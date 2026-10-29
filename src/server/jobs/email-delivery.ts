import "server-only";
import {randomUUID} from "node:crypto";
import type {PrismaClient} from "../../generated/prisma/client";
import {emailMessage,defaultMailFrom} from "../email/transport";

type Database=Pick<PrismaClient,"notificationEmail">;
type Mail=ReturnType<typeof emailMessage>;
type Sender=(message:Mail)=>Promise<unknown>;
const retryDelays=[60000,300000,1800000,7200000];
export function emailFailure(error:unknown){
  const value=error as {code?:unknown;responseCode?:unknown};
  // Never persist SMTP responses: they can contain credentials, addresses or content.
  const code=typeof value?.code==="string"&&/^[A-Z_]{1,30}$/.test(value.code)?value.code:"DELIVERY_ERROR";
  const permanent=typeof value?.responseCode==="number"&&value.responseCode>=500&&value.responseCode<600;
  return {code,permanent};
}
/** Standalone worker only. SMTP happens after the claim commits, never in a workflow transaction. */
export async function deliverNotificationEmails(db:Database,send:Sender,options:{limit?:number;from?:string;now?:()=>Date}={}){
  const now=options.now??(()=>new Date()),limit=options.limit??50;
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error("Invalid email batch limit.");
  const result={sent:0,retried:0,failed:0,skipped:0};
  for(let i=0;i<limit;i++){
    const at=now(),eligible={OR:[{status:"pending",nextAttemptAt:{lte:at}},{status:"sending",leaseUntil:{lte:at}}]};
    const candidate=await db.notificationEmail.findFirst({where:eligible,orderBy:[{nextAttemptAt:"asc"},{notificationId:"asc"}],select:{notificationId:true}});
    if(!candidate)break;
    const leaseToken=randomUUID();
    const claim=await db.notificationEmail.updateMany({where:{notificationId:candidate.notificationId,...eligible},data:{status:"sending",leaseToken,leaseUntil:new Date(at.getTime()+300000),attempts:{increment:1}}});
    if(!claim.count)continue;
    const row=await db.notificationEmail.findUniqueOrThrow({where:{notificationId:candidate.notificationId},include:{notification:{include:{user:true}}}});
    const where={notificationId:row.notificationId,status:"sending",leaseToken};
    const clear={leaseToken:null,leaseUntil:null};
    const recipient=row.notification.user;
    if(!recipient.isActive||!row.notification.emailRequested){
      await db.notificationEmail.updateMany({where,data:{...clear,status:"skipped",lastError:"RECIPIENT_INACTIVE_OR_DISABLED"}});result.skipped++;continue;
    }
    if(row.attempts>5){await db.notificationEmail.updateMany({where,data:{...clear,status:"failed",lastError:"ATTEMPTS_EXHAUSTED"}});result.failed++;continue;}
    try{
      await send(emailMessage({id:row.notificationId,to:recipient.email,title:row.notification.title,message:row.notification.message},options.from??defaultMailFrom));
    }catch(error){
      const failure=emailFailure(error),terminal=failure.permanent||row.attempts>=5;
      await db.notificationEmail.updateMany({where,data:{...clear,status:terminal?"failed":"pending",lastError:failure.code,nextAttemptAt:new Date(now().getTime()+(retryDelays[row.attempts-1]??7200000))}});
      if(terminal)result.failed++;else result.retried++;
      continue;
    }
    // If this write fails after SMTP accepted the message, the lease can be retried.
    // SMTP is at-least-once; the stable Message-ID helps identify such duplicates.
    await db.notificationEmail.updateMany({where,data:{...clear,status:"sent",sentAt:now(),lastError:null}});result.sent++;
  }
  return result;
}
