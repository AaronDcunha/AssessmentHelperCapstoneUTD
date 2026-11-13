import type { Prisma, HiringLevel } from "../../generated/prisma/client";
import { pagination, uuid, invalid } from "../configuration-validation";
import { authorize, required, type AdminUser, type Operation } from "../admin-validation";
export type Connection = Pick<Prisma.TransactionClient,"appUser"|"role"|"permission"|"userRole"|"rolePermission"|"professor"|"department"|"hiringLevel">;
export const userInclude = { professor: true, userRoles: { include: {role: true}, orderBy: {roleId: "asc" as const} } };
type User = Prisma.AppUserGetPayload<{include: typeof userInclude}>;
export const grantInclude = {rolePermissions: {include: {permission: true}}};
export async function readRoleGrants(db: Pick<Connection, "role" | "permission">) {
  const roles = await db.role.findMany({include: grantInclude});
  const admin = roles.find(role => role.roleName === "Admin");
  if (admin) {
    admin.rolePermissions = (await db.permission.findMany()).map(permission => ({
      roleId: admin.roleId, permissionId: permission.permissionId, permission,
    }));
  }
  return roles;
}
export function userResponse(u: User) {
  return {id:u.userId,name:u.fullName,email:u.email,accountStatus:u.isActive,revision:u.revision,
    roleIds:u.userRoles.map(r=>r.roleId),roles:u.userRoles.map(r=>({id:r.roleId,name:r.role.roleName})),
    professor:u.professor ? {departmentId:u.professor.departmentId,hiringLevelId:u.professor.hiringLevelId,hireDate:u.professor.hireDate?.toISOString().slice(0,10) ?? null} : null};
}
export function levelResponse(l: HiringLevel) { return {id:l.hiringLevelId,name:l.levelName,evaluationIntervalYears:l.evaluationIntervalYears,active:l.active,revision:l.revision}; }
function page<T extends {id: string}>(rows: T[],limit: number) {
  const items=rows.slice(0,limit),hasMore=rows.length>limit;
  return {items,pageInfo:{hasMore,nextCursor:hasMore ? items.at(-1)!.id : null}};
}
export async function getUser(db: Connection,user: AdminUser,id: string) {
  authorize(user,"users.get");
  return userResponse(required(await db.appUser.findUnique({where:{userId:uuid(id)},include:userInclude})));
}
export async function readAdmin(db: Connection,user: AdminUser,operation: Operation,url: URL,params: Record<string,string>) {
  authorize(user,operation);
  if (operation === "users.get") return getUser(db,user,params.userId);
  if (operation === "levels.list") return {items:(await db.hiringLevel.findMany({orderBy:{hiringLevelId:"asc"}})).map(levelResponse)};
  if (operation === "permissions.list") return {items:(await db.permission.findMany({orderBy:{permissionName:"asc"}})).map(p=>({key:p.permissionName,name:p.permissionName,description:null,featureGroup:p.permissionName.split(".")[0]}))};
  const {limit,cursor}=pagination(url),q=url.searchParams.get("q");
  if (q && q.length>2000) invalid("Search is too long.");
  if (operation === "roles.list") {
    const rows=await db.role.findMany({where:cursor ? {roleId:{gt:cursor}} : {},include:grantInclude,orderBy:{roleId:"asc"},take:limit+1});
    const adminKeys = rows.slice(0,limit).some(r=>r.roleName==="Admin")
      ? (await db.permission.findMany({orderBy:{permissionName:"asc"}})).map(p=>p.permissionName)
      : [];
    return page(rows.map(r=>({id:r.roleId,key:r.roleName,name:r.roleName,permissionKeys:r.roleName==="Admin" ? adminKeys : r.rolePermissions.map(p=>p.permission.permissionName).sort(),revision:r.revision})),limit);
  }
  if (operation === "departments.list") {
    const rows=await db.department.findMany({where:{...(cursor ? {departmentId:{gt:cursor}} : {}),...(q ? {departmentName:{contains:q,mode:"insensitive"}} : {})},orderBy:{departmentId:"asc"},take:limit+1});
    // Imported department names are CourseBook department codes; no separate code column exists.
    return page(rows.map(d=>({id:d.departmentId,code:d.departmentName,name:d.departmentName})),limit);
  }
  if (operation === "users.list") {
    const status=url.searchParams.get("accountStatus"),role=url.searchParams.get("roleId"),department=url.searchParams.get("departmentId"),level=url.searchParams.get("hiringLevelId");
    if (status!==null && status!=="true" && status!=="false") invalid("accountStatus must be true or false.");
    const where: Prisma.AppUserWhereInput = {
      ...(cursor ? {userId:{gt:cursor}} : {}),...(status!==null ? {isActive:status==="true"} : {}),
      ...(q ? {OR:[{fullName:{contains:q,mode:"insensitive"}},{email:{contains:q,mode:"insensitive"}}]} : {}),
      ...(role ? {userRoles:{some:{roleId:uuid(role)}}} : {}),
      ...(department || level ? {professor:{is:{...(department ? {departmentId:uuid(department)} : {}),...(level ? {hiringLevelId:uuid(level)} : {})}}} : {})};
    return page((await db.appUser.findMany({where,include:userInclude,orderBy:{userId:"asc"},take:limit+1})).map(userResponse),limit);
  }
  throw new Error("Unsupported read operation.");
}
