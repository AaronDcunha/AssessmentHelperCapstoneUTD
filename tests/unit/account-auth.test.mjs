import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { authenticateAccount, publicAccount, verifyPassword, fixturePermissions } from '../../src/server/account-auth.ts';

const salt = '1234567890abcdef1234567890abcdef';
const passwordHash = `scrypt:${salt}:${scryptSync('123',salt,64).toString('hex')}`;
const account = {id:'test-id',username:'arden_stone',name:'Arden Stone',isActive:true,passwordHash,
  roles:['Faculty','AC','Admin'],permissions:['users.manage']};

test('seed-format hashes authenticate and private fields never escape', async () => {
  let lookedUp;
  const user = await authenticateAccount({username:' ARDEN_STONE ',password:'123'},async username => {lookedUp=username;return account;});
  assert.equal(lookedUp,'arden_stone');
  assert.deepEqual(user,publicAccount(account));
  assert.equal('passwordHash' in user,false);
  assert.equal('isActive' in user,false);
  assert.equal(await verifyPassword('wrong',passwordHash),false);
});

test('unknown, inactive, missing credential and malformed hashes fail closed',async()=>{
  for(const record of [null,{...account,isActive:false},{...account,passwordHash:null},{...account,passwordHash:'123'},
    {...account,passwordHash:'scrypt:bad:bad'}]) {
    assert.equal(await authenticateAccount({username:'arden_stone',password:'123'},async()=>record),null);
  }
  assert.equal(await authenticateAccount({username:'arden_stone',password:'wrong'},async()=>account),null);
});

test('invalid inputs do not query the database',async()=>{
  for(const credentials of [{},{username:3,password:'123'},{username:' ',password:'123'},
    {username:'x',password:{}},{username:'x'.repeat(101),password:'123'},{username:'x',password:'a'.repeat(257)}]) {
    assert.equal(await authenticateAccount(credentials,async()=>assert.fail('Unexpected lookup')),null);
  }
});

test('database errors propagate instead of falling back to demo authentication',async()=>{
  await assert.rejects(authenticateAccount({username:'x',password:'123'},async()=>{throw new Error('offline')}),/offline/);
});

test('fresh account reads reflect deactivation and permission revocation',()=>{
  assert.equal(publicAccount({...account,isActive:false}),null);
  assert.deepEqual(publicAccount({...account,roles:[],permissions:[]}).permissions,[]);
});

test('fixture role inheritance is isolated from business permissions',()=>{
  assert.deepEqual(fixturePermissions(['Admin']),['test:faculty','test:ac','test:admin']);
  assert.deepEqual(fixturePermissions(['AC']),['test:faculty','test:ac']);
  assert.deepEqual(fixturePermissions(['Faculty']),['test:faculty']);
  assert.deepEqual(fixturePermissions(['Unknown']),[]);
});
