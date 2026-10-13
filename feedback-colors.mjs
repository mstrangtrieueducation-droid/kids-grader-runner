// Single coordinator, bounded formatting reconciliation. No model/media calls.
export function restoreFeedbackColors(c,cell,grade=null){
 const before=cell.getRichTextValue(),text=before.getText();
 if(!c.hasFeedback_(text)||cell.getFormula()||cell.isPartOfMerge()||cell.getDataValidation())return {status:'PROTECTED'};
 const marker=text.indexOf('— NHẬN XÉT GV —');if(marker<0)return {status:'PROTECTED'};
 let ranges;
 try{ranges=grade?c.feedbackColorRanges_(text,grade):c.legacyFeedbackColorRanges_(text);}catch{return {status:'GRADE_OR_FORMAT_MISMATCH'};}
 // Status colours belong to the tracker; restore only the feedback body.
 ranges=ranges.filter(r=>r.start>=marker+'— NHẬN XÉT GV —'.length);
 if(!ranges.length)return {status:'NO_SEMANTIC_COLORS'};
 const correct=rich=>ranges.every(r=>rich.getRuns().filter(x=>x.getStartIndex()<r.end&&x.getEndIndex()>r.start).every(x=>x.getTextStyle().getForegroundColor()?.toUpperCase()===r.color.toUpperCase()));
 if(correct(before))return {status:'ALREADY_COLORED'};
 const builder=before.copy();for(const r of ranges)for(const run of before.getRuns()){const a=Math.max(r.start,run.getStartIndex()),z=Math.min(r.end,run.getEndIndex());if(a<z)builder.setTextStyle(a,z,run.getTextStyle().copy().setForegroundColor(r.color).build());}
 const backupId=c.saveArtifact_('before-color-recovery',{spreadsheetId:cell.sheet.book.id,sheetName:cell.sheet.getName(),cell:cell.getA1Notation(),text,runs:before.runs});
 cell.sheet.book.invalidateSheet(cell.sheet.getName());
 const fresh=cell.getRichTextValue();if(fresh.getText()!==text||cell.getFormula())return {status:'DESTINATION_CHANGED'};
 if(JSON.stringify(fresh.runs)!==JSON.stringify(before.runs))return {status:'DESTINATION_CHANGED'};
 cell.setRichTextFormats(builder.build());
 const after=cell.getRichTextValue();if(after.getText()!==text||!correct(after))throw Error('COLOR_REPAIR_READBACK_FAILED');
 return {status:'COLORS_RESTORED',cell:cell.getA1Notation(),backupId,assessmentRevalidated:false,apiCalls:0};
}
export function reconcileFeedbackColors(c,{limit=16,deadline=Date.now()+20000}={}){
 const jobs=c.loadJobs_().filter(x=>!x.job.phonicsTemplateVersion&&['RETURNED','SKIPPED_EXISTING_FEEDBACK'].includes(x.job.status));
 if(!jobs.length)return {checked:0,restored:0};
 const key='FLEET_WORK_COLOR_REPAIR_CURSOR',start=Number(c.runnerProperties.get(key)||0)%jobs.length;
 let checked=0,restored=0;const errors={};
 for(let i=0;i<Math.min(limit,jobs.length)&&Date.now()<deadline;i++){
  const job=jobs[(start+i)%jobs.length].job;checked++;
  try{const dst=c.destination_(job.cls,job.route,job.receipt.student),grade=job.gradeId?c.readArtifact_(job.gradeId):null,result=restoreFeedbackColors(c,dst.cell,grade);if(result.status==='COLORS_RESTORED'){restored++;c.audit_(job.id,'COLORS_RESTORED',result.cell+'; formatting only');}}
  catch(e){const name=/^[A-Z_]+$/.test(e.message)?e.message:'COLOR_REPAIR_PROTECTED';errors[name]=(errors[name]||0)+1;}
 }
 c.runnerProperties.set(key,String((start+checked)%jobs.length));return {checked,restored,errors};
}
