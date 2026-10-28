import '../configuration-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { notificationsApi, parseNotificationPage, NotificationRequestError, notificationDestination } = await import('../../src/lib/notifications-api.ts');
const { createNotificationsController } = await import('../../src/lib/notifications-state.ts');
const id = '11111111-1111-4111-8111-111111111111';
const item = (suffix = '', createdAt = '2026-10-28T10:00:00Z') => ({ id: id + suffix, type:'reminder', title:'Observation reminder', message:'An observation is approaching.', createdAt, readAt:null, target:{kind:'observation',id} });
const page = (items = [item()], unreadCount = 1, nextCursor = null) => ({items, unreadCount, latestCursor:'latest', pageInfo:{hasMore:nextCursor!==null,nextCursor}});
const deferred = () => { let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve}; };

test('contract requests use all four endpoints, private session reads and exact mutation bodies', async t => {
  const calls=[];
  t.mock.method(globalThis,'fetch', async (url,options) => {
    calls.push({url,options});
    if (url.includes('mark-all-read')) return Response.json({updatedCount:1,cutoff:'2026-10-28T11:00:00Z',unreadCount:0});
    if (url.includes('unread-count')) return Response.json({unreadCount:1,asOf:'2026-10-28T11:00:00Z'});
    if(options.method==='PATCH') return Response.json({...item(),readAt:'2026-10-28T11:00:00Z'});
    return Response.json(page());
  });
  await notificationsApi.list('unread','page & 2'); await notificationsApi.unreadCount(); await notificationsApi.setRead(id,true); await notificationsApi.markAllRead();
  assert.equal(new URL(calls[0].url,'http://localhost').searchParams.get('cursor'),'page & 2');
  assert.equal(new URL(calls[0].url,'http://localhost').searchParams.get('read'),'unread');
  assert.equal(calls[1].url,'/api/notifications/unread-count');
  assert.equal(calls[2].url,`/api/notifications/${id}`); assert.deepEqual(JSON.parse(calls[2].options.body),{read:true});
  assert.equal(calls[3].options.body,'{}'); assert.equal(calls[3].options.method,'POST');
  assert.ok(calls.every(c=>c.options.cache==='no-store'&&c.options.credentials==='same-origin'));
  assert.throws(()=>notificationsApi.setRead('..',true));
});
test('malformed envelopes, duplicate records, missing targets and invalid counts never become an empty success', () => {
  for(const value of [{},page([item(),item()]),{...page(),unreadCount:-1},page([{...item(),target:undefined}]),page([{...item(),createdAt:'invalid'}]),{...page(),pageInfo:{hasMore:true,nextCursor:null}}]) assert.throws(()=>parseNotificationPage(value));
  assert.deepEqual(parseNotificationPage(page([],0)).items,[]);
});
test('HTTP, network and malformed success errors preserve denial and uncertain mutation outcomes without leaking bodies', async t => {
  for(const status of [401,403,404,503]) {
    const mock=t.mock.method(globalThis,'fetch',async()=>new Response('private details',{status}));
    await assert.rejects(notificationsApi.list('all'),e=>e.status===status&&!e.message.includes('private details')); mock.mock.restore();
  }
  const mock=t.mock.method(globalThis,'fetch',async()=>new Response('<html>unexpected</html>'));
  await assert.rejects(notificationsApi.setRead(id,true),e=>e.uncertain===true); mock.mock.restore();
  t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('Network');});
  await assert.rejects(notificationsApi.markAllRead(),e=>e.uncertain===true);
});
test('destinations allow only existing authorized internal observation routes', () => {
  assert.equal(notificationDestination(item().target,['observations.read.own']),`/observations/details?observationId=${id}`);
  for(const target of [null,{kind:'url',id:'https://evil.test'},{kind:'observation',id:'../admin'},{kind:'cycle',id}]) assert.equal(notificationDestination(target,['observations.read.own']),null);
  assert.equal(notificationDestination(item().target,[]),null);
});
test('changing filters cancels stale results; loading more preserves rows on failure',async()=>{
  const first=deferred();let calls=0;
  const store=createNotificationsController({list:async filter=>{calls++; if(calls===1)return first.promise;if(filter==='unread')return page([item('new')],1,'next');throw new Error('Offline');}});
  const old=store.load(); await store.load('unread'); first.resolve(page([item('old')])); await old;
  assert.equal(store.getSnapshot().items[0].id,id+'new');
  // Failure on continuation must keep the successfully loaded first page.
  const store2=createNotificationsController({list:async(_f,c)=>{if(c)throw new Error('Offline');return page([item()],1,'next');}});
  await store2.load();await store2.loadMore();assert.equal(store2.getSnapshot().items.length,1);assert.equal(store2.getSnapshot().error,'Offline');
});
test('individual read/unread actions use the server response and update the unread view/count',async()=>{
  let read=false;
  const store=createNotificationsController({list:async()=>page(),setRead:async(_id,value)=>{read=value;return {...item(),readAt:value?'2026-10-28T11:00:00Z':null};},unreadCount:async()=>({unreadCount:read?0:1})});
  await store.load('unread');await store.setRead(id,true);assert.equal(store.getSnapshot().items.length,0);assert.equal(store.getSnapshot().unreadCount,0);
  await store.load('all');await store.setRead(id,false);assert.equal(store.getSnapshot().items[0].readAt,null);assert.equal(store.getSnapshot().unreadCount,1);
});
test('mark all respects server cutoff and preserves new arrivals rather than assuming zero unread',async()=>{
  const store=createNotificationsController({list:async()=>page([item(),item('later','2026-10-28T12:00:00Z')],2),markAllRead:async()=>({updatedCount:1,cutoff:'2026-10-28T11:00:00Z',unreadCount:1})});
  await store.load('unread');await store.markAllRead();assert.deepEqual(store.getSnapshot().items.map(x=>x.id),[id+'later']);assert.equal(store.getSnapshot().unreadCount,1);
});
test('uncertain writes block repeats until explicit reload; denied responses clear private rows',async()=>{
  let writes=0;
  const store=createNotificationsController({list:async()=>page(),setRead:async()=>{writes++;throw new NotificationRequestError('Unknown',503,true);}});
  await store.load();await store.setRead(id,true);await store.setRead(id,true);assert.equal(writes,1);assert.equal(store.getSnapshot().writeBlocked,true);
  await store.load();assert.equal(store.getSnapshot().writeBlocked,false);
  const denied=createNotificationsController({list:async()=>page(),setRead:async()=>{throw new NotificationRequestError('Forbidden',403);}});
  await denied.load();await denied.setRead(id,true);assert.equal(denied.getSnapshot().state,'denied');assert.deepEqual(denied.getSnapshot().items,[]);
});

test('selection covers loaded rows only and is cleared by filter changes',async()=>{
 const store=createNotificationsController({list:async(_filter,cursor)=>cursor?page([item('later')],2):page([item()],2,'next')});
 await store.load();store.selectLoaded(true);assert.deepEqual(store.getSnapshot().selectedIds,[id]);
 await store.loadMore();assert.deepEqual(store.getSnapshot().selectedIds,[id]);
 store.select(id+'later',true);assert.equal(store.getSnapshot().selectedIds.length,2);
 await store.load('unread');assert.deepEqual(store.getSnapshot().selectedIds,[]);
});
test('mark selected serializes PATCHes, skips already-read rows and leaves unselected rows unchanged',async()=>{
 const calls=[];const read={...item('read'),readAt:'2026-10-28T09:00:00Z'};
 const store=createNotificationsController({list:async()=>page([item(),item('second'),item('untouched'),read],3),
  setRead:async key=>{calls.push(key);return {...item(key.slice(id.length)),readAt:'2026-10-28T11:00:00Z'};},unreadCount:async()=>({unreadCount:1})});
 await store.load();store.select(id,true);store.select(id+'second',true);store.select(id+'read',true);
 await store.markSelectedRead();assert.deepEqual(calls,[id,id+'second']);assert.deepEqual(store.getSnapshot().selectedIds,[]);
 assert.equal(store.getSnapshot().items.find(x=>x.id===id+'untouched').readAt,null);
 assert.equal(store.getSnapshot().notice,'2 notifications marked as read.');assert.equal(store.getSnapshot().unreadCount,1);
});
test('partial bulk failure preserves successful updates and remaining selection; uncertain writes cannot be replayed',async()=>{
 const calls=[];
 const store=createNotificationsController({list:async()=>page([item(),item('second'),item('third')],3),setRead:async key=>{
  calls.push(key);if(calls.length===2)throw new NotificationRequestError('Unconfirmed',503,true);return {...item(),readAt:'2026-10-28T11:00:00Z'};
 },unreadCount:async()=>({unreadCount:2})});
 await store.load();store.selectLoaded(true);await store.markSelectedRead();await store.markSelectedRead();
 assert.deepEqual(calls,[id,id+'second']);assert.equal(store.getSnapshot().items[0].readAt,'2026-10-28T11:00:00Z');
 assert.deepEqual(store.getSnapshot().selectedIds,[id+'second',id+'third']);assert.equal(store.getSnapshot().writeBlocked,true);
 assert.equal(store.getSnapshot().notice,'1 notification marked as read.');assert.equal(store.getSnapshot().error,'Unconfirmed');
});
test('opening a message marks it read and retains the full detail when its unread row disappears',async()=>{
 const full='A long message. '.repeat(50);let calls=0;
 const store=createNotificationsController({list:async()=>page([{...item(),message:full,target:null}],1),setRead:async()=>{
  calls++;return {...item(),message:full,target:null,readAt:'2026-10-28T11:00:00Z'};
 },unreadCount:async()=>({unreadCount:0})});
 await store.load('unread');await store.open(id,true);assert.equal(calls,1);assert.equal(store.getSnapshot().items.length,0);
 assert.equal(store.getSnapshot().opened.message,full);assert.ok(store.getSnapshot().opened.readAt);
 store.close();assert.equal(store.getSnapshot().opened,null);
});
test('read-only viewing does not write, while already-read messages are not patched again',async()=>{
 let writes=0;
 const store=createNotificationsController({list:async()=>page([item(),{...item('read'),readAt:'2026-10-28T11:00:00Z'}],1),setRead:async()=>{writes++;}});
 await store.load();await store.open(id,false);assert.equal(store.getSnapshot().opened.id,id);assert.equal(writes,0);
 await store.open(id+'read',true);assert.equal(writes,0);
});
