import {mayResumeSaved} from './automatic-authorization.mjs';
import {currentBatchSnapshot} from './current-batch-snapshot.mjs';
import {sourceInMasterScope,masterScopeAllowsJob} from './master-submission-scope.mjs';
import {createMasterSweep} from './master-cross-class-sweep.mjs';
import {masterSweepEnabled} from './master-cross-class-sweep.mjs';
import {authorizeEmptyDashboardReprocess} from './dashboard-reprocess.mjs';
export function installMasterScoreProtection(c){const step=c.step_;c.step_=(j,row,...args)=>{if(masterSweepEnabled()){if(!masterScopeAllowsJob(j))return;try{const cell=c.destination_(j.cls,j.route,j.receipt.student).cell;if(c.hasFeedback_(cell.getDisplayValue())||cell.getFormula()||cell.getDataValidation()){j.status='SKIPPED_ALREADY_GRADED';j.error='';c.persist_(j,row);return;}}catch{/* The normal per-job handler records missing names and columns. */}}return step(j,row,...args);};}
const hostedSweeps=new WeakMap();
export function hostedKidsSweep(context,create){if(!hostedSweeps.has(context))hostedSweeps.set(context,create());return hostedSweeps.get(context);}
export function pendingKidsCache(sweep,jobs){return jobs.some(({job})=>mayResumeSaved(job)&&sweep.allowsJob(job));}
export const hasHostedKidsCache=c=>hostedSweeps.get(c)?.hasCachedWork?.();
export function prepareKidsMasterSweep(c,cluster,google,{emit=()=>{},receipts=null}={}){const build=()=>{
 c.recoverProviderRetries_?.();
 const tabs=c.masterSweepTabs_,catalog=c.guideCatalog_(),snapshotFor=currentBatchSnapshot(google,cls=>c.targetSnapshot_(cls)),routes=new Map(),latest=new Map(),jobs=c.loadJobs_(),byReceipt=new Map();
 const receiptKey=s=>[c.norm_(s.className),s.sourceTab,s.row,c.norm_(s.student),c.norm_(s.code),s.links].join('|');let intakeAdded=0;
 authorizeEmptyDashboardReprocess(c,jobs,{emit});
 for(const item of jobs)byReceipt.set(receiptKey(item.job.receipt),item);
 for(const s of receipts||tabs.flatMap(tab=>c.sourceRows_(tab))){const tab=s.sourceTab;
  if(!sourceInMasterScope(s)||!cluster.classes.some(cls=>c.norm_(cls.className)===c.norm_(s.className))||c.retiredTextbookHomework_(s))continue;
  const key=[c.norm_(s.className),tab,c.norm_(s.student),c.norm_(s.code)].join('|'),old=latest.get(key);
  if(!old||Date.parse(s.time)>Date.parse(old.time)||s.time===old.time&&s.row>old.row)latest.set(key,s);
 }
 const clsFor=s=>cluster.classes.find(cls=>c.norm_(cls.className)===c.norm_(s.className));
 const routeFor=s=>{const key=receiptKey(s);if(!routes.has(key))routes.set(key,c.routeForReceipt_(s,catalog));return routes.get(key);};
 const classes=receipts?cluster.classes.filter(cls=>receipts.some(s=>c.norm_(s.className)===c.norm_(cls.className))):cluster.classes;
 const sweep=createMasterSweep({google,lane:'kids',controlId:cluster.controlId,classes,entries:[...latest.values()].map(source=>({source,cls:clsFor(source)})),findJob:s=>byReceipt.get(receiptKey(s)),
  resolve:(s,j)=>{const cls=clsFor(s),snapshot=snapshotFor(cls),route=j?.rawId&&j.contentRouting?j.route:routeFor(s),dst=c.autoTarget_(snapshot,route,s.student);return {...dst,cell:snapshot.sheet.getRange(dst.row,dst.column)};},hasFeedback:text=>c.hasFeedback_(text),readyStatus:'READY',
  enqueue:(s,cls)=>{const route=routeFor(s),job={id:c.autoReceiptId_(cls,route,s),status:'WAITING_INPUT',cls,route,receipt:s,attempts:0,nextAt:0,autoManaged:true,media:[],error:''},row=c.persist_(job);intakeAdded++;const item={job,row};jobs.push(item);byReceipt.set(receiptKey(s),item);return item;},
  save:(j,row)=>c.persist_(j,row),allJobs:jobs,isCurrentStudent:s=>c.currentRoster_?c.currentRoster_(s):true,keepOccupiedJob:j=>!!c.isPendingCriticalCorrection_?.(j),isApproved:j=>{const a=c.teacherApprovalSession_?.approved.get(j.id);return !!a&&!a.automatic;},emit});
 sweep.scan();sweep.intakeAdded=intakeAdded;sweep.hasCachedWork=()=>pendingKidsCache(sweep,jobs);return sweep;};return receipts?build():hostedKidsSweep(c,build);
}
