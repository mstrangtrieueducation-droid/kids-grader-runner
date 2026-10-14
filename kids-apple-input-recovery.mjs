import {createHash} from 'node:crypto';
import {prepareAppleCompatibleAudio} from './apple-audio-compatibility.mjs';
import {sourceInMasterScope} from './master-submission-scope.mjs';
import {emptyTeacherBody} from './dashboard-feedback.mjs';
export const APPLE_RECOVERY_VERSION='proven-aac-compatibility-20261015';
const repairSignature='8fb79f33394837d27d6d4bf7f28a53d771c5db821f261bc2837f3284bf683da6';
const signature=(j,m)=>createHash('sha256').update(JSON.stringify([j.id,m.id,m.modified,Number(m.size)])).digest('hex');
export function consumedAudioJob(j){
 if(!j)return false;
 if(j.rawId||j.gradeId||j.apiUsage||j.usage||j.generateRequests||j.approvedGenerateRequests||j.physicalGenerateRequests||j.masterGenerationReserved||j.runnerGenerationStarted||j.generationReservation||j.singleCallPermanentlyConsumed||j.providerFailure)return true;
 return ['previousGradingAttempts','failedAttempts','generationHistory','recoveryHistory'].some(k=>j[k]?.some(a=>consumedAudioJob(a)||a.calls||a.oldRequests||a.previousRequests));
}
export function canRecoverProvenAppleInput(j){
 const media=(j.media||[]).filter(m=>!m.isReference);
 return j.status==='SYSTEM_AUDIO_ERROR'&&j.error==='SYSTEM_AUDIO_INPUT_LOCAL_REPAIR_FAILED'&&j.audioPayloadFailure?.firstError==='AUDIO_EXTRACTION_FAILED'&&!j.appleInputRecoveryVersion&&!consumedAudioJob(j)&&sourceInMasterScope(j.receipt)&&media.length===1&&signature(j,media[0])===repairSignature;
}
export function installKidsAppleInputRecovery(c,{g,root,ffmpeg,emit=()=>{}}){
 const mediaPart=c.mediaPart_;
 c.mediaPart_=(job,m,save,deadline)=>m.isReference?mediaPart(job,m,save,deadline):prepareAppleCompatibleAudio({prepare:()=>mediaPart(job,m,save,deadline),job,m,g,root,ffmpeg,save});
 const recover=c.recoverContentRouting_;
 c.recoverContentRouting_=()=>{
  const result=recover?.()||{};let restored=0;
  for(const {job,row} of c.loadJobs_()){
   if(!canRecoverProvenAppleInput(job))continue;
   try{const cell=c.destination_(job.cls,job.route,job.receipt.student).cell;
    const text=cell.getDisplayValue();if(cell.getFormula()||cell.getDataValidation()||c.hasFeedback_?.(text)||/\d+(?:[.,]\d+)?\s*%/.test(text)||!emptyTeacherBody(text))continue;
    const prior={at:new Date().toISOString(),status:job.status,error:job.error,version:APPLE_RECOVERY_VERSION,providerCalls:0};
    job.appleInputRecoveryVersion=APPLE_RECOVERY_VERSION;job.appleInputRecoveryHistory=[...(job.appleInputRecoveryHistory||[]),prior];job.status='READY';job.error='';job.nextAt=0;c.persist_(job,row);restored++;
   }catch(e){emit({event:'APPLE_INPUT_RECOVERY_DEFERRED',id:job.id,error:e.message,providerCalls:0});}
  }
  return {...result,appleInputsRestored:restored};
 };
}
