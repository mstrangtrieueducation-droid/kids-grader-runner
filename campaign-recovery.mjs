import {hasRequest,hasSavedResult} from './universal-media.mjs';
import {DASHBOARD_REPROCESS_AUTH} from './dashboard-reprocess.mjs';
import {hasTeacherReview,receiptOnlyCell,mergeTeacherMessage} from './teacher-feedback-state.mjs';
import {truthNoticeText} from './sheet-truth-sync.mjs';
import {markNotCurrent} from './current-roster-policy.mjs';
export const CAMPAIGN_RECOVERY='teacher-universal-ingestion-20261027';
function assessmentEvidence(x,seen=new Set()){
 if(!x||typeof x!=='object'||seen.has(x))return false;seen.add(x);
 if(x.rawId||x.gradeId||x.verificationRawId||x.apiUsage||x.usage||x.verificationUsage||x.providerResponseReceived?.httpStatus===200||x.gradeUsable===true||x.candidates?.length)return true;
 return Object.values(x).some(v=>v&&typeof v==='object'&&assessmentEvidence(v,seen));
}
export function existingUncalledChild(j,matches){
 if(hasRequest(j)||assessmentEvidence(j)||j.presentationResubmissionRequired||j.technicalInputFailure)return false;
 const parents=matches.map(x=>x.job||x);
 return j.dashboardReprocessAuth===DASHBOARD_REPROCESS_AUTH&&parents.some(p=>p.id===j.regradeParentId&&p.supersededByDashboardRegrade===j.id&&!assessmentEvidence(p))&&j.systemGradingFailure?.studentActionRequired===false;
}
export function uncalledTechnicalRecovery(j,matches){
 if(j.presentationResubmissionRequired||j.technicalInputFailure||!/^SYSTEM_AUDIO_INPUT_|^SYSTEM_PROCESSING_ERROR$|^MODEL_NOT_AVAILABLE_FOR_THIS_PROJECT$|^PROVIDER_PREPAYMENT_REQUIRED$/.test(j.error||''))return false;
 return [j,...matches.map(x=>x.job||x)].every(x=>!hasRequest(x)&&!assessmentEvidence(x));
}
export function prepareCampaignRecovery(c,j,row,{matches,cell}){
 if(cell.getFormula()||cell.getDataValidation()||hasTeacherReview(cell.getDisplayValue())||!receiptOnlyCell(cell.getDisplayValue()))return false;
 if(c.currentRoster_&&!c.currentRoster_(j.receipt,{fresh:true}))return false;
 const fresh=c.freshReceipt_(j);if(!fresh||fresh.row!==j.receipt.row||fresh.time!==j.receipt.time||fresh.links!==j.receipt.links)return false;
 if(j.rawId||j.gradeId){
  // Reading/parsing uses the original durable artifact. A failed parse never
  // licenses regeneration or removes the request history.
  const raw=c.readArtifact_(j.rawId||j.gradeId);if(!raw||typeof raw!=='object')throw Error('SAVED_ARTIFACT_NOT_READABLE');
  j.campaignSavedRecovery={version:CAMPAIGN_RECOVERY,previousStatus:j.status,previousError:j.error,at:new Date().toISOString(),providerCalls:0};
  j.status='READY';j.nextAt=0;c.persist_(j,row);return true;
 }
 if(existingUncalledChild(j,matches)||uncalledTechnicalRecovery(j,matches)){
  const previous={status:j.status,error:j.error,notice:j.autoNotice||null,renderHash:j.resultHash||null,at:new Date().toISOString()};
  // Only the existing, teacher-authorized uncalled child is resumed. Its paid
  // parent is unchanged. Technical notices are preserved as text, not grades.
  j.campaignTransportRecovery={version:CAMPAIGN_RECOVERY,previous};
  delete j.autoNotice;delete j.resultHash;j.status='READY';j.error='';j.nextAt=0;c.persist_(j,row);return true;
 }
 return false;
}
export function confirmedNoAudioNotice(c,j,row,cell){
 if(!/SYSTEM_AUDIO_INPUT_SOURCE_HAS_NO_AUDIO/.test(j.error||'')||hasRequest(j)||j.rawId||j.gradeId||hasTeacherReview(cell.getDisplayValue())||cell.getFormula()||cell.getDataValidation())return false;
 const fresh=c.freshReceipt_(j);if(!fresh||fresh.row!==j.receipt.row||fresh.time!==j.receipt.time||fresh.links!==j.receipt.links||c.currentRoster_&&!c.currentRoster_(j.receipt,{fresh:true}))return false;
 const media=(j.media||[]).filter(m=>!m.isReference);if(!media.length||media.some(m=>m.nativeYouTube))return false;
 const proof=media.map(m=>c.runnerUniversalMedia_.verifyAudio(m));
 if(!proof.every(p=>p.confirmedAbsent))return false;
 const before=cell.getDisplayValue(),text=truthNoticeText(j.receipt,before,'❌ CẦN NỘP LẠI: Video không có tiếng đọc bài. Con thu lại để cô nhận xét nhé!');
 j.noAudioSourceProof=proof;j.pendingInputNotice={version:CAMPAIGN_RECOVERY,text};c.persist_(j,row);
 if(cell.getDisplayValue()!==before)throw Error('DESTINATION_CHANGED');
 cell.setRichTextValue(c.coloredFeedback_(cell,text,null));
 j.autoNotice=cell.getDisplayValue();j.status='COMPLETED_NEEDS_RESUBMISSION';j.error='';j.nextAt=0;delete j.pendingInputNotice;c.persist_(j,row);return true;
}
export function closeRetiredCampaignRecord(c,j,row,error){
 if(!/^STUDENT_NOT_FOUND_OR_AMBIGUOUS$/.test(error?.message||'')||!c.currentRoster_||c.currentRoster_(j.receipt,{fresh:true})!==false)return false;
 markNotCurrent(j,()=>c.persist_(j,row));return true;
}
