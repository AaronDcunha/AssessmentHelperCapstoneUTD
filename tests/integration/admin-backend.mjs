// Isolated local schema only. Never changes application records or migration history.
import '../configuration-loader.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {PrismaPg} from '@prisma/adapter-pg';
const {PrismaClient}=await import('../../src/generated/prisma/client.ts');
const {mutateAdmin}=await import('../../src/server/services/admin.ts');
const {readAdmin}=await import('../../src/server/queries/admin.ts');
const {grants}=await import('../../src/server/admin-validation.ts');
const url=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Admin integration requires local PostgreSQL.');
url.searchParams.delete('schema');
const schema='admin_backend_test_'+randomUUID().replaceAll('-','');
const pool=new pg.Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});
const migrationPool=new pg.Pool({connectionString:url.toString(),options:`-c search_path=${schema}`,connectionTimeoutMillis:5000});
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()},{schema})});
let created=false;
try {
 await pool.query(`CREATE SCHEMA ${schema}`); created=true;
 for(const dir of (await readdir(new URL('../../prisma/migrations/',import.meta.url),{withFileTypes:true})).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) {
  const sql=(await readFile(new URL(`../../prisma/migrations/${dir.name}/migration.sql`,import.meta.url),'utf8')).replace('CREATE SCHEMA IF NOT EXISTS "public";','');
  await migrationPool.query(sql);
 }
 const faculty=await prisma.role.create({data:{roleName:'Faculty'}});
 const admin=await prisma.role.create({data:{roleName:'Admin'}});
 const permission=await prisma.permission.create({data:{permissionName:'profile.read.own'}});
 await prisma.rolePermission.create({data:{roleId:faculty.roleId,permissionId:permission.permissionId}});
 const user={id:randomUUID(),permissions:[...new Set(Object.values(grants).flat())]};
 const mutate=(op,params,body)=>mutateAdmin(prisma,user,op,params,body);
 const read=(op,query='',params={})=>readAdmin(prisma,user,op,new URL('http://test/'+query),params);
 const level=await mutate('levels.create',{}, {name:'Assistant Professor',evaluationIntervalYears:1});
 assert.equal(level.active,true); assert.equal(level.revision,0);
 const department=await prisma.department.create({data:{departmentName:'CS'}});
 const account=await mutate('users.create',{}, {name:'New Account',email:'new@example.edu',accountStatus:false,roleIds:[faculty.roleId],professor:{departmentId:department.departmentId,hiringLevelId:level.id,hireDate:'2026-10-01'}});
 assert.equal(account.accountStatus,false); assert.equal(account.professor.hireDate,'2026-10-01');
 const stored=await prisma.appUser.findUnique({where:{userId:account.id},include:{loginCredential:true}});
 assert.equal(stored.username,null); assert.equal(stored.loginCredential,null);
 assert.equal((await read('users.list','?accountStatus=false&limit=1')).items[0].id,account.id);
 const second=await mutate('users.create',{}, {name:'Other',email:'other@example.edu',accountStatus:true,roleIds:[faculty.roleId]});
 const page=await read('users.list','?limit=1'); assert.equal(page.pageInfo.hasMore,true);
 const next=await read('users.list',`?limit=1&cursor=${page.pageInfo.nextCursor}`); assert.equal(next.items.length,1); assert.notEqual(next.items[0].id,page.items[0].id);
 const updated=await mutate('users.update',{userId:account.id},{expectedRevision:0,name:'Changed',accountStatus:true});
 assert.equal(updated.revision,1); assert.equal(updated.accountStatus,true);
 await assert.rejects(()=>mutate('users.update',{userId:account.id},{expectedRevision:0,name:'Stale'}),e=>e.status===409);
 await assert.rejects(()=>mutate('users.update',{userId:account.id},{expectedRevision:1,email:second.email,professor:{hireDate:'2025-01-01'}}),e=>e.code==='P2002');
 assert.equal((await read('users.get','',{userId:account.id})).professor.hireDate,'2026-10-01');
 assert.equal((await read('users.get','',{userId:account.id})).revision,1);
 const assigned=await mutate('users.roles',{userId:account.id},{expectedRevision:1,roleIds:[admin.roleId]});
 assert.deepEqual(assigned.permissions,['profile.read.own']); assert.equal(assigned.revision,2);
 await assert.rejects(()=>mutate('users.roles',{userId:account.id},{expectedRevision:1,roleIds:[faculty.roleId]}),e=>e.status===409);
 assert.deepEqual((await read('users.get','',{userId:account.id})).roleIds,[admin.roleId]);
 const saved=await mutate('roles.permissions',{roleId:admin.roleId},{expectedRevision:0,permissionKeys:[]});
 assert.deepEqual(saved.permissionKeys,[]); assert.deepEqual(saved.effectivePermissionKeys,['profile.read.own']);
 await assert.rejects(()=>mutate('roles.permissions',{roleId:admin.roleId},{expectedRevision:1,permissionKeys:['unsupported']}),e=>e.status===422);
 await assert.rejects(()=>mutate('levels.delete',{hiringLevelId:level.id}),e=>e.code==='P2003');
 assert.ok(await prisma.hiringLevel.findUnique({where:{hiringLevelId:level.id}}));
 const changed=await mutate('levels.update',{hiringLevelId:level.id},{expectedRevision:0,active:false}); assert.equal(changed.active,false);
 await assert.rejects(()=>mutate('levels.update',{hiringLevelId:level.id},{expectedRevision:0,name:'Stale'}),e=>e.status===409);
 const disposable=await mutate('levels.create',{}, {name:'Disposable',evaluationIntervalYears:2});
 await mutate('levels.delete',{hiringLevelId:disposable.id}); assert.equal(await prisma.hiringLevel.count({where:{hiringLevelId:disposable.id}}),0);
 assert.equal((await read('departments.list')).items[0].code,'CS');
 assert.equal((await read('roles.list')).items.length,2);
 assert.equal((await read('permissions.list')).items[0].key,'profile.read.own');
 const managerKeys=['users.read','users.manage','roles.read','permissions.read','roles.assign','role-permissions.manage'];
 for(const key of managerKeys) {
  const p=await prisma.permission.create({data:{permissionName:key}});
  await prisma.rolePermission.create({data:{roleId:admin.roleId,permissionId:p.permissionId}});
 }
 const self={...user,id:account.id};
 await assert.rejects(()=>mutateAdmin(prisma,self,'users.update',{userId:account.id},{expectedRevision:2,accountStatus:false}),e=>e.code==='ADMIN_ACCESS_REQUIRED');
 await assert.rejects(()=>mutateAdmin(prisma,self,'users.roles',{userId:account.id},{expectedRevision:2,roleIds:[faculty.roleId]}),e=>e.code==='ADMIN_ACCESS_REQUIRED');
 await assert.rejects(()=>mutate('users.update',{userId:account.id},{expectedRevision:2,accountStatus:false}),e=>e.code==='ADMIN_ACCESS_REQUIRED');
 await assert.rejects(()=>mutate('roles.permissions',{roleId:admin.roleId},{expectedRevision:1,permissionKeys:[]}),e=>e.code==='ADMIN_ACCESS_REQUIRED');
 const retained=await read('users.get','',{userId:account.id});
 assert.equal(retained.accountStatus,true); assert.equal(retained.revision,2); assert.deepEqual(retained.roleIds,[admin.roleId]);
 const concurrent=await Promise.allSettled([
  mutate('users.update',{userId:second.id},{expectedRevision:0,name:'Concurrent A'}),
  mutate('users.update',{userId:second.id},{expectedRevision:0,name:'Concurrent B'}),
 ]);
 assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(concurrent.filter(r=>r.status==='rejected').length,1);
 assert.equal((await read('users.get','',{userId:second.id})).revision,1);
 console.log('Admin database integration passed: migrations, CRUD, filters/pagination, revisions/concurrency, inheritance, rollback, retention and admin safeguards.');
} finally {
 await prisma.$disconnect(); await migrationPool.end();
 if(created) await pool.query(`DROP SCHEMA ${schema} CASCADE`);
 await pool.end();
}
