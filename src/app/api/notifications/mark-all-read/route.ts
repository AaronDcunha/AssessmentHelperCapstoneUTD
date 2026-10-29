import { notificationApi } from "@/server/notifications-api";
export const runtime="nodejs";
const handler=notificationApi("all");
export async function POST(request:Request){return handler(request);}
