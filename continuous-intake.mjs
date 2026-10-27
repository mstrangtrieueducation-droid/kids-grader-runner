import vm from 'node:vm';
import {gzipSync,gunzipSync} from 'node:zlib';
import {gridMaster} from './google-adapter.mjs';
import {stateStore} from './runner-state.mjs';
import {readNativeQueue} from './frozen-backlog-policy.mjs';
import {prepareKidsMasterSweep} from './master-kids-sweep.mjs';

export const INTAKE_INTERVAL=10*60000;
export const decodeIntakeState=value=>JSON.parse(value?.startsWith('gz:')?gunzipSync(Buffer.from(value.slice(3),'base64')).toString('utf8'):value||'{"tabs":{}}');
export function encodeIntakeState(state){const text=JSON.stringify(state),encoded=text.length>12000?'gz:'+gzipSync(text).toString('base64'):text;if(encoded.length>32000)throw Error('NATIVE_INTAKE_CURSOR_CAPACITY');return encoded;}
export function intakeDue(state,now=Date.now()){return !!state?.more||!state?.completedAt||now-state.completedAt>=INTAKE_INTERVAL;}
export function tailWindow({cursor,known=1,rowCount,pageSize=50}){
 if(!Number.isInteger(rowCount)||rowCount<1)throw Error('SOURCE_ROW_COUNT_INVALID');
 const acknowledged=Number.isInteger(cursor)&&cursor>=1?cursor:Math.max(1,known-32);
 const start=acknowledged+1,end=Math.min(rowCount,start+pageSize-1);
 return {acknowledged,start,end,empty:start>rowCount};
}
const quoted=s=>"'"+s.replaceAll("'","''")+"'";
const col=n=>String.fromCharCode(64+n);

// This is a tail transport into the EXISTING native receipt parser and sweep.
// It never decides submission status, matches a pupil, writes a review, or calls AI.
export async function intakeNewKidsReceipts({config,google:g,buildContext,emit=()=>{},now=Date.now,makeState=stateStore,readJobs=readNativeQueue,makeSweep=prepareKidsMasterSweep}={}){
 const leases=[],contexts=[],cursorKey='FLEET_SCAN_INTAKE_TAIL_V1';let properties;
 try{
  for(const cluster of config.clusters){const lease=makeState(g,cluster.controlId);lease.acquire(now()+15*60000);leases.push(lease);}
  properties=new Map(Object.entries(leases[0].initial));let state;
  try{state=decodeIntakeState(properties.get(cursorKey));}catch{throw Error('NATIVE_INTAKE_CURSOR_INVALID');}
  if(!intakeDue(state,now()))return {due:false,providerCalls:0};
  const all=[];
  for(let i=0;i<config.clusters.length;i++){
   const cluster=config.clusters[i],c=buildContext(cluster);
   for(const [key,value] of Object.entries(leases[i].initial))c.runnerProperties.set(key,value);
   const source=vm.runInContext('KG.source',c),tabs=Array.from(vm.runInContext('KIDS21_AUTO.tabs',c)),entries=readJobs(g,cluster.controlId);
   contexts.push({cluster,c,source,tabs});all.push(...entries.map(e=>({...e,source})));
  }
  const groups=new Map();for(const item of contexts){if(!groups.has(item.source))groups.set(item.source,[]);groups.get(item.source).push(item);}
  let observed=0,handled=0,more=false,failures=0;const next=structuredClone(state);next.tabs ||= {};
  const deferredKey=x=>[x.source,x.tab,x.row,x.controlId].join('|'),deferred=new Map((state.deferred||[]).map(x=>[deferredKey(x),x]));
  const defer=(source,r,cluster,reason)=>{const x={source,tab:r.sourceTab,row:r.row,controlId:cluster.controlId,reason,nextAt:now()+INTAKE_INTERVAL};deferred.set(deferredKey(x),x);failures++;};
  for(const [source,members] of groups){
   const book=g.book(source);book.refresh?.();
   const tabs=[...new Set(members.flatMap(x=>x.tabs))],plans=[];
   for(const tab of tabs){
    const sheet=book.getSheetByName(tab);if(!sheet)throw Error('SOURCE_TAB_NOT_FOUND');
    const key=source+'|'+sheet.getSheetId(),known=Math.max(1,...all.filter(e=>e.source===source&&e.job.receipt?.sourceTab===tab).map(e=>Number(e.job.receipt.row)||1));
    const window=tailWindow({cursor:state.tabs?.[key],known,rowCount:sheet.meta.properties.gridProperties.rowCount});
    const replay=[...deferred.values()].filter(x=>x.source===source&&x.tab===tab&&x.nextAt<=now()&&x.row<=sheet.meta.properties.gridProperties.rowCount).slice(0,25).map(x=>x.row);
    if(!window.empty||replay.length)plans.push({sheet,tab,key,...window,replay,width:Math.min(7,sheet.meta.properties.gridProperties.columnCount)});
   }
   if(!plans.length)continue;
   const ranges=plans.flatMap(p=>[quoted(p.tab)+'!A1:'+col(p.width)+'1',...(!p.empty?[quoted(p.tab)+'!A'+p.start+':'+col(p.width)+p.end]:[]),...p.replay.filter(row=>p.empty||row<p.start||row>p.end).map(row=>quoted(p.tab)+'!A'+row+':'+col(p.width)+row)]);
   const response=g.api('https://sheets.googleapis.com/v4/spreadsheets/'+source+'?'+ranges.map(x=>'ranges='+encodeURIComponent(x)).join('&')+'&includeGridData=true&fields=sheets(properties(title),data(startRow,rowData(values(effectiveValue,userEnteredValue,formattedValue,hyperlink,textFormatRuns))))');
   const receipts=[];
   for(const plan of plans){
    const wire=response.sheets?.find(s=>s.properties.title===plan.tab);if(!wire){failures++;continue;}
    const cells=Array.from({length:Math.max(plan.empty?1:plan.end,...plan.replay)},()=>({}));
    for(const block of wire.data||[]){const offset=block.startRow||0;for(let i=0;i<(block.rowData||[]).length;i++)cells[offset+i]=block.rowData[i];}
    book.cache.set(plan.tab+'|master',gridMaster(cells,plan.width));
    let parsed;try{parsed=members[0].c.sourceRows_(plan.tab).filter(r=>(!plan.empty&&r.row>=plan.start&&r.row<=plan.end)||plan.replay.includes(r.row));}catch{failures++;continue;}
    // Empty allocated rows do not acknowledge future Form submissions.
    const nonempty=parsed.filter(r=>r.time||r.student||r.code||r.links);observed+=nonempty.length;
    receipts.push(...nonempty);const tail=nonempty.filter(r=>!plan.empty&&r.row>=plan.start&&r.row<=plan.end);
    next.tabs[plan.key]=Math.max(plan.acknowledged,...tail.map(r=>r.row));
    if(tail.some(r=>r.row===plan.end)&&plan.end<plan.sheet.meta.properties.gridProperties.rowCount)more=true;
   }
   for(const {cluster,c} of members){
    const relevant=receipts.filter(r=>cluster.classes.some(cls=>c.norm_(cls.className)===c.norm_(r.className)));
    if(!relevant.length)continue;
    for(const r of relevant)deferred.delete(deferredKey({source,tab:r.sourceTab,row:r.row,controlId:cluster.controlId}));
    try{
     const sweep=makeSweep(c,cluster,g,{emit,receipts:relevant}),issues=sweep.flushIssues();
     if(issues.failed.length)for(const r of relevant)defer(source,r,cluster,'NATIVE_ISSUE_WRITE_DEFERRED');
     for(const item of sweep.states.values())if(item.error||item.outcome==='assignment')defer(source,item.source,cluster,item.error?'NATIVE_ROW_DEFERRED':'NATIVE_ASSIGNMENT_PENDING');
    }catch{for(const r of relevant)defer(source,r,cluster,'NATIVE_CLUSTER_DEFERRED');}
    handled+=relevant.length;
   }
  }
  next.completedAt=now();next.more=more;next.deferred=[...deferred.values()];
  if(next.deferred.length>5000)throw Error('NATIVE_DEFERRED_QUEUE_CAPACITY');
  properties.set(cursorKey,encodeIntakeState(next));leases[0].save(properties);
  emit({event:'KIDS_NATIVE_TAIL_INTAKE',observed,handled,more,failures,deferred:next.deferred.length,fullClassScans:0,providerCalls:0});
  return {due:true,observed,handled,more,failed:failures>0,providerCalls:0};
 }finally{
  // Do not leave a partial Form grid installed for freshness/generation guards.
  g.invalidate();for(const lease of leases.reverse())lease.release();
 }
}
