import assert from 'node:assert/strict';import fs from 'node:fs';
import {MasterBaremCatalog,sealEntry} from './master-barem.mjs';import {recoverUnpaidKidsBarem} from './kids-barem-recovery.mjs';
const doc=JSON.parse(fs.readFileSync('migration/kids-barem-20261012/catalog.approved.json')),catalog=new MasterBaremCatalog(doc);
for(const code of ['FF2-Tiết 43','D1-Tiết 41','D1-Tiết 35','FF2-Tiết 48']){
 const found=catalog.lookup('kids',code);assert.equal(found.status,'READY');assert.equal(catalog.lookup('kids',found.code).sha256,found.sha256);
}
const one=catalog.lookup('kids','FF2-Tiết 43');
const ambiguous=new MasterBaremCatalog({...doc,entries:[one,sealEntry({...one,code:'FF2-Tiết 43-Từ vựng',kind:'vocabulary'})]});
assert.throws(()=>ambiguous.lookup('kids','FF2-Tiết 43'),/BAREM_AMBIGUOUS/);
assert.throws(()=>catalog.lookup('kids','FF2-Tiết 99'),/BAREM_NOT_FOUND/);
const make=(id,extra={})=>({row:Number(id)+1,job:{id,status:'NEEDS_REVIEW',error:'BAREM_NOT_FOUND',attempts:0,cls:{className:'KIDS 1'},receipt:{code:'FF2-Tiết 43',student:id},...extra}});
const jobs=[make('1'),make('2'),make('3'),make('4',{rawId:'raw'}),make('5',{gradeId:'grade'}),make('6',{snapshotId:'input'}),make('7',{generationReservation:'unknown'}),make('8',{runnerGenerationStarted:true}),make('9',{apiUsage:{}}),make('10',{attempts:1}),make('11',{error:'GRADE_INVALID'}),make('12',{status:'RETURNED'})];
const original=JSON.stringify(jobs.slice(3));let current;
const c={runnerProperties:new Map(),loadJobs_:()=>jobs,routeForReceipt_:r=>{current=r.student;return {code:r.code,kind:'grammar'};},targetSnapshot_:()=>({headers:['test']}),currentAssignment_:()=>current!=='2',autoTarget_:(s,r,student)=>({value:student==='3'?'existing':''}),hasFeedback_:v=>!!v,persist_:()=>{}};
const result=recoverUnpaidKidsBarem(c,{deadline:100,maxJobs:25,now:()=>0});assert.deepEqual(result,{reopened:1,old:1,preserved:1,held:0});
assert.equal(jobs[0].job.status,'WAITING_INPUT');assert.equal(jobs[1].job.status,'SKIPPED_OLD_LESSON');assert.equal(jobs[2].job.status,'SKIPPED_EXISTING_FEEDBACK');assert.equal(JSON.stringify(jobs.slice(3)),original);
assert(c.runnerProperties.has('FLEET_SCAN_BAREM_ALIAS_CURSOR'));
console.log(JSON.stringify({event:'KIDS_LEGACY_BAREM_TESTS',passed:true,apiCalls:0,sheetWrites:0}));

const batchJobs=Array.from({length:130},(_,i)=>make(String(i+1))),batchCalls=[];
const batch={...c,runnerProperties:new Map(),loadJobs_:()=>batchJobs,currentAssignment_:()=>true,autoTarget_:()=>({value:''}),persistRecoveryBatch_:entries=>batchCalls.push(entries.map(e=>e.row))};
const full=recoverUnpaidKidsBarem(batch,{deadline:100,now:()=>0});assert.equal(full.reopened,130);assert.deepEqual(batchCalls.map(x=>x.length),[50,50,30]);
const bad=make('1'),precise={...batch,loadJobs_:()=>[bad],autoTarget_:()=>{throw Error('STUDENT_AMBIGUOUS');}};recoverUnpaidKidsBarem(precise,{deadline:100,now:()=>0});assert.equal(bad.job.error,'STUDENT_AMBIGUOUS');assert.equal(bad.job.baremRoutingRecovery.previousError,'BAREM_NOT_FOUND');
const paid=make('1',{generateRequests:1}),originalPaid=JSON.stringify(paid);recoverUnpaidKidsBarem({...batch,loadJobs_:()=>[paid]},{deadline:100,now:()=>0});assert.equal(JSON.stringify(paid),originalPaid);
const {planContinuation}=await import('./kids-lane-continuation.mjs');assert.equal(planContinuation([make('1').job],0,()=>true).due,1);assert.equal(planContinuation([make('1').job],0,()=>false).due,0);assert.equal(planContinuation([paid.job],0,()=>true).due,0);
console.log('Batch recovery, precise secondary errors, saved-call protection and continuation passed.');
