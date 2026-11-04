import test from 'node:test';
import assert from 'node:assert/strict';
import {canReportNotCompleted} from '../../src/lib/observation-actions.ts';

const now=new Date('2026-11-04T18:00:00Z');
const record={status:'CONFIRMED',completedAt:null,scheduledAt:new Date('2026-11-03T18:00:00Z'),signedAssessment:null};
test('non-occurrence is available after an unfinished appointment starts',()=>{
 assert.equal(canReportNotCompleted(record,now),true);
 assert.equal(canReportNotCompleted({...record,scheduledAt:now},now),true);
});
test('completed, closed, signed and unscheduled observations cannot report non-occurrence',()=>{
 for(const status of ['COMPLETED','completed','CANCELLED','CANCELED','NOT_OCCURRED'])assert.equal(canReportNotCompleted({...record,status},now),false);
 for(const patch of [{completedAt:now},{scheduledAt:null},{scheduledAt:new Date(now.getTime()+1)},
  {signedAssessment:{isLocked:true,observerSignedAt:null,observeeSignedAt:null}},
  {signedAssessment:{isLocked:false,observerSignedAt:now,observeeSignedAt:null}},
  {signedAssessment:{isLocked:false,observerSignedAt:null,observeeSignedAt:now}}])assert.equal(canReportNotCompleted({...record,...patch},now),false);
});
