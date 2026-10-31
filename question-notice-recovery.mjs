import {createHash} from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import {COMPONENT_POLICY,assignmentComponents,hasQuestionComponent} from './presentation-component-policy.mjs';
import {decodeSavedDraft} from './saved-draft.mjs';
import {completeScoredResponse} from './scored-assessment-policy.mjs';
import {sourceInMasterScope} from './master-submission-scope.mjs';
import {MASTER_TERMINAL} from './master-policy.mjs';
import {beginSheetBatch} from './kids-sheet-batch.mjs';
import {commitClassValues,acknowledgedFeedback} from './class-values-commit.mjs';
import {preloadRecoveryClass} from './scored-feedback-recovery.mjs';
import {cellEvidence,expectedBindings,guardClassRequests} from './sheet-truth-write-guard.mjs';

// Human-authorized correction of legacy Q&A recording verdicts, not a retry of
// provider blocks or an invitation to regrade an existing valid assessment.
export const QUESTION_REASSESS_AUTH='teacher-question-component-reassessment-20261031';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const identity=j=>[j.cls?.spreadsheetId,j.cls?.className,j.receipt?.student,j.receipt?.code,j.receipt?.sourceTab,j.receipt?.time,j.receipt?.links];
const same=(a,b)=>hash(identity(a))===hash(identity(b));
const body=s=>String(s||'').split('— NHẬN XÉT GV —').at(-1).trim();
const score=/Chất lượng:\s*đạt(?: khoảng)?\s*\d+(?:[.,]\d+)?\s*%/iu;
export const questionNoticeCandidate=j=>!j.questionComponentCorrection&&!!j.rawId&&!!j.snapshotId&&sourceInMasterScope(j.receipt)&&/^(?:COMPLETED_PRESENTATION_RESUBMISSION|CẦN_NỘP_LẠI_DO_ĐỌC_BÀI)$/.test(j.status)&&!score.test(j.autoNotice||'');
export const questionCorrectionId=j=>'runner:question-component:'+hash([QUESTION_REASSESS_AUTH,identity(j)]);
export const questionParentDigest=j=>hash([j.id,j.rawId,j.gradeId||null,j.snapshotId,j.generateRequests||0,j.physicalGenerateRequests||0,!!j.masterGenerationReserved]);
export function legacyQuestionVerdict(job,raw,snapshot,current){
 if(!questionNoticeCandidate(job)||!hasQuestionComponent(snapshot)||snapshot.barem?.componentPolicyVersion===COMPONENT_POLICY||snapshot.barem?.requirements?.componentPolicyVersion===COMPONENT_POLICY)return null;
 if(raw?.promptFeedback?.blockReason||raw?.candidates?.[0]?.finishReason!=='STOP')return null;
 const draft=decodeSavedDraft(raw);if(draft.assessable!==false||completeScoredResponse(raw,draft)||draft.band||draft.rubricBand||draft.roseSections?.length)return null;
 const x=draft.presentationVisualCheck;if(x?.confirmed!==true||x.studentVisible!==false||!['screen_only','filming_screen'].includes(x.capture)||!Number.isInteger(x.sourceFileIndex))return null;
 // Both the declared component AND the model's direct description must identify
 // Q&A. File order alone never proves the student's presentation was acceptable.
 const component=assignmentComponents(snapshot).find(p=>p.role==='question_answers'&&p.partNumber===x.sourceFileIndex+1);
 if(!component||!/câu hỏi|questions?/iu.test(x.basis||'')||/đọc (?:bài viết sẵn|giấy|thoại)|prepared script/iu.test(x.basis||''))return null;
 if(current!==undefined&&(body(current)!==body(job.autoNotice)||score.test(body(current))))return null;
 return {legacyRawArtifact:job.rawId,rawHash:hash(raw),legacySnapshotArtifact:job.snapshotId,snapshotHash:hash(snapshot),sourceFileIndex:x.sourceFileIndex,declaredComponent:component.text,observedQuestionBasis:x.basis};
}
export function questionCorrectionPlan(parent,raw,snapshot,current,{roster,latest,protectedCell=false,all=[]}={}){
 const proof=legacyQuestionVerdict(parent,raw,snapshot,current);
 if(!proof||!roster||!latest||protectedCell||all.some(j=>same(j,parent)&&j.questionComponentCorrection))return null;
 return {id:questionCorrectionId(parent),cls:structuredClone(parent.cls),route:structuredClone(parent.route),receipt:structuredClone(parent.receipt),autoManaged:true,media:[],status:'WAITING_INPUT',attempts:0,nextAt:0,error:'',generateRequests:0,createdAt:new Date().toISOString(),questionComponentCorrection:{authorization:QUESTION_REASSESS_AUTH,policy:COMPONENT_POLICY,maxNewGenerations:1,parentId:parent.id,parentDigest:questionParentDigest(parent),identityHash:hash(identity(parent)),expectedBodyHash:hash(body(current)),proof}};
}
export function authorizedQuestionCorrection(child,entries){
 const a=child.questionComponentCorrection,parent=entries.map(e=>e.job||e).find(j=>j.id===a?.parentId);
 return !!parent&&a.authorization===QUESTION_REASSESS_AUTH&&a.policy===COMPONENT_POLICY&&a.maxNewGenerations===1&&child.id===questionCorrectionId(parent)&&same(child,parent)&&a.identityHash===hash(identity(child))&&a.parentDigest===questionParentDigest(parent);
}
function exactFresh(c,j){const fresh=c.freshReceipt_(j);return !!fresh&&hash(identity({...j,receipt:fresh}))===hash(identity(j));}
function checkCell(c,j){const cell=c.destination_(j.cls,j.route,j.receipt.student).cell;if(cell.getFormula()||cell.getDataValidation()||hash(body(cell.getDisplayValue()))!==j.questionComponentCorrection.expectedBodyHash)throw Error('QUESTION_CORRECTION_TARGET_CHANGED');return cell;}

// Runs under the existing coordinator's native leases, before the worker pool.
// Uses the original processor, media validator, immutable raw storage and writer.
export async function recoverQuestionNotices(c,g,entries,{root,deadline,heartbeat=()=>{},stopping=()=>false,emit=()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='mstrangtrieueducation-droid/kids-grader-runner'||process.env.GRADING_ENABLED!=='true'||process.env.AUTOMATIC_GRADING_AUTHORIZED!=='true')throw Error('TRUSTED_QUESTION_RECOVERY_REQUIRED');
 const report={created:0,delivered:[],deferred:[],providerCalls:0},parents=entries.filter(e=>questionNoticeCandidate(e.job));
 for(const e of parents){if(stopping()||Date.now()>deadline-180000)break;const parent=e.job;
  try{
   heartbeat();const declared=c.masterSnapshot_(parent);if(!hasQuestionComponent(declared))continue;
   const raw=c.readArtifact_(parent.rawId),snapshot=c.readArtifact_(parent.snapshotId);if(!legacyQuestionVerdict(parent,raw,snapshot))continue;
   g.preloadSource(vm.runInContext('KG.source',c),7,[parent.receipt.sourceTab]);
   if(!c.currentRoster_(parent.receipt,{fresh:true})||!exactFresh(c,parent))continue;
   let existing=entries.find(x=>x.job.id===questionCorrectionId(parent));
   if(existing?.job.questionComponentCorrection?.writeReceipt?.updatedCells>0)continue;
   let cell=c.destination_(parent.cls,parent.route,parent.receipt.student).cell;
   preloadRecoveryClass(g,cell.sheet,cell.getRow());cell=c.destination_(parent.cls,parent.route,parent.receipt.student).cell;
   if(!existing){
    // A separate saved valid assessment always wins at zero provider calls.
    const peers=entries.filter(x=>same(x.job,parent));let saved=false;
    for(const p of peers)for(const ref of new Set([p.job.rawId,p.job.gradeId].filter(Boolean))){const r=c.readArtifact_(ref);if(completeScoredResponse(r,decodeSavedDraft(r)))saved=true;}
    if(saved){report.deferred.push({id:parent.id,reason:'SAVED_VALID_ASSESSMENT_REQUIRES_ZERO_API_DELIVERY'});continue;}
    const child=questionCorrectionPlan(parent,raw,snapshot,cell.getDisplayValue(),{roster:true,latest:true,protectedCell:!!cell.getFormula()||!!cell.getDataValidation(),all:entries.map(x=>x.job)});if(!child)continue;
    child.questionComponentCorrection.beforeArtifactId=c.saveArtifact_('question-component-before-'+parent.id,{parent:structuredClone(parent),before:cell.getDisplayValue(),note:cell.getNote(),cell:cell.getA1Notation(),rawId:parent.rawId,snapshotId:parent.snapshotId});
    const row=c.persist_(child);if(!Number.isInteger(row)||row<2)throw Error('QUESTION_CORRECTION_APPEND_UNCONFIRMED');existing={job:child,row};entries.push(existing);report.created++;emit({event:'QUESTION_COMPONENT_REASSESSMENT_AUTHORIZED',id:child.id,parentId:parent.id});
   }
   const j=existing.job;if(!authorizedQuestionCorrection(j,entries))throw Error('QUESTION_CORRECTION_HISTORY_CHANGED');
   // Never reset/retry a second failed child or an uncertain paid outcome.
   if(!j.rawId&&(j.generateRequests||j.physicalGenerateRequests||j.masterGenerationReserved))continue;
   if(MASTER_TERMINAL.has(j.status))continue;
   const originalHas=c.hasFeedback_,originalGenerate=c.generate_,priorSession=c.teacherApprovalSession_,priorJobs=c.teacherApprovalJobs_,priorLoad=c.loadJobs_,priorRecord=c.recordMasterGeneration_,priorScoped=c.scopedQuestionCorrection_,receipts=[];
   const ram=beginSheetBatch(g,{controlId:c.FLEET_CLUSTER.controlId,classes:[j.cls]},path.join(root,'private','question-correction-journal'),{classOnly:true,commitClass:request=>{const proof=commitClassValues(g,request.bookId,request.requests,request.expected,{emit});receipts.push(...proof.cells);return proof;}});
   try{
    c.scopedQuestionCorrection_=true;c.loadJobs_=()=>entries;c.teacherApprovalJobs_=entries;c.teacherApprovalSession_={approved:new Map(),finish:job=>{job.teacherApproval={...job.teacherApproval,approved:false,completedAt:new Date().toISOString()};},flush(){}};
    c.hasFeedback_=text=>hash(body(text))===j.questionComponentCorrection.expectedBodyHash?false:originalHas(text);
    c.generate_=(job,...args)=>{if(job.id!==j.id||!authorizedQuestionCorrection(job,entries)||!exactFresh(c,job)||!c.currentRoster_(job.receipt,{fresh:true}))throw Error('QUESTION_CORRECTION_AUTHORIZATION_CHANGED');
     const live=checkCell(c,job),sheet=live.sheet,master=sheet.book.cache.get(sheet.getName()+'|master'),row=live.getRow()-1,col=live.getColumn()-1;
     const expected={key:[sheet.getSheetId(),row,col].join('|'),sheetId:sheet.getSheetId(),title:sheet.getName(),row,col,before:cellEvidence(master.cells[row]?.values?.[col]),...expectedBindings(sheet,master,row,col)};
     if(guardClassRequests(g,job.cls.spreadsheetId,[],[expected]).conflicts.length)throw Error('QUESTION_CORRECTION_TARGET_CHANGED');
     if(!job.rawId&&(job.generateRequests||job.physicalGenerateRequests||job.masterGenerationReserved))throw Error('QUESTION_CORRECTION_ONE_CALL_ONLY');return originalGenerate(job,...args);};
    c.recordMasterGeneration_=()=>{report.providerCalls++;priorRecord?.();};
    const until=Math.min(deadline-120000,Date.now()+10*60000);
    while(Date.now()<until&&!stopping()){
     heartbeat();checkCell(c,j);if(!exactFresh(c,j))throw Error('QUESTION_CORRECTION_NEWER_SUBMISSION');
     j.teacherApproval={approved:true,automatic:true,authorization:QUESTION_REASSESS_AUTH,acceptedAt:new Date().toISOString()};
     c.step_(j,existing.row,until,{});ram.flush();
     if(j.rawId||MASTER_TERMINAL.has(j.status)||j.generateRequests||j.physicalGenerateRequests)break;
     if(j.nextAt>Date.now()+30000)break;await sleep(Math.max(1000,Number(j.nextAt)-Date.now()));
    }
    if(j.status==='RETURNED'&&j.rawId){
     const target=c.destination_(j.cls,j.route,j.receipt.student).cell,text=target.getDisplayValue(),receipt=acknowledgedFeedback(receipts,{sheetId:target.sheet.getSheetId(),row:target.getRow()-1,col:target.getColumn()-1,text});
     if(!receipt)throw Error('QUESTION_CORRECTION_WRITE_ACK_UNCONFIRMED');
     j.questionComponentCorrection.writeReceipt=receipt;j.questionComponentCorrection.completedAt=receipt.committedAt;c.persist_(j,existing.row);report.delivered.push({id:j.id,parentId:parent.id,cell:target.getA1Notation(),writeReceipt:receipt});
    }else report.deferred.push({id:j.id,status:j.status,reason:j.error||'NATIVE_PREPARATION_PENDING'});
   }finally{c.hasFeedback_=originalHas;c.generate_=originalGenerate;c.teacherApprovalSession_=priorSession;c.teacherApprovalJobs_=priorJobs;c.loadJobs_=priorLoad;c.recordMasterGeneration_=priorRecord;c.scopedQuestionCorrection_=priorScoped;ram.close();}
  }catch(error){report.deferred.push({id:parent.id,reason:error.message});}
 }
 emit({event:'QUESTION_NOTICE_RECOVERY',...report});return report;
}
