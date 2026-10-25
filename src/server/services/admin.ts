import { adminAccess, preserveAdminAccess } from "../admin-safeguards";
import type { PrismaClient } from "../../generated/prisma/client";
import { object, fields, uuid, revision, invalid } from "../configuration-validation";
import { authorize, required, conflict, strings, userInput, levelInput, effectivePermissions, type AdminUser, type Operation } from "../admin-validation";
import { grantInclude, userInclude, userResponse, levelResponse, type Connection } from "../queries/admin";

async function validRoles(db: Connection,ids: string[]) {
  if (!ids.length) invalid("Select at least one role.");
  if (await db.role.count({where:{roleId:{in:ids}}})!==ids.length) invalid("Unknown role selection.");
}
async function validProfile(db: Connection,p: {departmentId?: string; hiringLevelId?: string},existingLevel?: string) {
  if (p.departmentId) required(await db.department.findUnique({where:{departmentId:p.departmentId}}));
  if (p.hiringLevelId) {
    const level=required(await db.hiringLevel.findUnique({where:{hiringLevelId:p.hiringLevelId}}));
    if (!level.active && p.hiringLevelId!==existingLevel) invalid("Select an active hiring level.");
  }
}
export async function mutateAdmin(prisma: PrismaClient,user: AdminUser,operation: Operation,params: Record<string,string>,value: unknown) {
  authorize(user,operation);
  return prisma.$transaction(async db=>{
    const guarded = ["users.update","users.roles","roles.permissions"].includes(operation);
    const before = guarded ? await adminAccess(db,user.id) : null;
    async function protect() { if (before) preserveAdminAccess(before,await adminAccess(db,user.id)); }
    if (operation === "users.create") {
      const input=userInput(value,true); await validRoles(db,input.roleIds!);
      if (input.profile) await validProfile(db,input.profile);
      return userResponse(await db.appUser.create({data:{fullName:input.data.fullName!,email:input.data.email!,isActive:input.data.isActive!,
        userRoles:{create:input.roleIds!.map(roleId=>({roleId}))},
        ...(input.profile ? {professor:{create:{departmentId:input.profile.departmentId!,hiringLevelId:input.profile.hiringLevelId!,hireDate:input.profile.hireDate}}} : {})},include:userInclude}));
    }
    if (operation === "users.update") {
      const id=uuid(params.userId),input=userInput(value,false);
      const current=required(await db.appUser.findUnique({where:{userId:id},include:{professor:true}}));
      if (current.revision!==input.expectedRevision) conflict();
      if (input.profile) {
        if (!current.professor && (!input.profile.departmentId || !input.profile.hiringLevelId)) invalid("New faculty profiles require a department and hiring level.");
        await validProfile(db,input.profile,current.professor?.hiringLevelId);
      }
      if (!(await db.appUser.updateMany({where:{userId:id,revision:input.expectedRevision},data:{...input.data,revision:{increment:1}}})).count) conflict();
      if (input.profile) {
        if (current.professor) await db.professor.update({where:{userId:id},data:input.profile});
        else await db.professor.create({data:{userId:id,departmentId:input.profile.departmentId!,hiringLevelId:input.profile.hiringLevelId!,hireDate:input.profile.hireDate}});
      }
      await protect();
      return userResponse(required(await db.appUser.findUnique({where:{userId:id},include:userInclude})));
    }
    if (operation === "users.roles") {
      const b=object(value); fields(b,["roleIds","expectedRevision"]);
      const id=uuid(params.userId),expectedRevision=revision(b.expectedRevision),ids=strings(b.roleIds);
      await validRoles(db,ids); required(await db.appUser.findUnique({where:{userId:id}}));
      if (!(await db.appUser.updateMany({where:{userId:id,revision:expectedRevision},data:{revision:{increment:1}}})).count) conflict();
      await db.userRole.deleteMany({where:{userId:id}});
      await db.userRole.createMany({data:ids.map(roleId=>({userId:id,roleId}))});
      await protect();
      const roles=await db.role.findMany({include:grantInclude});
      return {userId:id,roleIds:ids,permissions:effectivePermissions(roles,ids),revision:expectedRevision+1};
    }
    if (operation === "roles.permissions") {
      const b=object(value); fields(b,["permissionKeys","expectedRevision"]);
      const id=uuid(params.roleId),expectedRevision=revision(b.expectedRevision),keys=strings(b.permissionKeys,false);
      const permissions=await db.permission.findMany({where:{permissionName:{in:keys}}});
      if (permissions.length!==keys.length) invalid("Unsupported permission key.");
      required(await db.role.findUnique({where:{roleId:id}}));
      if (!(await db.role.updateMany({where:{roleId:id,revision:expectedRevision},data:{revision:{increment:1}}})).count) conflict();
      await db.rolePermission.deleteMany({where:{roleId:id}});
      if (permissions.length) await db.rolePermission.createMany({data:permissions.map(p=>({roleId:id,permissionId:p.permissionId}))});
      await protect();
      return {roleId:id,permissionKeys:[...keys].sort(),effectivePermissionKeys:effectivePermissions(await db.role.findMany({include:grantInclude}),[id]),revision:expectedRevision+1};
    }
    if (operation === "levels.create") {
      const {data}=levelInput(value,true);
      return levelResponse(await db.hiringLevel.create({data:{levelName:data.levelName!,evaluationIntervalYears:data.evaluationIntervalYears!}}));
    }
    if (operation === "levels.update") {
      const id=uuid(params.hiringLevelId),{data,expectedRevision}=levelInput(value,false);
      required(await db.hiringLevel.findUnique({where:{hiringLevelId:id}}));
      if (!(await db.hiringLevel.updateMany({where:{hiringLevelId:id,revision:expectedRevision},data:{...data,revision:{increment:1}}})).count) conflict();
      return levelResponse(required(await db.hiringLevel.findUnique({where:{hiringLevelId:id}})));
    }
    if (operation === "levels.delete") {
      await db.hiringLevel.delete({where:{hiringLevelId:uuid(params.hiringLevelId)}}); return null;
    }
    throw new Error("Unsupported mutation.");
  },{isolationLevel:"Serializable"});
}
