import { createHash,randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import { ConfigurationError,uuid,type ConfigurationUser } from "../configuration-validation";
import { reminderInput,workflowGrant } from "../alert-reminder-validation";
import { facultyStatuses,observationWhere } from "../queries/ac-reports";
import { createWorkflowNotification } from "./notifications";
type Database=Pick<Prisma.TransactionClient,"reminderDispatch"|"notification"|"professor"|"observation"|"evaluationCycle"|"hiringLevel">;
export async function sendCycleReminders(db:Database,user:ConfigurationUser,cycleId:string,body:unknown,idempotencyKey?:string){
 workflowGrant(user,"notifications.send","cycles.read");uuid(cycleId);const input=reminderInput(body),dispatchId=idempotencyKey?uuid(idempotencyKey):randomUUID();
 if(input.params.has("evaluationStatus"))workflowGrant(user,"reports.read");
 if(input.params.has("status"))workflowGrant(user,"observations.read");
 const hash=createHash("sha256").update(JSON.stringify({kind:input.kind,params:input.params.toString(),ids:input.ids?[...input.ids].sort():null,message:input.message,channels:[...input.channels].sort()})).digest("hex");
 const outcome=(recipientCount:number)=>({dispatchId,recipientCount,notificationCount:input.channels.includes("inApp")?recipientCount:0,emailQueuedCount:input.channels.includes("email")?recipientCount:0,status:"completed"});
 const existing=await db.reminderDispatch.findUnique({where:{dispatchId}});
 if(existing){if(existing.cycleId!==cycleId||existing.createdById!==user.id||existing.requestHash!==hash)throw new ConfigurationError(409,"IDEMPOTENCY_CONFLICT","This reminder key is already used for a different request.");return outcome(existing.recipientCount);}
 const cycle=await db.evaluationCycle.findUnique({where:{cycleId},include:{semester:true}});
 if(!cycle)throw new ConfigurationError(404,"NOT_FOUND","Evaluation cycle not found.");
 const clauses:Prisma.ProfessorWhereInput[]=[{user:{isActive:true}}];
 if(input.ids)clauses.push({professorId:{in:input.ids}});
 if(input.params.has("departmentId"))clauses.push({departmentId:input.params.get("departmentId")!});
 if(input.params.has("hiringLevelId"))clauses.push({hiringLevelId:input.params.get("hiringLevelId")!});
 const query=new URL("http://local");query.search=input.params.toString();
 if(input.params.has("evaluationStatus")){
  const status=input.params.get("evaluationStatus")==="unavailable"?"needs-review":input.params.get("evaluationStatus");
  const rows=await facultyStatuses(db,query,cycle);clauses.push({professorId:{in:rows.filter(p=>p.evaluationStatus===status).map(p=>p.id)}});
 }
 if(input.params.has("status")){
  const observations=await db.observation.findMany({where:observationWhere(query,cycleId,new Date()),select:{observerId:true,signup:{select:{professorId:true}}}});
  clauses.push({professorId:{in:[...new Set(observations.flatMap(o=>[o.signup.professorId,...(o.observerId?[o.observerId]:[])]))]}});
 }
 const recipients=await db.professor.findMany({where:{AND:clauses},select:{userId:true},orderBy:{professorId:"asc"},take:1001});
 if(recipients.length>1000)throw new ConfigurationError(413,"TOO_MANY_RECIPIENTS","Narrow the recipient filter to at most 1000 faculty members.");
 await db.reminderDispatch.create({data:{dispatchId,cycleId,createdById:user.id,requestHash:hash,recipientCount:recipients.length}});
 for(const recipient of recipients)await createWorkflowNotification(db,{userId:recipient.userId,eventKey:`reminder:${dispatchId}`,type:`AC_REMINDER_${input.kind.toUpperCase()}`,title:`${cycle.semester.termName} reminder`,message:input.message,channels:input.channels});
 return outcome(recipients.length);
}
