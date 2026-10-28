import { ConfigurationError, sameOrigin, type ConfigurationUser } from "./configuration-validation";
import { notificationBody, notificationGrant, notificationQuery } from "./notification-validation";
export type NotificationOperation = "list" | "count" | "read" | "all";
export function notificationsHandler(operation: NotificationOperation, dependencies: {
  getUser:()=>Promise<ConfigurationUser|null>;
  execute:(user:ConfigurationUser,params:URLSearchParams,body:unknown,id?:string)=>Promise<unknown>;
}) {
  return async (request: Request, id?: string) => {
    const headers={"Cache-Control":"private, no-store"};
    try {
      const user=await dependencies.getUser();
      if(!user) throw new ConfigurationError(401,"UNAUTHENTICATED","Sign in to view notifications.");
      const mutation=operation==="read"||operation==="all";
      notificationGrant(user,mutation);
      const params=new URL(request.url).searchParams;
      notificationQuery(params,operation==="list");
      let body:unknown;
      if(mutation) {
        if(!sameOrigin(request)) throw new ConfigurationError(403,"INVALID_ORIGIN","A same-origin request is required.");
        if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json") throw new ConfigurationError(415,"UNSUPPORTED_MEDIA_TYPE","Use application/json.");
        if(Number(request.headers.get("content-length"))>4096) throw new ConfigurationError(413,"PAYLOAD_TOO_LARGE","Request exceeds 4 KiB.");
        const reader=request.body?.getReader(), chunks:Uint8Array[]=[];let size=0;
        if(reader) try { while(true) {const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;
          if(size>4096){await reader.cancel();throw new ConfigurationError(413,"PAYLOAD_TOO_LARGE","Request exceeds 4 KiB.");}chunks.push(chunk.value);}
        } finally {reader.releaseLock();}
        try {body=JSON.parse(Buffer.concat(chunks).toString("utf8"));} catch {throw new ConfigurationError(400,"INVALID_JSON","Invalid JSON request.");}
        notificationBody(body,operation==="read");
      }
      return Response.json(await dependencies.execute(user,params,body,id),{headers});
    } catch(error) {
      const conflict=(error as {code?:string})?.code==="P2034";
      const failure=error instanceof ConfigurationError?error:conflict?
        new ConfigurationError(409,"CONCURRENT_UPDATE","Notifications changed. Refresh and try again."):
        new ConfigurationError(503,"UNAVAILABLE","Notifications are currently unavailable. Please try again later.");
      return Response.json({error:{code:failure.code,message:failure.message}},{status:failure.status,headers});
    }
  };
}
