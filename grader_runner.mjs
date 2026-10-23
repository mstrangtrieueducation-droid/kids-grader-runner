import {createCurrentRosterCheck,markNotCurrent} from './current-roster-policy.mjs';
import {settleSheetTruth} from './sheet-truth-sync.mjs';
import {installSubmissionSourceGate} from './submission-source-kids.mjs';
import {createMediaService,firstUniversalPart,downloadWithRetry} from './universal-media.mjs';
import {installCompactKids} from './master-compact-output.mjs';
import {installKidsPreprocessing} from './automatic-preprocessing.mjs';
import {installCriticalHomeworkPolicy,verifyLiveCriticalTarget,criticalPriorityWork} from './critical-homework-policy.mjs';
import {installFeedbackAlignment} from './feedback-alignment.mjs';
import {SCREEN_GROUNDING_VERSION} from './screen-grounding.mjs';
import {extractScreenFrames,screenFramesReady} from './phonics-frame.mjs';
import {addAutomaticAuthorizations} from './automatic-authorization.mjs';
import {authorizeFairKidsWork,authorizedWorkQueue,authorizedPhaseQueue,sourceRepairQueue,deferFleetMaintenance} from './automatic-work-queue.mjs';
import {installSubmissionAssignmentScope} from './submission-assignment-scope.mjs';
import {installKidsAppleInputRecovery} from './kids-apple-input-recovery.mjs';
import {installKidsModelAccessRecovery} from './kids-model-access-recovery.mjs';
import {installKidsProviderRetry} from './kids-provider-retry.mjs';
import {installTimelyKidsQueue} from './timely-kids-queue.mjs';
import {installLinkedDestinationBindings} from './linked-destination-binding.mjs';
import {masterSweepEnabled} from './master-cross-class-sweep.mjs';
import {prepareKidsMasterSweep,installMasterScoreProtection,hasHostedKidsCache} from './master-kids-sweep.mjs';
import {beginSheetBatch,replaySheetBatches} from './kids-sheet-batch.mjs';
import {installContentRouting} from './kids-content-routing.mjs';
import {installMasterKids} from './master-kids.mjs';
import {installReturnedScorePolicy} from './returned-score-policy.mjs';
import {installDashboardFeedback} from './dashboard-feedback.mjs';
import {MASTER_MODEL,MASTER_TERMINAL,generationSpent} from './master-policy.mjs';
import {nextDrainWait} from './runner-policies.mjs';
import {extractStudentAudio,inspectAudio} from './student-audio.mjs';
import {approvalSession,acceptTeacherApprovals,installTeacherApprovalGuards} from './teacher-approval-guards.mjs';
import {verifyCodeFreeze} from './code-freeze.mjs';
import {MasterBaremCatalog,installKidsBarem} from './master-barem.mjs';
import {recoverUnpaidKidsBarem} from './kids-barem-recovery.mjs';
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {spawnSync} from 'node:child_process';import {randomUUID,createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {Google,Blob,RichBuilder,Style,request,utilities,pause} from './google-adapter.mjs';
import {localGuard,stateStore} from './runner-state.mjs';
import {isNewer,pronunciationEvidence,cameraEvidence,chooseTrackerTab,mediaQueuePriority,googleQueueFailure,throughputQueue,hasUploadedMedia,reusableReference,mediaPolicy,mediaDecision,canRepairTaskReference,kidsReleaseCompatible,jobShard,workerLanes} from './runner-policies.mjs';
import {tryFileLock} from './shared-gate.mjs';
import {MediaCache} from './media-cache.mjs';
import {extractPhonicsFrame,extractPresentationFrames,phonicsFrameParts} from './phonics-frame.mjs';


import {reconcileFeedbackColors} from './feedback-colors.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),cache=path.join(root,'private','cache');fs.mkdirSync(cache,{recursive:true});
const mediaCache=new MediaCache(cache);
verifyCodeFreeze(root);
const config=JSON.parse(process.env.RUNNER_CONFIG||fs.readFileSync(path.join(root,'private','runner-config.json'),'utf8'));
config.kids={...config.kids,model:MASTER_MODEL,routing:'teacher-master-v1-20261014'};
const sa=JSON.parse(process.env.GOOGLE_CREDENTIALS||fs.readFileSync(path.join(root,'..','tracker-fast-pilot-20260924','private','google-service-account.json'),'utf8'));
const key=(process.env.GEMINI_API_KEY||fs.readFileSync(path.join(root,'private','gemini-key.txt'),'utf8')).trim();if(!key)throw Error('GEMINI_KEY_MISSING');
export const runnerGoogle=new Google(sa);installFeedbackAlignment(runnerGoogle);const google=runnerGoogle,args=new Set(process.argv.slice(2)),dry=args.has('--audit'),scanOnly=args.has('--scan-only');
const option=name=>process.argv.find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const poolWorker=args.has('--pool-worker'),poolSlot=Number(option('--pool-slot')||0),poolCount=Number(option('--pool-count')||5);
const lanes=workerLanes(poolCount,!!config.shadowing?.enabled),dedicatedShadow=poolWorker&&!lanes.kidsSlots.includes(poolSlot),kidsSlot=lanes.kidsSlots.indexOf(poolSlot),kidsCount=lanes.kidsSlots.length;
let poolState;
if(poolWorker){poolState=JSON.parse(fs.readFileSync(process.env.RUNNER_POOL_STATE));if(poolState.session!==process.env.RUNNER_POOL_SESSION)throw Error('POOL_SESSION_INVALID');process.kill(poolState.pid,0);}
const maxJobs=Number(option('--max-jobs')||Infinity),maxApiCalls=Number(option('--max-api-calls')||Infinity),maxMinutes=Number(option('--max-minutes')||80),until=Date.now()+maxMinutes*60000;
const ffmpeg=process.env.FFMPEG_PATH||(process.platform==='win32'?path.join(root,'..','ielts-speaking-gemini-20261010','private','runtime','imageio_ffmpeg','binaries','ffmpeg-win-x86_64-v7.1.exe'):'ffmpeg');
const universalMedia=createMediaService({g:google,root,ffmpeg});
const emit=x=>console.log(JSON.stringify({...x,at:new Date().toISOString()}));
let finished=0,paidCalls=0;const outcomes=[];
const recoveredClusters=new Set(),preparedClusters=new Set(),contexts=new Map(),lastScans=new Map(),referenceUploads=new Map();
let referenceStoreLoaded=false;
function referenceStore(){
 const b=google.book(config.clusters[0].controlId);
 const s=b.getSheetByName('RunnerReferences')||b.insertSheet('RunnerReferences');
 if(!referenceStoreLoaded){
  if(!s.getLastRow())s.appendRow(['cacheKey','state']);
  else if(s.getLastRow()>1)for(const [cacheKey,json] of s.getRange(2,1,s.getLastRow()-1,2).getValues())if(cacheKey&&json)referenceUploads.set(cacheKey,JSON.parse(json));
  referenceStoreLoaded=true;
 }
 return s;
}
function referenceKey(c,job,m){return c.hash_([m.id,m.modified,m.size,c.poolScope_(job.keyHash),mediaPolicy(job.route.kind)]);}
function registerReference(c,job,m){
 if(!m.isReference||!hasUploadedMedia(m))return;
 const u=m.runnerUpload?.name?{...m.runnerUpload}:{...m.upload,mime:m.mime};
 if(mediaPolicy(job.route.kind)==='audio'&&m.mime.startsWith('video/')&&!u.mime?.startsWith('audio/'))return;
 const tag=referenceKey(c,job,m);referenceStore();if(referenceUploads.get(tag)?.upload?.name===u.name){m.runnerSharedReference=true;return;}
 const value={upload:u,state:m.processingState||'',savedAt:Date.now()};
 referenceStore().appendRow([tag,JSON.stringify(value)]);referenceUploads.set(tag,value);m.runnerSharedReference=true;
}
function attachReference(c,job,m){
 if(!m.isReference||hasUploadedMedia(m))return;
 referenceStore();const cached=referenceUploads.get(referenceKey(c,job,m));
 if(!reusableReference(cached))return;
 m.runnerUpload={...cached.upload};m.runnerSharedReference=true;m.processingState=cached.state;
}
function safeError(e){return /^[A-Z0-9_: .-]+$/.test(e.message||'')?String(e.message).slice(0,160):'RUNNER_INTERNAL_ERROR';}
function sourceKey(c,r){let code=c.norm_(r.code);try{const a=c.assignmentIdentity_(r.code);code=[a.family,a.number,c.norm_(a.detail||'')].join('|');}catch{}return [c.norm_(r.className),c.norm_(r.student),code].join('|');}
export function buildContext(cluster){
 const kidsModel=MASTER_MODEL;
 const props=new Map(Object.entries({KIDS_NATIVE_CONFIG:process.env.KIDS_NATIVE_CONFIG||'{}',KIDS_CONTROL_ID:cluster.controlId,KIDS_ARTIFACT_FOLDER:cluster.artifactFolder,KIDS21_AUTOMATION:'ACTIVE',GEMINI_API_KEYS:key,GEMINI_MODEL:kidsModel,KIDS_MODEL_ROUTING:config.kids?.routing||'',GEMINI_KEY_PROJECT_IDS:cluster.projectId||'paid-central',GEMINI_PAID_CONFIRMED:'YES',GEMINI_PAID_PROJECT_ID:cluster.projectId||'paid-central'}));
 const prop={getProperty:k=>props.get(k)||null,setProperty:(k,v)=>{props.set(k,String(v));return prop;},deleteProperty:k=>{props.delete(k);return prop;},setProperties:x=>{Object.entries(x).forEach(([k,v])=>props.set(k,String(v)));return prop;}};
 const c=vm.createContext({Date,console,FLEET_CLUSTER:cluster,PropertiesService:{getScriptProperties:()=>prop},Utilities:utilities(),SpreadsheetApp:{openById:id=>google.book(id),flush:()=>{},newRichTextValue:()=>new RichBuilder(),newTextStyle:()=>new Style()},
  DriveApp:{getFileById:id=>google.file(id)},ScriptApp:{getOAuthToken:()=>google.token()},Logger:{log:()=>{}},UrlFetchApp:{fetch:(url,o={})=>{
   const headers={...(o.headers||{})};if(o.contentType)headers['Content-Type']=o.contentType;const q={url,method:(o.method||'GET').toUpperCase(),headers};if(o.payload instanceof Blob)q.bodyBase64=o.payload.bytes.toString('base64');else if(Array.isArray(o.payload))q.bodyBase64=Buffer.from(o.payload).toString('base64');else if(o.payload!==undefined)q.body=o.payload;return request(q);
  }} });
 const source=path.join(root,'gas');for(const f of fs.readdirSync(source).filter(f=>f.endsWith('.gs')))vm.runInContext(fs.readFileSync(path.join(source,f),'utf8'),c,{filename:f});
 // Teacher approved upgrading every Kids class; never silently downgrade to Lite.
 c.fleetModelPool_=()=>[MASTER_MODEL];
 c.configuredModel_=()=>MASTER_MODEL;c.model_=()=>MASTER_MODEL;c.fallbackModelFor_=()=>null;
 c.kidsTaskModel_=s=>({version:'teacher-master-v1-20261014',model:MASTER_MODEL,kind:s.kind,reason:'teacher_master'});
 c.routeKidsCostModel_=j=>{if(!j.rawId&&!j.gradeId){j.generationModel=MASTER_MODEL;j.model=MASTER_MODEL;}};
 c.assertClusterOwner_=()=>{if(!config.clusters.some(x=>x.controlId===cluster.controlId&&x.email===cluster.email)||sa.client_email!==config.serviceAccount)throw Error('RUNNER_CLUSTER_BINDING_INVALID');};
 c.assertClusterOwner_();
 const writeCurrent=c.writeGrade_;c.writeGrade_=(job,grade)=>{if(!kidsReleaseCompatible(job,grade,vm.runInContext('KIDS_REVIEW_VERSION',c)))throw Error('GRADE_POLICY_VERSION_REVIEW');return writeCurrent(job,grade);};
 const resolveClass=cls=>{const b=google.book(cls.spreadsheetId),sheetName=chooseTrackerTab(cls.sheetName,b.sheets.map(s=>s.getName()));return {...cls,sheetName};};
 const destination=c.destination_;c.destination_=(cls,route,student)=>{const resolved=resolveClass(cls),b=google.book(cls.spreadsheetId),s=b.getSheetByName(resolved.sheetName);if(!b.cache.has(resolved.sheetName+'|master'))google.preloadSource(cls.spreadsheetId,s.meta.properties.gridProperties.columnCount,[resolved.sheetName]);return destination(resolved,route,student);};
 const snapshot=c.targetSnapshot_,current=c.currentAssignment_;
 c.targetSnapshot_=cls=>{try{return snapshot(resolveClass(cls));}catch(e){if(!/^(DESTINATION_TAB_|GOOGLE_HTTP_(403|404))/.test(e.message))throw e;emit({event:'CLASS_TARGET_REVIEW',className:cls.className,error:safeError(e)});const headers=[];headers.runnerDestinationError=e.message;return {headers,values:[],formulas:[]};}};
 c.currentAssignment_=(headers,route)=>{if(headers.runnerDestinationError)throw Error(headers.runnerDestinationError);return current(headers,route);};
 const artifactIndex=new Map(),savedArtifacts=new Map();let artifactIndexLoaded=false,artifactHeaderReady=false;
 const indexArtifacts=()=>{const s=google.book(cluster.controlId).getSheetByName('RunnerArtifacts');if(!s)return null;const last=s.getLastRow();if(last>1)for(const [i,[id,part]] of s.getRange(2,1,last-1,2).getValues().entries())if(id){let rows=artifactIndex.get(id);if(!rows)artifactIndex.set(id,rows=[]);if(!rows.some(x=>x.row===i+2))rows.push({row:i+2,part:Number(part)});}artifactIndexLoaded=true;return s;};
 c.saveArtifact_=(name,data)=>{
  const book=google.book(cluster.controlId),s=book.getSheetByName('RunnerArtifacts')||book.insertSheet('RunnerArtifacts');if(!artifactHeaderReady){if(!s.getLastRow())s.appendRow(['artifactId','part','json']);artifactHeaderReady=true;}
  const id='runner:'+randomUUID(),text=JSON.stringify(data),rows=[];for(let i=0;i<text.length;i+=40000)rows.push([id,i/40000,text.slice(i,i+40000)]);s.appendRows(rows);artifactIndex.set(id,rows.map((_,i)=>({row:s.lastAppendRow+i,part:i})));savedArtifacts.set(id,text);return id;
 };
 c.readArtifact_=id=>{
  if(savedArtifacts.has(id))return JSON.parse(savedArtifacts.get(id));
  if(!String(id).startsWith('runner:'))return JSON.parse(google.file(id).getBlob().getDataAsString());
  let s=google.book(cluster.controlId).getSheetByName('RunnerArtifacts');if(!artifactIndexLoaded||!artifactIndex.has(id))s=indexArtifacts();const rows=artifactIndex.get(id);if(!s||!rows?.length)throw Error('RUNNER_ARTIFACT_MISSING');return JSON.parse(rows.sort((a,b)=>a.part-b.part).map(r=>s.getRange(r.row,3).getValue()).join(''));
 };
 const sourceCheck=c.currentSource_;c.currentSource_=job=>{
  google.refreshFileMetadata();
  google.books.get(job.cls.spreadsheetId)?.cache.clear();
  try{return sourceCheck(job);}catch(e){
   if(e.message!=='STALE_GUIDELINE'||!job.snapshotId||job.rawId||job.gradeId)throw e;
   const saved=c.readArtifact_(job.snapshotId),fresh=c.guide_(job.route);
   if(c.hash_(saved)!==c.hash_(fresh)){
    const safeAddition=saved.guide===fresh.guide&&saved.kind===fresh.kind&&JSON.stringify(saved.form)===JSON.stringify(fresh.form)&&JSON.stringify(saved.referenceMedia||[])===JSON.stringify(fresh.referenceMedia||[])&&JSON.stringify(saved.referenceAssets||[])===JSON.stringify(fresh.referenceAssets||[])&&fresh.reference.startsWith(saved.reference+'\nWEB SUBMISSION INSTRUCTIONS:\n');
    if(!safeAddition)throw e;
    job.snapshotId=c.saveArtifact_('web-requirements-refresh-'+job.id,fresh);
    c.audit_(job.id,'WEB_REQUIREMENTS_ADDED','Same task and reference media; now includes web submission template instructions before first generation');
   }
   job.previousSourceHash=job.sourceHash;job.sourceHash=c.hash_(fresh);
   c.audit_(job.id,'VERIFIED_SNAPSHOT_HASH_MIGRATION','Saved and current guideline content are identical');
   return sourceCheck(job);
  }
 };
 const stepCurrent=c.step_;
 c.step_=(job,row,deadline,options)=>{
  google.book(cluster.controlId).cache.clear();
  const held=c.kidsManualAssignmentHold_(job,c.loadJobs_());

  if(held){job.manualReviewRequired=true;job.manualAssignmentGrading=true;job.status=job.recordingIssue?.status==='NEEDS_RESUBMISSION'?'NEEDS_RESUBMISSION':'NEEDS_REVIEW';job.error=job.status==='NEEDS_RESUBMISSION'?(job.error||'GRADE_SUBMISSION_RESUBMIT'):'GRADE_MANUAL_RESUBMISSION';job.nextAt=0;job.manualReviewFrom=held.job.id;c.persist_(job,row);return;}
  return stepCurrent(job,row,deadline,options);
 };
 const originalPreflight=c.kidsCostPreflight_;
 c.kidsCostPreflight_=job=>{google.refreshFileMetadata();google.preloadSource(vm.runInContext('KG.source',c),7,vm.runInContext('KIDS21_AUTO.tabs',c));google.books.get(job.cls.spreadsheetId)?.cache.clear();const latest=latestSource(c).get(sourceKey(c,job.receipt));if(latest&&JSON.stringify(latest)!==JSON.stringify(job.receipt))throw Error('SKIPPED_OLD_SUBMISSION');return originalPreflight(job);};
 const originalError=c.handleError_;c.handleError_=(job,row,e)=>{if(e.recordingIssue){c.handleKidsRecordingIssue_(job,row,e);return;}const googleFailure=googleQueueFailure(job,e.message);if(googleFailure){job.status=googleFailure.status;job.error=googleFailure.error;job.nextAt=googleFailure.retry?Date.now()+60000:0;c.persist_(job,row);}else if(e.message==='RUNNER_DISK_PRESSURE'){job.status='WAITING_MEDIA';job.error=e.message;job.nextAt=Date.now()+60000;c.persist_(job,row);}else if(e.message==='SKIPPED_OLD_SUBMISSION'||e.message==='STALE_RECEIPT'){job.status='SKIPPED_OLD_SUBMISSION';job.error='';job.nextAt=0;c.persist_(job,row);}else if(/^(GRADE_|MODEL_INCOMPLETE|MODEL_INVALID)/.test(e.message)){job.status='NEEDS_REVIEW';job.error=e.message;job.nextAt=0;c.persist_(job,row);}else if(e.message==='NETWORK_OUTCOME_UNKNOWN'){job.status=job.status==='GENERATING'?'NEEDS_REVIEW':'WAITING_MEDIA';job.error=job.status==='NEEDS_REVIEW'?'UNCERTAIN_GENERATION':'MEDIA_TRANSFER_RETRY';job.nextAt=0;c.persist_(job,row);}else originalError(job,row,e);};
 const systemInstruction=c.kidsSystemInstruction_;let generatingAudioOnly=false;c.kidsSystemInstruction_=()=>systemInstruction()+(generatingAudioOnly?'\nRÀNG BUỘC TỆP HỌC SINH LẦN NÀY: chỉ gửi âm thanh. Bắt buộc scene.type="audio_only", presentation.assessable=false, presentation.text="", presentation.spans=[]. Âm thanh có thể do runner tách từ video gốc; không kết luận học sinh không quay video hoặc quay sai chỉ vì lần này không gửi hình. Không suy ra camera quay sách, màn hình hoặc học sinh từ mã bài. Hình trong tệp mẫu không phải học sinh.':'');
 const oldGenerate=c.generate_;c.generate_=(job,parts,snapshot)=>{if(job.route.kind==='phonics')snapshot={...snapshot,phonicsFrameCount:job.media.filter(m=>!m.isReference&&m.runnerPdfFrame).length};const visibleMedia=job.runnerAudioOnly?job.media.map(m=>m.isReference?m:{...m,mime:'audio/mp4'}):job.media;if(job.rawId){const raw=c.readArtifact_(job.rawId),text=(raw.candidates?.[0]?.content?.parts||[]).filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join(''),grade=(()=>{const draft=JSON.parse(text);if(/^kids-rubric-evidence-/.test(job.kidsReviewVersion||''))c.validateKidsRubricDraft_(draft,snapshot);return c.normalizeKidsGrade_(draft);})();c.validateGrade_(grade,snapshot.form,job.studentFileCount||job.media.length,snapshot);pronunciationEvidence(grade);cameraEvidence(grade,visibleMedia);return grade;}parts=[...parts,...phonicsFrameParts(job)];paidCalls++;job.runnerGenerationStarted=true;generatingAudioOnly=!!job.runnerAudioOnly;let grade;try{grade=oldGenerate(job,parts,snapshot);}finally{generatingAudioOnly=false;}job.runnerGenerationStarted=false;if(job.rawId){const u=c.kidsUsageReceipt_(c.readArtifact_(job.rawId));emit({event:'API_USAGE',jobId:job.id,student:job.receipt.student,className:job.cls.className,usage:u});}pronunciationEvidence(grade);cameraEvidence(grade,visibleMedia);return grade;};
 const originalMedia=c.mediaPart_;c.mediaPart_=(job,m,save,deadline)=>{
  const lockFile=path.join(cache,'locks',c.hash_([m.id,m.modified])+'.lock'),release=tryFileLock(lockFile);if(!release)return null;
  try{mediaCache.register(m.id+'-'+c.hash_(m.modified).slice(0,10),lockFile);if(m.isReference){referenceStoreLoaded=false;referenceUploads.clear();google.book(config.clusters[0].controlId).cache.clear();}
   attachReference(c,job,m);const shared=m.runnerSharedReference;
   const part=prepareMedia(c,job,m,save,deadline,originalMedia);
   if(m.isReference&&hasUploadedMedia(m)){registerReference(c,job,m);save();}else if(shared){const tag=referenceKey(c,job,m);referenceUploads.delete(tag);referenceStore().appendRow([tag,JSON.stringify({upload:null,savedAt:0})]);delete m.runnerSharedReference;save();}return part;
  }finally{release();}
 };
 const cleanup=c.cleanupMedia_;c.cleanupMedia_=job=>{const media=job.media;job.media=media.filter(m=>!m.runnerSharedReference);try{cleanup(job);for(const m of job.media){const u=m.runnerUpload;if(!u?.name||u.deleted)continue;try{c.api_('/v1beta/'+u.name,c.keyFor_(job),{method:'delete'});u.deleted=true;}catch{}}}finally{job.media=media;for(const m of media.filter(m=>!m.isReference))mediaCache.dropUnlocked(m.id+'-'+c.hash_(m.modified).slice(0,10));}};
 const bind=c.bindPoolJob_;c.bindPoolJob_=(job,binding)=>{if(job.rawId||job.gradeId)return bind(job,binding);const changed=job.keyHash!==binding.keyHash,sameProject=c.poolScope_(job.keyHash).startsWith('project:')&&c.poolScope_(job.keyHash)===c.poolScope_(binding.keyHash);if(changed&&!sameProject)for(const m of job.media){if(m.runnerUpload?.name){job.retiredFiles=job.retiredFiles||[];job.retiredFiles.push({name:m.runnerUpload.name,keyHash:job.keyHash});}delete m.runnerUpload;}return bind(job,binding);};
 const priority=c.fleetJobPriority_;c.fleetJobPriority_=(job,preferred)=>{if(job.id===preferred)return priority(job,preferred);for(const m of job.media||[])attachReference(c,job,m);const prepared=mediaQueuePriority(job);if(prepared!==null)return prepared;if(job.media?.length&&job.media.every(m=>!m.mime.startsWith('video/')&&m.size<=8*1024*1024))return 1;return priority(job,preferred);};
 if(poolWorker){const load=c.loadJobs_,persist=c.persist_;let owned;
  c.loadJobs_=()=>owned||(owned=kidsSlot<0?[]:load().filter(x=>jobShard(sourceKey(c,x.job.receipt),kidsCount)===kidsSlot));
  c.persist_=(job,row)=>{const actual=persist(job,row);if(owned){const entry=owned.find(x=>x.job.id===job.id);if(entry){entry.job=job;entry.row=actual;}else if(kidsSlot>=0&&jobShard(sourceKey(c,job.receipt),kidsCount)===kidsSlot)owned.push({job,row:actual});}return actual;};
 }
 if(process.env.MASTER_BAREM_CATALOG){const catalog=MasterBaremCatalog.fromFile(process.env.MASTER_BAREM_CATALOG);installKidsBarem(c,catalog,vm.runInContext('FORMS',c));
 installContentRouting(c,catalog,{refresh:j=>{google.books.get(j.cls.spreadsheetId)?.cache.clear();},lock:j=>tryFileLock(path.join(cache,'locks','student-'+c.hash_([j.cls.spreadsheetId,c.norm_(j.receipt.student)])+'.lock')),onCall:()=>{paidCalls++;},emit});
 installMasterKids(c,catalog,{emit});
 installLinkedDestinationBindings(c,{google,config});
 installKidsAppleInputRecovery(c,{g:google,root,ffmpeg,emit});
 installTeacherApprovalGuards(c,{g:google,root,ffmpeg,emit,session:{finish:j=>c.teacherApprovalSession_?.finish(j)}});
 installMasterScoreProtection(c);
 installCompactKids(c);
 // No fixed inter-student delay; provider backoff remains durable.
 c.throttle_=()=>{};
 installReturnedScorePolicy(c);
 installDashboardFeedback(c);
 installSubmissionAssignmentScope(c);
 installTimelyKidsQueue(c,cluster);
 installKidsModelAccessRecovery(c,{emit});
 installKidsProviderRetry(c,{emit});
 installKidsPreprocessing(c,{g:google,service:universalMedia,emit,isLatest:j=>{google.preloadSource(vm.runInContext('KG.source',c),7,vm.runInContext('KIDS21_AUTO.tabs',c));const fresh=latestSource(c).get(sourceKey(c,j.receipt));return fresh&&fresh.row===j.receipt.row&&fresh.time===j.receipt.time&&fresh.links===j.receipt.links;}});
 installCriticalHomeworkPolicy(c,catalog,{authorization:config.kids?.criticalCorrectionAuthorization,emit,verifyReplacement:(j,cell)=>verifyLiveCriticalTarget(c,google,j,cell),isLatest:j=>{const fresh=latestSource(c).get(sourceKey(c,j.receipt));return fresh&&fresh.row===j.receipt.row&&fresh.time===j.receipt.time&&fresh.links===j.receipt.links;}});
 installSubmissionSourceGate(c,{g:google,service:universalMedia,sourceId:vm.runInContext('KG.source',c),isLatest:j=>{const fresh=latestSource(c).get(sourceKey(c,j.receipt));return fresh&&fresh.row===j.receipt.row&&fresh.time===j.receipt.time&&fresh.links===j.receipt.links;}});
 c.masterGenerationParts_=(j,parts)=>{j.masterVisualFileIndexes=j.media.filter(m=>!m.isReference).flatMap((m,i)=>[...(m.runnerScreenFrames||[]),...(m.runnerContextFrames||[]),...(m.runnerPdfFrame?[m.runnerPdfFrame]:[])].some(f=>f.path&&fs.existsSync(f.path))||m.nativeYouTube?[i]:[]);return parts.flatMap((p,i)=>[{text:'TỆP BÀI NỘP '+(i+1)+' (fileIndex '+i+'): chưa xác nhận có tiếng học sinh; kiểm tra giọng thực sự nghe được.'},p]).concat(phonicsFrameParts(j));};
 c.recordMasterGeneration_=()=>{paidCalls++;};
 c.recordMasterUsage_=j=>emit({event:'API_USAGE',jobId:j.id,usage:j.apiUsage});
 c.flushMasterCheckpoint_=row=>google.books.get(cluster.controlId)?.ramBatch?.checkpointControl(cluster.controlId,row);
 }
 c.persistRecoveryBatch_=entries=>{
  const name='Jobs',sheet=google.book(cluster.controlId).getSheetByName(name);if(!sheet)throw Error('RECOVERY_QUEUE_MISSING');
  const data=entries.map(({job,row})=>{const json=JSON.stringify(job);if(!Number.isInteger(row)||row<2||json.length>=45000)throw Error('RECOVERY_ROW_INVALID');return {range:"'Jobs'!A"+row+':F'+row,values:[[job.id,job.status,new Date().toISOString(),'',job.attempts||0,json]]};});
  google.api('https://sheets.googleapis.com/v4/spreadsheets/'+cluster.controlId+'/values:batchUpdate','POST',{valueInputOption:'RAW',data});google.book(cluster.controlId).invalidateSheet(name);
 };
 c.currentRoster_=createCurrentRosterCheck(google,cluster.classes);const rosterStep=c.step_,rosterGenerate=c.generate_,rosterError=c.handleError_;c.step_=(j,row,...a)=>c.currentRoster_(j.receipt,{fresh:true})?rosterStep(j,row,...a):markNotCurrent(j,()=>c.persist_(j,row));c.generate_=(j,...a)=>{if(!c.currentRoster_(j.receipt,{fresh:true}))throw Error('SKIPPED_NOT_IN_CURRENT_ROSTER');return rosterGenerate(j,...a);};c.handleError_=(j,row,e)=>e.message==='SKIPPED_NOT_IN_CURRENT_ROSTER'?markNotCurrent(j,()=>c.persist_(j,row)):rosterError(j,row,e);
 c.runnerProperties=props;return c;
}
export function initializeParallelCluster(cluster,deadline,scan=false,initial={}){
 const c=buildContext(cluster);for(const [k,v] of Object.entries(initial))c.runnerProperties.set(k,v);google.preloadSource(vm.runInContext('KG.source',c),7,vm.runInContext('KIDS21_AUTO.tabs',c));
 if(c.recoverContentRouting_)emit({event:'KIDS_CONTENT_RECOVERY',...c.recoverContentRouting_()});
 if(process.env.MODE==='reprocess-content')return c.runnerProperties;
 emit({event:'DEDUPLICATION',account:cluster.email,...deduplicate(c)});
 let repair;do{repair=c.repairKidsCostQueue_();emit({event:'REPAIR',...repair});}while(repair.reopened&&Date.now()<deadline-90000);
 emit({event:'SNAPSHOT_MIGRATION',...migrateSnapshots(c)});
 
 if(process.env.MASTER_BAREM_CATALOG)emit({event:'KIDS_BAREM_ROUTING_RECOVERY',...recoverUnpaidKidsBarem(c,{deadline:Math.min(deadline-90000,Date.now()+300000)})});
 emit({event:'FEEDBACK_COLOR_RECONCILIATION',...reconcileFeedbackColors(c,{deadline:Math.min(deadline-90000,Date.now()+20000)})});
 referenceStore();for(const {job} of c.loadJobs_())for(const m of job.media||[])if(m.isReference&&hasUploadedMedia(m)&&job.keyHash===c.hash_(key))registerReference(c,job,m);
 if(scan){google.preloadSource(vm.runInContext('KG.classroom',c),2);google.preloadSource(vm.runInContext('KG.practice',c),2);c.scanFleetSlice_(Math.min(deadline-90000,Date.now()+180000));}
 return c.runnerProperties;
}
function latestSource(c){const rows=[];for(const tab of vm.runInContext('KIDS21_AUTO.tabs',c))rows.push(...c.sourceRows_(tab).filter(c.inAutoScope_));const newest=new Map();for(const r of rows){const k=sourceKey(c,r),p=newest.get(k);if(!p||isNewer(r,p))newest.set(k,r);}return newest;}
function deduplicate(c){
 const retired=c.retireTextbookHomeworkJobs_();
 const all=[];for(const tab of vm.runInContext('KIDS21_AUTO.tabs',c))all.push(...c.sourceRows_(tab).filter(c.inAutoScope_));
 const newest=new Map();for(const r of all){const k=sourceKey(c,r),p=newest.get(k);if(!p||isNewer(r,p))newest.set(k,r);}
 const existing=c.loadJobs_(),seen=new Set(existing.map(x=>c.hash_(x.job.receipt))),rows=[];let skipped=0;
 for(const {job,row} of existing){const fresh=newest.get(sourceKey(c,job.receipt));if(fresh&&JSON.stringify(fresh)!==JSON.stringify(job.receipt)&&!['RETURNED','SKIPPED_EXISTING_FEEDBACK','SKIPPED_OLD_SUBMISSION'].includes(job.status)){job.status='SKIPPED_OLD_SUBMISSION';job.error='';job.nextAt=0;c.persist_(job,row);skipped++;}}
 for(const r of all){if(newest.get(sourceKey(c,r))===r||seen.has(c.hash_(r)))continue;const cls=c.assignedClass_(r.className),route={className:cls.className,sourceTab:r.sourceTab,code:r.code,autoManaged:true};const job={id:c.autoReceiptId_(cls,route,r),status:'SKIPPED_OLD_SUBMISSION',cls,route,receipt:r,media:[],attempts:0,nextAt:0,error:'',autoManaged:true};rows.push([job.id,job.status,new Date().toISOString(),'',0,JSON.stringify(job)]);seen.add(c.hash_(r));skipped++;}
 if(rows.length)google.book(vm.runInContext("prop_().getProperty('KIDS_CONTROL_ID')",c)).getSheetByName('Jobs').appendRows(rows);
 return {newest:newest.size,skipped,retired};
}
function migrateSnapshots(c){
 const checked=new Map();let reopened=0;
 // Revisit previously skipped receipt placeholders, never real employee feedback.
 // Bound and rotate the review so a large protected history cannot stall grading.
 const skipped=c.loadJobs_().filter(x=>x.job.status==='SKIPPED_EXISTING_FEEDBACK'),newest=skipped.length?latestSource(c):new Map();
 let cursor=Number(c.runnerProperties.get('FLEET_WORK_RECEIPT_REVIEW_CURSOR')||0),receiptReopened=0;
 for(let i=0;i<Math.min(24,skipped.length)&&Date.now()<until-90000;i++){
  const {job,row}=skipped[(cursor+i)%skipped.length],fresh=newest.get(sourceKey(c,job.receipt));
  if(!fresh||JSON.stringify(fresh)!==JSON.stringify(job.receipt))continue;
  try{const dst=c.destination_(job.cls,job.route,job.receipt.student);if(c.hasFeedback_(dst.cell.getDisplayValue())||!c.currentAssignment_(c.expandedHeaders_(dst.sheet),job.route))continue;
   // Recover saved results only when their source/media/guideline still match.
   if(job.rawId||job.gradeId)c.currentSource_(job);
   job.status=job.gradeId?'GRADED':job.snapshotId?'READY':'WAITING_INPUT';job.error='';job.nextAt=0;c.persist_(job,row);receiptReopened++;reopened++;
  }catch{ /* An ambiguous target stays protected; no API call or forced write. */ }
 }
 c.runnerProperties.set('FLEET_WORK_RECEIPT_REVIEW_CURSOR',String(skipped.length?(cursor+Math.min(24,skipped.length))%skipped.length:0));
 for(const {job,row} of c.loadJobs_()){
  if(canRepairTaskReference(job)){
   try{
    const fresh=c.guide_(job.route);
    if(job.snapshotId){const old=c.readArtifact_(job.snapshotId);if(old.guide!==fresh.guide||old.kind!==fresh.kind||JSON.stringify(old.form)!==JSON.stringify(fresh.form))continue;}
    job.referenceRepair={version:'web-reference-v14',previousSnapshotId:job.snapshotId,previousSourceHash:job.sourceHash,previousError:job.error,at:new Date().toISOString()};
    // Keep prior artifacts for audit. Shared reference uploads expire normally;
    // never delete files potentially used by a concurrent worker.
    delete job.snapshotId;delete job.sourceHash;job.media=[];job.status='WAITING_INPUT';job.error='';job.nextAt=0;
    c.persist_(job,row);reopened++;emit({event:'SOURCE_LOADER_REPAIRED',jobId:job.id,apiCalls:0});
   }catch{ /* Unverified sources stay held. No model request or teacher-cell write. */ }
   continue;
  }
  if(job.status==='NEEDS_REVIEW'&&['GRADE_COLOR_SPANS_INVALID','GRADE_PRONUNCIATION_IPA_REQUIRED'].includes(job.error)&&job.rawId&&!job.gradeId){
   try{const snapshot=c.readArtifact_(job.snapshotId),grade=c.generate_(job,[],snapshot);if(!grade.assessable)continue;job.gradeId=c.saveArtifact_('color-repaired-'+job.id,grade);job.status='GRADED';job.error='';job.nextAt=0;c.persist_(job,row);emit({event:'SAVED_COLOR_REPAIR',jobId:job.id,apiCalls:0});reopened++;}catch{ /* Other validation failures remain held without billing again. */ }
   continue;
  }
  if(job.rawId||job.gradeId||job.generateRequests)continue;
  if(job.status==='BLOCKED'&&String(job.error||'').startsWith('KEY_REMOVED:')){job.status='READY';job.error='';job.nextAt=0;c.preparePoolRetry_(job,row);c.persist_(job,row);reopened++;continue;}
  if(job.status==='BLOCKED'&&job.error==='NETWORK_OUTCOME_UNKNOWN'){job.status='WAITING_MEDIA';job.error='';job.nextAt=0;c.persist_(job,row);reopened++;continue;}
  if(job.status!=='STALE'||job.error!=='STALE_GUIDELINE'||!job.snapshotId)continue;
  const tag=c.hash_(job.route);let fresh=checked.get(tag);if(!fresh){try{fresh=c.guide_(job.route);checked.set(tag,fresh);}catch{continue;}}
  const saved=c.readArtifact_(job.snapshotId);if(c.hash_(saved)!==c.hash_(fresh))continue;
  job.previousSourceHash=job.sourceHash;job.sourceHash=c.hash_(fresh);job.status='READY';job.error='';job.nextAt=0;c.persist_(job,row);reopened++;
 }
 return {reopened,receiptReopened};
}
function prepareMedia(c,job,m,save,deadline,originalMedia){
 // Record why visual evidence was retained/discarded, for both student and reference.
 job.mediaDecision={...mediaDecision(job.route.kind),mode:['phonics','science','scienceK','critical','de'].includes(job.route.kind)?'audio_frame':'audio'};
 if(m.isReference||!m.mime.match(/^(audio|video)\//))throw Error('PREFLIGHT_FILE_MISSING_OR_INVALID');
 const audioFirst=(['audio','audio_frame'].includes(job.mediaDecision.mode)||m.mime.startsWith('audio/'))&&/^(audio|video)\//.test(m.mime);
 const needsScreenFrame=!m.isReference&&m.mime.startsWith('video/');
 const needsFrame=job.mediaDecision.mode==='audio_frame'&&!m.isReference&&m.mime.startsWith('video/');
 const frameAvailable=()=>(!needsFrame||m.visualExtractionFailed||!!(m.runnerPdfFrame?.path&&fs.existsSync(m.runnerPdfFrame.path))||m.runnerContextFrames?.some(f=>fs.existsSync(f.path)))&&(!needsScreenFrame||screenFramesReady(m));
 const proxyVideo=!audioFirst&&!m.isReference&&m.mime.startsWith('video/');
 if(audioFirst&&!m.isReference)job.runnerAudioOnly=true;
 // Retire pre-policy video uploads for audio tasks; their payload is never sent.
 if(audioFirst){
  if(m.runnerUpload?.name&&!['audio/mpeg','audio/flac'].includes(m.runnerUpload.mime)){delete m.runnerUpload;delete m.runnerSharedReference;save();}
  if(m.upload?.name){delete m.upload;save();}
 }
 if(frameAvailable()&&m.runnerUpload?.name&&!m.runnerUpload.deleted&&(!audioFirst||m.runnerUpload.mime.startsWith('audio/'))&&(!proxyVideo||m.runnerUpload.mime.startsWith('video/'))){
  try{const f=JSON.parse(c.api_('/v1beta/'+m.runnerUpload.name,c.keyFor_(job)).getContentText());m.processingState=f.state;save();if(f.state==='FAILED')throw Error('MEDIA_PROCESSING_FAILED');return f.state==='ACTIVE'?{fileData:{mimeType:m.runnerUpload.mime,fileUri:f.uri}}:null;}
  catch(e){if(e.httpCode!==404)throw e;delete m.runnerUpload;save();}
 }
 if(m.upload?.name&&!m.runnerAudio&&!audioFirst){try{const info=JSON.parse(c.api_('/v1beta/'+m.upload.name,c.keyFor_(job)).getContentText());m.processingState=info.state;save();if(info.state==='ACTIVE')return {fileData:{mimeType:m.mime,fileUri:info.uri}};if(info.state==='FAILED')throw Error('MEDIA_PROCESSING_FAILED');return null;}catch(e){if(e.httpCode!==404)throw e;delete m.upload;save();}}
 const tag=m.id+'-'+c.hash_(m.modified).slice(0,10),original=path.join(cache,tag+'.original'),audio=path.join(cache,tag+'.m4a'),mp3=path.join(cache,tag+'.mp3'),flac=path.join(cache,tag+'.flac'),proxy=path.join(cache,tag+'.context.mp4');let file=original,mime=m.mime;
 const present=p=>fs.existsSync(p)&&fs.statSync(p).size>0;
 if(audioFirst&&frameAvailable()&&(present(mp3)||present(flac))){file=present(mp3)?mp3:flac;mime=file===mp3?'audio/mpeg':'audio/flac';}
 else if(proxyVideo&&present(proxy)){file=proxy;mime='video/mp4';}
 if(fs.existsSync(original)&&fs.statSync(original).size!==m.size)fs.unlinkSync(original);
 // Large files use durable Drive -> Gemini chunks; a GitHub VM replacement cannot
 // discard this progress. Keep the original video for full camera-context evidence.
 if(file===original&&m.isReference&&!audioFirst&&(m.runnerDirectUpload||m.mime.startsWith('video/')&&m.size>50*1024*1024&&!fs.existsSync(original))){
  m.runnerDirectUpload=true;save();const sliceUntil=Math.min(deadline-45000,Date.now()+20000);
  do{const previous=m.upload?.offset||0,part=originalMedia(job,m,save,deadline);if(part)return part;if(m.upload?.name||!(m.upload?.offset>previous))return null;}while(Date.now()<sliceUntil);
  return null;
 }
 if(m.id.startsWith('yt_')&&!fs.existsSync(original)){fs.copyFileSync(universalMedia.localFile(m),original);}
 if(file===original&&!fs.existsSync(original)){
  const partial=original+'.part',sliceUntil=Math.min(deadline-45000,Date.now()+60000);let offset=fs.existsSync(partial)?fs.statSync(partial).size:0;
  if(offset>m.size){fs.unlinkSync(partial);offset=0;}
  while(offset<m.size&&Date.now()<sliceUntil){const end=Math.min(m.size-1,offset+8*1024*1024-1);mediaCache.sweep(end-offset+1);emit({event:'MEDIA_DOWNLOAD',jobId:job.id,bytes:m.size,offset});
   const expected='bytes '+offset+'-'+end+'/'+m.size;
   const r=downloadWithRetry({url:'https://www.googleapis.com/drive/v3/files/'+m.id+'?alt=media&supportsAllDrives=true',headers:{Authorization:'Bearer '+google.token(),Range:'bytes='+offset+'-'+end,'Accept-Encoding':'identity'},outputFile:partial,append:offset>0,expectedContentRange:expected,timeoutMs:40000});
   if(r.getResponseCode()===404||r.getResponseCode()===403)throw Error('PREFLIGHT_FILE_MISSING_OR_INVALID');
   if(r.getResponseCode()!==206||r.getAllHeaders()['content-range']!==expected)throw Error('DRIVE_RANGE_DOWNLOAD_FAILED');
   offset=fs.statSync(partial).size;if(offset!==end+1)throw Error('DRIVE_DOWNLOAD_SIZE_MISMATCH');
  }
  m.runnerDownloadBytes=offset;save();if(offset<m.size)return null;fs.renameSync(partial,original);
 }
 if(needsScreenFrame&&!screenFramesReady(m)){
  const duration=Number(google.fileMeta(m.id).videoMediaMetadata?.durationMillis)/1000;
  m.runnerScreenFrames=extractScreenFrames({ffmpeg,input:original,output:path.join(cache,tag+'.scope.jpg'),durationSeconds:duration});
  m.screenGroundingCapture={version:SCREEN_GROUNDING_VERSION,sourceId:m.id,modified:m.modified,status:m.runnerScreenFrames.length?'available':'unavailable'};save();
 }
 if(needsFrame&&!frameAvailable()&&!m.visualExtractionFailed){
  const output=path.join(cache,tag+'.context.jpg'),duration=Number(google.fileMeta(m.id).videoMediaMetadata?.durationMillis)/1000;
  try{if(job.route.kind==='phonics')m.runnerPdfFrame=extractPhonicsFrame({ffmpeg,input:original,output,durationSeconds:duration});else{m.runnerContextFrames=extractPresentationFrames({ffmpeg,input:original,output,durationSeconds:duration});if(!m.runnerContextFrames.length)m.visualExtractionFailed=true;}}catch{m.visualExtractionFailed=true;}save();
 }
 if(audioFirst){
  const result=universalMedia.prepare(m,{fileApi:job.media.filter(x=>!x.isReference).length>2}),part=firstUniversalPart(m,result);job.runnerAudioOnly=job.media.filter(x=>!x.isReference).every(x=>!x.runnerPdfFrame&&!x.runnerContextFrames?.length&&!x.runnerScreenFrames?.length);save();return part;
 }
 if(proxyVideo){
  if(!present(proxy)){mediaCache.sweep(Math.min(m.size,256*1024*1024));
   const selection=inspectAudio(ffmpeg,original);m.audioSelection=selection;const workingProxy=path.join(cache,tag+'.working.mp4'),p=spawnSync(ffmpeg,['-nostdin','-v','error','-i',original,'-map','0:v:0',...selection.args,'-vf','fps=1','-c:v','libx264','-crf','18','-preset','fast','-c:a',selection.indices.length===1?'copy':'aac','-movflags','+faststart','-y',workingProxy],{encoding:'utf8',timeout:120000,windowsHide:true});
   if(p.status===0&&present(workingProxy))fs.renameSync(workingProxy,proxy);else if(fs.existsSync(workingProxy))fs.unlinkSync(workingProxy);
  }
  if(present(proxy)){file=proxy;mime='video/mp4';m.runnerVideo={bytes:fs.statSync(proxy).size,originalBytes:m.size,fps:1,audio:'stream_copy'};mediaCache.dropOriginal(tag);}
  job.runnerAudioOnly=false;
 }
 const bytes=fs.statSync(file).size,key=c.keyFor_(job);
 if(m.runnerUpload&&(m.runnerUpload.mime!==mime||m.runnerUpload.bytes!==bytes)){if(m.runnerUpload.name){try{c.api_('/v1beta/'+m.runnerUpload.name,key,{method:'delete'});}catch{}}delete m.runnerUpload;save();}
 if(bytes<=8*1024*1024&&!mime.startsWith('video/')){save();return {inlineData:{mimeType:mime,data:fs.readFileSync(file).toString('base64')}};}
 if(!m.runnerUpload){const r=c.api_('/upload/v1beta/files',key,{method:'post',contentType:'application/json',headers:{'X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(bytes),'X-Goog-Upload-Header-Content-Type':mime},payload:JSON.stringify({file:{display_name:'runner-'+job.id.slice(0,12)}})});const h=c.headersLower_(r);if(!/^https:\/\/generativelanguage\.googleapis\.com\//.test(h['x-goog-upload-url']||''))throw Error('UPLOAD_URL_INVALID');m.runnerUpload={url:h['x-goog-upload-url'],offset:0,granularity:Number(h['x-goog-upload-chunk-granularity']||8388608),bytes,mime};save();}
 const u=m.runnerUpload;
 if(!u.name){const q=c.http_(u.url,{method:'post',headers:{'X-Goog-Upload-Command':'query'}}),h=c.headersLower_(q);if(h['x-goog-upload-status']==='final'){delete m.runnerUpload;save();return null;}u.offset=Number(h['x-goog-upload-size-received']||u.offset);const fd=fs.openSync(file,'r');try{while(u.offset<bytes&&Date.now()<deadline-30000){const size=Math.min(u.granularity,bytes-u.offset),buf=Buffer.alloc(size);if(fs.readSync(fd,buf,0,size,u.offset)!==size)throw Error('RUNNER_READ_SHORT');const final=u.offset+size===bytes;const r=c.http_(u.url,{method:'post',contentType:mime,headers:{'X-Goog-Upload-Offset':String(u.offset),'X-Goog-Upload-Command':final?'upload, finalize':'upload'},payload:new Blob(buf,mime)});u.offset+=size;if(final){const f=JSON.parse(r.getContentText()).file;u.name=f.name;u.uri=f.uri;delete u.url;}save();}}finally{fs.closeSync(fd);}if(!u.name)return null;}
 const info=JSON.parse(c.api_('/v1beta/'+u.name,key).getContentText());if(info.state==='FAILED')throw Error('MEDIA_PROCESSING_FAILED');m.processingState=info.state;save();return info.state==='ACTIVE'?{fileData:{mimeType:mime,fileUri:info.uri}}:null;
}
const isMain=process.argv[1]===fileURLToPath(import.meta.url);
let releaseLocal;
if(isMain){releaseLocal=localGuard(path.join(root,'private',poolWorker?'pool-worker-'+poolSlot+'.lock':'runner.lock'));process.on('exit',releaseLocal);}
const ordered=config.clusters.slice();if(args.has('--scheduled')){const offset=Math.floor(Date.now()/3600000)%ordered.length;ordered.push(...ordered.splice(0,offset));}
function updateProgress(c,cluster,label,lastJob=null){
 if(poolWorker)return; // The coordinator publishes aggregate progress without competing writers.
 const counts=c.loadJobs_().reduce((a,x)=>(a[x.job.status]=(a[x.job.status]||0)+1,a),{}),s=google.book(cluster.controlId).getSheetByName('Automation');if(!s)return;
 const pending=['WAITING_INPUT','QUEUED','READY','WAITING_MEDIA','RETRY','PROCESSING','GRADED'].reduce((n,k)=>n+(counts[k]||0),0);
 s.getRange(2,1,19,2).setValues([
 ['Chế độ',label],['Tài khoản cụm',cluster.email],['Các lớp',cluster.classes.map(x=>x.className).join(', ')],['Nguồn',vm.runInContext('KIDS21_AUTO.tabs',c).join(', ')],
 ['Phạm vi','Từ 01/09/2026; bài mới nhất; giữ nhận xét nhân viên'],['Quét nền','Chấm bù tự nối lượt tới khi hết bài hợp lệ; sau đó mỗi giờ 24/7 (UTC+7)'],['Batch','8 bài/cụm/lượt chấm bù; kiểm tra video đã tải trước; PROCESSING bỏ qua'],
 ['Trigger',process.env.RUNNER_HOST==='local'?'Windows Task Scheduler; chạy trên máy cô':'Apps Script đã dừng; runner dùng Service Account trên GitHub'],['Tiến độ quét',c.runnerProperties.get('FLEET_SCAN_CURSOR')||'Tiếp tục từ checkpoint'],['Đã trả',counts.RETURNED||0],['Chờ xử lý',pending],['Cần kiểm tra',(counts.NEEDS_REVIEW||0)+(counts.BLOCKED||0)+(counts.STALE||0)],
 ['Batch gần nhất',JSON.stringify(lastJob||{counts})],['Cập nhật',new Date().toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'})],['Thời gian đã dùng','Không dùng hạn mức trigger Apps Script'],['Tiếp tục sau',args.has('--drain')?'Tự nối lượt chấm bù ngay nếu còn bài hợp lệ':'Lượt chạy mỗi giờ kế tiếp'],['Ưu tiên','Video sẵn sàng; lỗi tên/cột/file tách khỏi luồng chấm'],['Bài cần kiểm tra','Không tự gọi lại Gemini cho bài chưa rõ hoặc phản hồi thiếu căn cứ'],['Hạn mức API','Kids: '+(config.kids?.model||MASTER_MODEL)+'; key dự án trả phí đã được cô xác nhận']]);
}
function runCluster(cluster,pass=0,phase='all'){
 if(Date.now()>until-90000||finished>=maxJobs||paidCalls>=maxApiCalls)return 0;
 if(option('--class')&&!cluster.classes.some(x=>x.className===option('--class')))return 0;
 let c=contexts.get(cluster.controlId);if(!c){c=buildContext(cluster);contexts.set(cluster.controlId,c);}if(phase==='repair'&&!sourceRepairQueue(c.loadJobs_()).length)return 0;if(phase==='cache'&&hasHostedKidsCache(c)===false){emit({event:'CACHE_PHASE_EMPTY',providerCalls:0});return 0;}emit({event:'CLUSTER_STARTED',account:cluster.email,phase});
 if(dry){const metadata=google.book(cluster.controlId);const counts=c.loadJobs_().reduce((a,x)=>(a[x.job.status]=(a[x.job.status]||0)+1,a),{});emit({event:'AUDIT',account:cluster.email,counts,controlTitle:metadata.meta.properties.title});return 0;}
 const state=poolWorker?{initial:poolState.states[cluster.controlId]||{},save:()=>{},release:()=>{}}:stateStore(google,cluster.controlId);
 let ramBatch;
 let masterSweep;
 try{
 if(!poolWorker)state.acquire(until+60000);for(const [k,v]of Object.entries(state.initial))c.runnerProperties.set(k,v);
 c.teacherApprovalSession_=approvalSession(google,config.clusters[0].controlId);
 if(process.env.RUNNER_SHEET_BATCH==='1')replaySheetBatches(google,cluster,path.join(root,'private','sheet-batch-journal'),{emit});
 if(process.env.RUNNER_SHEET_BATCH==='1'){c.ensureMasterAssignmentTab_?.();ramBatch=beginSheetBatch(google,cluster,path.join(root,'private','sheet-batch-journal'),{emit});}
 if(phase==='repair'){google.preloadSource(vm.runInContext('KG.source',c),7,vm.runInContext('KIDS21_AUTO.tabs',c));if(!args.has('--skip-scan')){google.preloadSource(vm.runInContext('KG.classroom',c),2);google.preloadSource(vm.runInContext('KG.practice',c),2);}}
 else if(!preparedClusters.has(cluster.controlId)){google.preloadSource(vm.runInContext('KG.source',c),7,vm.runInContext('KIDS21_AUTO.tabs',c));const submittedWorkWaiting=deferFleetMaintenance(c.loadJobs_());if(submittedWorkWaiting)emit({event:'FLEET_MAINTENANCE_DEFERRED',reason:'SUBMITTED_WORK_BEFORE_HISTORICAL_CLEANUP',providerCalls:0});if(!poolWorker&&!submittedWorkWaiting){emit({event:'DEDUPLICATION',account:cluster.email,...deduplicate(c)});
 let repair;do{repair=c.repairKidsCostQueue_();emit({event:'REPAIR',...repair});}while(repair.reopened&&Date.now()<until);
 emit({event:'SNAPSHOT_MIGRATION',...migrateSnapshots(c)});emit({event:'FEEDBACK_COLOR_RECONCILIATION',...reconcileFeedbackColors(c,{deadline:Math.min(until-90000,Date.now()+20000)})});}
 // Newest submissions only are queued by the original, validated multi-class scanner.
 if(!args.has('--skip-scan')){google.preloadSource(vm.runInContext('KG.classroom',c),2);google.preloadSource(vm.runInContext('KG.practice',c),2);}
 preparedClusters.add(cluster.controlId);
 }
 if(phase!=='repair'&&masterSweepEnabled()&&!args.has('--skip-scan')){c.masterSweepTabs_=vm.runInContext('KIDS21_AUTO.tabs',c);masterSweep=prepareKidsMasterSweep(c,cluster,google,{emit});}
 else if(phase!=='repair'&&!args.has('--skip-scan')&&(scanOnly||Date.now()-(lastScans.get(cluster.controlId)||0)>10*60000)){try{const fleetScanSlice=process.env.AUTOMATIC_GRADING_AUTHORIZED==='true'?60000:10000;c.scanFleetSlice_(Math.min(until-90000,Date.now()+(scanOnly?15*60000:fleetScanSlice)));lastScans.set(cluster.controlId,Date.now());emit({event:'SCAN_COMPLETE',account:cluster.email});}catch(e){emit({event:'SCAN_ERROR',account:cluster.email,error:safeError(e)});}}
 if(scanOnly||phase==='scan')return 0;
 if(phase!=='repair'&&!recoveredClusters.has(cluster.controlId)){if(c.recoverContentRouting_)emit({event:'FAULT_QUEUE_RECOVERY',...c.recoverContentRouting_()});recoveredClusters.add(cluster.controlId);}
 const selected=option('--class');const attempted=new Set();
 if(phase!=='repair'&&c.recoverLinkedDestinations_)emit({event:'LINKED_DESTINATION_RECOVERY',...c.recoverLinkedDestinations_()});
 if(phase!=='repair'&&c.recoverUniversalPreprocessing_)emit({event:'PREPROCESSING_RECOVERY',...c.recoverUniversalPreprocessing_()});
 if(phase!=='repair'&&c.recoverCriticalCorrections_)emit({event:'CRITICAL_CORRECTION_RECOVERY',...c.recoverCriticalCorrections_()});
 c.teacherApprovalSession_ ||= approvalSession(google,config.clusters[0].controlId);c.teacherApprovalJobs_=c.loadJobs_();if(process.env.AUTOMATIC_GRADING_AUTHORIZED==='true')authorizeFairKidsWork(c,cluster,google);acceptTeacherApprovals(c.teacherApprovalJobs_,c.teacherApprovalSession_,cluster.controlId,'Jobs',c.persist_);
 const queued=authorizedWorkQueue(c).filter(x=>!masterSweep||masterSweep.allowsJob(x.job)||c.isPendingCriticalCorrection_?.(x.job));
 const ordinaryWork=phase==='repair'?sourceRepairQueue(queued):phase==='cache'?queued.filter(x=>x.job.rawId||x.job.gradeId):authorizedPhaseQueue(queued,phase,process.env.AUTOMATIC_GRADING_AUTHORIZED==='true');
 const phaseWork=phase==='ready'?criticalPriorityWork(queued,ordinaryWork,j=>c.isPendingCriticalCorrection_?.(j)||j.sheetTruth?.youtubeNoticeRepair==='teacher-youtube-download-classification-20261023'):ordinaryWork;
 for(const {job,row} of phaseWork){
  if(Date.now()>until-90000||finished>=maxJobs||paidCalls>=maxApiCalls||args.has('--drain')&&attempted.size>=(phase==='repair'?2:phase==='prepare'?1:process.env.RUNNER_SHEET_BATCH==='1'?20:8))break;if(selected&&job.cls.className!==selected)continue;
  if(args.has('--routing-recovery-only')&&!job.routingRecovery)continue;
  if(option('--kind')&&job.route.kind!==option('--kind'))continue;
  if(option('--job-id')&&job.id!==option('--job-id'))continue;
  if(args.has('--new-only')&&(job.rawId||job.gradeId||generationSpent(job)))continue;
  if(attempted.has(job.id))continue;attempted.add(job.id);
  if(job.status==='GENERATING'&&!job.rawId){job.status='NEEDS_REVIEW';job.error='UNCERTAIN_GENERATION';c.persist_(job,row);continue;}
  if(!['WAITING_INPUT','QUEUED','READY','WAITING_MEDIA','RETRY','PROCESSING','GRADED'].includes(job.status))continue;
  emit({event:'JOB_STARTED',id:job.id,student:job.receipt.student,className:job.cls.className,code:job.route.code,status:job.status});
  const jobStarted=Date.now(),metricBefore={...google.metrics};
  try{c.preparePoolRetry_(job,row);c.step_(job,row,Math.min(until,Date.now()+20*60000),{});}catch(e){try{c.handleError_(job,row,e);}catch(handlerError){job.status='RETRY';job.error=e.message;job.handlerError=handlerError.message;job.nextAt=Date.now()+300000;try{c.persist_(job,row);}catch(persistError){emit({event:'JOB_STATE_WRITE_ERROR',id:job.id,error:safeError(persistError)});}}}
  settleSheetTruth({job,resolve:()=>c.destination_(job.cls,job.route,job.receipt.student).cell,save:()=>c.persist_(job,row),emit});if(attempted.size%10===0)ramBatch?.flush();
  emit({event:'JOB',id:job.id,student:job.receipt.student,className:job.cls.className,code:job.route.code,status:job.status,error:job.error||'',cell:job.cell||'',phase,elapsedMs:Date.now()-jobStarted,sheetCalls:google.metrics.sheetCalls-metricBefore.sheetCalls,sheetMs:google.metrics.sheetMs-metricBefore.sheetMs,audio:job.media?.filter(m=>!m.isReference).map(m=>m.runnerAudio||null)});outcomes.push({id:job.id,status:job.status,className:job.cls.className});if(MASTER_TERMINAL.has(job.status)){finished++;if(!ramBatch)updateProgress(c,cluster,'RUNNER — ĐANG CHẤM BÙ / TỰ ĐỘNG',{student:job.receipt.student,className:job.cls.className,code:job.route.code,cell:job.cell,status:job.status});}
 }
 emit({event:'CLUSTER_COMPLETE',account:cluster.email,counts:c.loadJobs_().reduce((a,x)=>(a[x.job.status]=(a[x.job.status]||0)+1,a),{})});
 return attempted.size;
 }finally{try{try{ramBatch?.flush();try{masterSweep?.publish();}catch(e){emit({event:'MASTER_SWEEP_REPORT_ERROR',error:safeError(e)});}}finally{ramBatch?.close();c.teacherApprovalSession_?.flush();updateProgress(c,cluster,'RUNNER — LƯỢT VỪA CHẠY ĐÃ KẾT THÚC');state.save(c.runnerProperties);}}finally{state.release();}}
}
function runIeltsPass(){return 0;}
export function runShadowingPass(){return {finished:0,paidCalls:0};}
function shadowPass(){return 0;}
if(isMain){
 const ieltsFirst=args.has('--ielts-only')||args.has('--scheduled')&&Math.floor(Date.now()/3600000)%4===3;
 let pass=0,visited=0;
 if(masterSweepEnabled()&&args.has('--drain')&&!dry&&!scanOnly&&!dedicatedShadow&&!args.has('--ielts-only')&&!args.has('--shadowing-only'))for(const cluster of ordered){try{runCluster(cluster,0,'repair');}catch(e){emit({event:'SOURCE_REPAIR_PASS_ERROR',error:safeError(e)});}}
 if(masterSweepEnabled()&&!dry&&!dedicatedShadow&&!args.has('--ielts-only')&&!args.has('--shadowing-only'))for(const cluster of ordered){try{runCluster(cluster,0,'scan');}catch(e){emit({event:'MASTER_SWEEP_CLUSTER_ERROR',account:cluster.email,error:safeError(e)});}}
 if(masterSweepEnabled()&&!dry&&!scanOnly)for(const cluster of ordered){try{runCluster(cluster,0,'cache');}catch(e){emit({event:'MASTER_SWEEP_CACHE_ERROR',account:cluster.email,error:safeError(e)});}}
 do{visited=shadowPass();if(!dedicatedShadow&&(ieltsFirst||args.has('--drain')&&pass===0))visited+=runIeltsPass();if(!dedicatedShadow&&!args.has('--ielts-only')&&!args.has('--shadowing-only')){
  if(args.has('--drain')){
   for(const cluster of ordered){try{visited+=runCluster(cluster,pass,'ready');}catch(e){emit({event:'CLUSTER_ERROR',account:cluster.email,error:safeError(e)});}}
   for(const cluster of ordered){try{visited+=runCluster(cluster,pass,'prepare');visited+=runCluster(cluster,pass,'ready');}catch(e){emit({event:'CLUSTER_ERROR',account:cluster.email,error:safeError(e)});}}
  }else for(const cluster of ordered){try{visited+=runCluster(cluster,pass);}catch(e){emit({event:'CLUSTER_ERROR',account:cluster.email,error:safeError(e)});}}
 }
 if(!ieltsFirst&&!args.has('--drain'))visited+=runIeltsPass();pass++;
 if(args.has('--drain')&&!visited&&!dry&&!scanOnly){
  const pending=[...contexts.values()].flatMap(c=>c.loadJobs_().map(x=>x.job)).filter(j=>(!args.has('--routing-recovery-only')||j.routingRecovery)&&(!option('--class')||j.cls.className===option('--class'))&&(!option('--kind')||j.route.kind===option('--kind'))&&(!option('--job-id')||j.id===option('--job-id')));
  const wait=nextDrainWait(pending,Date.now(),until);if(wait){emit({event:'DRAIN_WAIT',milliseconds:wait});pause(wait);visited=1;}
 }
 }while(args.has('--drain')&&!dry&&!scanOnly&&visited&&Date.now()<until-90000&&finished<maxJobs&&paidCalls<maxApiCalls);
 fs.writeFileSync(path.join(root,'private',poolWorker?'last-run-worker-'+poolSlot+'.json':'last-run.json'),JSON.stringify({at:new Date().toISOString(),finished,paidCalls,outcomes},null,2));emit({event:'RUN_COMPLETE',finished,paidCalls});
}
