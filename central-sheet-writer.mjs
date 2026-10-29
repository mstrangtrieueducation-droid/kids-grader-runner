import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {guardClassRequests} from './sheet-truth-write-guard.mjs';
// Workers retain the native guard and durable journal; only the coordinator commits class cells.
export function submitClassWrite({bookId,requests,expected},dir){
 if(!process.send||!process.env.CAMPAIGN_PARENT_PID)throw Error('TRUSTED_CLASS_WRITER_REQUIRED');
 fs.mkdirSync(dir,{recursive:true});const id=randomUUID(),answer=path.join(dir,id+'.ack.json');
 process.send({event:'CLASS_WRITE',id,bookId,requests,expected});
 const until=Date.now()+10*60000;
 while(!fs.existsSync(answer)){if(Date.now()>until)throw Error('TRANSIENT_CLASS_WRITER_TIMEOUT');try{process.kill(Number(process.env.CAMPAIGN_PARENT_PID),0);}catch{throw Error('CLASS_WRITER_OWNER_GONE');}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}
 const result=JSON.parse(fs.readFileSync(answer,'utf8'));fs.unlinkSync(answer);if(result.error)throw Error(result.error);return result;
}
export function centralSheetWriter(g,{interval=15000,guard=guardClassRequests,commit=(id,requests)=>g.api('https://sheets.googleapis.com/v4/spreadsheets/'+id+':batchUpdate','POST',{requests}),emit=()=>{}}={}){
 let pending=[],timer,flushing=false;
 const reply=(x,value)=>{const temp=x.answer+'.tmp';fs.writeFileSync(temp,JSON.stringify(value));fs.renameSync(temp,x.answer);};
 function flush(){if(flushing||!pending.length)return;flushing=true;clearTimeout(timer);timer=null;const batch=pending;pending=[];
  try{for(const id of new Set(batch.map(x=>x.bookId))){const jobs=batch.filter(x=>x.bookId===id);try{
   // Re-read original native identity/headers/teacher content at the single commit boundary.
   const plan=guard(g,id,jobs.flatMap(x=>x.requests),jobs.flatMap(x=>x.expected||[]));
   if(plan.requests.length)commit(id,plan.requests);
   for(const x of jobs)reply(x,x.requests.every(r=>plan.requests.includes(r))?{committed:true}:{error:'DESTINATION_CHANGED_BEFORE_COMMIT'});emit({event:'CENTRAL_CLASS_BATCH_COMMITTED',items:jobs.length,requests:plan.requests.length});
  }catch{for(const x of jobs)reply(x,{error:'TRANSIENT_CENTRAL_CLASS_COMMIT_RETRY'});}}
  }finally{flushing=false;if(pending.length&&!timer)timer=setTimeout(flush,interval);}
 }
 return {enqueue(x,answer){if(!Array.isArray(x.requests)||!x.id)throw Error('CLASS_WRITE_INVALID');pending.push({...x,answer});if(!timer)timer=setTimeout(flush,interval);},flush,close(){flush();clearTimeout(timer);}};
}
