import {sourceInMasterScope} from './master-submission-scope.mjs';
// The teacher's catch-up scope is the Form receipt, not the lesson/header date.
// Limit the exception to the protected, currently executing submission.
export function installSubmissionAssignmentScope(c){
 const step=c.step_,assignment=c.currentAssignment_;let receipt;
 c.currentAssignment_=(headers,route)=>{
  if(process.env.MASTER_CROSS_CLASS_SWEEP!=='true'||!receipt||!sourceInMasterScope(receipt))return assignment(headers,route);
  if(headers.runnerDestinationError)throw Error(headers.runnerDestinationError);
  c.autoColumns_(headers,route); // exact lesson/column ambiguity protection remains
  return true;
 };
 c.step_=(job,...args)=>{const prior=receipt;if(process.env.MASTER_CROSS_CLASS_SWEEP==='true'&&!sourceInMasterScope(job.receipt))return;receipt=job.receipt;try{return step(job,...args);}finally{receipt=prior;}};
}
