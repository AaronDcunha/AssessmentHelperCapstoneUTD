import '../configuration-loader.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword, verifyPassword, usernameFromName} from '../../src/server/account-auth.ts';
const {authenticateDatabase, resolveDatabaseUser}=await import('../../src/server/database-auth.ts');
const {mutateAdmin}=await import('../../src/server/services/admin.ts');

const id='00000000-0000-4000-8000-000000000001';
test('Prisma authentication verifies credentials and reloads inherited grants and active status',async()=>{
 const passwordHash=await hashPassword('123');
 const account={userId:id,username:'jane_smith',fullName:'Jane Smith',isActive:true,
  loginCredential:{passwordHash},userRoles:[{roleId:'admin',role:{roleName:'Admin'}}]};
 const roles=['Admin','AC','Faculty'].map(roleName=>({roleId:roleName.toLowerCase(),roleName,
  rolePermissions:[{permission:{permissionName:roleName.toLowerCase()+'.read'}}]}));
 const db={appUser:{findUnique:async({where})=>where.username==='jane_smith'||where.userId===id?account:null},role:{findMany:async()=>roles}};
 const user=await authenticateDatabase({username:' JANE_SMITH ',password:'123'},db);
 assert.equal(user.id,id); assert.deepEqual(user.roles,['Admin']);
 for(const key of ['admin.read','ac.read','faculty.read','test:admin'])assert.ok(user.permissions.includes(key));
 assert.equal('passwordHash' in user,false);
 assert.equal(await authenticateDatabase({username:'jane_smith',password:'wrong'},db),null);
 assert.equal(await authenticateDatabase({username:'missing',password:'123'},db),null);
 roles[1].rolePermissions=[];
 assert.equal((await resolveDatabaseUser(id,db)).permissions.includes('ac.read'),false);
 account.isActive=false;
 assert.equal(await resolveDatabaseUser(id,db),null);
 assert.equal(await authenticateDatabase({username:'jane_smith',password:'123'},db),null);
});

test('Admin creation provisions unique normalized usernames and salted credentials atomically',async()=>{
 assert.equal(usernameFromName(' Jane Mary Smith '),'jane_smith');
 assert.equal(usernameFromName("José O’Neil"),'jose_oneil');
 assert.equal(usernameFromName('Other'),'other');
 const existing=new Set(['jane_smith','jane_smith_2']);let data;
 const db={role:{count:async()=>1},appUser:{findUnique:async({where})=>existing.has(where.username)?{}:null,
  create:async args=>{data=args.data;return {userId:id,...data,revision:0,professor:null,
   userRoles:[{roleId:id,role:{roleName:'Faculty'}}]};}}};
 const result=await mutateAdmin({$transaction:async run=>run(db)},
  {id,permissions:['users.manage','roles.assign']},'users.create',{},
  {name:'Jane Mary Smith',email:'jane@example.edu',accountStatus:true,roleIds:[id]});
 assert.equal(data.username,'jane_smith_3');
 assert.ok(await verifyPassword('123',data.loginCredential.create.passwordHash));
 assert.notEqual(data.loginCredential.create.passwordHash,'123');
 assert.notEqual(await hashPassword('123'),data.loginCredential.create.passwordHash);
 assert.equal('loginCredential' in result,false);
});
