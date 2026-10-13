import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Google} from './google-adapter.mjs';
import {backlogCounts} from './runner-policies.mjs';
import {dispatchContinuation} from './backlog-continuation.mjs';

export function recoveryDecision(state,failedRun,counts){
 if(counts.pending===0&&!Number(state.scanRemaining||0))return {retry:false,state:{...state,...counts,active:false,completedAt:new Date().toISOString()}};
 if(!state.active||String(state.lastFailedRun||'')===String(failedRun))return {retry:false,state};
 const attempts=counts.returned>Number(state.recoveryReturned??-1)?1:Number(state.recoveryAttempts||0)+1;
 return {retry:attempts<=2,state:{...state,...counts,recoveryAttempts:attempts,recoveryReturned:counts.returned,lastFailedRun:String(failedRun),updatedAt:new Date().toISOString()}};
}
async function recover(){
 const env=process.env,id=env.FAILED_RUN_ID;
 if(!/^\d+$/.test(id||'')||!/^\w[\w.-]*\/[\w.-]+$/.test(env.GITHUB_REPOSITORY||''))throw Error('RECOVERY_CONFIG_INVALID');
 const r=await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/grading_cron.yml/runs?per_page=1`,{headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('RECOVERY_GITHUB_HTTP_'+r.status);
 const latest=(await r.json()).workflow_runs?.[0];
 if(String(latest?.id)!==id||latest.status!=='completed'||latest.conclusion!=='failure')return {event:'BULK_RECOVERY',dispatched:false,reason:'NEWER_OR_ACTIVE_RUN'};
 const cfg=JSON.parse(env.RUNNER_CONFIG),g=new Google(JSON.parse(env.GOOGLE_CREDENTIALS));
 const book=g.book(cfg.clusters[0].controlId),sheet=book.getSheetByName('RunnerBacklog');
 if(!sheet)return {event:'BULK_RECOVERY',dispatched:false,reason:'BULK_NOT_ACTIVE'};
 const state=JSON.parse(sheet.getRange('A1').getValue()||'{}');
 if(!state.active)return {event:'BULK_RECOVERY',dispatched:false,reason:'BULK_NOT_ACTIVE'};
 const counts={pending:0,held:0,returned:0};
 for(const b of [...cfg.clusters,...(cfg.ielts?[cfg.ielts]:[]),...(cfg.shadowing?.enabled?[{...cfg.shadowing,queueTab:'SHADOWING AI',stateTab:'ShadowingState'}]:[])]){
  const cb=g.book(b.controlId),s=cb.getSheetByName(b.queueTab||(b.email?'Jobs':'IELTS SPEAKING AI')),rows=s.getLastRow()<2?[]:s.getRange(2,6,s.getLastRow()-1,1).getValues();
  const c=backlogCounts(rows.filter(r=>r[0]).map(r=>JSON.parse(r[0])));for(const k of Object.keys(counts))counts[k]+=c[k];
  const ls=cb.getSheetByName(b.stateTab||'RunnerState');if(!ls)continue;
  const cell=ls.getRange('B1'),raw=cell.getValue(),lease=JSON.parse(raw||'{}');
  // Clear only an unexpired lease belonging to the verified failed GitHub run.
  // A replacement run's token, a live run, and an unidentified lease are protected.
  if(lease.until>Date.now()){
   if(String(lease.runId)!==id)return {event:'BULK_RECOVERY',dispatched:false,reason:'LEASE_OWNER_UNVERIFIED'};
   cb.cache.clear();if(cell.getValue()!==raw)throw Error('RECOVERY_LEASE_CHANGED');cell.clearContent();
  }
 }
 const decision=recoveryDecision(state,id,counts);sheet.getRange('A1').setValue(JSON.stringify(decision.state));
 if(!decision.retry)return {event:'BULK_RECOVERY',dispatched:false,reason:counts.pending===0?'DRAINED':'NO_PROGRESS_RETRY_LIMIT',...counts};
 const result=await dispatchContinuation({...env,CONTINUE_BULK:'true',GITHUB_REF_NAME:latest.head_branch});
 return {...result,event:'BULK_RECOVERY',failedRun:id,...counts};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await recover()));
