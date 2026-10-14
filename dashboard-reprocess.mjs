import {sourceInMasterScope} from './master-submission-scope.mjs';
import {generationSpent} from './master-policy.mjs';
import {emptyTeacherBody} from './dashboard-feedback.mjs';
export const DASHBOARD_REPROCESS_AUTH='teacher-dashboard-empty-feedback-20261014';
export function dashboardReprocessPlan(job,text,childId){
 if(!sourceInMasterScope(job.receipt)||job.rawId||job.gradeId||!generationSpent(job)||job.dashboardReprocessAuth||!emptyTeacherBody(text)||!/ĐÃ NỘP/iu.test(text)||/\d+(?:[.,]\d+)?\s*%/.test(text))return null;
 if([...(job.previousGradingAttempts||[]),...(job.failedAttempts||[])].some(x=>x.rawId||x.gradeId))return null; // recover archived paid output before considering another request
 // A new explicitly authorized attempt; original reservations and history remain
 // in the parent record. Never turn a paid result into a new unpaid result.
 const child=structuredClone(job);
 for(const k of ['generateRequests','masterGenerationReserved','runnerGenerationStarted','generationReservation','previousGradingAttempts','failedAttempts','apiUsage','usage','gradeId','rawId','teacherApproval','backupId','pendingFeedback','pendingMasterFeedback','automaticRepairAttempts','technicalInputFailure','faultRecovery','nextAt','error','lastAttemptAt'])delete child[k];
 Object.assign(child,{id:childId,status:'WAITING_INPUT',attempts:0,nextAt:0,error:'',dashboardReprocessAuth:DASHBOARD_REPROCESS_AUTH,regradeParentId:job.id,generateRequests:0,masterSweep:{version:'master-cross-class-20261014',baseline:'EMPTY',mode:'EXPLICIT_REPROCESS',at:new Date().toISOString()}});
 return child;
}
export function authorizeEmptyDashboardReprocess(c,jobs,{emit=()=>{}}={}){
 const ids=new Set(jobs.map(x=>x.job.id)),added=[];
 for(const item of jobs){const j=item.job;if(j.dashboardReprocessAuth||j.supersededByDashboardRegrade||!sourceInMasterScope(j.receipt)||j.rawId||j.gradeId||!generationSpent(j))continue;
  try{const dst=c.destination_(j.cls,j.route,j.receipt.student),cell=dst.cell;if(cell.getFormula()||cell.getDataValidation())continue;
   const id=c.hash_([DASHBOARD_REPROCESS_AUTH,j.id]);if(ids.has(id))continue;
   const child=dashboardReprocessPlan(j,cell.getDisplayValue(),id);if(!child)continue;
   const row=c.persist_(child);j.previousDashboardReprocessStatus=j.status;j.supersededByDashboardRegrade=id;j.status='SUPERSEDED_BY_APPROVED_DASHBOARD_REPROCESS';c.persist_(j,item.row);ids.add(id);added.push({job:child,row});emit({event:'DASHBOARD_EMPTY_FEEDBACK_REPROCESS_AUTHORIZED',parentId:j.id,id,providerCalls:0});
  }catch(e){emit({event:'DASHBOARD_REPROCESS_TARGET_UNRESOLVED',id:j.id,error:String(e.message||'TARGET_UNKNOWN'),providerCalls:0});}
 }
 jobs.push(...added);return added.length;
}
