import {createHash} from 'node:crypto';
import {automaticEligible,mayResumeSaved} from './automatic-authorization.mjs';
import {hasRequest,hasSavedResult,sourceIds} from './universal-media.mjs';
import {savedDeliveryCandidates} from './saved-delivery-repair.mjs';
export const normalize=s=>String(s||'').normalize('NFC').trim().replace(/\s+/g,' ').toUpperCase();
export const targetKey=t=>[t.spreadsheetId,t.sheetId,t.cell].join('|');
export function validateBacklog(q){
 if(q.schema!=='kids-frozen-backlog-v1'||q.items.length!==q.total||q.workers!==4)throw Error('BACKLOG_SCHEMA_INVALID');
 if(new Set(q.items.map(x=>x.id)).size!==q.total||new Set(q.items.map(x=>targetKey(x.target))).size!==q.total)throw Error('BACKLOG_DUPLICATE_TARGET');
 if(createHash('sha256').update(JSON.stringify(q.items.map(x=>x.id))).digest('hex')!==q.membershipHash)throw Error('BACKLOG_MEMBERSHIP_CHANGED');
 return q;
}
export function matchesTarget(j,t){return j.cls?.spreadsheetId===t.spreadsheetId&&normalize(j.cls?.className)===normalize(t.className)&&normalize(j.receipt?.student)===normalize(t.student)&&normalize(j.receipt?.code)===normalize(t.code)&&Date.parse(j.receipt?.time)===Date.parse(t.submissionAt);}
export function selectExisting(t,entries,now=Date.now()){
 const all=entries.map(x=>x.job),matches=entries.filter(x=>matchesTarget(x.job,t));
 const possible=matches.filter(({job:j})=>!(Number(j.nextAt)>now)&&(automaticEligible(j,all)||mayResumeSaved(j)));
 // A saved result always precedes an uncalled duplicate of the same receipt.
 const saved=matches.filter(x=>x.job.rawId||x.job.gradeId);
 if(saved.length)return saved.find(x=>possible.includes(x))||savedDeliveryCandidates(saved)[0]||null;
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
