// A listening result is not the teacher's video assessment. Classify without
// changing the original text, then merge the listening prefix verbatim.
const markerPattern=/[—–-]*\s*NHẬN XÉT GV\s*[—–-]*/iu;
const clean=value=>String(value??'').normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g,'');
export function emptyTeacherBody(value){const text=clean(value),marker=markerPattern.exec(text);return !!marker&&!text.slice(marker.index+marker[0].length).trim();}
export function hasTeacherReview(value){const text=clean(value),marker=markerPattern.exec(text);return !!marker&&!!text.slice(marker.index+marker[0].length).trim();}
function withoutListeningScores(text){
 return text.replace(/(?:^|\n)[\t ]*🎧[\t ]*ĐIỂM NGHE[^\r\n]*\r?\n(?:[\t ]*(?:Lần[\t ]+\d+[\t ]*:[\t ]*)?Điểm[\t ]+\d+[\t ]*\/[\t ]*\d+[\t ]*\([\t ]*\d+(?:[.,]\d+)?[\t ]*%[\t ]*\)[\t ]*(?:\r?\n|$))+/giu,'\n')
  .replace(/(?:^|\n)[\t ]*(?:🎧[\t ]*)?(?:Điểm nghe\s*:\s*|Điểm\s+)?\d+\s*\/\s*\d+(?:\s*\(\s*\d+(?:[.,]\d+)?\s*%\s*\))?[\t ]*(?=\r?\n|$)/giu,'')
  .replace(/(?:^|\n)[\t ]*(?:Điểm nghe\s*:\s*)?\d+(?:[.,]\d+)?\s*%[\t ]*(?=\r?\n|$)/giu,'');
}
export function receiptOnlyCell(value){
 let text=clean(value).trim();if(!text)return true;if(hasTeacherReview(text))return false;
 text=withoutListeningScores(text);
 if(/\d+(?:[.,]\d+)?\s*%/.test(text))return false; // reconcile unknown legacy teacher marks; never blind regeneration
 text=text.replace(markerPattern,'');
 text=text.replace(/\[?\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\]?/g,'');
 text=text.replace(/(?:Lần đầu|Lần mới|Thời gian|Lần nộp\s*\d+|Lần\s*\d+|Lượt\s*\d+)\s*:?/giu,'');
 text=text.replace(/\d+\s+(?:lượt|lần)/giu,'');
 text=text.replace(/(?:ĐÃ NỘP(?:\s+MUỘN|\s+\d+\s+LẦN)?|ĐÃ GHI NHẬN|NỘP MUỘN|CHƯA GHI NHẬN|CHƯA NỘP|NHẬN XÉT GV)/giu,'');
 return text.replace(/[✅☑✔❌⚠🔁\uFE0F\[\]():·—–\-\s]/gu,'')==='';
}
export function auxiliaryListeningOnly(value){const text=clean(value);return withoutListeningScores(text)!==text&&receiptOnlyCell(text);}
export function teacherFeedbackPrefix(before,fallback=''){
 const text=String(before??''),marker=markerPattern.exec(text);
 if(marker)return text.slice(0,marker.index)||fallback;
 if(auxiliaryListeningOnly(text))return text+(text.endsWith('\n')?'':'\n')+(/ĐÃ NỘP/iu.test(text)?'':fallback);
 return fallback;
}
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
