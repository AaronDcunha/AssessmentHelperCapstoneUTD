import { workflowApi } from "@/server/alert-reminder-api";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const handler=workflowApi("alert.create");
export async function POST(request:Request,{params}:{params:Promise<{observationId:string}>}){return handler(request,(await params).observationId);}
