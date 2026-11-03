import {hasSavedResult,hasRequest} from './universal-media.mjs';
import {sourceInMasterScope} from './master-submission-scope.mjs';
import {normalize} from './frozen-backlog-policy.mjs';
export const UNPAID_RECOVERY='teacher-unpaid-recovery-20261103';
// Runner faults raised before any provider request. The pupil's work is intact,
// so one more attempt charges nothing twice and needs no action from the family.
const RUNNER_CAUSES=new Set(['RUNNER_ARTIFACT_MISSING','PREFLIGHT_DESTINATION_CHANGED']);
export const unpaidRecoveryEligible=j=>sourceInMasterScope(j.receipt)&&j.unpaidRecovery?.version!==UNPAID_RECOVERY&&j.status==='SYSTEM_GRADING_ERROR'&&RUNNER_CAUSES.has(j.systemGradingFailure?.cause)&&j.systemGradingFailure?.studentActionRequired===false&&!hasRequest(j)&&!hasSavedResult(j)&&!j.presentationResubmissionRequired;
// matchesTarget also compares the exact receipt time, so it cannot see a newer one.
const sameAssignment=(a,b)=>a.cls?.spreadsheetId===b.cls?.spreadsheetId&&normalize(a.receipt?.student)===normalize(b.receipt?.student)&&normalize(a.receipt?.code)===normalize(b.receipt?.code);
const newerReceipt=(job,entries)=>entries.some(({job:x})=>x.id!==job.id&&sameAssignment(x,job)&&Date.parse(x.receipt?.time)>Date.parse(job.receipt?.time));
// Reopens at most once per job. Attempt history, snapshot and paid counters stay.
export function reopenUnpaidItem(item,entry,entries,{context,now=Date.now()}){
 const job=entry.job;
 if(item.state!=='QUARANTINED'||!unpaidRecoveryEligible(job)||newerReceipt(job,entries))return false;
 if(context.currentRoster_&&!context.currentRoster_(job.receipt,{fresh:true}))return false;
 const cell=context.destination_(job.cls,job.route,job.receipt.student).cell;
 if(cell.getFormula()||cell.getDataValidation()||context.hasFeedback_(cell.getDisplayValue()))return false;
 job.unpaidRecovery={version:UNPAID_RECOVERY,previousStatus:job.status,previousError:job.error,cause:job.systemGradingFailure.cause,at:new Date(now).toISOString(),providerCalls:0};
 delete job.queueQuarantine;job.status='READY';job.error='';job.nextAt=0;context.persist_(job,entry.row);
 item.unpaidRecovery={version:UNPAID_RECOVERY,previous:item.queueQuarantine||null,at:new Date(now).toISOString()};
 delete item.queueQuarantine;item.state='PENDING_VALIDATION';item.error=null;item.nextAt=0;item.attempt_count=0;
 return true;
}
