import type { Prisma } from "../../generated/prisma/client";
import type { ConfigurationUser } from "../configuration-validation";
import { notificationGrant, notificationQuery, notificationToken, parseNotificationToken, tokenDate, notificationId, notificationError } from "../notification-validation";
export type NotificationDatabase = Pick<Prisma.TransactionClient, "notification" | "observation">;
const select = { notificationId:true, title:true, message:true, notificationType:true, createdAt:true, readAt:true, targetKind:true, targetId:true } satisfies Prisma.NotificationSelect;
type Row = Prisma.NotificationGetPayload<{select:typeof select}>;

export async function notificationResources(db: NotificationDatabase, user: ConfigurationUser, rows: Row[]) {
  const ids = [...new Set(rows.flatMap(row => row.targetKind === "observation" && row.targetId ? [row.targetId] : []))];
  const broad = user.permissions.includes("observations.read"), own = user.permissions.includes("observations.read.own");
  const accessible = ids.length && (broad || own) ? await db.observation.findMany({ where: { observationId:{in:ids}, ...(broad ? {} : { OR:[{signup:{professor:{userId:user.id}}},{observer:{userId:user.id}}] }) },
    select:{observationId:true, signup:{select:{professor:{select:{userId:true}}}}, observer:{select:{userId:true}}} }) : [];
  const destinations = new Map(accessible.map(row => [row.observationId, own && (row.signup.professor.userId === user.id || row.observer?.userId === user.id) ? "observation" : "acObservation"]));
  return rows.map(row => ({ id:row.notificationId, type:row.notificationType, title:row.title, message:row.message,
    createdAt:row.createdAt.toISOString(), readAt:row.readAt?.toISOString() ?? null,
    target:row.targetId && destinations.has(row.targetId) ? {kind:destinations.get(row.targetId)!,id:row.targetId} : null }));
}

export async function getNotifications(db: NotificationDatabase, user: ConfigurationUser, params: URLSearchParams, now = new Date()) {
  notificationGrant(user); const query = notificationQuery(params,true);
  let asOf = now, anchor: {id:string;at:Date} | null = null;
  let after: Date | null = null;
  if(query.after) {
    const token = parseNotificationToken(query.after);
    if(token.v!==1 || token.kind!=="after" || token.user!==user.id || Object.keys(token).length!==4) notificationError(400,"INVALID_CURSOR","Invalid notification cursor.");
    after = tokenDate(token.at);
    if(after > now) notificationError(400,"INVALID_CURSOR","Invalid notification cursor.");
  }
  if(query.cursor) {
    const token = parseNotificationToken(query.cursor);
    if(token.v!==1 || token.kind!=="page" || token.user!==user.id || token.read!==query.read || token.after!==query.after || Object.keys(token).length!==8) notificationError(400,"INVALID_CURSOR","Invalid notification cursor.");
    anchor={id:notificationId(token.id),at:tokenDate(token.at)};asOf=tokenDate(token.asOf);
    if(asOf>now || anchor.at>asOf) notificationError(400,"INVALID_CURSOR","Invalid notification cursor.");
  }
  if(user.id.startsWith("demo:")) return {items:[],pageInfo:{hasMore:false,nextCursor:null},unreadCount:0,latestCursor:null};
  if(anchor && !await db.notification.findFirst({where:{userId:user.id,notificationId:anchor.id,createdAt:anchor.at},select:{notificationId:true}})) notificationError(400,"INVALID_CURSOR","Invalid notification cursor.");
  const clauses: Prisma.NotificationWhereInput[] = [{userId:user.id},{createdAt:{lte:asOf}},...(query.read==="unread"?[{isRead:false}]:[])];
  // Inclusive millisecond boundary avoids losing equal-timestamp arrivals; incremental clients deduplicate IDs.
  if(after) clauses.push({createdAt:{gte:after}});
  if(anchor) clauses.push({OR:[{createdAt:{lt:anchor.at}},{createdAt:anchor.at,notificationId:{lt:anchor.id}}]});
  const [rows,unreadCount]=await Promise.all([
    db.notification.findMany({where:{AND:clauses},select,orderBy:[{createdAt:"desc"},{notificationId:"desc"}],take:query.limit+1}),
    db.notification.count({where:{userId:user.id,isRead:false}}),
  ]);
  const page=rows.slice(0,query.limit), hasMore=rows.length>query.limit, last=page.at(-1);
  return {items:await notificationResources(db,user,page), pageInfo:{hasMore,nextCursor:hasMore&&last?notificationToken({v:1,kind:"page",user:user.id,read:query.read,after:query.after,id:last.notificationId,at:last.createdAt.toISOString(),asOf:asOf.toISOString()}):null},
    unreadCount,latestCursor:notificationToken({v:1,kind:"after",user:user.id,at:asOf.toISOString()})};
}
export async function getUnreadNotificationCount(db: NotificationDatabase, user: ConfigurationUser, params: URLSearchParams, now = new Date()) {
  notificationGrant(user); notificationQuery(params,false);
  return {unreadCount:user.id.startsWith("demo:")?0:await db.notification.count({where:{userId:user.id,isRead:false}}),asOf:now.toISOString()};
}
export { select as notificationSelect };
