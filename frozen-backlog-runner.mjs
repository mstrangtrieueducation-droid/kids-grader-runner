import {isolateItem,attemptCount} from './queue-isolation.mjs';
import {centralSheetWriter} from './central-sheet-writer.mjs';
import {mediaLimiterEnv,retainWorkerMedia} from './ffmpeg-limiter.mjs';
import {mainRevisionChanged} from './cooperative-upgrade.mjs';
import {workerAccepts,mediaWorkload,ITEM_MS} from './workload-lanes.mjs';
import fs from 'node:fs';import path from 'node:path';import {fork} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {validateBacklog,selectExisting,matchesTarget,claimAllowed,readNativeQueue,campaignClosed,cacheFirstItems,resultNativeClaim} from './frozen-backlog-policy.mjs';
import {stateStore,localGuard} from './runner-state.mjs';
import {preparationProgress,retryProgressTracker,NATIVE_TODO_SCHEMA,workerOwnsPreparation,mergeDurableNativeItem} from './persistent-kids-queue.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),config=JSON.parse(process.env.RUNNER_CONFIG||'{}');
export async function runFrozenBacklog(file,{minutes=300,table='FrozenBacklog',isolationOnly=false}={}){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='mstrangtrieueducation-droid/kids-grader-runner'||process.env.GRADING_ENABLED!=='true')throw Error('TRUSTED_ENABLED_CAMPAIGN_REQUIRED');
 const q=validateBacklog(JSON.parse(fs.readFileSync(file))),{runnerGoogle:g,buildContext}=await import('./grader_runner.mjs');
 if(!['FrozenBacklog','KidsTodo'].includes(table)||(table==='KidsTodo')!==(q.schema===NATIVE_TODO_SCHEMA))throw Error('CAMPAIGN_TABLE_SCHEMA_MISMATCH');
 const deadline=Date.now()+minutes*60000,release=localGuard(path.join(root,'private','runner.lock')),leases=[],workers=[],entriesByControl=new Map(),active=new Map(),haltFile=path.join(root,'private','campaign-halt');
 if(fs.existsSync(haltFile))fs.unlinkSync(haltFile);
 const saveLocal=()=>{const t=file+'.tmp';fs.writeFileSync(t,JSON.stringify(q));fs.renameSync(t,file);};
 const control=config.clusters[0].controlId,tab=table,base='https://sheets.googleapis.com/v4/spreadsheets/'+control;
 const durable=(items)=>{if(!items.length)return;g.api(base+'/values:batchUpdate','POST',{valueInputOption:'RAW',data:items.map(item=>({range:"'"+tab+"'!A"+(q.items.indexOf(item)+2)+':F'+(q.items.indexOf(item)+2),values:[[item.id,item.state,new Date().toISOString(),process.env.GITHUB_RUN_ID||'',q.membershipHash,JSON.stringify(item)]]}))});saveLocal();};
 retainWorkerMedia(root);
 const workerCount=8,fastWorkers=6,mediaEnv=mediaLimiterEnv(root),writer=centralSheetWriter(g,{emit:x=>console.log(JSON.stringify(x))});
 let beats,providerCalls=0,preparationAdvanced=0,upgradeRequested=false;
 try{
  // The ordinary workflow and this coordinator share the same GitHub concurrency
  // group. A coordinator owns all native leases; workers never erase/acquire them.
  for(const cluster of config.clusters){const lease=stateStore(g,cluster.controlId);lease.acquire(deadline+60000);leases.push(lease);}
  beats=setInterval(async()=>{try{for(const l of leases)l.heartbeat();if(await mainRevisionChanged()){upgradeRequested=true;fs.writeFileSync(haltFile,'COOPERATIVE_UPGRADE_DRAIN');for(const w of workers)w.retire=true;}}catch(e){fs.writeFileSync(haltFile,'LEASE_CHECK_FAILED');for(const w of workers)w.retire=true;}},60000);
  const book=g.book(control);let sheet=book.getSheetByName(tab);if(!sheet){sheet=book.insertSheet(tab);sheet.getRange(1,1,1,6).setValues([['itemId','state','updatedAt','runId','membershipHash','itemJson']]);}
  const existing=g.api(base+'/values/'+encodeURIComponent("'"+tab+"'!A2:F"+(q.total+1))).values||[];
  if(existing.length){const append=table==='KidsTodo'&&existing.length<q.total,oldHash=existing[0][4];if((append?existing.length>q.total:existing.length!==q.total)||existing.some((r,i)=>r[0]!==q.items[i].id||r[4]!==oldHash)||!append&&oldHash!==q.membershipHash||append&&oldHash!==validateBacklog({...q,total:existing.length,items:q.items.slice(0,existing.length),membershipHash:oldHash}).membershipHash)throw Error('DURABLE_BACKLOG_MEMBERSHIP_MISMATCH');const reopened=[];existing.forEach((r,i)=>{const saved=JSON.parse(r[5]);if(saved.id!==q.items[i].id)throw Error('DURABLE_ITEM_INVALID');const merged=table==='KidsTodo'?mergeDurableNativeItem(q.items[i],saved):saved;q.items[i]=merged;if(merged!==saved)reopened.push(merged);});if(append)durable(q.items);else if(reopened.length)durable(reopened);}
  else durable(q.items);
  // Read only the existing persistent ledgers, never discovery across classes/Form.
  for(const cluster of config.clusters)entriesByControl.set(cluster.controlId,readNativeQueue(g,cluster.controlId));
  // Isolate old poison before allocating a worker. Paid history is never reset.
  const isolated=[];
  for(const item of q.items){const cluster=config.clusters.find(c=>c.classes.some(x=>x.spreadsheetId===item.target.spreadsheetId)),es=cluster&&entriesByControl.get(cluster.controlId),job=es?.find(x=>x.job.id===item.claim?.jobId)?.job||es?.find(x=>matchesTarget(x.job,item.target))?.job||{};if(isolateItem(item,job,{activeRun:process.env.GITHUB_RUN_ID}))isolated.push(item);}
  durable(isolated);console.log(JSON.stringify({event:'QUEUE_QUARANTINE_RECONCILED',isolated:isolated.length,providerCalls:0}));
  if(isolationOnly)return {providerCalls:0,isolated:isolated.length,counts:q.items.reduce((a,x)=>(a[x.state]=(a[x.state]||0)+1,a),{})};
  const bindingContexts=new Map(),nativeRows=new Map();
  const attempted=new Set(),progress=retryProgressTracker();let verified=q.items.filter(x=>x.state==='VERIFIED_WRITTEN').length,milestone=Math.floor(verified/50)*50;
  console.log(JSON.stringify({event:'CAMPAIGN_STARTED',workers:workerCount,fastWorkers,heavyWorkers:2,claimBatchSize:1,total:q.total,verified,fullClassScans:0}));
  const choose=slot=>{
   if(Date.now()>deadline-ITEM_MS-120000)return [];
   const busy=[...active.values()].flatMap(x=>x.batch.map(y=>y.entry.job));
   const candidates=q.items.filter(item=>(workerCount===8||workerOwnsPreparation(item,slot,process.env.GITHUB_RUN_ID,false))&&!attempted.has(item.id)&&!campaignClosed(item.state)&&!(item.nextAt>Date.now()));if(!candidates.length)return [];
    const heavyWaiting=candidates.some(x=>{const c=config.clusters.find(y=>y.classes.some(z=>z.spreadsheetId===x.target.spreadsheetId));const es=c&&entriesByControl.get(c.controlId);const e=es&&selectExisting(x.target,es);return e&&mediaWorkload(e.job).lane==='heavy';});
   for(const first of cacheFirstItems(candidates)){
   const cluster=config.clusters.find(c=>c.classes.some(x=>x.spreadsheetId===first.target.spreadsheetId));if(!cluster){first.state='HELD';first.error='CAMPAIGN_CLASS_BINDING_MISSING';attempted.add(first.id);durable([first]);return choose(slot);}
   const entries=entriesByControl.get(cluster.controlId),batch=[];
   for(const item of cacheFirstItems(q.items.filter(x=>(workerCount===8||workerOwnsPreparation(x,slot,process.env.GITHUB_RUN_ID,false))&&x.target.spreadsheetId===first.target.spreadsheetId&&!attempted.has(x.id)&&!campaignClosed(x.state)&&!(x.nextAt>Date.now())))){
    const selected=selectExisting(item.target,entries),entry=selected||entries.filter(x=>matchesTarget(x.job,item.target)).sort((a,b)=>b.row-a.row)[0];
    if(!entry){item.state='HELD';item.error='EXACT_NATIVE_QUEUE_RECORD_NOT_FOUND';attempted.add(item.id);durable([item]);continue;}
    if(!workerAccepts({...entry.job,attempt_count:attemptCount(item)},slot,{workers:workerCount,fastWorkers,heavyWaiting,ownerSlot:item.claim&&(item.claim.runId===process.env.GITHUB_RUN_ID||process.env.MEDIA_CACHE_RESTORED==='true')?item.claim.worker:undefined})||!claimAllowed(entry.job,busy)){continue;}
    let nativeRowKey=nativeRows.get(entry.job.id);if(!nativeRowKey){try{let c=bindingContexts.get(cluster.controlId);if(!c){c=buildContext(cluster);bindingContexts.set(cluster.controlId,c);}const cell=c.destination_(entry.job.cls,entry.job.route,entry.job.receipt.student).cell;nativeRowKey=[entry.job.cls.spreadsheetId,cell.sheet.getSheetId(),cell.getA1Notation().match(/\d+$/)[0]].join('|');nativeRows.set(entry.job.id,nativeRowKey);}catch{nativeRowKey='unresolved-class|'+entry.job.cls.spreadsheetId;}}
    if([...active.values()].some(w=>w.batch.some(b=>b.nativeRowKey===nativeRowKey||b.entry.job.cls.spreadsheetId===entry.job.cls.spreadsheetId&&(b.nativeRowKey.startsWith('unresolved-class|')||nativeRowKey.startsWith('unresolved-class|')))))continue;
    batch.push({item,entry,nativeRowKey,executable:!!selected});if(batch.length===1)break;
   }
   if(!batch.length)continue;return {batch,entries,controlId:cluster.controlId,initial:leases[config.clusters.indexOf(cluster)].initial,deadline};
   }return [];
  };
  await new Promise((resolve,reject)=>{
   let stopped=0;const restarts=new Map();
   const schedule=w=>{if(w.busy||!w.connected)return;const work=w.retire?[]:choose(w.slot);if(!work.batch?.length){
    const dueLater=q.items.some(x=>['RETRY','PENDING_VALIDATION'].includes(x.state)&&!attempted.has(x.id)&&x.nextAt<deadline-120000);
    if(!w.retire&&Date.now()<deadline-ITEM_MS-120000&&(active.size||dueLater)){setTimeout(()=>schedule(w),2000);return;}
    w.send({stop:true});return;
   }
    work.before=new Map(work.batch.map(x=>[x.item.id,preparationProgress(x.entry.job)]));for(const {item,entry} of work.batch){attempted.add(item.id);item.beforeClaimState=item.state;item.state='CLAIMED';item.locked_at=new Date().toISOString();item.attempt_count=attemptCount(item);item.claim={runId:process.env.GITHUB_RUN_ID,worker:w.slot,jobId:entry.job.id,row:entry.row,controlId:work.controlId,at:new Date().toISOString()};}durable(work.batch.map(x=>x.item));w.busy=true;active.set(w.pid,work);w.send(work);
   };
   const launch=slot=>{
    const dir=path.join(root,'private','campaign-workers',String(slot));fs.mkdirSync(dir,{recursive:true});
    for(const name of fs.readdirSync(root)){if(['private','.git','node_modules','.runtime'].includes(name))continue;fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});}
    const w=fork(path.join(dir,'frozen-backlog-worker.mjs'),[],{cwd:dir,env:{...process.env,...mediaEnv,GRADING_SHARED_MEDIA_ROOT:root,FROZEN_BACKLOG_WORKER:String(slot+1),CAMPAIGN_PARENT_PID:String(process.pid),CAMPAIGN_HALT_FILE:haltFile,RUNNER_SHEET_BATCH:'0',GOOGLE_RATE_GATE_FILE:path.resolve(process.env.GOOGLE_RATE_GATE_FILE||path.join(root,'private','campaign-rate.json'))},silent:true});w.slot=slot;workers.push(w);
    const log=fs.createWriteStream(path.join(root,'private','campaign-worker-'+slot+'.log'));w.stdout.pipe(log);w.stderr.pipe(log);
    w.on('message',m=>{try{
     if(m.event==='CLASS_WRITE'){const owned=active.get(w.pid);if(!owned||!owned.batch.some(x=>x.item.target.spreadsheetId===m.bookId))throw Error('CLASS_WRITE_OWNERSHIP_INVALID');writer.enqueue(m,path.join(dir,'private','class-write-acks',m.id+'.ack.json'));}
     if(m.event==='READY')schedule(w);
     if(m.event==='CALL_STARTED'){providerCalls++;}
     if(m.event==='RESULT_BATCH'){
      const work=active.get(w.pid);for(const out of m.results){const item=q.items.find(x=>x.id===out.itemId);if(!work.batch.some(x=>x.item.id===out.itemId))throw Error('WORKER_RESULT_OWNERSHIP_INVALID');const r=out.result;if(r.unstarted){item.state=item.beforeClaimState||'PENDING_VALIDATION';delete item.beforeClaimState;continue;}delete item.beforeClaimState;if(Number.isInteger(r.nativeRow))item.claim=resultNativeClaim(item,r,work.controlId);item.state=r.state;item.resolvedTarget=r.target||item.resolvedTarget;item.verifiedAt=r.verifiedAt;item.nextAt=r.nextAt||0;item.error=r.error||null;if(['HELD','RETRY'].includes(r.state))item.attempt_count=attemptCount(item)+1;isolateItem(item,r.job);item.delivery={jobId:r.job.id,status:r.job.status,rawId:r.job.rawId||null,gradeId:r.job.gradeId||null,resultHash:r.job.resultHash||null,replayProof:r.replayProof||null,calls:r.calls||0};item.attempts.push({runId:process.env.GITHUB_RUN_ID,worker:slot,at:new Date().toISOString(),state:r.state,calls:r.calls||0});const e=work.entries.find(x=>x.job.id===r.job.id);if(e)e.job=r.job;else if(Number.isInteger(r.nativeRow)&&matchesTarget(r.job,item.target)&&r.job.invalidResultRetry)work.entries.push({job:r.job,row:r.nativeRow});else throw Error('WORKER_NATIVE_ENTRY_INVALID');fs.appendFileSync(path.join(root,'private','campaign-deliveries.jsonl'),JSON.stringify(out)+'\n');}
      for(const {item} of work.batch){const job=work.entries.find(x=>x.job.id===item.delivery?.jobId)?.job;if(job&&preparationProgress(job)!==work.before.get(item.id))preparationAdvanced++;}
      active.delete(w.pid);w.busy=false;restarts.set(slot,0);durable(work.batch.map(x=>x.item));for(const {item} of work.batch)if(['RETRY','PENDING_VALIDATION'].includes(item.state)&&item.delivery&&item.nextAt>Date.now()&&progress.allow(work.entries.find(x=>x.job.id===item.delivery.jobId).job,work.before.get(item.id)))attempted.delete(item.id);verified=q.items.filter(x=>x.state==='VERIFIED_WRITTEN').length;
      if(Math.floor(verified/50)*50>milestone){milestone=Math.floor(verified/50)*50;console.log(JSON.stringify({event:'CAMPAIGN_VERIFIED_MILESTONE',verified,total:q.total,providerCalls}));}schedule(w);
     }
    }catch(e){w.retire=true;reject(e);}});
    w.on('exit',code=>{try{const work=active.get(w.pid);active.delete(w.pid);w.busy=false;
     if(work){
      // A dead process cannot still issue a call. Refresh durable Jobs before any
      // replacement claims: saved raw wins and uncertain paid requests stay held.
      entriesByControl.set(work.controlId,readNativeQueue(g,work.controlId));
      for(const {item} of work.batch){item.state='HELD';item.error='WORKER_EXIT_RECHECK_NATIVE_LEDGER';if(!item.workerRecoveryRuns?.includes(process.env.GITHUB_RUN_ID)){item.workerRecoveryRuns=[...(item.workerRecoveryRuns||[]),process.env.GITHUB_RUN_ID];attempted.delete(item.id);}}
      durable(work.batch.map(x=>x.item));
     }
     const n=restarts.get(slot)||0;
     if(work&&!w.retire&&!fs.existsSync(haltFile)&&Date.now()<deadline-120000&&n<3){restarts.set(slot,n+1);console.log(JSON.stringify({event:'CAMPAIGN_WORKER_RESTART',slot,attempt:n+1}));launch(slot);return;}
     stopped++;if(stopped===workerCount)resolve();
    }catch(e){reject(e);}});w.on('error',reject);
   };for(let slot=0;slot<workerCount;slot++)launch(slot);
  });
  const report={at:new Date().toISOString(),campaignId:q.campaignId,total:q.total,workers:workerCount,attempted:attempted.size,providerCalls,preparationAdvanced,upgradeRequested,counts:q.items.reduce((a,x)=>(a[x.state]=(a[x.state]||0)+1,a),{})};fs.writeFileSync(path.join(root,'private','campaign-report.json'),JSON.stringify(report));console.log(JSON.stringify({event:'CAMPAIGN_RUN_COMPLETE',...report}));return report;
 }finally{fs.writeFileSync(haltFile,'COORDINATOR_DRAINING');for(const w of workers)w.retire=true;if(workers.some(w=>w.connected))await Promise.all(workers.filter(w=>w.connected).map(w=>new Promise(resolve=>{w.once('exit',resolve);if(!w.busy)w.send({stop:true});})));writer.close();clearInterval(beats);for(const l of leases.reverse())l.release();release();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await runFrozenBacklog(process.env.FROZEN_BACKLOG_FILE);
