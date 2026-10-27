// Reconcile a staged, validated saved result after a class batch readback failed.
// Native source/roster/target resolution and the ordinary fresh write guard all
// run again. Never substitute a different cell, overwrite feedback, or call AI.
import {createHash} from 'node:crypto';
import {resolveFrozenTarget} from './frozen-backlog-policy.mjs';
import {receiptOnlyCell,hasTeacherReview} from './teacher-feedback-state.mjs';
import {cellEvidence,expectedBindings,guardClassRequests} from './sheet-truth-write-guard.mjs';
export function replaySavedClassBatch(c,g,results){
 const groups=new Map(),written=new Set();
 for(const out of results){const r=out.result,j=r.job;if(r.state!=='STAGED'||!j.rawId&&!j.gradeId||!r.deliveryCell)continue;
  try{
   const {cell,target}=resolveFrozenTarget(c,j,out.target),text=cell.getDisplayValue();
   if(text===r.after||text!==r.before||!receiptOnlyCell(text)||hasTeacherReview(text)||cell.getFormula()||cell.getDataValidation()||cell.getNote()!==(r.beforeNote||'')||target.sheetId!==r.target.sheetId||target.cell!==r.target.cell)continue;
   if(c.currentRoster_&&!c.currentRoster_(j.receipt,{fresh:true}))continue;
   c.currentSource_(j);
   const sheet=cell.sheet,master=sheet.book.cache.get(sheet.getName()+'|master'),row=cell.getRow()-1,col=cell.getColumn()-1;
   if(!master?.cells)continue;
   const expected={key:[target.sheetId,row,col].join('|'),sheetId:target.sheetId,title:sheet.getName(),row,col,before:structuredClone(cellEvidence(master.cells[row]?.values?.[col])),...expectedBindings(sheet,master,row,col)};
   const value=structuredClone(r.deliveryCell);delete value.note;delete value.effectiveValue;delete value.formattedValue;delete value.hyperlink;delete value.dataValidation;
   if(value.userEnteredValue?.stringValue!==r.after||!hasTeacherReview(r.after))continue;
   const request={updateCells:{range:{sheetId:target.sheetId,startRowIndex:row,endRowIndex:row+1,startColumnIndex:col,endColumnIndex:col+1},rows:[{values:[value]}],fields:'userEnteredValue,textFormatRuns,userEnteredFormat.wrapStrategy,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment'}};
   const group=groups.get(target.spreadsheetId)||[];group.push({out,expected,request});groups.set(target.spreadsheetId,group);
  }catch{/* Retain the original conflict and immutable artifact for a later turn. */}
 }
 for(const [id,items]of groups){const plan=guardClassRequests(g,id,items.map(x=>x.request),items.map(x=>x.expected));if(!plan.requests.length)continue;
  g.api('https://sheets.googleapis.com/v4/spreadsheets/'+id+':batchUpdate','POST',{requests:plan.requests});written.add(id);
  for(const x of items)if(plan.requests.includes(x.request))x.out.result.replayProof={version:'native-saved-batch-readback-replay-v1',rawId:x.out.result.job.rawId||x.out.result.job.gradeId,textHash:createHash('sha256').update(x.out.result.after).digest('hex'),providerCalls:0,at:new Date().toISOString()};
 }
 return written;
}
