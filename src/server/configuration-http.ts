import { ConfigurationError, hasAnyPermission, object, sameOrigin, type ConfigurationUser } from "./configuration-validation";
import { cycleReadPermissions, templateReadPermissions } from "./queries/configuration";

export type Operation = "cycles.list" | "cycles.get" | "cycles.create" | "cycles.update" | "cycles.settings" |
  "semesters.list" | "templates.list" | "templates.get" | "templates.current" | "templates.create" | "templates.update" | "templates.publish";
export function configurationHandler(operation:Operation, dependencies:{getUser:()=>Promise<ConfigurationUser|null>; execute:(operation:Operation,user:ConfigurationUser,url:URL,params:Record<string,string>,body:unknown)=>Promise<unknown>}) {
  return async (request:Request,context?:{params:Promise<Record<string,string>>}) => {
    try {
      const user=await dependencies.getUser();
      if (!user) throw new ConfigurationError(401,"UNAUTHENTICATED","Sign in to access configuration.");
      const mutation=request.method!=="GET" && request.method!=="HEAD";
      const templates=operation.startsWith("templates.");
      const permissions=mutation ? [templates?"templates.manage":"cycles.manage"] : templates?templateReadPermissions:cycleReadPermissions;
      if (!hasAnyPermission(user,permissions)) throw new ConfigurationError(403,"FORBIDDEN","Permission denied.");
      if (mutation && !sameOrigin(request)) throw new ConfigurationError(403,"INVALID_ORIGIN","A same-origin request is required.");
      let body:unknown;
      if (mutation) {
        if (request.headers.get("content-type")?.split(";")[0].trim()!=="application/json") throw new ConfigurationError(415,"UNSUPPORTED_MEDIA_TYPE","Use application/json.");
        // Bound the actual stream as Content-Length may be absent or inaccurate.
        if (Number(request.headers.get("content-length"))>262144) throw new ConfigurationError(413,"PAYLOAD_TOO_LARGE","Request exceeds 256 KiB.");
        const reader=request.body?.getReader(); const chunks:Uint8Array[]=[]; let size=0;
        if (reader) {
          try { while (true) { const chunk=await reader.read(); if (chunk.done) break; size+=chunk.value.length;
            if (size>262144) { await reader.cancel(); throw new ConfigurationError(413,"PAYLOAD_TOO_LARGE","Request exceeds 256 KiB."); }
            chunks.push(chunk.value); } } finally { reader.releaseLock(); }
        }
        try { body=object(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch(error) { if(error instanceof ConfigurationError) throw error; throw new ConfigurationError(400,"INVALID_JSON","Invalid JSON body."); }
      }
      const params=context ? await context.params : {};
      const data=await dependencies.execute(operation,user,new URL(request.url),params,body);
      return Response.json(data,{status:operation.endsWith(".create")?201:200,headers:{"Cache-Control":"no-store"}});
    } catch(error) {
      let failure=error instanceof ConfigurationError ? error : null;
      if (!failure && error && typeof error==="object" && "code" in error) {
        if (error.code==="P2002") failure=new ConfigurationError(409,"DUPLICATE","A record with these unique fields already exists.");
        if (error.code==="P2003") failure=new ConfigurationError(409,"RELATED_RECORD","A related record is unavailable or still in use.");
        if (error.code==="P2034") failure=new ConfigurationError(409,"CONCURRENT_UPDATE","Concurrent update; reload and retry.");
      }
      if (!failure) { console.error("Configuration request failed."); failure=new ConfigurationError(500,"INTERNAL_ERROR","Unable to complete the configuration request."); }
      return Response.json({error:{code:failure.code,message:failure.message}},{status:failure.status,headers:{"Cache-Control":"no-store"}});
    }
  };
}
