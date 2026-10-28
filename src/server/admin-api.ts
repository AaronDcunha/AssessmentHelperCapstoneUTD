import { getCurrentUser } from "./permissions";
import { getPrisma } from "./prisma";
import { adminHandler as handler } from "./admin-http";
import { readAdmin } from "./queries/admin";
import { mutateAdmin } from "./services/admin";
import type { Operation } from "./admin-validation";
export function adminHandler(operation: Operation) {
  return handler(operation,{getUser:getCurrentUser,execute:async(operation,user,url,params,body)=> {
    const db=getPrisma();
    return operation.endsWith(".list") || operation.endsWith(".get") ? readAdmin(db,user,operation,url,params) : mutateAdmin(db,user,operation,params,body);
  }});
}
