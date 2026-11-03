import assert from 'node:assert/strict';
import {UNPAID_RECOVERY,unpaidRecoveryEligible,reopenUnpaidItem} from './unpaid-recovery.mjs';
const target={spreadsheetId:'s',className:'KIDS 30',student:'KEVIN',code:'Peppa-22',cell:'DE12',submissionAt:'2026-11-01T14:07:36.828Z'};
const job=(o={})=>({id:'j1',status:'SYSTEM_GRADING_ERROR',error:'SYSTEM_PROCESSING_ERROR',attempts:0,cls:{spreadsheetId:'s',className:'KIDS 30'},route:{code:'Peppa-22'},receipt:{student:'KEVIN',code:'Peppa-22',className:'KIDS 30',time:target.submissionAt,links:'https://drive.google.com/open?id=abc'},media:[],snapshotId:'runner:snap',systemGradingFailure:{cause:'RUNNER_ARTIFACT_MISSING',code:'SYSTEM_PROCESSING_ERROR',studentActionRequired:false},queueQuarantine:{reason:'SYSTEM_PROCESSING_ERROR'},...o});
const item=()=>({id:'i1',target,state:'QUARANTINED',error:'SYSTEM_PROCESSING_ERROR',attempt_count:1,attempts:[{state:'PENDING_VALIDATION',calls:0},{state:'HELD',calls:0}],queueQuarantine:{reason:'SYSTEM_PROCESSING_ERROR',rawId:null}});
const context=(o={})=>{const saved=[];return {saved,currentRoster_:()=>o.roster??true,persist_:(j,row)=>saved.push([j.status,row]),hasFeedback_:t=>/Chất lượng/.test(t),destination_:()=>({cell:{getFormula:()=>o.formula||'',getDataValidation:()=>o.validation||null,getDisplayValue:()=>o.text||'✅ ĐÃ NỘP\n01/11/2026 21:07\n\n— NHẬN XÉT GV —'}})};};
const run=(j,c=context(),it=item(),extra=[])=>{const entry={row:9,job:j};return {result:reopenUnpaidItem(it,entry,[entry,...extra],{context:c,now:Date.UTC(2026,10,3)}),it,j,c};};
let r=run(job());assert.equal(r.result,true);assert.equal(r.j.status,'READY');assert.equal(r.it.state,'PENDING_VALIDATION');assert.equal(r.it.error,null);assert.equal(r.it.attempts.length,2,'attempt history stays');assert.equal(r.j.snapshotId,'runner:snap');assert.equal(r.j.queueQuarantine,undefined);assert.deepEqual(r.c.saved,[['READY',9]]);
assert.equal(unpaidRecoveryEligible(r.j),false,'a second reopen is impossible');
assert.equal(run(job({systemGradingFailure:{cause:'PREFLIGHT_DESTINATION_CHANGED',studentActionRequired:false}})).result,true);
// Anything that may have reached the provider, or already has a result, stays closed.
for(const paid of [{generateRequests:1},{physicalGenerateRequests:1},{rawId:'runner:raw'},{gradeId:'g'}])assert.equal(run(job(paid)).result,false,JSON.stringify(paid));
assert.equal(run(job({systemGradingFailure:{cause:'PROVIDER_RESPONSE_BLOCKED',studentActionRequired:false}})).result,false);
assert.equal(run(job({systemGradingFailure:{cause:'RUNNER_ARTIFACT_MISSING',studentActionRequired:true}})).result,false);
assert.equal(run(job({presentationResubmissionRequired:true})).result,false);
assert.equal(run(job({unpaidRecovery:{version:UNPAID_RECOVERY}})).result,false);
assert.equal(run(job(),context(),{...item(),state:'DONE'}).result,false);
// Teacher feedback, protected cells, removed pupils and newer submissions win.
assert.equal(run(job(),context({text:'✅ ĐÃ NỘP\n— NHẬN XÉT GV —\nChất lượng: đạt 80%'})).result,false);
assert.equal(run(job(),context({formula:'=A1'})).result,false);
assert.equal(run(job(),context({validation:{}})).result,false);
assert.equal(run(job(),context({roster:false})).result,false);
const newer={row:10,job:job({id:'j2',status:'READY',receipt:{...job().receipt,time:'2026-11-02T01:00:00.000Z'}})};
assert.equal(run(job(),context(),item(),[newer]).result,false);
console.log(JSON.stringify({test:'unpaid-recovery-tests.mjs',passed:true,providerCalls:0}));
