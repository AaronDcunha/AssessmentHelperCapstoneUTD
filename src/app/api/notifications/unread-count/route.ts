import { notificationApi } from "@/server/notifications-api";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const handler=notificationApi("count");
export async function GET(request:Request){return handler(request);}
