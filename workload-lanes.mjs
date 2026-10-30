// Scheduling only. Native source, eligibility, paid history and final-cell guards remain authoritative.
import {sourceIds} from './universal-media.mjs';
export const FAST_BYTES=50_000_000;
export const SERVICE_MS=300*60000;
export const ITEM_MS=5*60000;
export function mediaWorkload(job){
 if(job.rawId||job.gradeId)return {lane:'fast',bytes:0,saved:true};
 const media=(job.media||[]).filter(m=>!m.isReference),files=media.length?media:job.sourceIntake?.metadataFiles?.length?job.sourceIntake.metadataFiles:job.sourceIntake?.files||[];
 if(/\/drive\/folders\//i.test(job.receipt?.links||job.source?.link||'')||files.some(m=>m.mimeType==='application/vnd.google-apps.folder'||m.mime==='application/vnd.google-apps.folder'))return {lane:'heavy',bytes:null,saved:false};
 if(files.length&&files.every(m=>m.nativeYouTube||String(m.id||'').startsWith('yt_')))return {lane:'fast',bytes:0,saved:false};
 const sizes=files.map(m=>Number(m.size??m.bytes));
 const known=sizes.length>0&&sizes.every(n=>Number.isFinite(n)&&n>0),observed=sizes.filter(n=>Number.isFinite(n)&&n>0).reduce((n,v)=>n+v,0),bytes=known?observed:null;
 return {lane:observed>=FAST_BYTES?'heavy':'fast',bytes,saved:false};
}
export function workerAccepts(job,slot,{heavyWaiting=true,ownerSlot,workers=4,fastWorkers=3,allowSteal=false}={}){if(workers===4&&slot===3&&ownerSlot===3)return true;if(workers===8&&allowSteal)return slot>=0&&slot<workers;const saved=!!(job.rawId||job.gradeId),retry=Number(job.attempt_count||0)>0||!!job.preprocessRetry||!!job.providerRetryOrigin;const heavy=mediaWorkload(job).lane==='heavy'||workers===8&&retry;return slot>=fastWorkers&&slot<workers?(heavy||saved||workers===4&&!heavyWaiting):slot>=0&&slot<fastWorkers&&!heavy;}
// Scheduling memo only. The native selector remains authoritative; invalidate
// whenever a worker returns changed paid/raw/job history or a ledger is reloaded.
export function queueSelectionCache(select){const cache=new Map();return {get(item){if(!cache.has(item.id))cache.set(item.id,select(item));return cache.get(item.id);},clear(){cache.clear();}};}
export const serviceMinutes=(deadline,now=Date.now())=>Math.max(1,(deadline-now)/60000-3);
export function assertDelegatedWork(lane,id){
 if(!process.send||process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='mstrangtrieueducation-droid/'+lane+'-grader-runner'||String(process.ppid)!==process.env.LANE_POOL_PARENT_PID||id!==process.env.LANE_POOL_JOB_ID)throw Error('TRUSTED_OWNED_WORKER_REQUIRED');
}
export function workConflict(a,b){
 const cls=j=>j.cls?.spreadsheetId||j.source?.className;
 // Disjoint pupils/cells in one class can commit independently. Keep the
 // original pupil/target/media exclusions so a heavy file cannot block classmates.
 const pupil=j=>String(j.receipt?.student||j.source?.name||'').normalize('NFC').trim().replace(/\s+/g,' ').toUpperCase();
 const address=j=>j.target?.address||j.target?.cell||j.cell;
 if(a._runtimeRowKey&&a._runtimeRowKey===b._runtimeRowKey)return true;
 if(cls(a)===cls(b)&&(!a._runtimeRowKey||!b._runtimeRowKey||!pupil(a)||!pupil(b)||pupil(a)===pupil(b)||address(a)&&address(a)===address(b)))return true;
 const input=j=>{try{return sourceIds(j.source?.link||j.receipt?.links||'');}catch{return [];}};
 const ids=new Set([...(a.media||[]).filter(m=>!m.isReference).map(m=>m.id),...input(a)]);
 return [...(b.media||[]).filter(m=>!m.isReference).map(m=>m.id),...input(b)].some(id=>ids.has(id));
}
