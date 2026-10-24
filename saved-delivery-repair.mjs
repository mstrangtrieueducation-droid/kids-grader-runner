import {createHash} from 'node:crypto';
import {masterScopeAllowsJob,sourceInMasterScope} from './master-submission-scope.mjs';
import {receiptOnlyCell} from './teacher-feedback-state.mjs';
const closed=new Set(['RETURNED','DONE','SKIPPED_ALREADY_GRADED','SKIPPED_EXISTING_FEEDBACK']);
export const savedDeliveryCandidates=items=>items.filter(({job:j})=>closed.has(j.status)&&!!(j.rawId||j.gradeId)&&sourceInMasterScope(j.receipt)&&masterScopeAllowsJob(j)&&!j.technicalInputFailure&&!j.presentationResubmissionRequired);
export const savedDeliveryWork=items=>items.filter(({job:j})=>!!(j.rawId||j.gradeId)&&!!j.savedDeliveryRepair);
// Requeue only durable results whose current, exact target is still receipt-only.
// The ordinary native step performs the actual 0-API restoration and rechecks
// source, roster, target and saved grading policies before writing.
export function reconcileSavedDelivery(c,items,{deadline=Infinity}={}){
 let requeued=0,held=0;
 for(const {job:j,row}of savedDeliveryCandidates(items)){
  if(Date.now()>deadline-90000)break;
  try{
   if(c.currentRoster_&&!c.currentRoster_(j.receipt))continue;
   const cell=c.destination_(j.cls,j.route,j.receipt.student).cell,text=cell.getDisplayValue();
   if(cell.getFormula()||cell.getDataValidation()||!receiptOnlyCell(text))continue;
   c.currentSource_(j);
   const previousStatus=j.status;
   j.status='READY';j.error='';j.nextAt=0;
   j.sheetTruth={...j.sheetTruth,state:'PENDING'};
   j.savedDeliveryRepair={version:'receipt-only-saved-delivery-v1',previousStatus,at:new Date().toISOString(),previousCellHash:createHash('sha256').update(text).digest('hex'),providerCalls:0};
   c.persist_(j,row);requeued++;
  }catch{held++;}
 }
 return {requeued,held,providerCalls:0};
}
