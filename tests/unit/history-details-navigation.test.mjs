import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const id = '11111111-1111-4111-8111-111111111111';
function load({ permissions = ['observations.read.own', 'assessment.read.own'], workflow = { marker: 'current' } } = {}) {
  const source = readFileSync(new URL('../../src/app/(main)/observations/details/page.tsx', import.meta.url), 'utf8');
  const loaded = { exports: {} }; let workflowReads = 0;
  const details = () => null, active = () => null;
  const mockRequire = name => {
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'next/navigation') return { notFound() { throw new Error('NOT_FOUND'); } };
    if (name.endsWith('/faculty-screens')) return { ObservationDetailsScreen: active };
    if (name.endsWith('/observation-details')) return { ObservationDetails: details };
    if (name.endsWith('/faculty-routes')) return { facultyRoutes: { history: '/observations/history' } };
    if (name.endsWith('/faculty-page-data')) return { facultyPageData: async () => { workflowReads++; return { data: workflow }; } };
    if (name.endsWith('/permissions')) return { requirePermission: async permission => { if (!permissions.includes(permission)) throw new Error('FORBIDDEN'); return { permissions }; } };
    throw new Error(name);
  };
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  new Function('require', 'module', 'exports', outputText)(mockRequire, loaded, loaded.exports);
  return { page: loaded.exports.default, details, active, reads: () => workflowReads };
}
test('History record destination preserves the selected ID instead of resolving the active observation', async () => {
  const app = load(); const result = await app.page({ searchParams: Promise.resolve({ observationId: id }) });
  assert.equal(result.type, app.details); assert.equal(result.props.observationId, id);
  assert.equal(result.props.backHref, '/observations/history'); assert.equal(result.props.canReadAssessment, true);
  assert.equal(app.reads(), 0);
});
test('the existing no-ID details destination keeps the active workflow', async () => {
  const app = load(); const result = await app.page({ searchParams: Promise.resolve({}) });
  assert.equal(result.type, app.active); assert.equal(result.props.data.marker, 'current'); assert.equal(result.props.canReadAssessment,true); assert.equal(app.reads(), 1);
});
test('direct record links enforce own-read grant and independently gate assessment loading', async () => {
  const denied = load({ permissions: ['test:admin'] });
  await assert.rejects(denied.page({ searchParams: Promise.resolve({ observationId: id }) }), /FORBIDDEN/);
  const allowed = load({ permissions: ['observations.read.own'] });
  assert.equal((await allowed.page({ searchParams: Promise.resolve({ observationId: id }) })).props.canReadAssessment, false);
});
test('malformed and repeated record IDs cannot fall back to the active observation', async () => {
  for (const observationId of ['bad', '', [id, id]]) {
    const app = load(); await assert.rejects(app.page({ searchParams: Promise.resolve({ observationId }) }), /NOT_FOUND/);
    assert.equal(app.reads(), 0);
  }
});

function treeNodes(value){if(!value||typeof value!=='object')return [];return [value,...[value.props?.children].flat(Infinity).flatMap(treeNodes)];}
function component(path,mocks){
 const source=readFileSync(new URL(path,import.meta.url),'utf8'),loaded={exports:{}};
 const localRequire=name=>name==='react/jsx-runtime'?require(name):name==='@/lib/evaluation-progress-label'?component('../../src/lib/evaluation-progress-label.ts',()=>{}):mocks(name);
 new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(localRequire,loaded,loaded.exports);
 return loaded.exports;
}
test('current details reuse the shared record view and retain active workflow actions and selectors',()=>{
 const Shared=()=>null;
 const exports=component('../../src/components/observations/faculty-screens.tsx',name=>{
  if(name==='./observation-details')return {ObservationDetails:Shared};
  if(name==='./faculty-routes')return {facultyRoutes:{observations:'/observations',form:'/observations/form',recommendations:'/observations/recommendations',confirmed:'/observations/confirmed'}};
  return new Proxy({},{get:(_,key)=>String(key)});
 });
 const data={observation:{id,participation:'observee'},dashboard:{}};
 const tree=exports.ObservationDetailsScreen({data,canReadAssessment:true}),nodes=treeNodes(tree),detail=nodes.find(n=>n.type===Shared);
 assert.ok(detail);assert.equal(detail.props.observationId,id);assert.equal(detail.props.canReadAssessment,true);assert.equal(detail.props.backHref,'/observations');
 assert.ok(nodes.some(n=>n.type==='FacultyCycleSelector'));assert.ok(nodes.some(n=>n.type==='FacultyObservationSelector'));
 assert.ok(treeNodes(detail).some(n=>n.type==='FacultyIssueControl'&&n.props.kind==='ALERT'));assert.ok(treeNodes(detail).some(n=>n.type==='FacultyIssueControl'&&n.props.kind==='NOT_OCCURRED'));assert.ok(treeNodes(detail).some(n=>n.type==='FacultyFeedbackControl'));
 assert.ok(!treeNodes(exports.ObservationDetailsScreen({data:null})).some(n=>n.type===Shared));
});
test('shared details hide current workflow actions while loading or denied, and show them after a successful read',()=>{
 let state={loading:true,error:null,data:{observation:{id},progress:[],proposedMeetings:[]}};
 const exports=component('../../src/components/observations/observation-details.tsx',name=>{
  if(name==='react')return {useCallback:fn=>fn,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}]};
  if(name.endsWith('use-api-resource'))return {useApiResource:()=>state};
  if(name==='@/lib/ac-api')return {acApi:{},userDisplayName:()=>''};
  return new Proxy({},{get:(_,key)=>String(key)});
 });
 const render=()=>exports.ObservationDetails({observationId:id,canReadAssessment:false,children:'CURRENT_ACTIONS'});
 const text=tree=>treeNodes(tree).flatMap(n=>[n.props?.children].flat(Infinity)).includes('CURRENT_ACTIONS');
 assert.equal(text(render()),false);state={...state,loading:false,error:'Forbidden'};assert.equal(text(render()),false);
 state={...state,error:null};assert.equal(text(render()),true);
});

test('signup route redirects existing cycle signups and leaves new/unknown signup states on the form',async()=>{
 for(const data of [{existingSignup:{id:'saved'},dashboard:{cycle:{id:'selected-cycle'}}},{existingSignup:null},null]){
  const Signup=()=>null;
  const exports=component('../../src/app/(main)/observations/signup/page.tsx',name=>{
   if(name==='next/navigation')return {redirect:target=>{throw Error('REDIRECT:'+target);}};
   if(name.endsWith('faculty-page-data'))return {facultyPageData:async()=>({data})};
   if(name.endsWith('faculty-routes'))return {facultyRoutes:{details:'/observations/details'}};
   if(name.endsWith('faculty-screens'))return {SignupScreen:Signup};
   throw Error(name);
  });
  if(data?.existingSignup)await assert.rejects(exports.default(),/REDIRECT:\/observations\/details/);
  else assert.equal((await exports.default()).type,Signup);
 }
});
test('existing signup never renders a second submission form, and successful signup navigates to details',async()=>{
 let existing=true,index=0;const calls=[];
 const exports=component('../../src/components/observations/faculty-screens.tsx',name=>{
  if(name==='react')return {useRef:initial=>({current:initial}),useEffect:()=>{},useState:initial=>{const defaults=['','section-1',['2026-11-02'],false,false];return [existing?initial:defaults[index++],()=>{}];}};
  if(name==='next/navigation')return {useRouter:()=>({replace:path=>calls.push(['replace',path]),refresh:()=>calls.push(['refresh'])})};
  if(name==='./faculty-routes')return {facultyRoutes:{details:'/observations/details'}};
  if(name==='./faculty-api')return {postFacultyAction:async(path,body)=>{calls.push(['post',path,body]);return {message:'Saved'};}};
  return new Proxy({},{get:(_,key)=>String(key)});
 });
 const data={existingSignup:{id:'saved',sectionId:'section-1'},sections:[{id:'section-1',options:[]}],signup:{allowed:true},dashboard:{}};
 const shellExisting=exports.SignupScreen({data});const tree=shellExisting.type(shellExisting.props);assert.equal(treeNodes(tree).some(n=>n.type==='form'),false);assert.ok(treeNodes(tree).some(n=>n.props.href==='/observations/details'));assert.equal(calls.length,0);
 existing=false;const shell=exports.SignupScreen({data:{...data,existingSignup:null}});const form=shell.type(shell.props);await form.props.onSubmit({preventDefault(){}});
 assert.deepEqual(calls,[['post','signup',{sectionId:'section-1',dates:['2026-11-02']}],['replace','/observations/details'],['refresh']]);
});

test('My Evaluation distinguishes an existing signup from a completed evaluation without changing due calculations',()=>{
 const exports=component('../../src/components/observations/faculty-screens.tsx',()=>new Proxy({},{get:(_,key)=>String(key)}));
 const data={existingSignup:null,dashboard:{cycle:{semesterId:'current',signupDeadline:'2026-10-31T23:59:00Z',observationDeadline:'2026-11-30T23:59:00Z'},access:{evaluation:true},evaluation:{status:'due',hiringLevel:'Assistant',lastCompletedEvaluation:null}}};
 const texts=value=>treeNodes(value).flatMap(n=>[n.props?.children].flat(Infinity));
 assert.ok(texts(exports.EvaluationScreen({data})).includes('Due'));
 const signedUp={...data,existingSignup:{id:'signup'}};assert.ok(texts(exports.EvaluationScreen({data:signedUp})).includes('Signed up'));assert.equal(data.dashboard.evaluation.status,'due');
 const completed={...signedUp,dashboard:{...data.dashboard,evaluation:{...data.dashboard.evaluation,lastCompletedEvaluation:{semesterId:'current',semester:'Fall 2026'}}}};
 assert.ok(texts(exports.EvaluationScreen({data:completed})).includes('Completed'));
 const revoked={...signedUp,dashboard:{...data.dashboard,access:{evaluation:false}}};assert.ok(texts(exports.EvaluationScreen({data:revoked})).includes('Unavailable'));
});
