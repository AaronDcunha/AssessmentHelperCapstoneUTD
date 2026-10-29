import {randomUUID} from "node:crypto";
import { ConfigurationError,uuid,type ConfigurationUser } from "../configuration-validation";
import { workflowGrant,alertCreation } from "../alert-reminder-validation";
import { alertInclude,alertResource,type AlertDatabase } from "../queries/alerts";
import { createWorkflowNotification } from "./notifications";
import { effectivePermissions } from "../admin-validation";
import { grantInclude } from "../queries/admin";
export async function createObservationAlert(db:AlertDatabase,user:ConfigurationUser,observationId:string,body:unknown){
 workflowGrant(user,"observations.read.own","invitations.send.own");uuid(observationId);const input=alertCreation(body);
 const observation=await db.observation.findFirst({where:{observationId,signup:{professor:{userId:user.id}}},select:{observationId:true,signup:{select:{professor:{select:{user:{select:{fullName:true}}}}}}}});
 if(!observation)throw new ConfigurationError(404,"NOT_FOUND","Observation not found.");
 const occurrenceKey=input.creationKey??randomUUID();
 const existing=await db.facultyIssue.findUnique({where:{observationId_reportedBy_kind_occurrenceKey:{observationId,reportedBy:user.id,kind:"ALERT",occurrenceKey}},include:alertInclude});
 if(existing){
  if(existing.reason!==input.reason||existing.details!==input.details)throw new ConfigurationError(409,"IDEMPOTENCY_CONFLICT","This alert request key has already been used for a different message.");
  return {alert:alertResource(existing,user),created:false};
 }
 const alert=await db.facultyIssue.create({data:{observationId,reportedBy:user.id,kind:"ALERT",occurrenceKey,reason:input.reason,details:input.details},include:alertInclude});
 const roles=await db.role.findMany({include:grantInclude});const roleIds=roles.filter(role=>["AC","Admin"].includes(role.roleName)||["notifications.send","observations.read"].every(grant=>effectivePermissions(roles,[role.roleId]).includes(grant))).map(role=>role.roleId);
 const recipients=await db.appUser.findMany({where:{isActive:true,userRoles:{some:{roleId:{in:roleIds}}}},select:{userId:true}});
 for(const recipient of recipients)await createWorkflowNotification(db,{userId:recipient.userId,eventKey:`faculty-issue:${alert.issueId}`,type:"FACULTY_ALERT",title:"Faculty needs assistance",message:`From: ${observation.signup.professor.user.fullName}\n\n${input.reason}\n${input.details}`,observationId});
 return {alert:alertResource(alert,user),created:true};
}
