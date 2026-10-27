import {discoveryAllowed} from './persistent-kids-queue.mjs';
import {campaignClosed} from './frozen-backlog-policy.mjs';
const remaining=counts=>Object.entries(counts||{}).filter(([state])=>!campaignClosed(state)).reduce((n,[,v])=>n+v,0);
const signature=counts=>JSON.stringify(Object.entries(counts||{}).sort());
export async function runKidsService({deadline,intake,runFrozen,prepareTodo,discover,runTodo,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),emit=x=>console.log(JSON.stringify(x))}){
 let frozenRemaining=1,nextFrozen=0,previousFrozen='',previousTodo='';
 while(now()<deadline-3*60000){
  const cycleStarted=now();
  try{
   // Intake is independent of held/uncertain old jobs. It reads Form tails and
   // delegates every pupil/assignment/status decision to the native sweep.
   let incoming;
   try{incoming=await intake();}catch{incoming={due:false,handled:0,failed:true};emit({event:'KIDS_INTAKE_DEFERRED_EXISTING_QUEUE_CONTINUES',providerCalls:0});}
   let progress=!!incoming.handled||!!incoming.more;
   if(now()>=nextFrozen){
    const report=await runFrozen(Math.max(1,Math.min(6,(deadline-now())/60000-3)));
    frozenRemaining=remaining(report.counts);const fingerprint=signature(report.counts);
    progress ||= !!report.providerCalls||fingerprint!==previousFrozen;previousFrozen=fingerprint;nextFrozen=now()+10*60000;
   }
   if(now()>=deadline-3*60000)break;
   let todo=await prepareTodo();
   // A full historical scan still cannot interrupt either unresolved queue.
   if(incoming.due&&discoveryAllowed(frozenRemaining,todo.queue)){
    await discover(Math.max(1,Math.min(30,(deadline-now())/60000-5)));todo=await prepareTodo();
   }
   progress ||= !!todo.added;
   if(todo.queue.items.some(x=>!campaignClosed(x.state))&&now()<deadline-3*60000){
    const report=await runTodo(Math.max(1,Math.min(8,(deadline-now())/60000-2)));
    const fingerprint=signature(report.counts);progress ||= !!report.providerCalls||fingerprint!==previousTodo;previousTodo=fingerprint;
   }
   emit({event:'KIDS_CONTINUOUS_CYCLE',frozenRemaining,nativeQueueEntries:todo.entries,workers:4,incoming:incoming.handled||0,fullScanAllowed:discoveryAllowed(frozenRemaining,todo.queue)});
   // An empty or held queue is an idle state, never a reason to end service.
   if(incoming.failed||!progress)await sleep(Math.min(incoming.failed?10000:Math.max(1000,10*60000-(now()-cycleStarted)),Math.max(0,deadline-now()-3*60000)));
  }catch(e){
   emit({event:'KIDS_CONTINUOUS_RECOVERING',code:/^[A-Z0-9_]+$/.test(e.message||'')?e.message:'CYCLE_FAILED',providerCallsInRecovery:0});
   await sleep(Math.min(10000,Math.max(0,deadline-now()-3*60000)));
  }
 }
 emit({event:'KIDS_CONTINUOUS_SAFE_HOSTED_HANDOVER',workers:4});
 return {handover:true};
}
