export function isNewer(a,b){return Date.parse(a.time)>Date.parse(b.time)||(Date.parse(a.time)===Date.parse(b.time)&&(a.sourceTab.localeCompare(b.sourceTab)>0||a.sourceTab===b.sourceTab&&a.row>b.row));}
export function nextDrainWait(jobs,now,until){
 const times=jobs.filter(j=>['READY','WAITING_MEDIA','RETRY','PROCESSING','QUEUED'].includes(j.status)).map(j=>Number(j.nextAt)).filter(t=>t>now&&t<=now+60000&&t<until-90000);
 return times.length?Math.min(60000,Math.max(250,Math.min(...times)-now+50)):0;
}
export function pronunciationEvidence(grade){
 if(!grade.assessable)return;
 for(const e of grade.evidence){
  if(!['grammar','vocabulary','pronunciation','content','presentation','intonation','fluency'].includes(e.type))throw Error('GRADE_EVIDENCE_TYPE_REQUIRED');
  if(e.type==='pronunciation'&&(!(e.word||'').trim()||!/^\/[^\n/<>]+\/$/.test(e.ipa||'')||!grade.sections.some(s=>s.text.normalize('NFC').toLowerCase().includes(e.word.normalize('NFC').toLowerCase())&&s.text.includes(e.ipa))))throw Error('GRADE_PRONUNCIATION_IPA_REQUIRED');
 }
}
export function cameraEvidence(grade,media){
 if(!grade.assessable)return;
 if(!['student_visible','screen','book','audio_only','unclear'].includes(grade.scene?.type))throw Error('GRADE_VISUAL_CONTEXT_INVALID');
 const students=media.filter(m=>!m.isReference);
 if(students.length&&students.every(m=>m.mime.startsWith('audio/'))&&grade.scene?.type!=='audio_only')throw Error('GRADE_VISUAL_CONTEXT_INVALID');
}
export function newestOnly(rows,key){const newest=new Map();for(const r of rows){const k=key(r),previous=newest.get(k);if(!previous||isNewer(r,previous))newest.set(k,r);}return newest;}
// PROCESSING is the last observed state, not the current state. Uploaded files
// get a cheap readiness check before unprepared jobs, so a large input backlog
// cannot starve recordings that have become ACTIVE since the last pass.
export function mediaQueuePriority(job){
 if(job.gradeId||job.status==='GENERATING')return 0;
 if((job.media||[]).some(m=>m.runnerUpload?.name&&!m.runnerUpload.deleted||m.upload?.name&&!m.upload.deleted))return 1;
 if((job.media||[]).some(m=>Number(m.runnerUpload?.offset||m.upload?.offset||0)>0))return 2;
 return null;
}
export function hasUploadedMedia(media){
 return !!(media.runnerUpload?.name&&!media.runnerUpload.deleted||media.upload?.name&&!media.upload.deleted);
}
export function reusableReference(entry,now=Date.now()){
 return !!(entry?.upload?.name&&entry.upload.uri&&entry.upload.mime&&!entry.upload.deleted&&Number.isFinite(entry.savedAt)&&now-entry.savedAt>=0&&now-entry.savedAt<47*3600000);
}
export function readyForMediaCheck(job){
 if(job.rawId||job.gradeId||job.status==='GENERATING')return true;
 return !!job.media?.length&&job.media.every(m=>hasUploadedMedia(m)||m.mime.startsWith('audio/')&&m.size<=8*1024*1024);
}
// Decide which evidence must survive BEFORE extracting audio. A screen recording
// is not automatically audio-only: picture/letter prompts may be needed to grade.
const TASK_MEDIA = Object.freeze({
 peppa:['audio','speech_and_reference_rhythm'],
 reading:['audio','spoken_reading'],
 translation:['audio','spoken_reading_and_translation'],
 phonicsVideo:['audio','spoken_sounds_and_reference_rhythm'],
 grammar:['audio','spoken_sentences'],
 shadowing:['audio','speech_and_reference_rhythm'],
 vocabulary:['video','picture_or_written_answer_context'],
 phonics:['audio_frame','assigned_pdf_context_with_one_student_frame'],
 de:['video','task_delivery_and_visible_context'],
 science:['video','mindmap_and_task_delivery'],
 scienceK:['video','picture_context_and_task_delivery'],
 critical:['video','task_content_and_delivery']
});
export function mediaDecision(kind){
 const [mode,reason]=TASK_MEDIA[kind]||['video','unknown_task_preserve_evidence'];
 return {version:'task-evidence-media-v5-20261013',mode,reason};
}
export function mediaPolicy(kind){return mediaDecision(kind).mode;}
export function canRepairTaskReference(job){
 if(!job.autoManaged||job.manualReviewRequired||job.rawId||job.gradeId||job.generateRequests||job.runnerGenerationStarted||job.referenceRepair?.version==='web-reference-v14')return false;
 if(!['NEEDS_REVIEW','STALE'].includes(job.status))return false;
 const kind=job.route?.kind;
 if(['phonics','phonicsVideo','peppa'].includes(kind)&&['REFERENCE_READING_PDF_MISSING','REFERENCE_PHONICS_SOUND_MODEL_MISSING','STALE_GUIDELINE'].includes(job.error))return true;
 if(['vocabulary','science'].includes(kind)&&['GUIDE_TASK_REQUIREMENTS_UNCLEAR','REFERENCE_SIZE_INVALID','STALE_GUIDELINE'].includes(job.error))return true;
 return false;
}
export function kidsReleaseCompatible(job,grade,version){return job.kidsReviewVersion===version&&grade?.protocol==='typed-evidence-v2'&&!!grade.evidenceProjected&&(version!=='kids-rubric-evidence-v15-20261013'||grade.rubricEstimate?.policy==='teacher-rubric-estimate-v1');}
export function jobShard(key,count=5){
 let hash=2166136261;for(const ch of String(key))hash=Math.imul(hash^ch.charCodeAt(0),16777619);
 return (hash>>>0)%count;
}
export function remainingTransferBytes(job){
 return (job.media||[]).reduce((n,m)=>n+(hasUploadedMedia(m)?0:Math.max(0,Number(m.size||0)-Math.max(Number(m.runnerUpload?.offset||0),Number(m.upload?.offset||0)))),0);
}
export function throughputQueue(items,phase){
 const selected=items.filter(x=>readyForMediaCheck(x.job)===(phase==='ready'));
 if(phase==='prepare')selected.sort((a,b)=>{
  const knownA=!!a.job.media?.length,knownB=!!b.job.media?.length;
  if(knownA!==knownB)return knownA?-1:1;
  return knownA?remainingTransferBytes(a.job)-remainingTransferBytes(b.job):0;
 });
 return selected;
}
export function backlogCounts(jobs){
 const pending=new Set(['WAITING_INPUT','QUEUED','READY','WAITING_MEDIA','RETRY','PROCESSING','GRADED','GENERATING','GENERATED']);
 return jobs.reduce((a,j)=>{if(pending.has(j.status))a.pending++;else if(['NEEDS_REVIEW','BLOCKED','STALE'].includes(j.status))a.held++;else if(['RETURNED','DONE'].includes(j.status))a.returned++;return a;},{pending:0,held:0,returned:0});
}
export function reviewTable(jobs,capacity=0){
 const rows=[['jobId','Lớp','Tên tiếng Anh','Mã bài','Trạng thái','Lý do'],...jobs.filter(j=>['NEEDS_REVIEW','BLOCKED','STALE'].includes(j.status)).map(j=>[j.id,j.cls?.className||j.source?.className||'',j.receipt?.student||j.source?.name||'',j.route?.code||j.source?.code||'',j.status,j.error||'Cần giáo viên xem hồ sơ chấm'])];
 while(rows.length<capacity)rows.push(['','','','','','']);return rows;
}
export function bulkRunMode(requested,active){
 if(requested==='audit')return 'audit';
 if(['auto','catchup','catchup-start'].includes(requested)||requested==='resume'&&active)return 'catchup';
 return 'grade';
}
export function scanProgress(goals,completed){
 return Object.entries(goals||{}).reduce((remaining,[id,target])=>remaining+Math.max(0,Number(target)-Number(completed[id]||0)),0);
}
export function shouldRefreshScan(requested,state,hour){return !state.active||requested==='auto'&&state.lastScheduledScanHour!==hour;}
export function workerLanes(count,shadowingEnabled){const dedicated=shadowingEnabled&&count>1;return {shadowingSlot:0,ieltsSlot:dedicated?1:0,kidsSlots:Array.from({length:count-(dedicated?1:0)},(_,i)=>i+(dedicated?1:0))};}
export function shouldContinueBulk(mode,state){
 return mode==='catchup'&&state.active===true&&(Number(state.pending)>0||Number(state.scanRemaining)>0);
}
export function googleQueueFailure(job,message){
 if(!/^GOOGLE_HTTP_(429|500|502|503|504)$/.test(message))return null;
 return job.runnerGenerationStarted&&!job.rawId&&!job.gradeId?{status:'NEEDS_REVIEW',error:'UNCERTAIN_ARTIFACT_SAVE',retry:false}:{status:'RETRY',error:'GOOGLE_TEMPORARY_LIMIT',retry:true};
}
export function chooseTrackerTab(configured,titles){
 if(titles.includes(configured))return configured;
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('Đ','D').replaceAll('đ','d').toUpperCase().replace(/\s+/g,' ').trim();
 const exact=titles.filter(t=>norm(t)===norm(configured));if(exact.length===1)return exact[0];
 const candidates=titles.filter(t=>['THEO DOI TOAN DIEN','THEO DOI'].includes(norm(t)));
 if(candidates.length!==1)throw Error(candidates.length?'DESTINATION_TAB_AMBIGUOUS':'DESTINATION_TAB_NOT_FOUND');return candidates[0];
}
