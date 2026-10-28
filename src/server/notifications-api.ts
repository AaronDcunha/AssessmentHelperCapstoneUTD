import { getCurrentUser } from "./permissions";
import { getPrisma } from "./prisma";
import { notificationsHandler, type NotificationOperation } from "./notifications-http";
import { getNotifications, getUnreadNotificationCount } from "./queries/notifications";
import { setNotificationRead, markAllNotificationsRead } from "./services/notifications";
export function notificationApi(operation: NotificationOperation) {
  return notificationsHandler(operation,{getUser:getCurrentUser,execute:async(user,params,body,id)=>{
    const db=getPrisma();
    return db.$transaction(async tx=>{
      if(operation==="list")return getNotifications(tx,user,params);
      if(operation==="count")return getUnreadNotificationCount(tx,user,params);
      if(operation==="read")return setNotificationRead(tx,user,id!,body);
      return markAllNotificationsRead(tx,user,body);
    },{isolationLevel:"RepeatableRead"});
  }});
}
