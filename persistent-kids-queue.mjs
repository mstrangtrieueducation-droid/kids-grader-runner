// Scheduling over the existing native Jobs ledger. No receipt matching or
// homework classification is introduced here; native eligibility/resolvers win.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {readNativeQueue,selectExisting,matchesTarget,validateBacklog} from './frozen-backlog-policy.mjs';
import {automaticEligible,mayResumeSaved} from './automatic-authorization.mjs';
import {hasTeacherReview,receiptOnlyCell} from './teacher-feedback-state.mjs';
import {masterScopeAllowsJob} from './master-submission-scope.mjs';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const NATIVE_TODO_SCHEMA='kids-native-todo-v1';
export function appendNativeItems(previous,entries,resolve,{now=Date.now()}={}){
 const q=previous?structuredClone(validateBacklog(previous)):{schema:NATIVE_TODO_SCHEMA,campaignId:'native-kids-persistent-4',workers:4,total:0,items:[],membershipHash:digest([])};
 if(q.schema!==NATIVE_TODO_SCHEMA)throw Error('NATIVE_TODO_SCHEMA_REQUIRED');
 const known=new Set(q.items.map(x=>x.id)),all=entries.map(x=>x.job),newest=new Map();
 for(const entry of entries){const j=entry.job;if(!masterScopeAllowsJob(j)||j.nextAt>now||!(automaticEligible(j,all)||mayResumeSaved(j)))continue;
  const key=[j.cls?.spreadsheetId,j.receipt?.student,j.route?.code].join('|'),old=newest.get(key);
  if(!old||Date.parse(j.receipt?.time)>Date.parse(old.job.receipt?.time))newest.set(key,entry);
 }
 let added=0;for(const entry of newest.values()){
  const j=entry.job,id=digest(['native-todo',j.id]);if(known.has(id))continue;
  let target;try{target=resolve(entry);}catch{continue;}if(!target||!matchesTarget(j,target))continue;
  const chosen=selectExisting(target,entries,now);if(!chosen||chosen.job.id!==j.id)continue;
  q.items.push({id,target,state:'PENDING_VALIDATION',attempts:[]});known.add(id);added++;
 }
 q.total=q.items.length;q.membershipHash=digest(q.items.map(x=>x.id));validateBacklog(q);return {queue:q,added};
}
export function preparationProgress(j){
 return digest({raw:j.rawId,grade:j.gradeId,status:j.status,requests:j.generateRequests,input:j.snapshotId||j.inputId,transport:j.campaignTransportProgress,
  media:(j.media||[]).map(m=>({id:m.id,download:m.runnerDownloadBytes,upload:m.upload?.offset,runner:m.runnerUpload?.offset,prepared:m.universalAudio?.segments?.map(s=>[s.sha256,s.fileUri])}))});
}
export function retryProgressTracker(){const stalled=new Map();return {allow(j,before){const moved=preparationProgress(j)!==before;if(moved){stalled.delete(j.id);return true;}const count=(stalled.get(j.id)||0)+1;stalled.set(j.id,count);return count<3;}};}
export async function prepareNativeTodo(file,{config,google,buildContext}){
 const g=google,control=config.clusters[0].controlId,tab=g.book(control).getSheetByName('KidsTodo');let previous=null;
 if(tab){const rows=g.api('https://sheets.googleapis.com/v4/spreadsheets/'+control+'/values/'+encodeURIComponent("'KidsTodo'!A2:F")).values||[];
  if(rows.length){const items=rows.map(r=>JSON.parse(r[5]));previous={schema:NATIVE_TODO_SCHEMA,campaignId:'native-kids-persistent-4',workers:4,total:items.length,items,membershipHash:rows[0][4]};validateBacklog(previous);if(rows.some(r=>r[4]!==previous.membershipHash))throw Error('NATIVE_TODO_MEMBERSHIP_INVALID');}
 }
 const entries=config.clusters.flatMap(c=>readNativeQueue(g,c.controlId)),contexts=new Map();
 const result=appendNativeItems(previous,entries,entry=>{
  const j=entry.job,cluster=config.clusters.find(x=>x.classes.some(c=>c.spreadsheetId===j.cls.spreadsheetId));if(!cluster)return null;
  let c=contexts.get(cluster.controlId);if(!c){c=buildContext(cluster);contexts.set(cluster.controlId,c);}
  if(c.currentRoster_&&!c.currentRoster_(j.receipt))return null;
  const cell=c.destination_(j.cls,j.route,j.receipt.student).cell,text=cell.getDisplayValue();
  if(cell.getFormula()||cell.getDataValidation()||hasTeacherReview(text)||!receiptOnlyCell(text))return null;
  return {spreadsheetId:j.cls.spreadsheetId,sheetId:cell.sheet.getSheetId(),cell:cell.getA1Notation(),className:j.cls.className,student:j.receipt.student,code:j.receipt.code,submissionAt:j.receipt.time};
 });
 fs.writeFileSync(file,JSON.stringify(result.queue));return {...result,entries:entries.length};
}
