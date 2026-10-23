import {sourceRepairQueue,deferFleetMaintenance} from './automatic-work-queue.mjs';
import assert from 'node:assert/strict';
import {fairAutomaticCandidates,authorizeFairKidsWork,authorizedWorkQueue,authorizedPhaseQueue} from './automatic-work-queue.mjs';
import {acceptTeacherApprovals} from './teacher-approval-guards.mjs';
const item=(id,cls,time,status='READY',extra={})=>({row:Number(id.replace(/\D/g,''))||1,job:{id,status,nextAt:0,cls:{className:cls,spreadsheetId:cls},receipt:{student:id,time},route:{code:'OP1-L01'},...extra}});
const rows=[...Array.from({length:8},(_,i)=>item('a'+i,'A','2026-10-14T12:00:00Z')),...Array.from({length:8},(_,i)=>item('b'+i,'B','2026-09-14T12:00:00Z'))];
const fair=fairAutomaticCandidates(rows,['A','B']);assert.deepEqual(fair.ordered.slice(0,6).map(x=>x.job.cls.className),['A','B','A','B','A','B']);
const ordinary=item('c1','C','2026-10-14','WAITING_TEACHER_APPROVAL'),paid=item('c2','C','2026-10-14','RETRY',{generateRequests:1}),rejected=item('c3','C','2026-10-14','COMPLETED_PRESENTATION_RESUBMISSION'),resubmit=item('c4','C','2026-10-14','READY',{receipt:{student:'c3',time:'2026-10-14'}});
assert.deepEqual(fairAutomaticCandidates([ordinary,paid,rejected,resubmit],['C']).ordered.map(x=>x.job.id),['c1']);
const props=new Map(),session={approved:new Map(),finish:()=>{}},c={teacherApprovalSession_:session,teacherApprovalJobs_:[...rows,ordinary,paid,rejected,resubmit],runnerProperties:props,batchQueue_:jobs=>jobs.filter(x=>['READY','WAITING_MEDIA'].includes(x.job.status))},g={book:()=>({getSheetByName:()=>({getSheetId:()=>1})})};
authorizeFairKidsWork(c,{controlId:'fixture',classes:['A','B','C']},g);assert.equal(session.approved.size,6);assert(session.approved.has('c1'));assert(!session.approved.has('c2'));assert(!session.approved.has('c4'));
acceptTeacherApprovals(c.teacherApprovalJobs_,session,'fixture','Jobs',()=>{});assert.equal(ordinary.job.status,'READY');assert(ordinary.job.teacherApproval.approved);
const authorized=authorizedWorkQueue(c);assert.equal(authorized.length,6);assert(authorized.every(x=>session.approved.has(x.job.id)));assert(!authorized.some(x=>x.job.id==='c2'||x.job.id==='c4'));
assert.equal(fairAutomaticCandidates(rows,['A','B','C','D','E','F','G','H','I','J'],0).nextCursor,6);
const a=item('x1','A','2026-10-01'),b=item('x2','A','2026-10-14');a.job.receipt.student=b.job.receipt.student='same';const dedup=fairAutomaticCandidates([a,b],['A']);assert.equal(dedup.ordered[0].job.id,'x2');assert.equal(dedup.ordered.length,1);
const delayed=item('d1','A','2026-10-14');delayed.job.nextAt=Date.now()+60000;assert.equal(fairAutomaticCandidates([delayed],['A']).ordered.length,0);
const large=item('l1','A','2026-10-14','WAITING_MEDIA',{media:[{mime:'video/mp4',size:100000000}]}),small=item('s1','B','2026-10-14','WAITING_MEDIA',{media:[{mime:'video/mp4',size:1000}]});
assert.equal(authorizedPhaseQueue([large,small],'prepare',true)[0].job.id,'l1');assert.equal(authorizedPhaseQueue([large,small],'prepare',false)[0].job.id,'s1');
const cached=item('r1','C','2026-09-01','WAITING_TEACHER_APPROVAL',{rawId:'saved-result',generateRequests:1});const ready=item('r2','C','2026-10-14');assert.equal(fairAutomaticCandidates([ready,cached],['C']).ordered[0].job.id,'r1');const resume={approved:new Map(),finish:()=>{}};authorizeFairKidsWork({teacherApprovalSession_:resume,teacherApprovalJobs_:[cached],runnerProperties:new Map()},{controlId:'fixture',classes:['C']},g);acceptTeacherApprovals([cached],resume,'fixture','Jobs',()=>{});assert.equal(cached.job.status,'READY');assert.equal(cached.job.rawId,'saved-result');assert.equal(cached.job.generateRequests,1);assert.equal(cached.job.teacherApproval.resumingSavedResult,true);
console.log('Fair classes, waiting-state authorization, preparation fairness, paid/rejected guards and authorized-only processing passed; provider calls: 0.');

// New YouTube work uses the same priority entry, without a historic repair marker or pupil-specific ID.
const nativePreviousScope=process.env.MASTER_CROSS_CLASS_SWEEP;process.env.MASTER_CROSS_CLASS_SWEEP='true';
const nativeCandidate={id:'native-new',cls:{spreadsheetId:'fixture',className:'KIDS 1'},route:{code:'SCIENCE-G1-1'},receipt:{student:'Fixture',time:'2026-10-23T00:00:00Z',links:'https://youtu.be/AbCdEfGhIjK'},status:'READY'};assert.equal(sourceRepairQueue([{job:nativeCandidate}]).length,1);assert.equal(sourceRepairQueue([{job:{...nativeCandidate,generateRequests:1}}]).length,0);assert.equal(sourceRepairQueue([{job:{...nativeCandidate,previousGradingAttempts:[{rawId:'old'}]}}]).length,0);assert.equal(sourceRepairQueue([{job:{...nativeCandidate,receipt:{...nativeCandidate.receipt,time:'2026-08-01T00:00:00Z'}}}]).length,0);

const driveCandidate={...nativeCandidate,id:'drive-queued',receipt:{...nativeCandidate.receipt,links:'https://drive.google.com/file/d/abcdefghijklmnopqr/view'}};
assert.equal(deferFleetMaintenance([{job:driveCandidate}]),true);
assert.equal(deferFleetMaintenance([{job:{...driveCandidate,status:'RETURNED',rawId:'saved'}}]),false);
assert.equal(deferFleetMaintenance([{job:{...driveCandidate,status:'RETRY',rawId:'saved',generateRequests:1}}]),true);
assert.equal(deferFleetMaintenance([{job:{...driveCandidate,nextAt:Date.now()+60000}}]),false);
assert.equal(deferFleetMaintenance([{job:{...driveCandidate,generateRequests:1}}]),false);
assert.equal(deferFleetMaintenance([{job:{...driveCandidate,receipt:{...driveCandidate.receipt,time:'2026-08-01T00:00:00Z'}}}]),false);
assert.equal(deferFleetMaintenance([{job:{...driveCandidate,status:'COMPLETED_PRESENTATION_RESUBMISSION'}}]),false);

if(nativePreviousScope===undefined)delete process.env.MASTER_CROSS_CLASS_SWEEP;else process.env.MASTER_CROSS_CLASS_SWEEP=nativePreviousScope;
