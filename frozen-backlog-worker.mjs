import {prepareCampaignRecovery,confirmedNoAudioNotice,closeRetiredCampaignRecord} from './campaign-recovery.mjs';
import {replaySavedClassBatch} from './campaign-saved-replay.mjs';
// Executed only as a child of the trusted GitHub campaign coordinator.
import fs from 'node:fs';import vm from 'node:vm';
import {matchesTarget,resolveFrozenTarget} from './frozen-backlog-policy.mjs';
import {hasTeacherReview} from './teacher-feedback-state.mjs';
import {approvalSession,acceptTeacherApprovals} from './teacher-approval-guards.mjs';
import {addAutomaticAuthorizations} from './automatic-authorization.mjs';
import {settleSheetTruth} from './sheet-truth-sync.mjs';
import {beginSheetBatch} from './kids-sheet-batch.mjs';
import {Google} from './google-adapter.mjs';
import {reconcileSavedDelivery} from './saved-delivery-repair.mjs';
import {installFrozenGenerationGuard} from './frozen-generation-guard.mjs';
import path from 'node:path';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='mstrangtrieueducation-droid/kids-grader-runner'||!process.send||!process.env.FROZEN_BACKLOG_WORKER)throw Error('TRUSTED_CAMPAIGN_REQUIRED');
const {buildContext,runnerGoogle:g}=await import('./grader_runner.mjs'),config=JSON.parse(process.env.RUNNER_CONFIG),contexts=new Map();
process.on('message',message=>{if(message.stop){process.disconnect();return;}const {batch,entries,controlId,deadline,initial={}}=message;
 const cluster=config.clusters.find(x=>x.controlId===controlId);if(!cluster)throw Error('CAMPAIGN_CLUSTER_INVALID');
 let c=contexts.get(controlId);if(!c){c=buildContext(cluster);for(const [k,v] of Object.entries(initial))c.runnerProperties.set(k,v);installFrozenGenerationGuard(c,g);contexts.set(controlId,c);
  const nativeFresh=c.freshReceipt_;c.freshReceipt_=j=>{Google.prototype.preloadSource.call(g,vm.runInContext('KG.source',c),7,[j.route.sourceTab]);return nativeFresh(j);};
 }
 g.invalidate();g.refreshFileMetadata();
 const ram=beginSheetBatch(g,cluster,path.resolve('private/campaign-journal'),{classOnly:true});
 const results=[];
 try{for(const {item,entry,executable} of batch){
 let result;try{
  if(!matchesTarget(entry.job,item.target))throw Error('CAMPAIGN_JOB_BINDING_INVALID');
  if(Date.now()>deadline-120000||process.env.CAMPAIGN_HALT_FILE&&fs.existsSync(process.env.CAMPAIGN_HALT_FILE)){results.push({itemId:item.id,target:item.target,result:{state:'RETRY',error:'CAMPAIGN_SOFT_DEADLINE',nextAt:Date.now()+60000,job:entry.job}});continue;}
  // No RAM queue/artifact writer: native append returns the server allocated rows.
  // Every reservation and raw save is immediately durable in the native ledger.
  c.loadJobs_=()=>entries;const nativePersist=c.campaignNativePersist_||c.persist_;c.campaignNativePersist_=nativePersist;
  c.persist_=(j,row)=>{if(j.id!==entry.job.id||row!==entry.row)throw Error('CAMPAIGN_ROW_OWNERSHIP_INVALID');const actual=nativePersist(j,row);const e=entries.find(x=>x.row===row);if(e)e.job=j;return actual;};
  c.teacherApprovalJobs_=entries;c.teacherApprovalSession_=approvalSession(g,config.clusters[0].controlId);
  const j=entry.job;
  const {cell,target:resolvedTarget}=resolveFrozenTarget(c,j,item.target);
  const before=cell.getDisplayValue(),beforeNote=cell.getNote();let recovered=false,noAudio=false;
  const approval=c.teacherApprovalSession_.approved.get(j.id),manual=!!approval&&!approval.automatic&&String(approval.sourceLink).includes('/'+controlId+'/')&&String(approval.sourceLink).includes('A'+entry.row+':F'+entry.row)&&/CẦN NỘP LẠI|CẦN_NỘP_LẠI/iu.test(before);
  if(!hasTeacherReview(before)&&!cell.getFormula()&&!cell.getDataValidation()){recovered=prepareCampaignRecovery(c,j,entry.row,{matches:entries.filter(e=>matchesTarget(e.job,item.target)),cell});noAudio=confirmedNoAudioNotice(c,j,entry.row,cell);}
  if(hasTeacherReview(before)&&!manual)result={state:'ALREADY_PRESENT',verifiedAt:new Date().toISOString(),before,after:before,job:j};
  else if(cell.getFormula()||cell.getDataValidation())result={state:'PROTECTED',error:'DESTINATION_PROTECTED',before,after:before,job:j};
  else if(noAudio)result={state:'STAGED',verifiedAt:null,before,after:cell.getDisplayValue(),job:j,calls:0,error:null};
  else {
   if(!executable&&!recovered&&!manual)throw Error('NATIVE_HISTORY_REQUIRES_RECONCILIATION');
   const sourceId=vm.runInContext('KG.source',c);g.preloadSource(sourceId,7,[j.route.sourceTab]);
   reconcileSavedDelivery(c,[entry],{deadline});
   addAutomaticAuthorizations(c.teacherApprovalSession_,[entry],controlId,'Jobs',g.book(controlId).getSheetByName('Jobs').getSheetId(),{allJobs:entries});
   if(recovered&&(j.rawId||j.gradeId))c.teacherApprovalSession_.approved.set(j.id,{jobId:j.id,automatic:true,authorization:'TEACHER_SAVED_RESULT_RECOVERY_20261027',sourceLink:`https://docs.google.com/spreadsheets/d/${controlId}/edit#gid=${g.book(controlId).getSheetByName('Jobs').getSheetId()}&range=A${entry.row}:F${entry.row}`});
   acceptTeacherApprovals([entry],c.teacherApprovalSession_,controlId,'Jobs',c.persist_);
   if(manual&&j.teacherApproval?.approved){j.teacherApprovalOverwrite=true;c.persist_(j,entry.row);}
   if(!c.teacherApprovalSession_.approved.has(j.id))throw Error('CAMPAIGN_AUTHORIZATION_MISSING');
   let calls=0;c.recordMasterGeneration_=()=>{calls++;process.send({event:'CALL_STARTED',itemId:item.id});};
   c.preparePoolRetry_(j,entry.row);
   // A soft boundary stops starting more work; it never kills an in-flight paid call.
   c.step_(j,entry.row,Math.min(deadline,Date.now()+20*60000),{});
   settleSheetTruth({job:j,resolve:()=>c.destination_(j.cls,j.route,j.receipt.student).cell,save:()=>c.persist_(j,entry.row)});
   c.teacherApprovalSession_.flush();
   const actual=c.destination_(j.cls,j.route,j.receipt.student).cell;
   const after=actual.getDisplayValue(),exact=actual.sheet.getSheetId()===resolvedTarget.sheetId&&actual.getA1Notation()===resolvedTarget.cell;
   if(manual&&after===before&&hasTeacherReview(after)){c.teacherApprovalSession_.finish(j);c.teacherApprovalSession_.flush();c.persist_(j,entry.row);}
   result={state:exact&&hasTeacherReview(after)?manual&&after===before?'ALREADY_PRESENT':'STAGED':j.rosterEligibility?.state==='NOT_IN_CURRENT_ROSTER'?'SKIPPED_NOT_IN_CURRENT_ROSTER':j.nextAt>Date.now()?'RETRY':'HELD',verifiedAt:null,before,after,job:j,calls,error:j.error||null,nextAt:Number(j.nextAt)||0};
  }
  result.target=resolvedTarget;
  result.beforeNote=beforeNote;if(result.state==='STAGED')result.deliveryCell=structuredClone(c.destination_(j.cls,j.route,j.receipt.student).cell.cells()[0]?.values?.[0]);
 }catch(e){let retired=false;try{retired=closeRetiredCampaignRecord(c,entry.job,entry.row,e);}catch{}result={state:retired?'SKIPPED_NOT_IN_CURRENT_ROSTER':'HELD',error:retired?null:/^[A-Z0-9_: .-]+$/.test(e.message||'')?e.message:'CAMPAIGN_ITEM_ERROR',job:entry.job};}
 if(c.runnerUniversalMedia_?.downloadProgress)result.job.campaignTransportProgress=c.runnerUniversalMedia_.downloadProgress();
 results.push({itemId:item.id,target:item.target,result});
 process.send({event:'ITEM_SAVED',itemId:item.id,calls:result.calls||0});
 }}finally{ram.close();}
 // Native batch guard has now checked fresh names, headers and teacher edits.
 // Read the real class grid once, never count the staged RAM value as delivery.
 for(const id of new Set(batch.map(x=>x.item.target.spreadsheetId))){const cls=cluster.classes.find(x=>x.spreadsheetId===id);const book=g.book(id),sheet=book.getSheetByName(cls.sheetName);g.preloadSource(id,sheet.meta.properties.gridProperties.columnCount,[sheet.getName()]);}
 for(const id of replaySavedClassBatch(c,g,results)){const cls=cluster.classes.find(x=>x.spreadsheetId===id),sheet=g.book(id).getSheetByName(cls.sheetName);g.preloadSource(id,sheet.meta.properties.gridProperties.columnCount,[sheet.getName()]);}
 for(const out of results){const {result:r,target:t}=out;if(r.state==='STAGED'){
  const actual=resolveFrozenTarget(c,r.job,t).cell,text=actual.getDisplayValue();
  const exact=actual.sheet.getSheetId()===r.target.sheetId&&actual.getA1Notation()===r.target.cell;
  r.state=exact&&text===r.after&&hasTeacherReview(text)?'VERIFIED_WRITTEN':'DELIVERY_CONFLICT';r.verifiedAt=r.state==='VERIFIED_WRITTEN'?new Date().toISOString():null;
 }}
 process.send({event:'RESULT_BATCH',results});
});
process.send({event:'READY'});
