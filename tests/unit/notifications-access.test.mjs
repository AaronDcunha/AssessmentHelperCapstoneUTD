import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function pageFor(permissions){
 const source=readFileSync(new URL('../../src/app/(main)/notifications/page.tsx',import.meta.url),'utf8');
 const loaded={exports:{}};
 const localRequire=name=>{
  if(name==='react/jsx-runtime')return require(name);
  if(name.endsWith('/permissions'))return {requirePermission:async permission=>{if(permissions===null)throw new Error('LOGIN');if(!permissions.includes(permission))throw new Error('FORBIDDEN');return {permissions};}};
  if(name.endsWith('/notifications-screen'))return {NotificationsScreen:()=>null};
  throw new Error(name);
 };
 const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
 new Function('require','module','exports',outputText)(localRequire,loaded,loaded.exports);
 return loaded.exports.default;
}
test('notifications page rejects anonymous and fixture-only access',async()=>{
 await assert.rejects(pageFor(null)(),/LOGIN/);
 for(const permissions of [[],['test:admin'],['notifications.update.own']])await assert.rejects(pageFor(permissions)(),/FORBIDDEN/);
});
test('notifications read permission allows the page without inventing a write grant',async()=>{
 const permissions=['notifications.read.own'];assert.deepEqual((await pageFor(permissions)()).props.permissions,permissions);
});
