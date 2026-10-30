import {scoredAssessment,SCORED_ASSESSMENT_INSTRUCTION} from './scored-assessment-policy.mjs';
import {reviewColumn} from './review-column-resolution.mjs';
import {requestFeedback} from './provider-generation-policy.mjs';
import {providerFailure,assessmentFailure,holdSystemFailure,wrongAssignmentNotice,studentAssessmentNotice,LEGACY_GENERIC_NOTICE} from './grading-failure-policy.mjs';
import {teacherFeedbackPrefix} from './dashboard-feedback.mjs';
import {mergeTeacherMessage} from './teacher-feedback-state.mjs';
import {MASTER_VERSION,MASTER_MODEL,MASTER_SYSTEM,ASSIGNMENT_TAB,UNCLEAR_AUDIO,masterForm,receiptDate,studentRows,generationConfig,masterSchema,MASTER_TERMINAL,generationSpent} from './master-policy.mjs';
import {savedFeedbackRich} from './saved-feedback.mjs';

import {PRESENTATION_RULE,confirmedScriptReading,readingResubmission,READING_RESUBMISSION_STATUS} from './presentation-resubmission.mjs';
import {decodeSavedDraft} from './saved-draft.mjs';
import {groundedWebReference} from './screen-grounding.mjs';
export {decodeSavedDraft} from './saved-draft.mjs';
export function installMasterKids(c,catalog,{emit=()=>{}}={}){
 const originalGuide=c.guide_,originalStep=c.step_,originalError=c.handleError_,originalRecovery=c.recoverContentRouting_;
 c.ensureMasterAssignmentTab_=()=>{const b=c.SpreadsheetApp.openById(c.FLEET_CLUSTER.controlId);let s=b.getSheetByName(ASSIGNMENT_TAB);if(!s){s=b.insertSheet(ASSIGNMENT_TAB);s.appendRow(['Cập nhật','Lớp','Học sinh','Mã bài','Lý do','Dòng Form','Mã hồ sơ','Trạng thái']);}return s;};
 c.masterSnapshot_=j=>{try{return c.guide_(j.route);}catch{return j.snapshotId?c.readArtifact_(j.snapshotId):{kind:j.route?.kind,form:masterForm(j.route?.kind)};}};
 c.guide_=route=>{const entry=catalog.lookup('kids',route.code),s=groundedWebReference(originalGuide(route),entry);return {...s,guide:entry.requirements.submissionText,form:masterForm(s.kind,entry),barem:{...s.barem,masterVersion:MASTER_VERSION},referenceMedia:[],referenceAssets:[]};};
 c.kidsSystemInstruction_=()=>MASTER_SYSTEM+'\n'+PRESENTATION_RULE+'\n'+SCORED_ASSESSMENT_INSTRUCTION;
 c.kidsEvidencePrompt_=s=>'BAREM TEXT LOCAL:\n'+s.reference+'\nYÊU CẦU BÀI NỘP:\n'+s.guide+'\nTiêu chí đúng thứ tự: '+s.form.join('; ');
 c.prompt_=c.kidsEvidencePrompt_;
 c.kidsEvidenceSchema_=masterSchema;
 c.kidsGenerationConfig_=(model,form)=>generationConfig(MASTER_MODEL,c.kidsEvidenceSchema_(form));
 const latest=c.latest_;if(latest)c.latest_=(rows,...args)=>latest(rows.map(r=>({...r,time:receiptDate(r.time).toISOString()})),...args);
 const fallbackDates=new Map(),sourceRows=c.sourceRows_;let priorDates;
 const stableDate=r=>{const parsed=receiptDate(r.time,new Date(NaN));if(Number.isFinite(parsed.getTime()))return parsed.toISOString();if(process.env.SHEET_TRUTH_SYNC==='true')return '';const key=[r.sourceTab,r.row].join('|');if(!fallbackDates.has(key)){priorDates ||= new Map(c.loadJobs_().map(x=>[[x.job.receipt?.sourceTab,x.job.receipt?.row].join('|'),x.job.receipt?.time]));fallbackDates.set(key,receiptDate(priorDates.get(key)));}return fallbackDates.get(key).toISOString();};
 const receipt=c.receiptAt_;if(receipt)c.receiptAt_=(values,...rest)=>{const schema=rest[1],copy=[...values];if(copy[schema.time] instanceof Date&&!Number.isFinite(copy[schema.time].getTime()))copy[schema.time]='';const r=receipt(copy,...rest);r.time=stableDate(r);return r;};
 if(sourceRows)c.sourceRows_=(...args)=>sourceRows(...args).map(r=>({...r,time:stableDate(r)}));
 const locateColumn=(headers,route)=>{try{return reviewColumn((h,r)=>c.autoColumns_(h,r),headers,route);}catch{throw Error('DESTINATION_COLUMN_MISSING');}};
 c.autoTarget_=(s,route,student)=>{const rows=studentRows(s.values,student);if(rows.length!==1)throw Error('STUDENT_NOT_FOUND_OR_AMBIGUOUS');const column=locateColumn(s.headers,route),row=rows[0];if(s.formulas?.[row-1]?.[column-1])throw Error('DESTINATION_FORMULA');return {row,column,value:s.values[row-1][column-1]};};
 c.destination_=(cls,route,student)=>{const b=c.SpreadsheetApp.openById(cls.spreadsheetId),s=b.getSheetByName(cls.sheetName)||b.getSheetByName('THEO DÕI TOÀN DIỆN')||b.getSheetByName('THEO DÕI');if(!s)throw Error('DESTINATION_COLUMN_MISSING');const rows=studentRows(s.getDataRange().getDisplayValues(),student);if(rows.length!==1)throw Error('STUDENT_NOT_FOUND_OR_AMBIGUOUS');const column=locateColumn(c.expandedHeaders_(s),route),row=rows[0],cell=s.getRange(row,column);return {sheet:s,cell,row,column};};
 const assignment=c.currentAssignment_;c.currentAssignment_=(...args)=>{try{return assignment(...args);}catch(e){if(e.message==='ASSIGNMENT_DATE_MISSING')return true;throw e;}};
 const oldHas=c.hasFeedback_;c.hasFeedback_=text=>{const s=String(text);return !/\d+\s*%/.test(s)&&(s.trim().endsWith(UNCLEAR_AUDIO)||s.startsWith('❌ CẦN NỘP LẠI ')&&s.includes('Chất lượng: Chưa đạt (Yêu cầu quay lại).'))?false:oldHas(text);};
 c.kidsCostPreflight_=j=>{
  const cell=c.destination_(j.cls,j.route,j.receipt.student).cell;
  if(c.hasFeedback_(cell.getDisplayValue())||cell.getFormula()||cell.getDataValidation())throw Error('PREFLIGHT_EXISTING_FEEDBACK');
  const ids=c.driveIds_(j.receipt.links);if(!ids.length||ids.length>8)throw Error('MEDIA_INVENTORY_INVALID');
  const files=ids.map(id=>c.fileMeta_(id));j.costPreflight={policy:MASTER_VERSION,checkedAt:new Date().toISOString(),files};return files;
 };
 function rejectReading(j,row,g){const cell=c.destination_(j.cls,j.route,j.receipt.student).cell;if(c.hasFeedback_(cell.getDisplayValue())||cell.getFormula()||cell.getDataValidation()){j.status='SKIPPED_ALREADY_GRADED';j.error='';j.nextAt=0;c.persist_(j,row);return;}const out=j.pendingMasterReading||readingResubmission(g,j);out.text=mergeTeacherMessage(cell.getDisplayValue(),out.text);j.pendingMasterReading=out;c.persist_(j,row);cell.setRichTextValue(savedFeedbackRich(c,cell,out.text,out.sections));j.autoNotice=out.text;j.cell=cell.getA1Notation();j.status=READING_RESUBMISSION_STATUS;j.manualReviewRequired=false;j.error='';j.nextAt=0;delete j.pendingMasterReading;c.persist_(j,row);}
 function pending(j,row,text,terminal='COMPLETED_NEEDS_RESUBMISSION'){
  const dst=c.destination_(j.cls,j.route,j.receipt.student),cell=dst.cell;if(c.hasFeedback_(cell.getDisplayValue())||cell.getFormula()||cell.getDataValidation()){j.status='SKIPPED_ALREADY_GRADED';j.error='';c.persist_(j,row);return;}
  j.pendingMasterFeedback={text,terminal};c.persist_(j,row);
  const before=cell.getDisplayValue(),marker='— NHẬN XÉT GV —';
  const stamp=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(receiptDate(j.receipt.time)).replace(',','');
  const out=teacherFeedbackPrefix(before,'✅ ĐÃ NỘP '+stamp+'\n')+marker+'\n'+text;
  cell.setRichTextValue(c.coloredFeedback_(cell,out,null));j.autoNotice=out;j.cell=cell.getA1Notation();j.status=terminal;j.error='';j.nextAt=0;delete j.pendingMasterFeedback;c.persist_(j,row);
 }
 function exception(j,row,e){
  if(e.message==='CAMPAIGN_COORDINATOR_STOPPED'&&!j.rawId&&!j.gradeId&&!j.generateRequests&&!j.physicalGenerateRequests&&!j.masterGenerationReserved){j.status='READY';j.error='';j.nextAt=0;j.cooperativePreparationPause={at:new Date().toISOString(),providerCalls:0};c.persist_(j,row);return;}
  const provider=providerFailure(j,e);if(provider){if(provider.httpCode===402)process.env.MODEL_GRADING_AVAILABLE='false';holdSystemFailure(c,j,row,e,provider);return;}

  if(/^(?:STUDENT_|DESTINATION_(?:COLUMN|TAB|AMBIGUOUS))/.test(e.message)){
   const reason=/^STUDENT_/.test(e.message)?'Không tìm thấy tên khớp duy nhất sau khi dò cả họ tên tiếng Việt và tên tiếng Anh.':'Sheet thiếu hoặc chưa xác định được cột đúng của bài '+j.receipt.code+'.';
   const s=c.ensureMasterAssignmentTab_();if(!j.masterAssignmentLogged){s.appendRow([new Date().toISOString(),j.cls.className,j.receipt.student,j.receipt.code,reason,j.receipt.row,j.id,'CẦN CÔ GÁN']);j.masterAssignmentLogged=true;}
   j.status='NEEDS_ASSIGNMENT';j.error=reason;j.nextAt=0;c.persist_(j,row);emit({event:'MASTER_ASSIGNMENT_REQUIRED',id:j.id,reason});return;
  }
  if((/^GOOGLE_HTTP_|NETWORK|DRIVE_RANGE|MEDIA_|RUNNER_DISK/.test(e.message))&&(!j.masterGenerationReserved||j.pendingMasterFeedback||j.pendingMasterReading)){j.status='RETRY';j.error=e.message;j.nextAt=Date.now()+60000;c.persist_(j,row);return;}
  holdSystemFailure(c,j,row,e);
 }
 function routeSaved(j,row,g){
  if(scoredAssessment(g))return true;
  const check=g.submissionCheck;if(check?.status!=='wrong_assignment'&&check?.category!=='wrong_assignment')return true;
  const notice=wrongAssignmentNotice(g,j);if(notice)pending(j,row,notice);else holdSystemFailure(c,j,row,Error('ASSIGNMENT_MISMATCH_WITHOUT_EXPLICIT_DISTANT_CODE'));return false;
 }
 c.generate_=(j,parts,snapshot)=>{
  if(j.rawId)throw Error('FULL_FEEDBACK_READY');
  if(generationSpent(j))throw Error('SINGLE_PASS_ALREADY_REQUESTED');
  if(!snapshot.barem||snapshot.barem.masterVersion!==MASTER_VERSION)throw Error('BAREM_MASTER_REQUIRED');
  catalog.lookup('kids',j.route.code,{expectedHash:snapshot.barem.sha256});
  if((j.media||[]).some(m=>m.isReference))throw Error('BAREM_REFERENCE_MEDIA_FORBIDDEN');
  const mediaParts=c.masterGenerationParts_?c.masterGenerationParts_(j,parts):parts;
  const apiKey=c.keyFor_(j),payload=JSON.stringify({systemInstruction:{parts:[{text:c.kidsSystemInstruction_()}]},contents:[{role:'user',parts:[{text:c.prompt_(snapshot)}].concat(mediaParts)}],generationConfig:c.kidsGenerationConfig_(MASTER_MODEL,snapshot.form)});
  c.throttle_?.();j.status='GENERATING';j.masterGenerationStartedAt=new Date().toISOString();j.masterGenerationReserved=true;delete j.retryGenerationAuthorized;j.generationModel=MASTER_MODEL;j.model=MASTER_MODEL;j.generateRequests=1;j.kidsReviewVersion=MASTER_VERSION;
  c.persist_(j,c.masterActiveRow);c.flushMasterCheckpoint_?.(c.masterActiveRow);
  c.recordMasterGeneration_?.(j);const started=Date.now();
  try{
   const response=requestFeedback({job:j,options:{body:payload},send:({body})=>c.api_('/v1beta/models/'+MASTER_MODEL+':generateContent',apiKey,{method:'post',contentType:'application/json',payload:body}),persist:()=>{c.persist_(j,c.masterActiveRow);c.flushMasterCheckpoint_?.(c.masterActiveRow);},saveArtifact:raw=>c.saveArtifact_('recitation-rejected-'+j.id,raw),onRetry:()=>c.recordMasterGeneration_?.(j)});
   const raw=JSON.parse(response.getContentText());j.usageRecordedAt=new Date().toISOString();j.apiUsage=c.kidsUsageReceipt_?.(raw,j.usageRecordedAt);j.rawId=c.saveArtifact_('master-raw-'+j.id,raw);
   // All assessment/formatting uses this paid response, even if ancillary fields are absent.
   throw Error('FULL_FEEDBACK_READY');
  }catch(e){if(e.message!=='FULL_FEEDBACK_READY'){j.technicalFailures ||= [];j.technicalFailures.push({at:new Date().toISOString(),phase:'generation',code:e.message,httpCode:e.httpCode||null,details:e.apiDetails||null});}throw e;}finally{j.lastGenerateMs=Date.now()-started;c.persist_(j,c.masterActiveRow);c.flushMasterCheckpoint_?.(c.masterActiveRow);if(j.apiUsage)c.recordMasterUsage_?.(j);}
 };
 c.step_=(j,row,deadline,options)=>{c.masterActiveRow=row;try{
  if(MASTER_TERMINAL.has(j.status))return;
  if(!j.rawId&&j.gradeId){j.rawId=j.gradeId;c.persist_(j,row);}
  if(!j.rawId&&process.env.MODEL_GRADING_AVAILABLE==='false'){const cell=c.destination_(j.cls,j.route,j.receipt.student).cell;j.status=c.hasFeedback_(cell.getDisplayValue())||cell.getFormula()||cell.getDataValidation()?'SKIPPED_ALREADY_GRADED':'WAITING_MODEL_ACCESS';j.error=j.status==='WAITING_MODEL_ACCESS'?'MODEL_NOT_AVAILABLE_FOR_THIS_PROJECT':'';j.nextAt=0;c.persist_(j,row);return;}
  j.receipt.time=receiptDate(j.receipt.time).toISOString();
  if(j.pendingMasterReading){rejectReading(j,row,{});return;}
  if(j.pendingMasterFeedback){if(j.pendingMasterFeedback.text===LEGACY_GENERIC_NOTICE){holdSystemFailure(c,j,row,Error('LEGACY_TECHNICAL_NOTICE_NOT_AN_ASSESSMENT'));return;}pending(j,row,j.pendingMasterFeedback.text,j.pendingMasterFeedback.terminal);return;}
  if(!j.rawId&&generationSpent(j)){holdSystemFailure(c,j,row,Error('GENERATION_OUTCOME_UNCONFIRMED'));return;}
  if(j.rawId){const raw=c.readArtifact_(j.rawId),d=decodeSavedDraft(raw),failure=assessmentFailure(raw,d,j);if(failure){holdSystemFailure(c,j,row,Error(failure.code),failure);return;}if(!routeSaved(j,row,d))return;if(confirmedScriptReading(d,j,c.masterSnapshot_(j))){rejectReading(j,row,d);return;}if(d.assessable===false&&!d.roseSections?.length&&!Object.values(d.sections||{}).some(s=>s.text)){const notice=studentAssessmentNotice(d,j);if(notice)pending(j,row,notice,'COMPLETED_UNASSESSABLE');else holdSystemFailure(c,j,row,Error('ASSESSMENT_WITHOUT_REASON'));return;}
  }
  if(!j.rawId&&j.snapshotId){const s=c.readArtifact_(j.snapshotId),fresh=c.guide_(j.route),scopeChanged=fresh.webPracticeScope&&(s.webPracticeScope?.version!==fresh.webPracticeScope.version||s.webPracticeScope?.totalItems!==fresh.webPracticeScope.totalItems);if(s.barem?.masterVersion!==MASTER_VERSION||scopeChanged){j.previousSnapshotId=j.snapshotId;j.snapshotId=c.saveArtifact_('master-local-input-'+j.id,fresh);j.sourceHash=c.hash_(fresh);j.media=(j.media||[]).filter(m=>!m.isReference);c.persist_(j,row);}}
  originalStep(j,row,deadline,options);
 }catch(e){c.handleError_(j,row,e);}finally{delete c.masterActiveRow;}};
 c.handleError_=(j,row,e)=>{try{
  if(/^SKIPPED_/.test(e.message)||e.message==='STALE_RECEIPT'){j.status=e.message==='STALE_RECEIPT'?'SKIPPED_OLD_SUBMISSION':e.message;j.error='';j.nextAt=0;c.persist_(j,row);return;}
  if(j.rawId){const raw=c.readArtifact_(j.rawId),d=decodeSavedDraft(raw),failure=assessmentFailure(raw,d,j);if(failure){holdSystemFailure(c,j,row,Error(failure.code),failure);return;}if(!routeSaved(j,row,d))return;if(confirmedScriptReading(d,j,c.masterSnapshot_(j))){rejectReading(j,row,d);return;}if(d.assessable===false&&!d.roseSections?.length&&!Object.values(d.sections||{}).some(s=>s.text)){const notice=studentAssessmentNotice(d,j);if(notice)pending(j,row,notice,'COMPLETED_UNASSESSABLE');else holdSystemFailure(c,j,row,Error('ASSESSMENT_WITHOUT_REASON'));return;}}
  if(j.rawId)return originalError(j,row,Error('FULL_FEEDBACK_READY'));
  if(e.httpCode===404&&/no longer available|not found|not supported/i.test(e.apiDetails?.message||'')){j.status='WAITING_MODEL_ACCESS';j.error='MODEL_NOT_AVAILABLE_FOR_THIS_PROJECT';j.nextAt=0;c.persist_(j,row);return;}
  if(/PREFLIGHT_EXISTING|DESTINATION_FORMULA|DESTINATION_VALIDATION/.test(e.message)){j.status='SKIPPED_ALREADY_GRADED';j.error='';j.nextAt=0;c.persist_(j,row);return;}
  return exception(j,row,e);
 }catch(delivery){j.status='RETRY';j.error=delivery.message;j.nextAt=Date.now()+60000;c.persist_(j,row);}};
 c.recoverContentRouting_=()=>{for(const {job:j,row}of c.loadJobs_())if(['NEEDS_REVIEW','BLOCKED','STALE','AUTOMATION_FAILED','GENERATING','NEEDS_ASSIGNMENT','NEEDS_RESUBMISSION'].includes(j.status)){
  try{if(j.rawId){j.status='READY';j.nextAt=0;c.persist_(j,row);}else if(/^STUDENT_|^DESTINATION_/.test(j.error||'')||j.status==='NEEDS_ASSIGNMENT'){const dst=c.destination_(j.cls,j.route,j.receipt.student);j.status=c.hasFeedback_(dst.cell.getDisplayValue())?'SKIPPED_ALREADY_GRADED':'READY';j.error='';j.nextAt=0;c.persist_(j,row);}else if(j.generateRequests||j.masterGenerationReserved||/UNCERTAIN_GENERATION/.test(j.error||'')){holdSystemFailure(c,j,row,Error('GENERATION_OUTCOME_UNCONFIRMED'));}else{j.status='READY';j.error='';j.nextAt=0;c.persist_(j,row);}}catch(e){exception(j,row,e);}
  }return originalRecovery?.()||{repaired:0,reopened:0};};
}
