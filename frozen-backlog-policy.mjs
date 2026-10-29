import {createHash} from 'node:crypto';
import {automaticEligible,mayResumeSaved} from './automatic-authorization.mjs';
import {hasRequest,hasSavedResult,sourceIds} from './universal-media.mjs';
import {savedDeliveryCandidates} from './saved-delivery-repair.mjs';
import {authorizedInvalidRetry} from './authorized-invalid-retry.mjs';
import {existingUncalledChild} from './campaign-recovery.mjs';
import {DASHBOARD_REPROCESS_AUTH} from './dashboard-reprocess.mjs';
export const normalize=s=>String(s||'').normalize('NFC').trim().replace(/\s+/g,' ').toUpperCase();
export const targetKey=t=>[t.spreadsheetId,t.sheetId,t.cell].join('|');
export const campaignClosed=state=>['DONE','VERIFIED_WRITTEN','ALREADY_PRESENT','SKIPPED_NOT_IN_CURRENT_ROSTER','PROTECTED','QUARANTINED'].includes(state);
export const cacheFirstItems=items=>items.slice().sort((a,b)=>Number(!!(b.savedArtifact||b.delivery?.rawId||b.delivery?.gradeId))-Number(!!(a.savedArtifact||a.delivery?.rawId||a.delivery?.gradeId))||(Number(a.attempt_count)||0)-(Number(b.attempt_count)||0));
export function validateBacklog(q){
 if(!['kids-frozen-backlog-v1','kids-native-todo-v1'].includes(q.schema)||q.items.length!==q.total||q.workers!==4)throw Error('BACKLOG_SCHEMA_INVALID');
 if(new Set(q.items.map(x=>x.id)).size!==q.total||q.schema==='kids-frozen-backlog-v1'&&new Set(q.items.map(x=>targetKey(x.target))).size!==q.total)throw Error('BACKLOG_DUPLICATE_TARGET');
 if(createHash('sha256').update(JSON.stringify(q.items.map(x=>x.id))).digest('hex')!==q.membershipHash)throw Error('BACKLOG_MEMBERSHIP_CHANGED');
 return q;
}
export function matchesTarget(j,t){return j.cls?.spreadsheetId===t.spreadsheetId&&normalize(j.cls?.className)===normalize(t.className)&&normalize(j.receipt?.student)===normalize(t.student)&&normalize(j.receipt?.code)===normalize(t.code)&&Date.parse(j.receipt?.time)===Date.parse(t.submissionAt);}
export function resultNativeClaim(item,result,controlId){
 if(!Number.isInteger(result.nativeRow)||result.nativeRow<2||!matchesTarget(result.job,item.target))throw Error('WORKER_NATIVE_RESULT_BINDING_INVALID');
 const claim=item.claim;if(!claim||claim.controlId!==controlId)throw Error('WORKER_NATIVE_RESULT_CONTROL_INVALID');
 if(claim.jobId===result.job.id&&claim.row===result.nativeRow)return claim;
 return {...claim,priorNativeBinding:claim.priorNativeBinding||{jobId:claim.jobId,row:claim.row},jobId:result.job.id,row:result.nativeRow};
}
export function selectExisting(t,entries,now=Date.now()){
 const all=entries.map(x=>x.job),matches=entries.filter(x=>matchesTarget(x.job,t));
 const explicit=matches.find(x=>authorizedInvalidRetry(x.job,all));
 if(explicit)return Number(explicit.job.nextAt)>now?null:explicit;
 const possible=matches.filter(({job:j})=>!(Number(j.nextAt)>now)&&(automaticEligible(j,all)||mayResumeSaved(j)));
 // A saved result always precedes an uncalled duplicate of the same receipt.
 const saved=matches.filter(x=>x.job.rawId||x.job.gradeId);
 if(saved.length)return saved.find(x=>possible.includes(x))||savedDeliveryCandidates(saved)[0]||saved[0]||null;
 // The existing, teacher-authorized one-child exception must remain executable
 // despite its parent's reservation. It is not a reset or a second child.
 const dashboard=matches.find(x=>possible.includes(x)&&existingUncalledChild(x.job,matches)&&x.job.id===createHash('sha256').update(JSON.stringify([DASHBOARD_REPROCESS_AUTH,x.job.regradeParentId])).digest('hex')&&matches.every(y=>[x.job.id,x.job.regradeParentId].includes(y.job.id)||!hasRequest(y.job)&&!hasSavedResult(y.job)));
 if(dashboard)return dashboard;
 if(matches.some(x=>hasRequest(x.job)||hasSavedResult(x.job)))return null;
 return possible.sort((a,b)=>b.row-a.row)[0]||null;
}
export function conflictKeys(j){let ids=[];try{ids=sourceIds(j.receipt?.links||'');}catch{}return ['target:'+j.cls.spreadsheetId+'|'+normalize(j.receipt.student)+'|'+normalize(j.route.code),'pupil:'+j.cls.spreadsheetId+'|'+normalize(j.receipt.student),...ids.map(x=>'media:'+x),...(j.media||[]).filter(x=>!x.isReference).map(x=>'media:'+x.id)];}
export function claimAllowed(j,active){const keys=new Set(conflictKeys(j));return ![...active].some(x=>conflictKeys(x).some(k=>keys.has(k)));}
export function verifiedCompletion({before,after,final,exactTarget}){return !!exactTarget&&!!final&&after!==before;}
export function readNativeQueue(g,controlId){
 const sheet=g.book(controlId).getSheetByName('Jobs');if(!sheet)throw Error('NATIVE_QUEUE_MISSING');const last=sheet.getLastRow(),entries=[];
 for(let start=2;start<=last;start+=400){const end=Math.min(last,start+399),rows=g.api('https://sheets.googleapis.com/v4/spreadsheets/'+controlId+'/values/'+encodeURIComponent("'Jobs'!F"+start+':F'+end)).values||[];rows.forEach((r,i)=>{if(r[0])entries.push({row:start+i,job:JSON.parse(r[0])});});}
 return entries;
}

// Freeze the receipt identity, not an A1 address that changes after column insertion.
// The native resolver retains its unique student/assignment and destination guards.
export function resolveFrozenTarget(c,job,target){
 if(!matchesTarget(job,target))throw Error('CAMPAIGN_JOB_BINDING_INVALID');
 const cell=c.destination_(job.cls,job.route,job.receipt.student).cell;
 if(cell.sheet.getSheetId()!==target.sheetId)throw Error('CAMPAIGN_TARGET_SHEET_CHANGED');
 return {cell,target:{...target,cell:cell.getA1Notation()}};
}
