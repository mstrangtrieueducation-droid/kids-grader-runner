import {generationSpent,UNCLEAR_AUDIO,receiptDate} from './master-policy.mjs';
export function systemSourceFailure(job,error){
 if(job.rawId||generationSpent(job))return '';
 if(/^UNSUPPORTED_LINK/.test(error.message))return 'SYSTEM_AUDIO_INPUT_UNSUPPORTED_EXTERNAL_SOURCE';
 return /^(INVALID_DRIVE_LINK|MEDIA_INVENTORY_INVALID|PREFLIGHT_FILE_MISSING_OR_INVALID)/.test(error.message)?'SYSTEM_AUDIO_INPUT_SOURCE_UNAVAILABLE':'';
}
export function repairUnsupportedSourceNotices(c){
 let repaired=0,protectedCells=0;
 for(const {job:j,row}of c.loadJobs_()){
  if(j.status!=='COMPLETED_UNASSESSABLE'||j.rawId||generationSpent(j)||j.media?.length||!j.autoNotice?.includes(UNCLEAR_AUDIO)||!/https?:\/\/(?:www\.)?(?:youtu\.be|youtube\.com)\//i.test(j.receipt?.links||''))continue;
  try{const dst=c.destination_(j.cls,j.route,j.receipt.student),cell=dst.cell,text=cell.getDisplayValue();if(text!==j.autoNotice||cell.getFormula()||cell.getDataValidation()){protectedCells++;continue;}
   const prefix=text.includes('— NHẬN XÉT GV —')?text.slice(0,text.indexOf('— NHẬN XÉT GV —')).trim():'';
   const stamp=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(receiptDate(j.receipt.time)).replace(',','');
   const receipt=prefix.includes('ĐÃ NỘP')?prefix:'✅ ĐÃ NỘP '+stamp;
   cell.setRichTextValue(c.SpreadsheetApp.newRichTextValue().setText(receipt).build());
   j.unsupportedSourceCorrection={at:new Date().toISOString(),removedFalseNotice:text,restoredReceipt:receipt,providerCalls:0};j.status='SYSTEM_AUDIO_ERROR';j.error='SYSTEM_AUDIO_INPUT_UNSUPPORTED_EXTERNAL_SOURCE';j.autoNotice='';j.nextAt=0;c.persist_(j,row);repaired++;
  }catch{ /* Keep other jobs moving; a destination failure retains its original record. */ }
 }
 return {repaired,protectedCells,providerCalls:0};
}
