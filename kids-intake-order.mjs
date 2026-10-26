// Intake delegates to the existing canonical native Form/Sheet reconciliation.
// This module chooses execution order only; it never classifies a receipt.
export function prepareKidsDrain(clusters,{scan,cache,canContinue=()=>true}){
 for(const cluster of clusters){if(!canContinue())return;scan(cluster);}
 for(const cluster of clusters){if(!canContinue())return;cache(cluster);}
}
export function existingSliceEnded({phase,savedOnly=false,attempted,startedAt,now=Date.now()}){
 return (phase==='cache'||phase==='existing'&&!savedOnly)&&(attempted>=4||now-startedAt>=6*60000);
}
// One unresolved saved result must not monopolize every later phase in the same
// writer. Retain its durable response and let the next writer reconcile again.
export function savedPassTracker(){const seen=new Set();return {allows(job){return !(job.rawId||job.gradeId)||!seen.has(job.id);},record(job){if(job.rawId||job.gradeId)seen.add(job.id);}};}
