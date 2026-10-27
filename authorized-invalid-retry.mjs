import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {decodeSavedDraft} from './saved-draft.mjs';
import {assessmentFailure} from './grading-failure-policy.mjs';
import {hasRequest} from './universal-media.mjs';
import {receiptOnlyCell,hasTeacherReview} from './teacher-feedback-state.mjs';

// Explicit human approval on 27 October. This is one additional attempt per
// native receipt, not a transport retry and not a reset of a paid reservation.
export const INVALID_RETRY_AUTH='teacher-invalid-result-one-new-attempt-20261027';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const identity=j=>[j.cls?.spreadsheetId,j.cls?.className,j.receipt?.student,j.receipt?.code,j.receipt?.row,j.receipt?.time,j.receipt?.links];
export const invalidRetryId=j=>'runner:invalid-retry:'+hash([INVALID_RETRY_AUTH,identity(j)]);
const same=(a,b)=>JSON.stringify(identity(a))===JSON.stringify(identity(b));
function references(value,out=new Set(),seen=new Set()){
 if(!value||typeof value!=='object'||seen.has(value))return out;seen.add(value);
 for(const [key,v]of Object.entries(value)){
  if(/^(?:rawId|gradeId|verificationRawId)$/.test(key)&&typeof v==='string'&&v)out.add(v);
  else if(v&&typeof v==='object')references(v,out,seen);
 }return out;
}
export const invalidRetryGenerationDigest=j=>hash([j.id,[...references(j)].sort(),j.generateRequests||0,j.physicalGenerateRequests||0,j.approvedGenerateRequests||0,!!j.masterGenerationReserved,!!j.runnerGenerationStarted,j.generationAttempt?.calls||0]);
function approvalSnapshot(){try{const a=JSON.parse(fs.readFileSync(process.env.INVALID_RESULT_RETRY_AUTH_FILE,'utf8'));return a.authorization===INVALID_RETRY_AUTH&&Array.isArray(a.generationDigests)?a:null;}catch{return null;}}
export function invalidArtifactProof(raw,job){
 if(!raw||typeof raw!=='object')return null;
 const d=decodeSavedDraft(raw),failure=assessmentFailure(raw,d,job);
 if(failure)return {code:failure.code,hash:hash(raw)};
 // A real assessment, including a zero score, is always recoverable at 0 API.
 if(d.assessable!==false)return null;
 // A supported wrong-assignment/presentation verdict is a final student result.
 if(d.submissionCheck?.category==='wrong_assignment'||d.submissionCheck?.status==='wrong_assignment'||d.presentationReadingCheck?.confirmed||d.presentationVisualCheck?.confirmed||job.presentationResubmissionRequired||job.recordingIssue?.status==='NEEDS_RESUBMISSION')return null;
 return {code:'UNASSESSABLE_WITHOUT_VALID_SCORE',hash:hash(raw)};
}
export function authorizedInvalidRetry(job,all){
 if(job.invalidResultRetry?.authorization!==INVALID_RETRY_AUTH)return false;
 const a=job.invalidResultRetry,approval=approvalSnapshot();if(!approval||a?.approvalSnapshotHash!==hash(approval)||a?.authorization!==INVALID_RETRY_AUTH||a.maxNewGenerations!==1||job.id!==invalidRetryId(job)||a.receiptHash!==hash(identity(job)))return false;
 const matches=all.map(x=>x.job||x).filter(p=>same(p,job)&&p.id!==job.id);
 if(!matches.length||matches.some(p=>p.invalidResultRetry||!a.parents?.some(x=>x.id===p.id&&x.referenceHash===hash([...references(p)].sort())&&x.generationDigest===invalidRetryGenerationDigest(p))||(hasRequest(p)||references(p).size)&&!approval.generationDigests.includes(invalidRetryGenerationDigest(p))))return false;
 return a.parents.length===matches.length&&a.parents.some(x=>x.proofs?.length);
}
export function initializeAuthorizedRetryInventory(job,all,save){
 if(job.media!==undefined||job.rawId||job.gradeId||hasRequest(job)||!authorizedInvalidRetry(job,all))return false;
 job.media=[];save();return true;
}
export function authorizeInvalidRetry(c,entry,entries,cell,persist){
 const parent=entry.job,all=entries.map(x=>x.job||x),id=invalidRetryId(parent);
 if(parent.invalidResultRetry)return null; // Never license a third attempt.
 const prior=entries.find(x=>x.job.id===id);
 if(prior)return authorizedInvalidRetry(prior.job,all)?prior:null;
 if(!/^(?:SYSTEM_GRADING_ERROR|COMPLETED_UNASSESSABLE|WAITING_MODEL_ACCESS|WAITING_PROVIDER_QUOTA|NEEDS_REVIEW|BLOCKED)$/.test(parent.status))return null;
 const approval=approvalSnapshot();if(!approval)return null;
 if(cell.getFormula()||cell.getDataValidation()||hasTeacherReview(cell.getDisplayValue())||!receiptOnlyCell(cell.getDisplayValue()))return null;
 if(!c.currentRoster_?.(parent.receipt,{fresh:true}))return null;
 const fresh=c.freshReceipt_(parent);if(!fresh||hash(fresh)!==hash(parent.receipt))return null;
 const matches=all.filter(p=>same(p,parent));if(matches.some(p=>p.invalidResultRetry||p.manualReviewRequired||p.presentationResubmissionRequired||p.recordingIssue?.status==='NEEDS_RESUBMISSION'))return null;
 const parents=[];let invalid=0;
 for(const p of matches){
  const ids=[...references(p)].sort(),proofs=[];
  if((ids.length||hasRequest(p))&&!approval.generationDigests.includes(invalidRetryGenerationDigest(p)))return null;
  for(const ref of ids){let raw;try{raw=c.readArtifact_(ref);}catch{return null;}
   const proof=invalidArtifactProof(raw,p);if(!proof)return null;
   proofs.push({artifactId:ref,...proof});invalid++;
  }
  // Missing/uncertain outcomes do not prove a failed assessment. Only a recorded
  // explicit provider rejection can substitute for an actual invalid response.
  if(!ids.length&&hasRequest(p)){
   const f=p.systemGradingFailure,failed=(p.technicalFailures||[]).find(x=>[401,402,403,404,429].includes(Number(x.httpCode)));
   if(![401,402,403,404,429].includes(Number(f?.httpCode))&&!failed)return null;
   proofs.push({code:'RECORDED_PROVIDER_REJECTION',httpCode:Number(f?.httpCode||failed.httpCode)});invalid++;
  }
  parents.push({id:p.id,referenceHash:hash(ids),generationDigest:invalidRetryGenerationDigest(p),proofs});
 }
 if(!invalid)return null;
 // Rebuild source metadata, audio, frames and prompt from the current native
 // route. Do not copy any old input, raw, usage, counter or reservation fields.
 const child={id,cls:structuredClone(parent.cls),route:structuredClone(parent.route),receipt:structuredClone(parent.receipt),autoManaged:true,media:[],status:'WAITING_INPUT',attempts:0,nextAt:0,error:'',generateRequests:0,createdAt:new Date().toISOString(),invalidResultRetry:{authorization:INVALID_RETRY_AUTH,approvalSnapshotHash:hash(approval),maxNewGenerations:1,receiptHash:hash(identity(parent)),parents,at:new Date().toISOString()}};
 const row=persist(child);if(!Number.isInteger(row)||row<2)throw Error('INVALID_RETRY_APPEND_NOT_CONFIRMED');
 const added={row,job:child};entries.push(added);return added;
}
