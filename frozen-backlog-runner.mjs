import fs from 'node:fs';import path from 'node:path';import {fork} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {validateBacklog,selectExisting,matchesTarget,claimAllowed,readNativeQueue} from './frozen-backlog-policy.mjs';
import {stateStore,localGuard} from './runner-state.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),config=JSON.parse(process.env.RUNNER_CONFIG||'{}');
export async function runFrozenBacklog(file,{minutes=45}={}){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='mstrangtrieueducation-droid/kids-grader-runner'||process.env.GRADING_ENABLED!=='true')throw Error('TRUSTED_ENABLED_CAMPAIGN_REQUIRED');
 const q=validateBacklog(JSON.parse(fs.readFileSync(file))),{runnerGoogle:g}=await import('./grader_runner.mjs');
 const deadline=Date.now()+minutes*60000,release=localGuard(path.join(root,'private','runner.lock')),leases=[],workers=[],entriesByControl=new Map(),active=new Map();
 const saveLocal=()=>{const t=file+'.tmp';fs.writeFileSync(t,JSON.stringify(q));fs.renameSync(t,file);};
 const control=config.clusters[0].controlId,tab='FrozenBacklog',base='https://sheets.googleapis.com/v4/spreadsheets/'+control;
 const durable=(items)=>{if(!items.length)return;g.api(base+'/values:batchUpdate','POST',{valueInputOption:'RAW',data:items.map(item=>({range:"'"+tab+"'!A"+(q.items.indexOf(item)+2)+':F'+(q.items.indexOf(item)+2),values:[[item.id,item.state,new Date().toISOString(),process.env.GITHUB_RUN_ID||'',q.membershipHash,JSON.stringify(item)]]}))});saveLocal();};
 let beats,providerCalls=0;
 try{
  // The ordinary workflow and this coordinator share the same GitHub concurrency
  // group. A coordinator owns all native leases; workers never erase/acquire them.
  for(const cluster of config.clusters){const lease=stateStore(g,cluster.controlId);lease.acquire(deadline+60000);leases.push(lease);}
  beats=setInterval(()=>{try{for(const l of leases)l.heartbeat();}catch(e){for(const w of workers)w.retire=true;}},60000);
  const book=g.book(control);let sheet=book.getSheetByName(tab);if(!sheet){sheet=book.insertSheet(tab);sheet.getRange(1,1,1,6).setValues([['itemId','state','updatedAt','runId','membershipHash','itemJson']]);}
  const existing=g.api(base+'/values/'+encodeURIComponent("'"+tab+"'!A2:F"+(q.total+1))).values||[];
  if(existing.length){if(existing.length!==q.total||existing.some((r,i)=>r[0]!==q.items[i].id||r[4]!==q.membershipHash))throw Error('DURABLE_BACKLOG_MEMBERSHIP_MISMATCH');existing.forEach((r,i)=>{const saved=JSON.parse(r[5]);if(saved.id!==q.items[i].id)throw Error('DURABLE_ITEM_INVALID');q.items[i]=saved;});}
  else durable(q.items);
  // Read only the existing persistent ledgers, never discovery across classes/Form.
  for(const cluster of config.clusters)entriesByControl.set(cluster.controlId,readNativeQueue(g,cluster.controlId));
  const attempted=new Set();let verified=q.items.filter(x=>x.state==='VERIFIED_WRITTEN').length,milestone=Math.floor(verified/50)*50;
  console.log(JSON.stringify({event:'CAMPAIGN_STARTED',workers:4,total:q.total,verified,fullClassScans:0}));
  const choose=()=>{
   if(Date.now()>deadline-120000)return [];
   const busy=[...active.values()].flatMap(x=>x.batch.map(y=>y.entry.job));
   const first=q.items.find(item=>!attempted.has(item.id)&&!['VERIFIED_WRITTEN','ALREADY_PRESENT'].includes(item.state)&&!(item.nextAt>Date.now())&&!busy.some(j=>j.cls.spreadsheetId===item.target.spreadsheetId));if(!first)return [];
   const cluster=config.clusters.find(c=>c.classes.some(x=>x.spreadsheetId===first.target.spreadsheetId));if(!cluster){first.state='HELD';first.error='CAMPAIGN_CLASS_BINDING_MISSING';attempted.add(first.id);durable([first]);return choose();}
   const entries=entriesByControl.get(cluster.controlId),batch=[];
   for(const item of q.items.filter(x=>x.target.spreadsheetId===first.target.spreadsheetId&&!attempted.has(x.id)&&!['VERIFIED_WRITTEN','ALREADY_PRESENT'].includes(x.state)&&!(x.nextAt>Date.now()))){
    const selected=selectExisting(item.target,entries),entry=selected||entries.filter(x=>matchesTarget(x.job,item.target)).sort((a,b)=>b.row-a.row)[0];
    if(!entry){item.state='HELD';item.error='EXACT_NATIVE_QUEUE_RECORD_NOT_FOUND';attempted.add(item.id);durable([item]);continue;}
    if(!claimAllowed(entry.job,busy)){attempted.add(item.id);continue;}
    batch.push({item,entry,executable:!!selected});if(batch.length===10)break;
   }
   if(!batch.length)return choose();return {batch,entries,controlId:cluster.controlId,initial:leases[config.clusters.indexOf(cluster)].initial,deadline};
  };
  await new Promise((resolve,reject)=>{
   let stopped=0;
   const schedule=w=>{if(w.busy)return;const work=w.retire?[]:choose();if(!work.batch?.length){w.send({stop:true});return;}
    w.busy=true;active.set(w.pid,work);for(const {item,entry} of work.batch){attempted.add(item.id);item.state='CLAIMED';item.claim={runId:process.env.GITHUB_RUN_ID,worker:w.slot,jobId:entry.job.id,row:entry.row,controlId:work.controlId,at:new Date().toISOString()};}durable(work.batch.map(x=>x.item));w.send(work);
   };
   for(let slot=0;slot<4;slot++){
    const dir=path.join(root,'private','campaign-workers',String(slot));fs.mkdirSync(dir,{recursive:true});
    for(const name of fs.readdirSync(root)){if(['private','.git','node_modules','.runtime'].includes(name))continue;fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});}
    const w=fork(path.join(dir,'frozen-backlog-worker.mjs'),[],{cwd:dir,env:{...process.env,FROZEN_BACKLOG_WORKER:String(slot+1),RUNNER_SHEET_BATCH:'0',GOOGLE_RATE_GATE_FILE:path.resolve(process.env.GOOGLE_RATE_GATE_FILE||path.join(root,'private','campaign-rate.json'))},silent:true});w.slot=slot;workers.push(w);
    const log=fs.createWriteStream(path.join(root,'private','campaign-worker-'+slot+'.log'));w.stdout.pipe(log);w.stderr.pipe(log);
    w.on('message',m=>{try{
     if(m.event==='READY')schedule(w);
     if(m.event==='CALL_STARTED'){providerCalls++;}
     if(m.event==='RESULT_BATCH'){
      const work=active.get(w.pid);for(const out of m.results){const item=q.items.find(x=>x.id===out.itemId);if(!work.batch.some(x=>x.item.id===out.itemId))throw Error('WORKER_RESULT_OWNERSHIP_INVALID');const r=out.result;item.state=r.state;item.verifiedAt=r.verifiedAt;item.nextAt=r.nextAt||0;item.error=r.error||null;item.delivery={jobId:r.job.id,status:r.job.status,rawId:r.job.rawId||null,gradeId:r.job.gradeId||null,resultHash:r.job.resultHash||null,calls:r.calls||0};item.attempts.push({runId:process.env.GITHUB_RUN_ID,worker:slot,at:new Date().toISOString(),state:r.state,calls:r.calls||0});const e=work.entries.find(x=>x.job.id===r.job.id);if(e)e.job=r.job;fs.appendFileSync(path.join(root,'private','campaign-deliveries.jsonl'),JSON.stringify(out)+'\n');}
      durable(work.batch.map(x=>x.item));active.delete(w.pid);w.busy=false;verified=q.items.filter(x=>x.state==='VERIFIED_WRITTEN').length;
      if(Math.floor(verified/50)*50>milestone){milestone=Math.floor(verified/50)*50;console.log(JSON.stringify({event:'CAMPAIGN_VERIFIED_MILESTONE',verified,total:q.total,providerCalls}));}schedule(w);
     }
    }catch(e){w.retire=true;reject(e);}});
    w.on('exit',code=>{const work=active.get(w.pid);if(work){for(const {item} of work.batch){item.state='HELD';item.error='WORKER_EXIT_RECHECK_NATIVE_LEDGER';}durable(work.batch.map(x=>x.item));active.delete(w.pid);}stopped++;if(stopped===4)resolve();});w.on('error',reject);
   }
  });
  const report={at:new Date().toISOString(),campaignId:q.campaignId,total:q.total,workers:4,attempted:attempted.size,providerCalls,counts:q.items.reduce((a,x)=>(a[x.state]=(a[x.state]||0)+1,a),{})};fs.writeFileSync(path.join(root,'private','campaign-report.json'),JSON.stringify(report));console.log(JSON.stringify({event:'CAMPAIGN_RUN_COMPLETE',...report}));return report;
 }finally{clearInterval(beats);for(const w of workers)w.retire=true;if(workers.some(w=>w.connected))await Promise.all(workers.filter(w=>w.connected).map(w=>new Promise(resolve=>{w.once('exit',resolve);if(!w.busy)w.send({stop:true});})));for(const l of leases.reverse())l.release();release();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await runFrozenBacklog(process.env.FROZEN_BACKLOG_FILE);
