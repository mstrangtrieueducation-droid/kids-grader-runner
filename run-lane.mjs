import './hosted-bootstrap.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createDecipheriv} from 'node:crypto';import {gunzipSync} from 'node:zlib';import {spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url)),lane='kids',repository='mstrangtrieueducation-droid/'+lane+'-grader-runner';
const required=n=>{const v=process.env[n]?.trim();if(!v)throw Error('MISSING_'+n);return v;};
const runTest=name=>{const r=spawnSync(process.execPath,[name],{cwd:root,env:{...process.env,NATIVE_YOUTUBE_INPUT:'false',SHEET_TRUTH_SYNC:'false',MODEL_GRADING_AVAILABLE:'true'},encoding:'utf8',windowsHide:true,maxBuffer:10*1024*1024});if(r.status){fs.mkdirSync(path.join(root,'private'),{recursive:true});fs.writeFileSync(path.join(root,'private','test-failure.txt'),r.stdout+'\n'+r.stderr);throw Error('SAFEGUARD_TEST_FAILED');}console.log(JSON.stringify({test:name,passed:true,providerCalls:0}));};
async function main(){
 runTest('audio-completeness-tests.mjs');
 runTest('kids-folder-inventory-tests.mjs');
 runTest('submission-source-tests.mjs');runTest('receipt-body-tests.mjs');runTest('unpaid-google-retry-tests.mjs');runTest('native-youtube-tests.mjs');runTest('current-roster-policy-tests.mjs');runTest('native-metadata-compat-tests.mjs');runTest('source-access-notices-tests.mjs');runTest('priority-kids-drain-tests.mjs');
 const mode=process.env.MODE||'audit';if(!['validate','audit','grade'].includes(mode))throw Error('MODE_INVALID');
 const publicTests=["runner-tests.mjs", "kids-content-routing-tests.mjs","replay-safety-tests.mjs","master-policy-tests.mjs","new-policy-tests.mjs","export-runtime-import-tests.mjs","canonical-audio-tests.mjs","automatic-work-queue-tests.mjs","linked-destination-binding-tests.mjs","retired-reference-inputs-tests.mjs","source-input-guards-tests.mjs"];runTest('automatic-authorization-tests.mjs');runTest('export-safeguards.mjs');for(const n of publicTests)runTest(n);
 runTest('master-cross-class-sweep-tests.mjs');runTest('master-first-snapshot-tests.mjs');runTest('student-speech-evidence-tests.mjs');runTest('master-submission-scope-tests.mjs');runTest('saved-speaking-consistency-tests.mjs');
 runTest('returned-score-policy-tests.mjs');runTest('dashboard-feedback-tests.mjs');runTest('dashboard-reprocess-tests.mjs');runTest('saved-delivery-repair-tests.mjs');runTest('kids-intake-order-tests.mjs');runTest('batch-artifact-index-tests.mjs');runTest('current-batch-snapshot-tests.mjs');runTest('drain-forward-progress-tests.mjs');
 runTest('submission-assignment-scope-tests.mjs');runTest('frozen-backlog-tests.mjs');runTest('ingestion-policy-tests.mjs');runTest('core-media-resolver-tests.mjs');runTest('media-source-notice-recovery-tests.mjs');runTest('campaign-recovery-tests.mjs');runTest('persistent-kids-queue-tests.mjs');runTest('continuous-intake-tests.mjs');runTest('continuous-kids-service-tests.mjs');runTest('campaign-saved-replay-tests.mjs');
 runTest('sheet-truth-merge-chunk-tests.mjs');runTest('authorized-invalid-retry-tests.mjs');runTest('kids-apple-input-recovery-tests.mjs');
 runTest('timely-kids-queue-tests.mjs');
 runTest('continuous-dispatcher-tests.mjs');
 runTest('universal-media-tests.mjs');runTest('partial-download-resume-tests.mjs');
 runTest('provider-retry-policy-tests.mjs');
 runTest('kids-provider-retry-tests.mjs');
 runTest('screen-grounding-tests.mjs');
 runTest('grading-failure-policy-tests.mjs');
 runTest('kids-model-access-recovery-tests.mjs');
 runTest('critical-homework-policy-tests.mjs');
 runTest('feedback-alignment-tests.mjs');runTest('feedback-contrast-tests.mjs');
 if(mode==='validate')return;
 if(process.env.GITHUB_ACTIONS==='true'&&(process.env.GITHUB_REPOSITORY!==repository||process.env.GITHUB_REF!=='refs/heads/'+required('RUNNER_DEFAULT_BRANCH')))throw Error('TRUSTED_REPOSITORY_AND_BRANCH_REQUIRED');
 if(mode==='grade'&&process.env.GRADING_ENABLED!=='true')throw Error('HANDOFF_NOT_ENABLED');
 if(mode==='grade'){process.env.AUTOMATIC_GRADING_AUTHORIZED='true';process.env.MASTER_CROSS_CLASS_SWEEP='true';}
 const bytes=fs.readFileSync(path.join(root,'approved-policy.enc'));if(bytes.subarray(0,4).toString()!=='GB01')throw Error('PRIVATE_BUNDLE_SCHEMA_INVALID');
 const decipher=createDecipheriv('aes-256-gcm',Buffer.from(required('PRIVATE_BUNDLE_KEY'),'base64'),bytes.subarray(4,16));decipher.setAAD(Buffer.from(repository));decipher.setAuthTag(bytes.subarray(16,32));
 const bundle=JSON.parse(gunzipSync(Buffer.concat([decipher.update(bytes.subarray(32)),decipher.final()])).toString('utf8'));
 const config=bundle.config; if(config.kids?.model!=='gemini-3.8-flash'||config.kids?.routing!=='teacher-master-v2-20261014')throw Error('MASTER_POLICY_BINDING_REQUIRED'); const sa=JSON.parse(required('GOOGLE_SERVICE_ACCOUNT_JSON')),key=required('GEMINI_KEY_'+lane.toUpperCase());
 if(bundle.lane!==lane||bundle.schema!=='private-grading-bundle-v1'||config.approvedRepository!==repository||config.serviceAccount!==sa.client_email)throw Error('PRIVATE_BINDING_INVALID');
 fs.mkdirSync(path.join(root,'private'),{recursive:true,mode:0o700});
 const invalidApprovalFile=path.join(root,'approved-invalid-retry.enc');if(fs.existsSync(invalidApprovalFile)){
  const b=fs.readFileSync(invalidApprovalFile);if(b.subarray(0,4).toString()!=='IR01')throw Error('INVALID_RETRY_ENVELOPE');const d=createDecipheriv('aes-256-gcm',Buffer.from(required('PRIVATE_BUNDLE_KEY'),'base64'),b.subarray(4,16));d.setAAD(Buffer.from(repository+'/invalid-result-retry'));d.setAuthTag(b.subarray(16,32));const value=gunzipSync(Buffer.concat([d.update(b.subarray(32)),d.final()]));const approval=JSON.parse(value);if(approval.authorization!=='teacher-invalid-result-one-new-attempt-20261027'||!Array.isArray(approval.generationDigests))throw Error('INVALID_RETRY_APPROVAL_BINDING');process.env.INVALID_RESULT_RETRY_AUTH_FILE=path.join(root,'private','invalid-result-retry-approval.json');fs.writeFileSync(process.env.INVALID_RESULT_RETRY_AUTH_FILE,value,{mode:0o600});
 }
 process.env.RUNNER_CONFIG=JSON.stringify(config);process.env.GOOGLE_CREDENTIALS=JSON.stringify(sa);process.env.GEMINI_API_KEY=key;process.env.KIDS_NATIVE_CONFIG=JSON.stringify(config.nativeConfig);process.env.RUNNER_SHEET_BATCH='1';process.env.RUNNER_HOST='github';if(bundle.nonStudentAudioRegistry)fs.writeFileSync(path.join(root,'private/non-student-audio-registry.json'),JSON.stringify(bundle.nonStudentAudioRegistry));
 if(lane==='kids'){const catalog=path.join(root,'migration/kids-barem-20261012/catalog.approved.json');fs.mkdirSync(path.dirname(catalog),{recursive:true});fs.writeFileSync(catalog,JSON.stringify(bundle.barem),{mode:0o600});process.env.MASTER_BAREM_CATALOG=catalog;runTest('kids-barem-recovery-tests.mjs');}
 else{fs.writeFileSync(path.join(root,'shadowing-references.json'),JSON.stringify(bundle.references),{mode:0o600});runTest('shadowing-tests.mjs');}
 const {Google,request}=await import('./google-adapter.mjs');const google=new Google(sa),model=lane==='kids'?config.kids.model:config.shadowing.model;
 const metadata=request({url:'https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model),headers:{'x-goog-api-key':key},timeoutMs:30000});if(metadata.getResponseCode()!==200)throw Error('MODEL_PREFLIGHT_FAILED');
 if(mode==='audit'){
  const counts={};for(const id of lane==='kids'?config.clusters.map(c=>c.controlId):[config.shadowing.controlId]){const range=lane==='kids'?"'Jobs'!F2:F5000":"'SHADOWING AI'!F2:F5000";const rows=google.api('https://sheets.googleapis.com/v4/spreadsheets/'+id+'/values/'+encodeURIComponent(range)).values||[];for(const r of rows)if(r[0]){try{const j=JSON.parse(r[0]);counts[j.status]=(counts[j.status]||0)+1;}catch{counts.INVALID=(counts.INVALID||0)+1;}}}
  console.log(JSON.stringify({audit:true,counts,providerGenerateCalls:0}));return;
 }
 const workDeadline=Date.now()+300*60000;
 const encrypted=fs.readFileSync(path.join(root,'backlog_563.enc'));if(encrypted.subarray(0,4).toString()!=='FB01')throw Error('BACKLOG_ENVELOPE_INVALID');
 const decoder=createDecipheriv('aes-256-gcm',Buffer.from(required('PRIVATE_BUNDLE_KEY'),'base64'),encrypted.subarray(4,16));decoder.setAAD(Buffer.from(repository+'/frozen-backlog'));decoder.setAuthTag(encrypted.subarray(16,32));
 const target=path.join(root,'private','backlog_563.json');fs.writeFileSync(target,gunzipSync(Buffer.concat([decoder.update(encrypted.subarray(32)),decoder.final()])));
 process.env.GOOGLE_SHEETS_INTERVAL_MS='2000';process.env.GOOGLE_RATE_GATE_FILE=path.join(root,'private','campaign-google-rate.json');
 const {runFrozenBacklog}=await import('./frozen-backlog-runner.mjs'),{prepareNativeTodo}=await import('./persistent-kids-queue.mjs'),{runnerGoogle,buildContext}=await import('./grader_runner.mjs'),{intakeNewKidsReceipts}=await import('./continuous-intake.mjs'),{runKidsService}=await import('./continuous-kids-service.mjs');
 const todoFile=path.join(root,'private','native-kids-todo.json');
 const refreshNativeLedgers=()=>{runnerGoogle.invalidate();for(const cluster of config.clusters)runnerGoogle.book(cluster.controlId).refresh();};
 await runKidsService({deadline:workDeadline,
  intake:()=>intakeNewKidsReceipts({config,google:runnerGoogle,buildContext,emit:x=>console.log(JSON.stringify(x))}),
  runFrozen:minutes=>{refreshNativeLedgers();return runFrozenBacklog(target,{minutes});},
  prepareTodo:()=>{refreshNativeLedgers();return prepareNativeTodo(todoFile,{config,google:runnerGoogle,buildContext});},
  discover:async scanMinutes=>{
   const scan=spawnSync(process.execPath,[path.join(root,'grader_runner.mjs'),'--scheduled','--scan-only','--max-minutes='+scanMinutes],{cwd:root,env:process.env,encoding:'utf8',windowsHide:true,timeout:(scanMinutes+2)*60000,maxBuffer:20*1024*1024});
   if(scan.status!==0){fs.writeFileSync(path.join(root,'private','intake-scan-failure.txt'),scan.stdout+'\n'+scan.stderr);throw Error('NATIVE_INTAKE_SCAN_FAILED');}runnerGoogle.invalidate();
  },
  runTodo:minutes=>runFrozenBacklog(todoFile,{table:'KidsTodo',minutes})
 });
 return;
 let finished=0,requests=0;
 if(lane==='kids'){
  // The child stops new work at40min. Allow final raw/usage/Sheet checkpoints to finish without a 45min hard kill.
  const result=spawnSync(process.execPath,[path.join(root,'grader_runner.mjs'),'--scheduled','--drain','--max-minutes=40',...(process.env.RUNNER_VERIFY_NEW_MODEL==='true'?['--new-only']:[])],{cwd:root,env:process.env,encoding:'utf8',windowsHide:true,timeout:70*60000,maxBuffer:20*1024*1024});
  const phases=(result.stdout||'').split('\n').flatMap(line=>{try{const e=JSON.parse(line);return ['CLUSTER_STARTED','CLUSTER_COMPLETE','JOB_STARTED','JOB','MASTER_SWEEP_SCANNED','MASTER_SWEEP_REPORT','RUN_COMPLETE','NO_FORWARD_PROGRESS_DEFERRED'].includes(e.event)?[{event:e.event,...(['scan','cache','existing','priority','ready','prepare','repair'].includes(e.phase)?{phase:e.phase}:{}),...(Number.isFinite(e.elapsedMs)?{elapsedMs:e.elapsedMs}:{}),...(Number.isFinite(e.finished)?{finished:e.finished}:{}),...(Number.isFinite(e.paidCalls)?{paidCalls:e.paidCalls}:{})}]:[];}catch{return [];}});console.log(JSON.stringify({event:'KIDS_CHILD_PROGRESS',events:phases.slice(-12),jobsStarted:phases.filter(e=>e.event==='JOB_STARTED').length,noProgressDeferred:phases.filter(e=>e.event==='NO_FORWARD_PROGRESS_DEFERRED').length}));
  if(result.status!==0){fs.writeFileSync(path.join(root,'private','run-failure.txt'),result.stdout+'\n'+result.stderr);console.error(JSON.stringify({event:'KIDS_CHILD_DIAGNOSTIC',exitCode:result.status,signal:result.signal||null,transportCode:result.error?.code||null,softWorkMinutes:40,checkpointGraceMinutes:30}));throw Error('KIDS_RUN_FAILED');}
  const counter=JSON.parse(fs.readFileSync(path.join(root,'private/last-run.json'),'utf8'));finished=counter.finished;requests=counter.paidCalls;
 }else{
  const {runShadowing}=await import('./shadowing-runner.mjs'),{buildContext}=await import('./grader_runner.mjs');const media=buildContext(config.clusters[0]),deadline=Date.now()+40*60000;
  do{const r=runShadowing({google,config,key,root,deadline,emit:()=>{},maxJobs:Math.min(8,16-finished),maxApiCalls:Math.min(8,16-requests),prepareAudio:(job,m,save,end)=>{
   const keyHash=media.hash_(key),model=config.shadowing.model;if(job.keyHash&&job.keyHash!==keyHash){if(job.rawId||job.gradeId)throw Error('SAVED_RESULT_MUST_NOT_BE_REGENERATED');media.bindPoolJob_(job,{keyHash,model});save();}else{job.keyHash=keyHash;job.generationModel=model;}return media.mediaPart_(job,m,save,end);
  },cleanupAudio:job=>media.cleanupMedia_(job)});finished+=r.finished;requests+=r.paidCalls;if(!r.attempted||!r.paidCalls&&!r.finished)break;}while(Date.now()<deadline-120000&&finished<16&&requests<16);
 }
 const report={lane,finished,providerGenerateCalls:requests};console.log(JSON.stringify(report));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`${lane}: ${finished} results returned; ${requests} provider requests.\n`);
 if(lane==='kids'&&bundle.progressConfig){try{const {refreshProgressDashboard}=await import('./progress-dashboard.mjs');refreshProgressDashboard(google,bundle.progressConfig,'GitHub public — quét định kỳ và giữ checkpoint');console.log(JSON.stringify({teacherProgressUpdated:true}));}catch{console.log(JSON.stringify({teacherProgressUpdated:false,gradingResultsPreserved:true}));}}

}
main().catch(e=>{const code=/^[A-Z][A-Z0-9_]+$/.test(e.message||'')?e.message:'RUN_FAILED';console.error(JSON.stringify({failed:true,code}));process.exitCode=1;});
