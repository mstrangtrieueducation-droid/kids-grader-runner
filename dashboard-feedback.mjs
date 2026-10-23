import {hasTeacherReview,emptyTeacherBody,receiptOnlyCell,auxiliaryListeningOnly,teacherFeedbackPrefix} from './teacher-feedback-state.mjs';
export {hasTeacherReview,emptyTeacherBody,receiptOnlyCell,auxiliaryListeningOnly,teacherFeedbackPrefix} from './teacher-feedback-state.mjs';
const markerPattern=/[—–-]*\s*NHẬN XÉT GV\s*[—–-]*/iu;
const clean=value=>String(value??'').normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g,'');
export function installDashboardFeedback(c){
 const original=c.hasFeedback_;c.hasFeedback_=value=>hasTeacherReview(value)?true:emptyTeacherBody(value)&&!/\d+(?:[.,]\d+)?\s*%/.test(String(value))||receiptOnlyCell(value)?false:original(value);
 // The frozen writer already merges marked prefixes. Cover the missing-marker
 // case additively, retaining its scope/source/protection/CAS/backup/readback gates.
 const write=c.writeGrade_;if(typeof write!=='function')return;
 c.writeGrade_=(job,grade)=>{
  const cell=c.destination_(job.cls,job.route,job.receipt.student).cell,before=cell.getDisplayValue();
  if(markerPattern.test(clean(before))||!auxiliaryListeningOnly(before))return write(job,grade);
  c.enforceKidsRecordingGate_(grade);
  if(job.autoManaged)c.require_(c.inAutoScope_(job.receipt)&&c.prop_().getProperty('KIDS21_AUTOMATION')==='ACTIVE','STALE_AUTOMATION_SCOPE');
  c.currentSource_(job);c.require_(!cell.getFormula()&&!cell.getDataValidation(),'DESTINATION_PROTECTED');
  const stamp=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(job.receipt.time)).replace(',','');
  const text=teacherFeedbackPrefix(before,'✅ ĐÃ NỘP '+stamp+'\n\n')+'— NHẬN XÉT GV —\n'+c.feedbackText_(grade);
  c.require_(cell.getDisplayValue()===before,'DESTINATION_CHANGED');
  job.backupId=c.saveArtifact_('before-'+job.id+'-'+Date.now(),{spreadsheetId:job.cls.spreadsheetId,sheet:job.cls.sheetName,cell:cell.getA1Notation(),value:cell.getValue(),note:cell.getNote(),output:text});
  cell.setRichTextValue(c.coloredFeedback_(cell,text,grade));c.SpreadsheetApp.flush();c.require_(cell.getValue()===text,'WRITE_READBACK_FAILED');c.verifyFeedbackColors_(cell,text,grade);
  job.status='RETURNED';job.cell=cell.getA1Notation();job.error='';job.nextAt=0;c.audit_(job.id,'RETURNED',job.cell);
 };
}
