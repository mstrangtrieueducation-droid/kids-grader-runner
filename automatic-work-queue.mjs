import {masterScopeAllowsJob} from './master-submission-scope.mjs';
import {addAutomaticAuthorizations,automaticEligible,mayResumeSaved} from './automatic-authorization.mjs';
import {receiptDate} from './master-policy.mjs';
import {readyForMediaCheck,throughputQueue} from './runner-policies.mjs';
export function fairAutomaticCandidates(jobs,classes,cursor=0){
 const all=jobs.map(x=>x.job),latest=new Map();
 for(const item of jobs.slice().sort((a,b)=>receiptDate(b.job.receipt?.time,new Date(0))-receiptDate(a.job.receipt?.time,new Date(0)))){
  const j=item.job;if(j.nextAt>Date.now()||!(automaticEligible(j,all)||mayResumeSaved(j)))continue;
  const key=[j.cls?.spreadsheetId,j.receipt?.student,j.route?.code].join('|');if(!latest.has(key))latest.set(key,item);
 }
 const names=classes.map(x=>typeof x==='string'?x:x.className),offset=((Number(cursor)||0)%names.length+names.length)%names.length,buckets=names.slice(offset).concat(names.slice(0,offset)).map(name=>[...latest.values()].filter(x=>x.job.cls?.className===name).sort((a,b)=>Number(mayResumeSaved(b.job))-Number(mayResumeSaved(a.job)))),ordered=[];
 while(buckets.some(x=>x.length))for(const bucket of buckets)if(bucket.length)ordered.push(bucket.shift());
 return {ordered,nextCursor:names.length?(offset+Math.min(6,names.length))%names.length:0};
}
export function authorizeFairKidsWork(c,cluster,google){
 const session=c.teacherApprovalSession_,jobs=c.teacherApprovalJobs_,selection=fairAutomaticCandidates(jobs,cluster.classes,c.runnerProperties.get('FLEET_WORK_AUTO_CURSOR'));
 addAutomaticAuthorizations(session,selection.ordered,cluster.controlId,'Jobs',google.book(cluster.controlId).getSheetByName('Jobs').getSheetId(),{fairOrder:true,allJobs:jobs});
 c.runnerProperties.set('FLEET_WORK_AUTO_CURSOR',String(selection.nextCursor));return session;
}
export function authorizedWorkQueue(c){return c.batchQueue_(c.teacherApprovalJobs_).filter(({job})=>masterScopeAllowsJob(job)&&c.teacherApprovalSession_.approved.has(job.id));}
export function authorizedPhaseQueue(items,phase,automatic=false){if(phase==='all')return items;return automatic&&phase==='prepare'?items.filter(x=>!readyForMediaCheck(x.job)):throughputQueue(items,phase);}
