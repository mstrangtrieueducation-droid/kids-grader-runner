import {fileURLToPath} from 'node:url';
import {backlogCounts} from './runner-policies.mjs';
import {unpaidBaremHold} from './kids-barem-recovery.mjs';
export function planContinuation(jobs, now=Date.now(), canRecover=()=>false) {
  const pending=jobs.filter(j=>backlogCounts([j]).pending||unpaidBaremHold(j)&&canRecover(j));
  const due=pending.filter(j=>{const at=typeof j.nextAt==='number'?j.nextAt:Date.parse(j.nextAt);return !j.nextAt||!Number.isFinite(at)||at<=now;});
  return {pending:pending.length,due:due.length,deferred:pending.length-due.length};
}
export async function continueKids(env, jobs, fetcher=fetch, canRecover=()=>false) {
  const plan=planContinuation(env.KIDS_CONTENT_REPROCESS==='1'?jobs.filter(j=>j.routingRecovery):jobs,Date.now(),canRecover);
  if(!plan.due&&!(env.KIDS_CONTENT_REPROCESS==='1'&&plan.pending))return {...plan,dispatched:false};
  if(!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY||'')||!env.GH_TOKEN||!env.GITHUB_RUN_ID)throw Error('CONTINUATION_CONFIG_MISSING');
  const base='https://api.github.com/repos/'+env.GITHUB_REPOSITORY;
  const headers={Authorization:'Bearer '+env.GH_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'};
  async function request(url, init={}) {
    const res=await fetcher(base+url,{...init,headers,signal:AbortSignal.timeout(30000)});
    if(!res.ok)throw Error('CONTINUATION_HTTP_'+res.status);
    return res.status===204?null:res.json();
  }
  if(env.SPLIT_ENABLED!=='true')return {...plan,dispatched:false,reason:'disabled'};
  const runs=await request('/actions/workflows/grade_kids.yml/runs?per_page=100');
  if(runs.workflow_runs.some(r=>String(r.id)!==env.GITHUB_RUN_ID&&r.status!=='completed'))return {...plan,dispatched:false,reason:'successor_already_queued'};
  await request('/actions/workflows/grade_kids.yml/dispatches',{method:'POST',body:JSON.stringify({ref:env.GITHUB_REF_NAME||'main',inputs:{mode:env.KIDS_CONTENT_REPROCESS==='1'?'reprocess-content':'grade'}})});
  return {...plan,dispatched:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const {Google}=await import('./google-adapter.mjs');
  const cfg=JSON.parse(process.env.RUNNER_CONFIG),g=new Google(JSON.parse(process.env.GOOGLE_CREDENTIALS));
  const jobs=[];
  for(const b of cfg.clusters){
    const rows=g.api(`https://sheets.googleapis.com/v4/spreadsheets/${b.controlId}/values/`+encodeURIComponent("'Jobs'!F2:F")).values||[];
    for(const row of rows)if(row[0])jobs.push(JSON.parse(row[0]));
  }
  const {MasterBaremCatalog}=await import('./master-barem.mjs');
  const catalog=MasterBaremCatalog.fromFile('migration/kids-barem-20261012/catalog.approved.json');
  const canRecover=j=>{try{const e=catalog.lookup('kids',j.receipt.code);return e.autoEligible!==false;}catch{return false;}};
  console.log(JSON.stringify({event:'KIDS_LANE_CONTINUATION',...await continueKids(process.env,jobs,fetch,canRecover)}));
}
