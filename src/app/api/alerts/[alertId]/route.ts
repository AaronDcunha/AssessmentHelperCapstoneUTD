import { workflowApi } from "@/server/alert-reminder-api";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const read=workflowApi("alert.get");
export async function GET(request:Request,{params}:{params:Promise<{alertId:string}>}){return read(request,(await params).alertId);}
