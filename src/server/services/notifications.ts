import type { Prisma } from "../../generated/prisma/client";
import type { ConfigurationUser } from "../configuration-validation";
import { notificationGrant, notificationBody, notificationId, notificationError } from "../notification-validation";
import { notificationResources, notificationSelect, type NotificationDatabase } from "../queries/notifications";

export async function setNotificationRead(db: NotificationDatabase, user: ConfigurationUser, id: string, body: unknown, now = new Date()) {
  notificationGrant(user,true); const notification = notificationId(id), read = notificationBody(body,true).read as boolean;
  // The same desired state preserves the original read timestamp. Ownership is in every predicate.
  if(user.id.startsWith("demo:")) notificationError(404,"NOT_FOUND","Notification not found.");
  await db.notification.updateMany({where:{notificationId:notification,userId:user.id,isRead:!read},data:{isRead:read,readAt:read?now:null}});
  const row=await db.notification.findFirst({where:{notificationId:notification,userId:user.id},select:notificationSelect});
  if(!row) return notificationError(404,"NOT_FOUND","Notification not found.");
  return (await notificationResources(db,user,[row]))[0];
}
export async function markAllNotificationsRead(db: NotificationDatabase, user: ConfigurationUser, body: unknown, cutoff = new Date()) {
  notificationGrant(user,true); notificationBody(body,false);
  if(user.id.startsWith("demo:")) return {updatedCount:0,cutoff:cutoff.toISOString(),unreadCount:0};
  // The API runs this in a repeatable-read transaction: arrivals outside this snapshot are untouched.
  const changed=await db.notification.updateMany({where:{userId:user.id,isRead:false,createdAt:{lte:cutoff}},data:{isRead:true,readAt:cutoff}});
  const unreadCount=await db.notification.count({where:{userId:user.id,isRead:false}});
  return {updatedCount:changed.count,cutoff:cutoff.toISOString(),unreadCount};
}

type NotificationWriter = Pick<Prisma.TransactionClient,"notification">;
export type WorkflowNotification = { userId:string; eventKey:string; type:string; title:string; message:string; observationId?:string };
/** Call inside the workflow's existing transaction; no network I/O or email delivery here. */
export async function createWorkflowNotification(db: NotificationWriter, input: WorkflowNotification) {
  const userId=notificationId(input.userId), targetId=input.observationId?notificationId(input.observationId):null;
  if(!input.eventKey.trim() || input.eventKey.length>300 || !input.type.trim() || input.type.length>100 || !input.title.trim() || input.title.length>2000 || input.message.length>20000) throw new Error("Invalid workflow notification.");
  return db.notification.upsert({where:{userId_eventKey:{userId,eventKey:input.eventKey}},
    create:{userId,eventKey:input.eventKey,notificationType:input.type,title:input.title,message:input.message,targetKind:targetId?"observation":null,targetId},update:{eventKey:input.eventKey}});
}
