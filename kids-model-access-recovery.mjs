import {sourceInMasterScope} from './master-submission-scope.mjs';
import {receiptOnlyCell} from './dashboard-feedback.mjs';

export const MODEL_ACCESS_RECOVERY='teacher-confirmed-topup-autoreload-20261016';
const consumedKeys=['rawId','gradeId','verificationRawId','usage','apiUsage','verificationUsage','resultHash','autoNotice','generateRequests','physicalGenerateRequests','approvedGenerateRequests','masterGenerationReserved','masterGenerationStartedAt','runnerGenerationStarted','generationReservation','singleCallPermanentlyConsumed','calls','oldRequests','previousRequests'];
export function hasModelAccessAttempt(value,seen=new Set()){
 if(!value||typeof value!=='object'||seen.has(value))return false;
 seen.add(value);
 if(consumedKeys.some(k=>!!value[k]))return true;
 return Object.values(value).some(v=>v&&typeof v==='object'&&hasModelAccessAttempt(v,seen));
}
export function canResumeUncalledModelHold(job){
 return process.env.RUNNER_HOST==='github'&&process.env.MODEL_GRADING_AVAILABLE==='true'&&process.env.AUTOMATIC_GRADING_AUTHORIZED==='true'
  &&job.status==='WAITING_MODEL_ACCESS'&&job.error==='MODEL_NOT_AVAILABLE_FOR_THIS_PROJECT'
  &&sourceInMasterScope(job.receipt)&&!job.presentationResubmissionRequired&&!job.technicalInputFailure&&!job.providerFailure&&!hasModelAccessAttempt(job);
}
export function installKidsModelAccessRecovery(c,{emit=()=>{}}={}){
 const recover=c.recoverContentRouting_;
 c.recoverContentRouting_=()=>{
  const result=recover?.()||{};let resumed=0;
  for(const {job,row} of c.loadJobs_()){
   if(!canResumeUncalledModelHold(job))continue;
   try{
    const cell=c.destination_(job.cls,job.route,job.receipt.student).cell,text=cell.getDisplayValue();
    if(cell.getFormula()||cell.getDataValidation()||c.hasFeedback_(text)||!receiptOnlyCell(text))continue;
    job.modelAccessRecovery={version:MODEL_ACCESS_RECOVERY,at:new Date().toISOString(),previousStatus:job.status,previousError:job.error,providerCalls:0};
    job.status='READY';job.error='';job.nextAt=0;c.persist_(job,row);resumed++;
   }catch(e){emit({event:'MODEL_ACCESS_RECOVERY_DEFERRED',id:job.id,error:e.message,providerCalls:0});}
  }
  return {...result,uncalledModelHoldsResumed:resumed};
 };
}
