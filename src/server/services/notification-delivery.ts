import type { Prisma } from "../../generated/prisma/client";
import { getPrisma } from "../prisma";
import { effectivePermissions, effectiveRoleNames } from "../admin-validation";
import { grantInclude } from "../queries/admin";
import { notificationId } from "../notification-validation";
import { createWorkflowNotification, validateWorkflowNotification, type WorkflowNotification } from "./notifications";

export type NotificationAudience =
  | { userId: string }
  | { userIds: readonly string[] }
  | { role: string }
  | { permissions: readonly string[] };
export type SendNotificationInput = Omit<WorkflowNotification, "userId" | "channels"> & {
  recipients: NotificationAudience | readonly NotificationAudience[];
  /** Opt in to queued email. Defaults to false. */
  email?: boolean;
  /** Defaults to true. Use false with email:true for email-only delivery. */
  inApp?: boolean;
};
export type NotificationTransaction = Pick<Prisma.TransactionClient, "notification" | "appUser" | "role">;

/** Trusted server code only: authorize the workflow and audience before calling.
 * Pass the workflow's transaction, or omit tx for an independent atomic dispatch.
 * This queues email; it never waits for SMTP.
 */
export async function sendNotification(input: SendNotificationInput, tx?: NotificationTransaction) {
  if(input.email!==undefined&&typeof input.email!=="boolean" || input.inApp!==undefined&&typeof input.inApp!=="boolean")throw new Error("Delivery options must be booleans.");
  const channels: ("inApp"|"email")[] = [...(input.inApp!==false?["inApp" as const]:[]),...(input.email===true?["email" as const]:[])];
  validateWorkflowNotification({...input,channels});
  const audiences = Array.isArray(input.recipients) ? input.recipients : [input.recipients];
  const ids = new Set<string>(), roleNames = new Set<string>(), grants: string[][] = [];
  for(const audience of audiences){
    if(!audience||typeof audience!=="object"||Object.keys(audience).length!==1)throw new Error("Choose a user, user list, role or permission audience.");
    if("userId" in audience)ids.add(notificationId(audience.userId));
    else if("userIds" in audience){if(!Array.isArray(audience.userIds))throw new Error("userIds must be an array.");for(const id of audience.userIds)ids.add(notificationId(id));}
    else if("role" in audience){if(typeof audience.role!=="string"||!audience.role.trim()||audience.role.length>100)throw new Error("Provide a role name.");roleNames.add(audience.role);}
    else if("permissions" in audience){
      if(!Array.isArray(audience.permissions)||!audience.permissions.length||audience.permissions.some((grant:unknown)=>typeof grant!=="string"||!grant.trim()||grant.length>200))throw new Error("Provide at least one permission.");
      grants.push([...new Set<string>(audience.permissions)]);
    }else throw new Error("Unsupported notification audience.");
  }
  const deliver = async(db:NotificationTransaction)=>{
    const roles=roleNames.size||grants.length?await db.role.findMany({include:grantInclude}):[];
    const matchingRoles=roles.filter(role=>effectiveRoleNames([role.roleName]).some(name=>roleNames.has(name))).map(role=>role.roleId);
    const candidateRoles=new Set([...matchingRoles,...roles.filter(role=>grants.some(required=>effectivePermissions(roles,[role.roleId]).includes(required[0]))).map(role=>role.roleId)]);
    const predicates:Prisma.AppUserWhereInput[]=[];
    if(ids.size)predicates.push({userId:{in:[...ids]}});
    if(candidateRoles.size)predicates.push({userRoles:{some:{roleId:{in:[...candidateRoles]}}}});
    const users=predicates.length?await db.appUser.findMany({where:{isActive:true,OR:predicates},select:{userId:true,userRoles:{select:{roleId:true}}},orderBy:{userId:"asc"}}):[];
    const selected=users.filter(user=>{
      if(ids.has(user.userId)||user.userRoles.some(role=>matchingRoles.includes(role.roleId)))return true;
      const effective=effectivePermissions(roles,user.userRoles.map(role=>role.roleId));
      return grants.some(required=>required.every(grant=>effective.includes(grant)));
    });
    const notificationIds:string[]=[];
    for(const user of selected){
      const notification=await createWorkflowNotification(db,{userId:user.userId,eventKey:input.eventKey,type:input.type,title:input.title,message:input.message,observationId:input.observationId,channels});
      notificationIds.push(notification.notificationId);
    }
    const recipientIds=selected.map(user=>user.userId);
    return {recipientCount:recipientIds.length,recipientIds,notificationIds,skippedUserIds:[...ids].filter(id=>!recipientIds.includes(id))};
  };
  return tx?deliver(tx):getPrisma().$transaction(deliver,{isolationLevel:"Serializable",timeout:30000});
}
