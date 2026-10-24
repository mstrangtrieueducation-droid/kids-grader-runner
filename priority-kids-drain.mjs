import {automaticEligible,mayResumeSaved} from './automatic-authorization.mjs';
import {nativeMetadataRepairEligible} from './native-metadata-compat.mjs';
const split=x=>String(x||'').split(',').map(s=>s.trim()).filter(Boolean);
export function priorityPolicy(env=process.env){return {classes:new Set(split(env.KIDS_PRIORITY_CLASSES).map(s=>s.toUpperCase())),ids:new Set(split([env.KIDS_PRIORITY_JOB_IDS,env.KIDS_PRIORITY_JOB_ID].filter(Boolean).join(',')))};}
export function isPriorityJob(j,policy=priorityPolicy()){return policy.ids.has(j.id)||policy.classes.has(String(j.cls?.className||'').toUpperCase());}
export function priorityCandidates(items,{now=Date.now(),policy=priorityPolicy(),includeFuture=false}={}){
 const all=items.map(x=>x.job);return items.filter(({job:j})=>isPriorityJob(j,policy)&&j.rosterEligibility?.state!=='NOT_IN_CURRENT_ROSTER'&&(includeFuture||!(Number(j.nextAt)>now))&&(automaticEligible(j,all)||mayResumeSaved(j)||nativeMetadataRepairEligible(j)));
}
export function priorityDrainWait(items,{now=Date.now(),deadline=Infinity,policy=priorityPolicy()}={}){
 const future=priorityCandidates(items,{now,policy,includeFuture:true}).map(x=>Number(x.job.nextAt)).filter(at=>at>now&&at<deadline-90000);
 return future.length?Math.min(5000,Math.min(...future)-now):0;
}
export function prioritizeKids(items,policy=priorityPolicy()){
 const saved=x=>!!(x.job.rawId||x.job.gradeId||x.job.status==='GENERATING');
 return [...items.filter(saved),...items.filter(x=>!saved(x)&&policy.ids.has(x.job.id)),...items.filter(x=>!saved(x)&&!policy.ids.has(x.job.id)&&isPriorityJob(x.job,policy)),...items.filter(x=>!saved(x)&&!isPriorityJob(x.job,policy))];
}
// Priority is an execution order, never permission to bypass a Form, roster,
// source, existing feedback, saved result or one-request guard.
export function priorityClusters(clusters,policy=priorityPolicy()){return clusters.slice().sort((a,b)=>Number(b.classes.some(c=>policy.classes.has(c.className.toUpperCase())))-Number(a.classes.some(c=>policy.classes.has(c.className.toUpperCase()))));}
