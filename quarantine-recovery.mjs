import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {decodeSavedDraft} from './saved-draft.mjs';
import {assessmentFailure} from './grading-failure-policy.mjs';
import {hasTeacherReview,receiptOnlyCell,mergeTeacherMessage} from './teacher-feedback-state.mjs';
import {invalidRetryGenerationDigest} from './authorized-invalid-retry.mjs';
import {oldGradedSubmission,SILENT_NOTICE,OLD_FILE_NOTICE} from './zero-cost-gates.mjs';
export const RECOVERY_AUTH='teacher-quarantine-recovery-20261030';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const identity=j=>[j.cls?.spreadsheetId,j.cls?.className,j.receipt?.student,j.receipt?.code,j.receipt?.sourceTab,j.receipt?.time,j.receipt?.links];
export const recoveryIdentity=j=>hash(identity(j));
const same=(a,b)=>recoveryIdentity(a)===recoveryIdentity(b);
function approval(){try{const x=JSON.parse(fs.readFileSync(process.env.QUARANTINE_RECOVERY_AUTH_FILE,'utf8'));return x.authorization===RECOVERY_AUTH&&Array.isArray(x.records)?x:null;}catch{return null;}}
export function recoveryRecord(item){const a=approval();return a?.records.find(x=>x.itemId===item.id&&x.targetHash===hash(item.target));}
export function openRecoveryItem(item,{now=Date.now()}={}){
 const record=recoveryRecord(item);if(!record||item.state==='CLAIMED')return false;
 if(item.quarantineRecovery){
  if(item.quarantineRecovery.authorization!==RECOVERY_AUTH||item.quarantineRecovery.attemptEpochAt||!['QUARANTINED','PENDING_VALIDATION','RETRY'].includes(item.state))return false;
  item.quarantineRecovery.previousAttemptCount=item.attempt_count||0;item.quarantineRecovery.attemptEpochAt=new Date(now).toISOString();item.attempt_count=0;item.state='PENDING_VALIDATION';item.error=null;item.nextAt=0;return true;
 }
 if(item.state!=='QUARANTINED')return false;
 item.quarantineRecovery={authorization:RECOVERY_AUTH,recordHash:hash(record),previous:structuredClone(item.queueQuarantine||{reason:item.error}),openedAt:new Date(now).toISOString(),attemptEpochAt:new Date(now).toISOString(),previousAttemptCount:item.attempt_count||0,maxNewAttempts:1};
 item.attempt_count=0;item.state='PENDING_VALIDATION';item.nextAt=0;item.error=null;return true;
}
export function recoveryChildId(job){return 'runner:quarantine-recovery:'+hash([RECOVERY_AUTH,identity(job)]);}
export function authorizedRecoveryChild(job,all){
 const a=job.quarantineRecovery,record=approval()?.records.find(x=>x.identityHash===recoveryIdentity(job));
 if(!a||!record||a.authorization!==RECOVERY_AUTH||a.recordHash!==hash(record)||job.id!==recoveryChildId(job)||a.maxNewAttempts!==1)return false;
 const parents=all.map(x=>x.job||x).filter(x=>x.id!==job.id&&same(x,job));
 return parents.length>0&&parents.every(p=>record.parents.some(v=>v.id===p.id&&v.generationDigest===invalidRetryGenerationDigest(p)));
}
export function validSavedAssessment(raw,job){
 try{const d=decodeSavedDraft(raw);return d.assessable===true&&/^\d+(?:\.\d+)?%$/.test(d.band||'')&&Number(d.band.replace('%',''))<=100&&d.roseSections?.some(s=>String(s.text||s.praise||s.correction||'').trim())&&!assessmentFailure(raw,d,job)&&!/lỗi kỹ thuật|chưa (?:nhận|gửi).{0,30}(?:tệp|file|video)|đang chờ chấm/iu.test(d.reason||'');}catch{return false;}
}
export function realSilenceProof(job){
 const media=(job.media||[]).filter(m=>!m.isReference);
 return media.length>0&&media.every(m=>m.localSilence?.silent===true&&Number(m.localSilence.durationSeconds)>0&&m.universalAudio?.sourceId===m.id&&m.universalAudio?.modified===m.modified&&m.audioPayloadProof?.sourceId===m.id&&m.audioPayloadProof?.bytes>10240&&m.audioPayloadProof?.sha256);
}
// Only the hosted native worker mutates jobs and the central writer owns cells.
export function prepareQuarantineRecovery(c,{item,entry,entries,cell,persist}){
 const record=recoveryRecord(item);if(!record||item.quarantineRecovery?.recordHash!==hash(record))return null;
 if(hasTeacherReview(cell.getDisplayValue())||cell.getFormula()||cell.getDataValidation())return null;
 const matches=entries.filter(x=>same(x.job,entry.job));
 if(!matches.length||record.identityHash!==recoveryIdentity(entry.job)||matches.some(e=>e.job.id!==recoveryChildId(e.job)&&!record.parents.some(p=>p.id===e.job.id&&p.generationDigest===invalidRetryGenerationDigest(e.job))))throw Error('RECOVERY_HISTORY_CHANGED');
 if(c.currentRoster_&&!c.currentRoster_(entry.job.receipt,{fresh:true}))throw Error('STUDENT_NOT_FOUND_OR_AMBIGUOUS');
 const fresh=c.freshReceipt_(entry.job);if(!fresh||hash(fresh)!==hash(entry.job.receipt))throw Error('STALE_RECEIPT');
 const existingFinal=matches.find(e=>cell.getDisplayValue()===e.job.autoNotice&&(realSilenceProof(e.job)||e.job.autoNotice===OLD_FILE_NOTICE&&oldGradedSubmission(e.job,entries,p=>{try{return hasTeacherReview(c.destination_(p.cls,p.route,p.receipt.student).cell.getDisplayValue());}catch{return false;}})));
 if(existingFinal)return {entry:existingFinal,mode:'ALREADY_PRESENT',existingFinal:true};
 if(!receiptOnlyCell(cell.getDisplayValue()))return null;
 for(const e of matches)for(const ref of [...new Set([e.job.rawId,e.job.gradeId].filter(Boolean))]){
  let raw;try{raw=c.readArtifact_(ref);}catch{continue;}
  if(!validSavedAssessment(raw,e.job))continue;
  const j=e.job;j.quarantineSavedRecovery={authorization:RECOVERY_AUTH,previousStatus:j.status,previousError:j.error,rawId:ref,providerCalls:0,at:new Date().toISOString()};j.rawId=ref;j.status='READY';j.error='';j.nextAt=0;persist(j,e.row);return {entry:e,mode:'CACHE'};
 }
 const final=matches.find(e=>e.job.autoNotice&&realSilenceProof(e.job));
 const old=matches.find(e=>e.job.autoNotice===OLD_FILE_NOTICE&&oldGradedSubmission(e.job,entries,p=>{try{return hasTeacherReview(c.destination_(p.cls,p.route,p.receipt.student).cell.getDisplayValue());}catch{return false;}}));
 if(final||old){const e=final||old;return {entry:e,mode:'SOURCE_FINAL',notice:mergeTeacherMessage(cell.getDisplayValue(),'— NHẬN XÉT GV —\n'+(final?SILENT_NOTICE:OLD_FILE_NOTICE)),terminal:final?'COMPLETED_UNASSESSABLE':'COMPLETED_NEEDS_RESUBMISSION'};}
 const id=recoveryChildId(entry.job),prior=entries.find(x=>x.job.id===id);
 if(prior){if(!authorizedRecoveryChild(prior.job,entries))throw Error('RECOVERY_CHILD_BINDING_CHANGED');return {entry:prior,mode:'AUTHORIZED_CHILD'};}
 const parent=entry.job;
 const child={id,cls:structuredClone(parent.cls),route:structuredClone(parent.route),receipt:structuredClone(parent.receipt),autoManaged:true,media:[],status:'WAITING_INPUT',attempts:0,nextAt:0,error:'',generateRequests:0,createdAt:new Date().toISOString(),quarantineRecovery:{authorization:RECOVERY_AUTH,recordHash:hash(record),identityHash:record.identityHash,maxNewAttempts:1,parents:record.parents.map(x=>({...x}))}};
 const row=persist(child);if(!Number.isInteger(row)||row<2)throw Error('RECOVERY_CHILD_APPEND_NOT_CONFIRMED');const added={row,job:child};entries.push(added);return {entry:added,mode:'AUTHORIZED_CHILD'};
}
