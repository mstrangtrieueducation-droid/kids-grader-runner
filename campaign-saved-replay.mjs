// Reconcile a staged, validated saved result after a class batch readback failed.
// Native source/roster/target resolution and the ordinary fresh write guard all
// run again. Never substitute a different cell, overwrite feedback, or call AI.
import {createHash} from 'node:crypto';
import {resolveFrozenTarget} from './frozen-backlog-policy.mjs';
import {receiptOnlyCell,hasTeacherReview,teacherFeedbackPrefix} from './teacher-feedback-state.mjs';
import {cellEvidence,expectedBindings,guardClassRequests} from './sheet-truth-write-guard.mjs';
export function replaySavedClassBatch(c,g,results){
 const groups=new Map(),written=new Set();
 for(const out of results){const r=out.result,j=r.job;if(r.state!=='STAGED'||!j.rawId&&!j.gradeId)continue;
  try{
   const {cell,target}=resolveFrozenTarget(c,j,out.target),text=cell.getDisplayValue();
   if(text===r.after||!receiptOnlyCell(r.before)||!receiptOnlyCell(text)||hasTeacherReview(text)||cell.getFormula()||cell.getDataValidation()||cell.getNote()!==(r.beforeNote||'')||target.sheetId!==r.target.sheetId||target.cell!==r.target.cell)continue;
   if(c.currentRoster_&&!c.currentRoster_(j.receipt,{fresh:true}))continue;
   c.currentSource_(j);
   const sheet=cell.sheet,master=sheet.book.cache.get(sheet.getName()+'|master'),row=cell.getRow()-1,col=cell.getColumn()-1;
   if(!master?.cells)continue;
   const expected={key:[target.sheetId,row,col].join('|'),sheetId:target.sheetId,title:sheet.getName(),row,col,before:structuredClone(cellEvidence(master.cells[row]?.values?.[col])),...expectedBindings(sheet,master,row,col)};
   const marker='— NHẬN XÉT GV —',bodyStart=r.after.indexOf(marker);if(bodyStart<0||!hasTeacherReview(r.after))continue;
   const prefix=teacherFeedbackPrefix(text,r.after.slice(0,bodyStart)),merged=prefix+r.after.slice(bodyStart),shift=prefix.length-bodyStart;
   const source=structuredClone(r.deliveryCell||{}),runs=source.textFormatRuns||[];
   let textFormatRuns;
   if(source.userEnteredValue?.stringValue===r.after&&runs.length){const active=runs.filter(x=>(x.startIndex||0)<=bodyStart).at(-1)?.format||{};textFormatRuns=[{startIndex:0,format:{foregroundColorStyle:{rgbColor:{red:13/255,green:71/255,blue:161/255}}}},{startIndex:prefix.length,format:active},...runs.filter(x=>x.startIndex>bodyStart).map(x=>({...x,startIndex:x.startIndex+shift}))].filter((x,i,a)=>i===a.findIndex(y=>y.startIndex===x.startIndex));}
   else{const rich=c.coloredFeedback_(cell,merged,null);textFormatRuns=rich.runs.map(x=>{const color=x.style.color||'#0D47A1',format={...(x.style.format||{}),bold:!!x.style.bold,foregroundColorStyle:{rgbColor:{red:parseInt(color.slice(1,3),16)/255,green:parseInt(color.slice(3,5),16)/255,blue:parseInt(color.slice(5,7),16)/255}}};delete format.foregroundColor;return {startIndex:x.start,format};});}
   const value={userEnteredValue:{stringValue:merged},textFormatRuns,userEnteredFormat:{wrapStrategy:'WRAP',horizontalAlignment:'LEFT',verticalAlignment:'TOP'}};
   const request={updateCells:{range:{sheetId:target.sheetId,startRowIndex:row,endRowIndex:row+1,startColumnIndex:col,endColumnIndex:col+1},rows:[{values:[value]}],fields:'userEnteredValue,textFormatRuns,userEnteredFormat.wrapStrategy,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment'}};
   const group=groups.get(target.spreadsheetId)||[];group.push({out,expected,request,merged});groups.set(target.spreadsheetId,group);
  }catch(error){r.replayProof={version:'native-saved-batch-readback-replay-v1',held:true,reason:/^[A-Z0-9_: .-]+$/.test(error.message||'')?error.message:'SOURCE_RECHECK_FAILED',providerCalls:0};}
 }
 for(const [id,items]of groups){const plan=guardClassRequests(g,id,items.map(x=>x.request),items.map(x=>x.expected));if(!plan.requests.length)continue;
  g.api('https://sheets.googleapis.com/v4/spreadsheets/'+id+':batchUpdate','POST',{requests:plan.requests});written.add(id);
  for(const x of items)if(plan.requests.includes(x.request)){x.out.result.after=x.merged;x.out.result.replayProof={version:'native-saved-batch-readback-replay-v1',rawId:x.out.result.job.rawId||x.out.result.job.gradeId,textHash:createHash('sha256').update(x.merged).digest('hex'),providerCalls:0,at:new Date().toISOString()};}
 }
 return written;
}
