import assert from 'node:assert/strict';
import {authorizeInvalidRetry,authorizedInvalidRetry,invalidArtifactProof,invalidRetryId,invalidRetryGenerationDigest,INVALID_RETRY_AUTH,initializeAuthorizedRetryInventory} from './authorized-invalid-retry.mjs';
import vm from 'node:vm';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'invalid-retry-test-')),approvalFile=path.join(temp,'approval.json');process.env.INVALID_RESULT_RETRY_AUTH_FILE=approvalFile;
import {automaticEligible} from './automatic-authorization.mjs';
import {selectExisting} from './frozen-backlog-policy.mjs';
import {providerRetryCandidate,planProviderRetries} from './provider-retry-policy.mjs';
import {dashboardReprocessPlan,authorizeEmptyDashboardReprocess} from './dashboard-reprocess.mjs';
const rejected={candidates:[{finishReason:'RECITATION'}]},valid={candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({assessable:true,band:'0%',roseSections:[{label:'Feedback',text:'Actual assessment.'}]})}]}}]},unassessable={candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({assessable:false,band:'',reason:'NO_SPEECH_DETECTED',roseSections:[]})}]}}]};
const base={id:'SYNTHETIC-PARENT',cls:{spreadsheetId:'SYNTHETIC-BOOK',className:'KIDS 99'},route:{code:'DE-01',kind:'reading',sourceTab:'SYNTHETIC-FORM'},receipt:{className:'KIDS 99',student:'SYNTHETIC PUPIL',code:'DE-01',row:3,time:'2026-10-20T01:00:00.000Z',links:'https://drive.google.com/file/d/SYNTHETIC_SOURCE/view'},status:'SYSTEM_GRADING_ERROR',rawId:'old-raw',generateRequests:1,physicalGenerateRequests:1,apiUsage:{total:123},masterGenerationReserved:true};
function fixture(changes={}){
 const parent={...structuredClone(base),...changes},entries=[{row:2,job:parent}],before=JSON.stringify(parent),writes=[];
 const cell={getDisplayValue:()=>'',getFormula:()=>'',getDataValidation:()=>null};
 const c={currentRoster_:()=>true,freshReceipt_:()=>structuredClone(parent.receipt),readArtifact_:id=>id==='old-raw'?rejected:id==='valid-raw'?valid:(()=>{throw Error('MISSING');})()};
 const persist=child=>(writes.push(structuredClone(child)),22);
 fs.writeFileSync(approvalFile,JSON.stringify({authorization:INVALID_RETRY_AUTH,generationDigests:[invalidRetryGenerationDigest(parent)]}));
 return {parent,entries,before,writes,cell,c,persist,run(){return authorizeInvalidRetry(c,entries[0],entries,cell,persist);}};
}
{
 const f=fixture(),child=f.run();assert(child);assert.equal(child.row,22);assert.equal(JSON.stringify(f.parent),f.before,'paid parent preserved byte-for-byte');
 assert.equal(child.job.id,invalidRetryId(f.parent));assert.equal(child.job.generateRequests,0);assert.equal(child.job.rawId,undefined);assert.equal(child.job.apiUsage,undefined);assert.deepEqual(child.job.media,[]);assert.equal(child.job.snapshotId,undefined);assert.equal(child.job.autoManaged,true);
 assert(authorizedInvalidRetry(child.job,f.entries));assert(automaticEligible(child.job,f.entries.map(x=>x.job)));
 assert.equal(f.run(),child);assert.equal(f.writes.length,1,'same receipt can append exactly one child');
 delete child.job.media;let saved=0;assert(initializeAuthorizedRetryInventory(child.job,f.entries,()=>saved++));assert.equal(saved,1);assert.deepEqual(child.job.media,[]);assert.equal(initializeAuthorizedRetryInventory(child.job,f.entries,()=>saved++),false);
 const native=vm.createContext({Date,job:child.job,keys_:()=>['SYNTHETIC-KEY'],hash_:s=>'HASH-'+s,prop_:()=>({getProperty:k=>({'GEMINI_API_KEYS':'SYNTHETIC-KEY','GEMINI_KEY_PROJECT_IDS':'SYNTHETIC-PROJECT','GEMINI_POOL_COOLDOWNS':'{}'})[k]||''}),fleetModelPool_:()=>['gemini-3.8-flash'],configuredModel_:()=> 'gemini-3.8-flash',FALLBACK_MODEL_NAMES:[],require_:(ok,why)=>{if(!ok)throw Error(why);},persist_:()=>{},audit_:()=>{},fleetNeedsUpload_:()=>false});
 vm.runInContext(fs.readFileSync(new URL('./gas/FleetKeyPool.gs',import.meta.url),'utf8'),native);child.job.status='READY';native.job={...child.job,media:undefined};assert.throws(()=>vm.runInContext('preparePoolRetry_(job,22)',native),/media.*iterable/,'reproduce the actual native initialization failure');native.job=child.job;vm.runInContext('preparePoolRetry_(job,22)',native);assert.equal(child.job.keyHash,'HASH-SYNTHETIC-KEY');assert.deepEqual(child.job.media,[]);assert.equal(child.job.generateRequests,0,'actual native pool setup performs no generation');assert.equal(JSON.stringify(f.parent),f.before);
 const target={...f.parent.cls,student:f.parent.receipt.student,code:f.parent.receipt.code,submissionAt:f.parent.receipt.time};assert.equal(selectExisting(target,f.entries),child,'authorized child selected before failed saved parent');
 child.job.rawId='new-invalid';child.job.generateRequests=1;child.job.status='SYSTEM_GRADING_ERROR';assert.equal(authorizeInvalidRetry(f.c,child,f.entries,f.cell,f.persist),null);assert.equal(automaticEligible(child.job,f.entries.map(x=>x.job)),false);assert.equal(f.writes.length,1);
 delete child.job.media;assert.equal(initializeAuthorizedRetryInventory(child.job,f.entries,()=>{throw Error('paid job must not be changed');}),false);
 const rejectedAgain={...structuredClone(child.job),rawId:undefined,status:'WAITING_PROVIDER_QUOTA',providerFailure:{http:429},error:'PROVIDER_QUOTA_REJECTED'};
 assert.equal(providerRetryCandidate(rejectedAgain),false);assert.equal(dashboardReprocessPlan(rejectedAgain,'✅ ĐÃ NỘP\n— NHẬN XÉT GV —','third'),null);
 const noRawParent={...structuredClone(f.parent),rawId:undefined,apiUsage:undefined,providerFailure:{http:429},status:'WAITING_PROVIDER_QUOTA'};
 assert.equal(planProviderRetries([noRawParent,rejectedAgain],{lane:'kids',isLatest:()=>true,emptyTarget:()=>true}).length,0,'older retry handlers cannot license a third attempt through the parent');
 assert.equal(authorizeEmptyDashboardReprocess({destination_:()=>{throw Error('must be skipped');}},[{job:noRawParent,row:2},{job:rejectedAgain,row:22}]),0,'legacy dashboard recovery cannot create a second child through the parent');
 const changed=structuredClone(child.job);changed.receipt.links+='?tampered';assert.equal(authorizedInvalidRetry(changed,f.entries),false);assert.equal(automaticEligible({...changed,rawId:undefined,generateRequests:0,status:'WAITING_INPUT'},f.entries.map(x=>x.job)),false);
 f.entries.push({row:23,job:{...structuredClone(f.parent),id:'LATE-VALID',rawId:'valid-raw'}});assert.equal(authorizedInvalidRetry(child.job,f.entries),false,'later unreviewed saved result blocks authorization');
}
for(const change of [{rawId:'valid-raw'},{rawId:'missing-raw'},{previousGradingAttempts:[{rawId:'valid-raw'}]},{rawId:undefined,error:'UNCERTAIN_GENERATION'},{presentationResubmissionRequired:{reason:'confirmed'}},{manualReviewRequired:true}]){const f=fixture(change);assert.equal(f.run(),null,JSON.stringify(change));assert.equal(f.writes.length,0);assert.equal(JSON.stringify(f.parent),f.before);}
for(const guard of ['formula','checkbox','feedback','roster','receipt']){const f=fixture();if(guard==='formula')f.cell.getFormula=()=>'=TRUE';if(guard==='checkbox')f.cell.getDataValidation=()=>({type:'BOOLEAN'});if(guard==='feedback')f.cell.getDisplayValue=()=>'— NHẬN XÉT GV —\n80% Actual teacher review';if(guard==='roster')f.c.currentRoster_=()=>false;if(guard==='receipt')f.c.freshReceipt_=()=>({...f.parent.receipt,time:'2026-10-21T01:00:00Z'});assert.equal(f.run(),null,guard);assert.equal(f.writes.length,0);}
{const f=fixture();f.parent.rawId='future-invalid';f.c.readArtifact_=()=>rejected;assert.equal(f.run(),null,'approval of old results does not license future failures');assert.equal(f.writes.length,0);}
assert.equal(invalidArtifactProof(valid,base),null,'zero is a valid assessment');assert(invalidArtifactProof(unassessable,base));assert.equal(invalidArtifactProof(unassessable,{...base,recordingIssue:{status:'NEEDS_RESUBMISSION'}}),null);
{
 const f=fixture({rawId:undefined,systemGradingFailure:{httpCode:429}});assert(f.run(),'explicit recorded rejection can use one authorized attempt');assert.equal(JSON.stringify(f.parent),f.before);
}
console.log(JSON.stringify({tests:'one authorized invalid-result child; historical/zero-score/teacher/source guards; deterministic deduplication; no third call',passed:true,providerCalls:0,liveSheetWrites:0}));
fs.rmSync(temp,{recursive:true,force:true});delete process.env.INVALID_RESULT_RETRY_AUTH_FILE;
