import { ConfigurationError, object, sameOrigin, type ConfigurationUser } from "./configuration-validation";
import { authorize, type Operation } from "./admin-validation";
export function adminHandler(operation:Operation, dependencies:{getUser:()=>Promise<ConfigurationUser|null>; execute:(operation:Operation,user:ConfigurationUser,url:URL,params:Record<string,string>,body:unknown)=>Promise<unknown>}) {
  return async (request:Request,context?:{params:Promise<Record<string,string>>}) => {
    try {
      const user=await dependencies.getUser();
      if (!user) throw new ConfigurationError(401,"UNAUTHENTICATED","Sign in to access administration.");
      const mutation=request.method!=="GET" && request.method!=="HEAD";
      authorize(user, operation);
      if (mutation && !sameOrigin(request)) throw new ConfigurationError(403,"INVALID_ORIGIN","A same-origin request is required.");
      let body:unknown;
      if (mutation && request.method !== "DELETE") {
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
      if (operation.endsWith(".delete")) return new Response(null,{status:204,headers:{"Cache-Control":"no-store"}});
      return Response.json(data,{status:operation.endsWith(".create")?201:200,headers:{"Cache-Control":"no-store"}});
    } catch(error) {
      let failure=error instanceof ConfigurationError ? error : null;
      if (!failure && error && typeof error==="object" && "code" in error) {
        if (error.code==="P2025") failure=new ConfigurationError(404,"NOT_FOUND","Record not found.");
        if (error.code==="P2002") failure=new ConfigurationError(409,"DUPLICATE","A record with these unique fields already exists.");
        if (error.code==="P2003") failure=new ConfigurationError(409,"RELATED_RECORD","A related record is unavailable or still in use.");
        if (error.code==="P2034") failure=new ConfigurationError(409,"CONCURRENT_UPDATE","Concurrent update; reload and retry.");
      }
      if (!failure) { console.error("Admin request failed."); failure=new ConfigurationError(500,"INTERNAL_ERROR","Unable to complete the admin request."); }
      return Response.json({error:{code:failure.code,message:failure.message}},{status:failure.status,headers:{"Cache-Control":"no-store"}});
    }
  };
}

