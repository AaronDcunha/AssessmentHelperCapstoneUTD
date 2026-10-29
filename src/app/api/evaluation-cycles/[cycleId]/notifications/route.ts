import { workflowApi } from "@/server/alert-reminder-api";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const handler=workflowApi("reminder.send");
export async function POST(request:Request,{params}:{params:Promise<{cycleId:string}>}){return handler(request,(await params).cycleId);}
