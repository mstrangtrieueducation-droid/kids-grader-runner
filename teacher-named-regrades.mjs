// Teacher10Nov ("6 bài tháng 9-10 chấm lại đi"): submissions the owner named for grading.
// Each is released once, only while its class cell still holds the receipt alone and
// only when no request was ever spent on that record. The normal one-call path grades it.
import {receiptOnlyCell} from './dashboard-feedback.mjs';
export const NAMED_REGRADE_AUTH='teacher-named-regrade-20261110';
export const NAMED_REGRADES=new Map([
 ['751377cf0c2f1620c6eb551a9726d05837b4df28449dd4a7d64d13e66d751474','Ella KIDS 22 DE-11 (4/10), dashboard child held on a retired model'],
 ['28b4ae40ca085eff5679e3004607ca81738e29aa00c50a81374c5deecd94152d','Amelia KIDS 27 Peppa-41 (15/10), held before any request'],
]);
const spent=j=>!!(j.rawId||j.gradeId||Number(j.generateRequests||0)>0||Number(j.approvedGenerateRequests||0)>0||Number(j.physicalGenerateRequests||0)>0||j.masterGenerationReserved||j.runnerGenerationStarted||j.generationReservation||j.apiUsage||j.usage||j.providerResponseReceived);
export const isNamedRegrade=j=>j?.namedRegrade?.authorization===NAMED_REGRADE_AUTH&&NAMED_REGRADES.has(j.id);
export function namedRegradeReleasable(job){
 return NAMED_REGRADES.has(job?.id)&&!job.namedRegrade&&!spent(job)&&/^(?:SYSTEM_GRADING_ERROR|WAITING_MODEL_ACCESS|COMPLETED_UNASSESSABLE|NEEDS_REVIEW|BLOCKED)$/.test(job.status||'');
}
export function releaseNamedRegrade(job,now=new Date()){
 if(!namedRegradeReleasable(job))return false;
 const moved=['model','snapshotId','sourceHash','teacherApproval','systemGradingFailure','retiredFiles','networkHistory','networkAttempts','autoNotice','retryGenerationAuthorized','lastGenerateMs'],previous={};
 for(const k of moved)if(job[k]!==undefined)previous[k]=job[k];
 // Kept as text: the copied parent history is a record, not a live request or result.
 job.namedRegrade={authorization:NAMED_REGRADE_AUTH,at:now.toISOString(),previousStatus:job.status,previousError:job.error||'',previousRecord:JSON.stringify(previous),providerCalls:0};
 // The retired model and its cached snapshot must not be reused for the new attempt.
 for(const k of moved)delete job[k];
 job.status='READY';job.error='';job.nextAt=0;return true;
}
export function installNamedRegrades(c,{emit=()=>{}}={}){
 // Teacher11Nov: the continuous service never reaches the content-recovery phase, so the
 // master sweep (every intake) calls this directly.
 c.releaseNamedRegrades_=()=>{let released=0;
  for(const {job,row} of c.loadJobs_()){
   if(!namedRegradeReleasable(job))continue;
   try{const cell=c.destination_(job.cls,job.route,job.receipt.student).cell,text=cell.getDisplayValue();
    if(cell.getFormula()||cell.getDataValidation()||c.hasFeedback_(text)||!receiptOnlyCell(text))continue;
    if(releaseNamedRegrade(job)){c.persist_(job,row);released++;emit({event:'TEACHER_NAMED_REGRADE_RELEASED',id:job.id,providerCalls:0});}
   }catch(e){emit({event:'TEACHER_NAMED_REGRADE_DEFERRED',id:job.id,error:String(e.message||''),providerCalls:0});}
  }
  return released;
 };
 const recover=c.recoverContentRouting_;
 c.recoverContentRouting_=()=>({...(recover?.()||{}),namedRegradesReleased:c.releaseNamedRegrades_()});
}
