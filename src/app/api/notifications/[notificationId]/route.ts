import { notificationApi } from "@/server/notifications-api";
export const runtime="nodejs";
const handler=notificationApi("read");
export async function PATCH(request:Request,{params}:{params:Promise<{notificationId:string}>}){
  return handler(request,(await params).notificationId);
}
