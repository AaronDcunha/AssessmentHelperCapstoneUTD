import { notificationApi } from "@/server/notifications-api";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const handler=notificationApi("list");
export async function GET(request:Request){return handler(request);}
