// Intake delegates to the existing canonical native Form/Sheet reconciliation.
// This module chooses execution order only; it never classifies a receipt.
export function prepareKidsDrain(clusters,{scan,cache,canContinue=()=>true}){
 for(const cluster of clusters){if(!canContinue())return;scan(cluster);}
 for(const cluster of clusters){if(!canContinue())return;cache(cluster);}
}
export function existingSliceEnded({phase,savedOnly=false,attempted,startedAt,now=Date.now()}){
 return phase==='existing'&&!savedOnly&&(attempted>=4||now-startedAt>=6*60000);
}
