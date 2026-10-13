function loadJobs_() {
  const s = control_().getSheetByName('Jobs');
  if (s.getLastRow()<2) return [];
  return s.getRange(2,1,s.getLastRow()-1,6).getValues().map((r,i)=>({row:i+2,job:JSON.parse(r[5])}));
}
function persist_(job, row) {
  const s = control_().getSheetByName('Jobs'), json = JSON.stringify(job);
  require_(json.length<45000, 'JOB_STATE_TOO_LARGE');
  const values = [job.id,job.status,new Date(),job.nextAt?new Date(job.nextAt):'',job.attempts||0,json];
  if (row) s.getRange(row,1,1,6).setValues([values]); else { s.appendRow(values); row=s.getLastRow(); }
  SpreadsheetApp.flush(); return row;
}
function currentSource_(job) {
  require_(hash_(freshReceipt_(job))===hash_(job.receipt), 'STALE_RECEIPT');
  require_(hash_(job.media.map(m=>fileMeta_(m.id,m.isReference)))===hash_(job.media.map(m=>({id:m.id,mime:m.mime,size:m.size,modified:m.modified}))), 'STALE_MEDIA');
  require_(hash_(guide_(job.route))===job.sourceHash, 'STALE_GUIDELINE');
}
function writeGrade_(job, grade) {
  enforceKidsRecordingGate_(grade);
  if(job.autoManaged)require_(inAutoScope_(job.receipt) && prop_().getProperty('KIDS21_AUTOMATION')==='ACTIVE','STALE_AUTOMATION_SCOPE');
  currentSource_(job);
  const dst=destination_(job.cls,job.route,job.receipt.student), cell=dst.cell;
  const before=cell.getDisplayValue();
  if (hasFeedback_(before)) { job.status='SKIPPED_EXISTING_FEEDBACK'; return; }
  require_(!cell.getFormula()&&!cell.getDataValidation(), 'DESTINATION_PROTECTED');
  // Keep the tracker-owned late/attempt count and timestamps; only fill feedback.
  const markerAt=before.indexOf(KG.marker),prefix=markerAt>=0?before.slice(0,markerAt):'✅ ĐÃ NỘP\n'+Utilities.formatDate(new Date(job.receipt.time),KG.timezone,'dd/MM/yyyy HH:mm')+'\n\n';
  const text=prefix+KG.marker+'\n'+feedbackText_(grade);
  // Recheck immediately before writing; external Apps Script writers should use the same marker-preservation rule.
  require_(cell.getDisplayValue()===before, 'DESTINATION_CHANGED');
  job.backupId=saveArtifact_('before-'+job.id+'-'+Date.now(),{spreadsheetId:job.cls.spreadsheetId,sheet:job.cls.sheetName,cell:cell.getA1Notation(),value:cell.getValue(),note:cell.getNote(),output:text});
  cell.setRichTextValue(coloredFeedback_(cell,text,grade)); SpreadsheetApp.flush();
  require_(cell.getValue()===text, 'WRITE_READBACK_FAILED');
  verifyFeedbackColors_(cell,text,grade);
  job.status='RETURNED'; job.cell=cell.getA1Notation();job.error='';job.nextAt=0;
  audit_(job.id,'RETURNED',job.cell);
}
function writeRecordingNotice_(job,issue) {
  if(issue.status!=='NEEDS_RESUBMISSION')return;
  currentSource_(job);
  const cell=destination_(job.cls,job.route,job.receipt.student).cell,before=cell.getDisplayValue();
  if(hasFeedback_(before))return;
  require_(!cell.getFormula()&&!cell.getDataValidation(),'DESTINATION_PROTECTED');
  const markerAt=before.indexOf(KG.marker),prefix=markerAt>=0?before.slice(0,markerAt):'✅ ĐÃ NỘP\n'+Utilities.formatDate(new Date(job.receipt.time),KG.timezone,'dd/MM/yyyy HH:mm')+'\n\n';
  const reading=(issue.checks||[]).some(x=>x.textUseStatus==='visible_reading');
  const guidance=issue.contract?.parentGuidance||'Con thực hiện lại đúng phần hướng dẫn quay và nộp bài trên web.';
  const message=kidsResubmissionMessage_(issue,reading,guidance);
  const text=prefix+KG.marker+'\n'+message,start=text.indexOf(message);
  job.noticeBackupId=saveArtifact_('before-recording-notice-'+job.id,{value:before,note:cell.getNote(),cell:cell.getA1Notation()});
  const rich=coloredFeedback_(cell,text,null).copy().setTextStyle(start,text.length,SpreadsheetApp.newTextStyle().setForegroundColor('#C2185B').build()).build();
  require_(cell.getDisplayValue()===before,'DESTINATION_CHANGED');cell.setRichTextValue(rich);SpreadsheetApp.flush();
  require_(cell.getDisplayValue()===text,'WRITE_READBACK_FAILED');job.cell=cell.getA1Notation();job.recordingNoticeWritten=true;
}
function kidsResubmissionMessage_(issue,reading,guidance){
  const reason=issue.noticeReason?String(issue.noticeReason).replace(/\s+/g,' ').trim().slice(0,400):(reading?'Khi quay bài này, con không nhìn văn bản hoặc phụ đề để đọc. '+guidance:'Con đặt máy cố định, quay chính diện để thấy rõ phần trình bày theo hướng dẫn. '+guidance);
  return '⚠ CẦN NỘP LẠI\n'+reason+' Cô đợi bài của con.';
}
function kidsManualAssignmentKey_(receipt){
  let code=norm_(receipt.code);try{const a=assignmentIdentity_(receipt.code);code=[a.family,a.number,norm_(a.detail||'')].join('|');}catch{}
  return [norm_(receipt.className),norm_(receipt.student),code].join('|');
}
function kidsManualAssignmentHold_(job,entries){
  return entries.find(x=>x.job.manualReviewRequired===true&&kidsManualAssignmentKey_(x.job.receipt)===kidsManualAssignmentKey_(job.receipt));
}
function handleKidsRecordingIssue_(job,row,err){
  const issue=err.recordingIssue;job.status=issue.status==='NEEDS_RESUBMISSION'?'NEEDS_RESUBMISSION':'NEEDS_REVIEW';job.error=err.message;job.recordingIssue=issue;job.manualReviewRequired=false;job.manualAssignmentGrading=false;job.nextAt=0;persist_(job,row);
  try{writeRecordingNotice_(job,issue);delete job.noticeError;}catch(e){job.noticeError=String(e.message||'NOTICE_WRITE_FAILED').slice(0,160);}
  persist_(job,row);audit_(job.id,job.status,issue.reason||job.error);
}
function step_(job, row, deadline, options) {
  const save=()=>persist_(job,row);
  const held=kidsManualAssignmentHold_(job,loadJobs_());
  if(held){job.manualReviewRequired=true;job.manualAssignmentGrading=true;job.manualReviewFrom=held.job.id;job.status=job.recordingIssue?.status==='NEEDS_RESUBMISSION'?'NEEDS_RESUBMISSION':'NEEDS_REVIEW';job.error=job.status==='NEEDS_RESUBMISSION'?(job.error||'GRADE_SUBMISSION_RESUBMIT'):'GRADE_MANUAL_RESUBMISSION';job.nextAt=0;save();return;}
  if(retiredTextbookHomework_(job.receipt)){job.status='SKIPPED_NOT_ASSIGNED';job.error='DISCOVER_3_4_HOMEWORK_RETIRED';job.nextAt=0;save();return;}
  if(job.autoManaged && !job.snapshotId) {initializeAutoJob_(job,row);if(['SKIPPED_EXISTING_FEEDBACK','SKIPPED_OLD_LESSON'].includes(job.status))return;}
  const dest=destination_(job.cls,job.route,job.receipt.student);
  if(hasFeedback_(dest.cell.getDisplayValue())) { job.status='SKIPPED_EXISTING_FEEDBACK'; cleanupMedia_(job); save(); return; }
  currentSource_(job);
  if(job.gradeId) {
    const grade=readArtifact_(job.gradeId);
    validateGrade_(grade,readArtifact_(job.snapshotId).form,job.studentFileCount||job.media.length);
    if(grade.assessable) writeGrade_(job,grade); else job.status='NEEDS_REVIEW';
    cleanupMedia_(job); save(); return;
  }
  kidsCostPreflight_(job);routeKidsCostModel_(job);save();
  if(options?.allowUploads===false && fleetNeedsUpload_(job)){job.status='WAITING_MEDIA';job.nextAt=0;save();return;}
  job.status='PROCESSING'; save();
  const parts=[];
  for(const media of job.media) {
    const part=mediaPart_(job,media,save,deadline);
    if(!part) { job.status='WAITING_MEDIA';job.nextAt=Date.now()+60000;save();return; }
    parts.push(part);
  }
  if(Date.now()>deadline-generationReserve_()) { job.status='READY';job.nextAt=0;save();return; }
  currentSource_(job);kidsCostPreflight_(job);
  // Another writer may have returned feedback while media was being prepared.
  if(hasFeedback_(destination_(job.cls,job.route,job.receipt.student).cell.getDisplayValue())){job.status='SKIPPED_EXISTING_FEEDBACK';save();return;}
  if(Date.now()>deadline-generationReserve_()) {job.status='READY';job.nextAt=0;save();return;}
  job.status='GENERATING';save();
  const snapshot=readArtifact_(job.snapshotId);parts.push(...referenceAssetParts_(snapshot));
  const grade=generate_(job,parts,snapshot);
  job.gradeId=saveArtifact_('grade-'+job.id+'-'+Date.now(),grade);job.status='GRADED';save();
  if(grade.assessable) writeGrade_(job,grade);
  else { job.status='NEEDS_REVIEW'; audit_(job.id,'NEEDS_REVIEW',grade.reason); }
  cleanupMedia_(job);save();
}
function handleError_(job, row, err) {
  if(err.recordingIssue){handleKidsRecordingIssue_(job,row,err);return;}
  job.attempts=(job.attempts||0)+1;
  // Only known technical errors are retried. Invalid grades never reach the learner's cell.
  const code=String(err.message||'ERROR').slice(0,160);
  job.error=code;if(err.apiDetails)job.apiError=err.apiDetails;
  if(code==='PREFLIGHT_EXISTING_FEEDBACK')job.status='SKIPPED_EXISTING_FEEDBACK';
  else if(/^(KIDS_|PREFLIGHT_|STUDENT_|DESTINATION_|MEDIA_|FILE_|UNSUPPORTED_MEDIA|INVALID_DRIVE_LINK|UNSUPPORTED_LINK|TYPE_|CODE_|GUIDE_|REFERENCE_)/.test(code)){job.status='NEEDS_REVIEW';job.nextAt=0;}
  else if(code==='NETWORK_RETRY'&&job.status==='GENERATING'&&!job.rawId){job.status='NEEDS_REVIEW';job.error='UNCERTAIN_GENERATION';job.nextAt=0;}
  else if (/STALE_/.test(code)) job.status='STALE';
  else if(err.httpCode===429) {
    // Quota exhaustion must resume unattended instead of permanently blocking the backlog.
    job.status='RETRY';job.nextAt=Date.now()+Math.max(err.retryAfter||60000,Math.min(3600000,Math.pow(2,Math.min(job.attempts,6))*60000));
    setModelCooldown_(job.generationModel||job.model,job.nextAt,job.keyHash);
  }
  else if (/HTTP_(500|502|503|504)/.test(code)){job.status='NEEDS_REVIEW';job.nextAt=0;}
  else if (/HTTP_(429)|NETWORK_RETRY/.test(code) && job.attempts<4) {
    job.status='RETRY';job.nextAt=Date.now()+Math.max(err.retryAfter||60000,Math.pow(2,job.attempts)*30000);
    if(err.httpCode===429) setModelCooldown_(job.generationModel||job.model,job.nextAt,job.keyHash);
  } else if (err.httpCode===401 || err.httpCode===403) {
    // Rotate only before media has been uploaded, never send another project's file URI with a new key.
    const keys=keys_(), old=keys.findIndex(k=>hash_(k)===job.keyHash);
    if(!job.media.some(m=>m.upload) && job.attempts<keys.length) {
      job.keyHash=hash_(keys[(old+1)%keys.length]);job.status='RETRY';job.nextAt=Date.now()+60000;
    } else job.status='BLOCKED';
  } else job.status='BLOCKED';
  persist_(job,row);audit_(job.id,job.status,code);
}
function generationReserve_() {
  const observed=JSON.parse(prop_().getProperty('KIDS_GENERATE_MS_BY_MODEL')||'{}');
  const models=typeof fleetModelPool_==='function'?fleetModelPool_():[model_()];
  const max=Math.max(0,...models.map(m=>Number(observed[m]||0)));
  return Math.max(KG.generationReserveMs,Math.min(180000,max+20000));
}
