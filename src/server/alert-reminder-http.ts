import { ConfigurationError,sameOrigin,type ConfigurationUser } from "./configuration-validation";
import { workflowGrant } from "./alert-reminder-validation";
export type WorkflowOperation="alert.create"|"alert.list"|"alert.get"|"alert.update"|"reminder.send";
export function workflowHandler(operation:WorkflowOperation,dependencies:{getUser:()=>Promise<ConfigurationUser|null>;execute:(user:ConfigurationUser,id:string,url:URL,body:unknown,key?:string)=>Promise<unknown>}){
 return async(request:Request,id:string)=>{
  const headers={"Cache-Control":"private, no-store"};
  try{
   const user=await dependencies.getUser();if(!user)throw new ConfigurationError(401,"UNAUTHENTICATED","Sign in to continue.");
   if(operation==="alert.create")workflowGrant(user,"observations.read.own","invitations.send.own");
   else if(operation==="alert.list")workflowGrant(user,"observations.read");
   else if(operation==="alert.update")workflowGrant(user,"observations.read","alerts.manage");
   else if(operation==="reminder.send")workflowGrant(user,"notifications.send","cycles.read");
   else if(!user.permissions.includes("observations.read"))workflowGrant(user,"observations.read.own");
   const mutation=operation==="alert.create"||operation==="alert.update"||operation==="reminder.send",url=new URL(request.url);
   if(operation!=="alert.list"&&url.searchParams.size)throw new ConfigurationError(400,"INVALID_QUERY","Unknown query parameters.");
   let body:unknown;
   if(mutation){
    if(!sameOrigin(request))throw new ConfigurationError(403,"INVALID_ORIGIN","A same-origin request is required.");
    if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")throw new ConfigurationError(415,"UNSUPPORTED_MEDIA_TYPE","Use application/json.");
    if(Number(request.headers.get("content-length"))>65536)throw new ConfigurationError(413,"PAYLOAD_TOO_LARGE","Request exceeds 64 KiB.");
    const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
    if(reader)try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();throw new ConfigurationError(413,"PAYLOAD_TOO_LARGE","Request exceeds 64 KiB.");}chunks.push(part.value);}}finally{reader.releaseLock();}
    try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new ConfigurationError(400,"INVALID_JSON","Invalid JSON request.");}
   }
   const result=await dependencies.execute(user,id,url,body,request.headers.get("idempotency-key")??undefined);
   if(operation==="alert.create"){const response=result as {created:boolean;alert:unknown};return Response.json(response.alert,{status:response.created?201:200,headers});}
   return Response.json(result,{headers});
  }catch(error){
   const code=(error as {code?:string})?.code;
   const failure=error instanceof ConfigurationError?error:["P2034","P2002"].includes(code??"")?new ConfigurationError(409,"CONCURRENT_UPDATE","This record changed. Refresh and retry the request."):new ConfigurationError(503,"UNAVAILABLE","The workflow service is temporarily unavailable.");
   return Response.json({error:{code:failure.code,message:failure.message}},{status:failure.status,headers});
  }
 };
}
