import {mainRevisionChanged} from './cooperative-upgrade.mjs';
import {serviceMinutes,ITEM_MS} from './workload-lanes.mjs';
import {discoveryAllowed} from './persistent-kids-queue.mjs';
import {campaignClosed} from './frozen-backlog-policy.mjs';
const remaining=counts=>Object.entries(counts||{}).filter(([state])=>!campaignClosed(state)).reduce((n,[,v])=>n+v,0);
const signature=counts=>JSON.stringify(Object.entries(counts||{}).sort());
export async function runKidsService({deadline,intake,runFrozen,prepareTodo,discover,runTodo,isolate=async()=>{},checkUpgrade=mainRevisionChanged,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),emit=x=>console.log(JSON.stringify(x))}){
 let frozenRemaining=1,nextFrozen=0,nextTodo=0,previousFrozen='',previousTodo='',freshSlices=0,upgradeRequested=false,isolated=false;
 const drainTodo=async()=>{
  const report=await runTodo(serviceMinutes(deadline,now())),fingerprint=signature(report.counts),moved=!!report.providerCalls||!!report.preparationAdvanced||fingerprint!==previousTodo;
  upgradeRequested ||= !!report.upgradeRequested;previousTodo=fingerprint;nextTodo=moved?0:now()+10*60000;return moved;
 };
 while(now()<deadline-ITEM_MS-3*60000){
  if(upgradeRequested||await checkUpgrade())return {handover:true,upgradeRequested:true};
  const cycleStarted=now();
  try{
   if(!isolated){await isolate();isolated=true;} // Before optional intake/history; normal cycle recovery handles failures.
   // Intake is independent of held/uncertain old jobs. It reads Form tails and
   // delegates every pupil/assignment/status decision to the native sweep.
   let incoming;
   try{incoming=await intake();}catch(e){incoming={due:false,handled:0,failed:true};emit({event:'KIDS_INTAKE_DEFERRED_EXISTING_QUEUE_CONTINUES',code:/^[A-Z0-9_]+$/.test(e.message||'')?e.message:'INTAKE_FAILED',providerCalls:0});}
   let progress=!!incoming.handled||!!incoming.more;
   // Reopened native submissions may have entered the durable queue in a
   // previous run. A fresh intake.added counter is not their readiness signal.
   // Resolve once with the original native guards, then consume ready work
   // before a slow frozen-history slice. Preserve the three-to-one sharing.
   let todo=await prepareTodo(),fastDrained=false;
   const nativeWaiting=todo.queue.items.some(x=>x.state==='PENDING_VALIDATION'&&!(x.nextAt>now()));
   if((incoming.added||todo.added||nativeWaiting)&&now()<deadline-3*60000){
    if(todo.queue.items.some(x=>!campaignClosed(x.state))){progress=(await drainTodo())||progress;fastDrained=true;freshSlices++;}
   }
   if(upgradeRequested)return {handover:true,upgradeRequested:true};
   if(now()>=nextFrozen&&(!fastDrained||freshSlices>=3)){
    const report=await runFrozen(serviceMinutes(deadline,now()));
    if(report.upgradeRequested)return {handover:true,upgradeRequested:true};
    frozenRemaining=remaining(report.counts);const fingerprint=signature(report.counts);
    const moved=!!report.providerCalls||!!report.preparationAdvanced||fingerprint!==previousFrozen;
    progress ||= moved;previousFrozen=fingerprint;nextFrozen=moved?0:now()+10*60000;freshSlices=0;
   }
   if(now()>=deadline-3*60000)break;
   todo ||= await prepareTodo();
   // A full historical scan still cannot interrupt either unresolved queue.
   if(incoming.due&&discoveryAllowed(frozenRemaining,todo.queue)){
    await discover(Math.max(1,Math.min(30,(deadline-now())/60000-5)));todo=await prepareTodo();
   }
   progress ||= !!todo.added;
   if(!fastDrained&&(todo.added||incoming.added||now()>=nextTodo)&&todo.queue.items.some(x=>!campaignClosed(x.state))&&now()<deadline-3*60000){
    progress=(await drainTodo())||progress;
   }
   emit({event:'KIDS_CONTINUOUS_CYCLE',frozenRemaining,nativeQueueEntries:todo.entries,workers:8,incoming:incoming.handled||0,fullScanAllowed:discoveryAllowed(frozenRemaining,todo.queue)});
   // An empty or held queue is an idle state, never a reason to end service.
   if(incoming.failed||!progress)await sleep(Math.min(incoming.failed?10000:Math.max(1000,10*60000-(now()-cycleStarted)),Math.max(0,deadline-now()-3*60000)));
  }catch(e){
   emit({event:'KIDS_CONTINUOUS_RECOVERING',code:/^[A-Z0-9_]+$/.test(e.message||'')?e.message:'CYCLE_FAILED',providerCallsInRecovery:0});
   await sleep(Math.min(10000,Math.max(0,deadline-now()-3*60000)));
  }
 }
 emit({event:'KIDS_CONTINUOUS_SAFE_HOSTED_HANDOVER',workers:8});
 return {handover:true};
}
