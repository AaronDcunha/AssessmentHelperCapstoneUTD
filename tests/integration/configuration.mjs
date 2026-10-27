// Uses a unique temporary schema in the configured local database, never application tables.
import '../configuration-loader.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
const { PrismaClient } = await import('../../src/generated/prisma/client.ts');
const service=await import('../../src/server/services/configuration.ts');
const query=await import('../../src/server/queries/configuration.ts');
const {configurationHandler}=await import('../../src/server/configuration-http.ts');
const url=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Configuration integration tests require local PostgreSQL.');
url.searchParams.delete('schema');
const schema='ac_config_test_'+randomUUID().replaceAll('-','');
const adminPool=new pg.Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});
const migrationPool=new pg.Pool({connectionString:url.toString(),options:`-c search_path=${schema}`,connectionTimeoutMillis:5000});
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()},{schema})});
const ids=Array.from({length:14},()=>randomUUID());
const [facultyId,otherId,departmentId,levelId,professorId,otherProfessorId,semesterId,otherSemesterId,courseId,sectionId,otherSectionId,legacyTemplateId,legacyCriterionId,legacyCycleId]=ids;
const ac={id:facultyId,permissions:['cycles.read','cycles.manage','templates.read','templates.manage']};
const faculty={id:facultyId,permissions:['course-sections.read.own','signups.read.own','observations.read.own','assessment.read.own']};
const deadlines={signupDeadline:'2026-10-31T23:59:00Z',observationDeadline:'2026-11-30T23:59:00Z',feedbackDeadline:'2026-12-07T23:59:00Z'};
let created=false;
try {
  await adminPool.query(`CREATE SCHEMA ${schema}`); created=true;
  const initial=(await readFile(new URL('../../prisma/migrations/20261019000000_initial_schema/migration.sql',import.meta.url),'utf8'))
    .replace('CREATE SCHEMA IF NOT EXISTS "public";','');
  // SQL is confined to schema setup and applying checked-in Prisma migrations.
  await migrationPool.query(initial);
  await migrationPool.query(await readFile(new URL('../../prisma/migrations/20261023000000_ac_configuration/migration.sql',import.meta.url),'utf8'));
  await migrationPool.query(await readFile(new URL('../../prisma/migrations/20261025000000_admin_backend/migration.sql',import.meta.url),'utf8'));
  await migrationPool.query(await readFile(new URL('../../prisma/migrations/20261026000000_faculty_workflows/migration.sql',import.meta.url),'utf8'));
  await migrationPool.query(await readFile(new URL('../../prisma/migrations/20261027000000_template_creation_idempotency/migration.sql',import.meta.url),'utf8'));
  await prisma.semester.createMany({data:[{semesterId,termCode:'26f',termName:'Fall 2026'},{semesterId:otherSemesterId,termCode:'27s',termName:'Spring 2027'}]});
  await prisma.observationTemplate.create({data:{templateId:legacyTemplateId,templateName:'Existing published template',status:'published',isActive:true,publishedAt:new Date('2026-10-19T00:00:00Z'),
    criteria:{create:{criterionId:legacyCriterionId,criterionKey:legacyCriterionId,criterionText:'Existing question',questionType:'RATING',minRating:1,maxRating:5,displayOrder:1,
      options:Array.from({length:5},(_,i)=>({value:i+1,label:String(i+1)}))}}}});
  await prisma.evaluationCycle.create({data:{cycleId:legacyCycleId,semesterId:otherSemesterId,cycleName:'Spring 2027',signupDeadline:new Date('2027-01-01'),observationDeadline:new Date('2027-02-01'),feedbackDeadline:new Date('2027-03-01')}});
  const legacy=await query.getTemplate(prisma,ac,legacyTemplateId);
  assert.equal(legacy.status,'published'); assert.equal(legacy.criteria[0].key,legacyCriterionId); assert.equal(legacy.criteria[0].options.length,5);
  assert.equal((await query.getSemesters(prisma,ac,new URL('http://test'))).items[0].startsOn,null);
  await prisma.appUser.createMany({data:[{userId:facultyId,fullName:'Faculty',username:'faculty',email:'faculty@test'},{userId:otherId,fullName:'Other',username:'other',email:'other@test'}]});
  await prisma.department.create({data:{departmentId,departmentName:'Test'}});
  await prisma.hiringLevel.create({data:{hiringLevelId:levelId,levelName:'Assistant',evaluationIntervalYears:1}});
  await prisma.professor.createMany({data:[{professorId,userId:facultyId,departmentId,hiringLevelId:levelId},{professorId:otherProfessorId,userId:otherId,departmentId,hiringLevelId:levelId}]});
  await prisma.course.create({data:{courseId,departmentId,courseCode:'TEST',courseTitle:'Test',courseLevel:1000}});
  await prisma.courseSection.createMany({data:[{sectionId,courseId,semesterId,sectionCode:'001'},{sectionId:otherSectionId,courseId,semesterId:otherSemesterId,sectionCode:'002'}]});
  await prisma.teaches.createMany({data:[{professorId,sectionId},{professorId:otherProfessorId,sectionId:otherSectionId}]});
  const cycle=await service.createCycle(prisma,ac,{semesterId,...deadlines});
  assert.equal(cycle.semester.name,'Fall 2026'); assert.equal(cycle.semester.year,2026); assert.equal(cycle.semester.season,'Fall');
  assert.equal(cycle.signupDeadline,'2026-10-31T23:59:00.000Z'); assert.equal(cycle.revision,0);
  await assert.rejects(()=>service.createCycle(prisma,ac,{semesterId,...deadlines}),e=>e.code==='P2002');
  assert.equal((await query.getCycles(prisma,faculty,new URL('http://test'))).items.length,1);
  assert.equal((await query.getSemesters(prisma,faculty,new URL('http://test'))).items.length,1);
  await assert.rejects(()=>query.getCycle(prisma,faculty,legacyCycleId),e=>e.status===404);
  const one=await query.getCycles(prisma,ac,new URL('http://test?limit=1'));
  assert.equal(one.pageInfo.hasMore,true);
  const next=await query.getCycles(prisma,ac,new URL(`http://test?limit=1&cursor=${one.pageInfo.nextCursor}`));
  assert.equal(next.items.length,1); assert.notEqual(one.items[0].id,next.items[0].id); assert.equal(next.pageInfo.hasMore,false);
  assert.equal((await query.getSemesters(prisma,ac,new URL('http://test?year=2026&season=Fall'))).items[0].id,semesterId);
  const changed=await service.updateCycle(prisma,ac,cycle.id,{expectedRevision:0,signupDeadline:'2026-10-01T00:00:00Z'});
  assert.equal(changed.revision,1); // Passed deadlines may be edited, per team decision.
  await assert.rejects(()=>service.updateCycle(prisma,ac,cycle.id,{expectedRevision:0,...deadlines}),e=>e.status===409);
  const settings={expectedCycleRevision:1,expectedSemesterRevision:0,semester:{startsOn:'2026-08-20',endsOn:'2026-12-20',timeZone:'America/Chicago'},deadlines};
  await assert.rejects(()=>service.updateSettings(prisma,ac,cycle.id,{...settings,expectedSemesterRevision:99}),e=>e.status===409);
  assert.equal((await query.getCycle(prisma,ac,cycle.id)).revision,1);
  const saved=await service.updateSettings(prisma,ac,cycle.id,settings);
  assert.equal(saved.semester.startsOn,'2026-08-20'); assert.equal(saved.semester.revision,1); assert.equal(saved.cycle.revision,2);
  const race=await Promise.allSettled([service.updateCycle(prisma,ac,cycle.id,{expectedRevision:2,...deadlines}),service.updateCycle(prisma,ac,cycle.id,{expectedRevision:2,...deadlines})]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1); assert.equal(race.find(r=>r.status==='rejected').reason.status,409);

  const questions=[{key:'objectives',prompt:'Objectives',type:'rating',required:true,order:0,options:[{value:1,label:'Low'},{value:5,label:'High'}]},
    {key:'notes',prompt:'Notes',type:'text',required:false,order:1}];
  const template=await service.createTemplate(prisma,ac,{title:'Test template',criteria:questions,commentPrompts:[],signatureLabels:{observer:'Observer',observee:'Observee'}});
  assert.equal(template.status,'draft'); assert.equal(template.criteria.length,2);
  const keyedInput={creationKey:randomUUID(),title:'Recoverable draft',criteria:questions,commentPrompts:[{prompt:'Notes',required:false,order:0}]};
  // The first response is deliberately ignored, as if the connection dropped
  // after commit. A retry must return the same template and generated child IDs.
  const committed=await service.createTemplate(prisma,ac,keyedInput);
  const recovered=await service.createTemplate(prisma,ac,{...keyedInput});
  assert.deepEqual(recovered,committed);
  assert.equal((await service.createTemplate(prisma,ac,{commentPrompts:keyedInput.commentPrompts,criteria:questions,title:keyedInput.title,creationKey:keyedInput.creationKey})).id,committed.id);
  await assert.rejects(()=>service.createTemplate(prisma,ac,{...keyedInput,creationKey:'invalid'}),e=>e.status===422);
  assert.equal(await prisma.observationTemplate.count({where:{creationKey:keyedInput.creationKey}}),1);
  await assert.rejects(()=>service.createTemplate(prisma,ac,{...keyedInput,title:'Different draft'}),e=>e.status===409 && e.code==='CREATION_KEY_REUSED');
  await assert.rejects(()=>service.createTemplate(prisma,{...ac,id:randomUUID()},keyedInput),e=>e.status===409 && e.code==='CREATION_KEY_REUSED');
  const concurrentInput={...keyedInput,creationKey:randomUUID()};
  const simultaneous=await Promise.all([service.createTemplate(prisma,ac,concurrentInput),service.createTemplate(prisma,ac,concurrentInput)]);
  assert.equal(simultaneous[0].id,simultaneous[1].id);
  assert.equal(await prisma.observationTemplate.count({where:{creationKey:concurrentInput.creationKey}}),1);
  await service.updateTemplate(prisma,ac,recovered.id,{expectedRevision:0,title:'Edited after creation'});
  assert.equal((await service.createTemplate(prisma,ac,keyedInput)).title,'Edited after creation');
  assert.equal((await service.createTemplate(prisma,ac,{...keyedInput,creationKey:randomUUID()})).id===recovered.id,false);
  await assert.rejects(()=>query.getTemplate(prisma,faculty,template.id),e=>e.status===404);
  assert(!(await query.getTemplates(prisma,faculty,new URL('http://test'))).items.some(t=>t.id===template.id));
  const swapped=await service.updateTemplate(prisma,ac,template.id,{expectedRevision:0,criteria:template.criteria.map((c,i)=>({...c,order:1-i}))});
  assert.equal(swapped.criteria[0].key,'notes');
  await assert.rejects(()=>service.updateTemplate(prisma,ac,template.id,{expectedRevision:1,criteria:[{...questions[0],id:legacyCriterionId}]}),e=>e.status===422);
  const published=await service.publishTemplate(prisma,ac,template.id,{expectedRevision:1});
  assert.equal(published.status,'published'); assert.equal((await query.getCurrentTemplate(prisma,faculty,new URL('http://test'))).id,template.id);
  assert.equal((await query.getTemplate(prisma,faculty,template.id)).id,template.id);
  const edited=await service.updateTemplate(prisma,ac,template.id,{expectedRevision:2,title:'Updated published template'});
  assert.equal(edited.title,'Updated published template');
  await assert.rejects(()=>service.publishTemplate(prisma,ac,template.id,{expectedRevision:3}),e=>e.status===409);
  const signupId=randomUUID(),observationId=randomUUID(),assessmentId=randomUUID();
  await prisma.evaluationSignup.create({data:{signupId,cycleId:cycle.id,professorId,sectionId}});
  await prisma.observation.create({data:{observationId,signupId,cycleId:cycle.id}});
  const responses={[edited.criteria[0].id]:'Historical answer'};
  await prisma.signedAssessment.create({data:{assessmentId,observationId,templateId:template.id,responses}});
  const questionEdit=await service.updateTemplate(prisma,ac,template.id,{expectedRevision:3,criteria:edited.criteria.map(c=>({...c,prompt:c.prompt+' edited'}))});
  assert.equal(questionEdit.criteria[0].id,edited.criteria[0].id);
  assert.deepEqual((await prisma.signedAssessment.findUniqueOrThrow({where:{assessmentId}})).responses,responses);
  await assert.rejects(()=>service.updateTemplate(prisma,ac,template.id,{expectedRevision:4,criteria:[questionEdit.criteria[0]]}),e=>e.code==='CRITERIA_IN_USE');

  // Exercise the HTTP security wrapper with the real database mutation beneath it.
  const origin='http://localhost:3000';
  const http=configurationHandler('cycles.create',{getUser:async()=>ac,execute:async(_operation,actor,_url,_params,body)=>service.createCycle(prisma,actor,body)});
  const duplicate=await http(new Request(origin+'/api/evaluation-cycles',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({semesterId,...deadlines})}));
  assert.equal(duplicate.status,409); assert.equal((await duplicate.json()).error.code,'DUPLICATE');
  console.log('Passed Prisma configuration migrations, cycle CRUD, faculty scope, pagination, filters, stale/concurrent edits, atomic settings, template CRUD, publication and HTTP duplicate handling.');
} finally {
  await prisma.$disconnect();
  await migrationPool.end();
  // schema is generated above and never accepted from external input.
  if(created) await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
  await adminPool.end();
}

