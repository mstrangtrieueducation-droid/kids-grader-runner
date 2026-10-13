export function unpaidBaremHold(j){return j.status==='NEEDS_REVIEW'&&j.error==='BAREM_NOT_FOUND'&&!j.snapshotId&&!j.rawId&&!j.gradeId&&!j.attempts&&!j.generateRequests&&!j.apiUsage&&!j.runnerGenerationStarted&&!j.generationReservation;}
export function recoverUnpaidKidsBarem(c,{deadline,maxJobs=2000,now=()=>Date.now()}={}){
 const p=c.runnerProperties,jobs=c.loadJobs_(),targets=new Map(),report={reopened:0,old:0,preserved:0,held:0},writes=[];
 if(!jobs.length)return report;
 const flush=()=>{if(!writes.length)return;if(c.persistRecoveryBatch_)c.persistRecoveryBatch_(writes.splice(0));else for(const {job,row}of writes.splice(0))c.persist_(job,row);};
 const save=(job,row)=>{writes.push({job,row});if(writes.length>=50)flush();};
 let cursor=Number(p.get('FLEET_SCAN_BAREM_ALIAS_CURSOR')||0)%jobs.length,visited=0,checked=0;
 while(visited<jobs.length&&checked<maxJobs&&now()<deadline){
  const {job:j,row}=jobs[cursor];cursor=(cursor+1)%jobs.length;visited++;
  if(!unpaidBaremHold(j))continue;
  checked++;let route,changed=false;
  try{
   route=c.routeForReceipt_(j.receipt);const s=targets.get(j.cls.className)||c.targetSnapshot_(j.cls);targets.set(j.cls.className,s);
   if(!c.currentAssignment_(s.headers,route)){j.status='SKIPPED_OLD_LESSON';report.old++;}
   else if(c.hasFeedback_(c.autoTarget_(s,route,j.receipt.student).value)){j.status='SKIPPED_EXISTING_FEEDBACK';report.preserved++;}
   else{j.status='WAITING_INPUT';report.reopened++;}
   j.baremRoutingRecovery={previousError:j.error,version:'kids-legacy-barem-alias-batch-v2'};j.route=route;j.error='';j.nextAt=0;changed=true;
  }catch(e){report.held++;if(route){j.baremRoutingRecovery={previousError:j.error,version:'kids-legacy-barem-alias-batch-v2'};j.route=route;j.error=String(e.message||'BAREM_RECOVERY_TARGET_REVIEW').slice(0,180);j.nextAt=0;changed=true;}}
  if(changed)save(j,row);
 }
 flush();p.set('FLEET_SCAN_BAREM_ALIAS_CURSOR',String(cursor));return report;
}
