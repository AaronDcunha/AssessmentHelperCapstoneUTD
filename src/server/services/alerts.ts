import { ConfigurationError,uuid,type ConfigurationUser } from "../configuration-validation";
import { workflowGrant,alertCreation,alertUpdate } from "../alert-reminder-validation";
import { alertInclude,alertResource,getAlert,type AlertDatabase } from "../queries/alerts";
import { createWorkflowNotification } from "./notifications";
import { effectivePermissions } from "../admin-validation";
import { grantInclude } from "../queries/admin";
export async function createObservationAlert(db:AlertDatabase,user:ConfigurationUser,observationId:string,body:unknown){
 workflowGrant(user,"observations.read.own","invitations.send.own");uuid(observationId);const input=alertCreation(body);
 const observation=await db.observation.findFirst({where:{observationId,signup:{professor:{userId:user.id}}},select:{observationId:true}});
 if(!observation)throw new ConfigurationError(404,"NOT_FOUND","Observation not found.");
 const existing=await db.facultyIssue.findUnique({where:{observationId_reportedBy_kind:{observationId,reportedBy:user.id,kind:"ALERT"}},include:alertInclude});
 if(existing)return {alert:alertResource(existing,user),created:false};
 const alert=await db.facultyIssue.create({data:{observationId,reportedBy:user.id,kind:"ALERT",reason:input.reason,details:input.details},include:alertInclude});
 const roles=await db.role.findMany({include:grantInclude});const roleIds=roles.filter(role=>["alerts.manage","observations.read"].every(grant=>effectivePermissions(roles,[role.roleId]).includes(grant))).map(role=>role.roleId);
 const recipients=await db.appUser.findMany({where:{isActive:true,userRoles:{some:{roleId:{in:roleIds}}}},select:{userId:true}});
 for(const recipient of recipients)await createWorkflowNotification(db,{userId:recipient.userId,eventKey:`faculty-issue:${alert.issueId}`,type:"FACULTY_ALERT",title:"Faculty needs assistance",message:`${input.reason}\n${input.details}`,observationId});
 return {alert:alertResource(alert,user),created:true};
}
export async function updateAlert(db:AlertDatabase,user:ConfigurationUser,id:string,body:unknown){
 workflowGrant(user,"observations.read","alerts.manage");const input=alertUpdate(body);await getAlert(db,user,id);
 const expectedStatus=input.status==="ACKNOWLEDGED"?"PENDING":"ACKNOWLEDGED";
 const changed=await db.facultyIssue.updateMany({where:{issueId:uuid(id),kind:"ALERT",revision:input.revision,status:expectedStatus},data:{status:input.status,revision:{increment:1},updatedById:user.id,
  ...(input.status==="ACKNOWLEDGED"?{acknowledgedAt:new Date()}:{resolvedAt:new Date(),resolutionNote:input.note})}});
 if(!changed.count)throw new ConfigurationError(409,"STALE_REVISION","The alert changed or this status transition is unavailable. Refresh it before continuing.");
 const alert=await getAlert(db,user,id);
 const reporter=await db.facultyIssue.findUnique({where:{issueId:id},select:{reportedBy:true}});
 if(reporter)await createWorkflowNotification(db,{userId:reporter.reportedBy,eventKey:`alert-status:${id}:${alert.revision}`,type:"ALERT_UPDATED",title:input.status==="RESOLVED"?"Your alert was resolved":"Your alert was acknowledged",message:input.status==="RESOLVED"?(input.note??"The Assessment Committee marked your alert as resolved."):"The Assessment Committee acknowledged your alert.",observationId:alert.observationId});
 return alert;
}

