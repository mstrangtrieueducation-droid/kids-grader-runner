import {fileURLToPath} from 'node:url';
import {sourceInMasterScope} from './master-submission-scope.mjs';
import {automaticEligible,mayResumeSaved} from './automatic-authorization.mjs';
const OWNER='mstrangtrieueducation-droid',MINUTE=60000;
export function actionableCount(lane,jobs,now=Date.now()){
 const due=j=>{const next=Number(j.nextAt)||Date.parse(j.nextAt)||0,name=lane==='kids'?j.cls?.className:j.source?.className;return sourceInMasterScope(j.receipt||j.source)&&!/^IELTS (40|41|42|43|44)$/.test(name||'')&&next<=now;};
 if(lane==='kids')return jobs.filter(j=>due(j)&&(automaticEligible(j,jobs)||mayResumeSaved(j))).length;
 const spent=j=>!!(j.rawId||j.gradeId||j.usage||j.apiUsage||j.generateRequests||j.approvedGenerateRequests||j.masterGenerationReserved||j.runnerGenerationStarted||j.generationReservation||j.singleCallPermanentlyConsumed||j.providerFailure||j.generationAttempt?.calls||['previousGradingAttempts','failedAttempts','recoveryHistory','teacherApprovedHistory'].some(k=>j[k]?.some(a=>spent(a)||a.calls||a.previousRequests||a.oldRequests)));
 return jobs.filter(j=>due(j)&&['READY','RETRY','WAITING_MEDIA','PROCESSING','GRADED','QUEUED'].includes(j.status)&&(j.rawId||j.gradeId||!spent(j))).length;
}
export function dispatchDecision({enabled,workflow,runs,due,lastDispatchAt=0,now=Date.now(),scanEveryMs=10*MINUTE}){
 if(!enabled||workflow.state!=='active')return {action:'stop',reason:'disabled'};
 if(runs.some(r=>r.status!=='completed'))return {action:'wait',reason:'writer_or_successor_exists'};
 if(now-lastDispatchAt<2*MINUTE)return {action:'wait',reason:'dispatch_visibility_grace'};
 const latest=runs[0];
 if(latest?.display_title?.includes('enabled=false'))return {action:'stop',reason:'teacher_disabled_grading'};
 if(latest?.conclusion==='failure'&&now-Date.parse(latest.updated_at)<3*MINUTE)return {action:'wait',reason:'infrastructure_backoff'};
 if(due>0)return {action:'dispatch',reason:'eligible_backlog'};
 if(!latest||now-Date.parse(latest.created_at)>=scanEveryMs)return {action:'dispatch',reason:'scan_for_new_submissions'};
 return {action:'wait',reason:'idle_until_next_source_scan'};
}
export async function watchLane(env,{fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,readDue,emit=x=>console.log(JSON.stringify(x))}={}){
 const lane=env.GRADING_LANE,repo=OWNER+'/'+lane+'-grader-runner';
 if(!['kids','shadowing'].includes(lane)||env.GITHUB_REPOSITORY!==repo||env.GITHUB_ACTIONS!=='true'||!env.GITHUB_TOKEN)throw Error('UNTRUSTED_DISPATCH_RUNTIME');
 const base='https://api.github.com/repos/'+repo,workflow='grade_'+lane+'.yml',started=now(),duration=Number(env.WATCH_DURATION_MS||5*60*MINUTE),state={lastDispatchAt:0},headers={Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
 async function api(url,method='GET',body){const r=await fetcher(base+url,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('DISPATCH_HTTP_'+r.status);return r.status===204?null:r.json();}
 const info=await api('');if(info.private||info.owner?.login!==OWNER||env.GITHUB_REF_NAME!==info.default_branch)throw Error('DISPATCH_REPOSITORY_BINDING_FAILED');
 if(!Number.isFinite(duration)||duration<=0||duration>5*60*MINUTE)throw Error('WATCH_DURATION_INVALID');
 let failures=0,lastReason='';
 while(now()-started<duration){
  try{
   const wf=await api('/actions/workflows/'+workflow),runs=(await api('/actions/workflows/'+workflow+'/runs?per_page=100&fresh='+now())).workflow_runs;
   // The generation workflow independently evaluates the current repository
   // switch at dispatch time. A stale controller cannot enable or grade while off.
   const due=runs.some(r=>r.status!=='completed')?0:await readDue(lane);
   const plan=dispatchDecision({enabled:env.GRADING_ENABLED==='true',workflow:wf,runs,due,lastDispatchAt:state.lastDispatchAt,now:now()});
   if(plan.reason!==lastReason){emit({event:'CONTINUOUS_DISPATCH',lane,...plan,due,providerCalls:0});lastReason=plan.reason;}
   if(plan.action==='stop')return plan;
   if(plan.action==='dispatch'){
    // Recheck immediately before POST; no queue mutation or reservation reset.
    const active=(await api('/actions/workflows/'+workflow+'/runs?per_page=100&fresh='+now())).workflow_runs.some(r=>r.status!=='completed');
    if(!active){await api('/actions/workflows/'+workflow+'/dispatches','POST',{ref:info.default_branch,inputs:{mode:'grade'}});state.lastDispatchAt=now();emit({event:'CONTINUOUS_SUCCESSOR_REQUESTED',lane,reason:plan.reason,providerCalls:0});}
   }
   failures=0;
  }catch(e){failures++;emit({event:'CONTINUOUS_CHECK_DEFERRED',lane,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'READ_CHECK_FAILED',consecutiveChecks:failures,providerCalls:0});}
  await sleep(30000);
 }
 // Only dispatcher jobs overlap during handover; grade writers never do.
 if(env.GRADING_ENABLED==='true'){
  const others=(await api('/actions/workflows/continuous_dispatch.yml/runs?per_page=100')).workflow_runs.filter(r=>String(r.id)!==env.GITHUB_RUN_ID&&r.status!=='completed');
  if(!others.length){await api('/actions/workflows/continuous_dispatch.yml/dispatches','POST',{ref:info.default_branch});emit({event:'CONTINUOUS_WATCH_HANDOVER',lane,providerCalls:0});}
 }
 return {action:'handover',providerCalls:0};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const fs=await import('node:fs'),{createDecipheriv}=await import('node:crypto'),{gunzipSync}=await import('node:zlib'),{Google}=await import('./google-adapter.mjs');
 const env=process.env,lane=env.GRADING_LANE,b=fs.readFileSync('approved-policy.enc'),d=createDecipheriv('aes-256-gcm',Buffer.from(env.PRIVATE_BUNDLE_KEY||'','base64'),b.subarray(4,16));d.setAAD(Buffer.from(OWNER+'/'+lane+'-grader-runner'));d.setAuthTag(b.subarray(16,32));
 const bundle=JSON.parse(gunzipSync(Buffer.concat([d.update(b.subarray(32)),d.final()]))),sa=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||'{}');
 if(bundle.lane!==lane||bundle.config.approvedRepository!==env.GITHUB_REPOSITORY||bundle.config.serviceAccount!==sa.client_email)throw Error('DISPATCH_PRIVATE_BINDING_FAILED');
 process.env.MASTER_CROSS_CLASS_SWEEP='true';const g=new Google(sa);
 const readDue=async()=>{const jobs=[];for(const id of lane==='kids'?bundle.config.clusters.map(c=>c.controlId):[bundle.config.shadowing.controlId]){const tab=lane==='kids'?'Jobs':'SHADOWING AI',rows=g.api('https://sheets.googleapis.com/v4/spreadsheets/'+id+'/values/'+encodeURIComponent("'"+tab+"'!F2:F5000")).values||[];for(const r of rows)try{jobs.push(JSON.parse(r[0]));}catch{}}return actionableCount(lane,jobs);};
 try{await watchLane(env,{readDue});}catch(e){console.error(JSON.stringify({event:'CONTINUOUS_DISPATCH_FAILED',code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'CONTROLLER_FAILED',providerCalls:0}));process.exitCode=1;}
}
