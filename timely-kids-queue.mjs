import {receiptDate,generationSpent} from './master-policy.mjs';
const DAY=24*60*60*1000;
const stamp=j=>receiptDate(j.receipt?.time,new Date(0)).getTime();
const saved=j=>!!(j.rawId||j.gradeId||j.status==='GENERATING');
function roundRobin(items,classes,cursor,newest){
 const names=[...new Set([...classes,...items.map(x=>x.job.cls.className)])];
 if(!names.length)return [];
 const start=((cursor||0)%names.length+names.length)%names.length;
 const buckets=names.slice(start).concat(names.slice(0,start)).map(name=>items.filter(x=>x.job.cls.className===name).sort((a,b)=>(newest?stamp(b.job)-stamp(a.job):stamp(a.job)-stamp(b.job))||a.row-b.row));
 const out=[];while(buckets.some(x=>x.length))for(const b of buckets)if(b.length)out.push(b.shift());return out;
}
export function timelyKidsQueue(items,classes,{now=Date.now(),turn=0,recentCursor=0,backlogCursor=0}={}){
 const protectedWork=items.filter(x=>saved(x.job)),unpaid=items.filter(x=>!saved(x.job));
 const recent=roundRobin(unpaid.filter(x=>stamp(x.job)>=now-DAY),classes,recentCursor,true);
 const older=roundRobin(unpaid.filter(x=>stamp(x.job)<now-DAY),classes,backlogCursor,false),out=[...protectedWork];
 while(recent.length||older.length){const oldTurn=turn++%4===3;out.push((oldTurn?older.length?older:recent:recent.length?recent:older).shift());}
 return out;
}
export function installTimelyKidsQueue(c,cluster,{now=Date.now}={}){
 const names=cluster.classes.map(x=>typeof x==='string'?x:x.className),queue=c.batchQueue_,step=c.step_;
 const number=k=>Number(c.runnerProperties.get(k)||0);
 const automatic=()=>process.env.AUTOMATIC_GRADING_AUTHORIZED==='true'&&process.env.MASTER_CROSS_CLASS_SWEEP==='true';
 c.batchQueue_=(items,preferred)=>{
  const result=queue(items,preferred);if(!automatic()||preferred)return result;
  return timelyKidsQueue(result,names,{now:now(),turn:number('FLEET_WORK_TIMELY_TURN'),recentCursor:number('FLEET_WORK_RECENT_CLASS'),backlogCursor:number('FLEET_WORK_BACKLOG_CLASS')});
 };
 c.step_=(job,...args)=>{
  const count=automatic()&&!saved(job)&&!generationSpent(job),recent=stamp(job)>=now()-DAY;
  try{return step(job,...args);}finally{if(count){const index=names.indexOf(job.cls.className);c.runnerProperties.set('FLEET_WORK_TIMELY_TURN',String(number('FLEET_WORK_TIMELY_TURN')+1));if(index>=0)c.runnerProperties.set(recent?'FLEET_WORK_RECENT_CLASS':'FLEET_WORK_BACKLOG_CLASS',String((index+1)%names.length));}}
 };
}
