import {createHash} from 'node:crypto';
const letters=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
export const textDigest=text=>createHash('sha256').update(String(text)).digest('hex');
export function planClassValues(requests,expected){
 const titles=new Map(expected.map(e=>[e.sheetId,e.title])),cells=new Map(),format=[],structure=[];
 for(const request of requests){
  const u=request.updateCells;
  if(!u){(request.appendDimension?structure:format).push(request);continue;}
  if(!u.fields.split(',').some(x=>x.trim()==='userEnteredValue')){format.push(request);continue;}
  const title=titles.get(u.range.sheetId);if(!title)throw Error('CLASS_VALUE_TITLE_UNBOUND');
  for(let y=0;y<(u.rows||[]).length;y++)for(let x=0;x<(u.rows[y].values||[]).length;x++){
   const v=u.rows[y].values[x].userEnteredValue||{stringValue:''};if(v.formulaValue!==undefined)throw Error('CLASS_VALUE_FORMULA_FORBIDDEN');
   const row=u.range.startRowIndex+y,col=u.range.startColumnIndex+x,value=v.stringValue??v.numberValue??v.boolValue??'';
   cells.set([u.range.sheetId,row,col].join('|'),{sheetId:u.range.sheetId,row,col,value,title,textHash:textDigest(value)});
  }
  const fields=u.fields.split(',').filter(x=>x.trim()!=='userEnteredValue').join(',');
  if(fields){const copy=structuredClone(request);copy.updateCells.fields=fields;for(const row of copy.updateCells.rows||[])for(const v of row.values||[])delete v.userEnteredValue;format.push(copy);}
 }
 const values=[...cells.values()];return {cells:values,data:values.map(c=>({range:"'"+c.title.replaceAll("'","''")+"'!"+letters(c.col)+(c.row+1),values:[[c.value]]})),format,structure};
}
export function commitClassValues(g,id,requests,expected,{now=()=>new Date().toISOString(),emit=()=>{}}={}){
 const plan=planClassValues(requests,expected),base='https://sheets.googleapis.com/v4/spreadsheets/'+id;
 if(plan.structure.length)g.api(base+':batchUpdate','POST',{requests:plan.structure});
 let cells=[],committedAt=null,totalUpdatedCells=0;
 if(plan.data.length){
  const response=g.api(base+'/values:batchUpdate','POST',{valueInputOption:'RAW',data:plan.data,includeValuesInResponse:false});
  if(!(response.totalUpdatedCells>0)||response.responses?.length!==plan.data.length||response.responses.some(r=>!(r.updatedCells>0)))throw Error('CLASS_VALUE_ACK_UNCONFIRMED');
  committedAt=now();totalUpdatedCells=response.totalUpdatedCells;
  cells=plan.cells.map(({value,title,...c},i)=>({...c,committedAt,updatedCells:response.responses[i].updatedCells,transport:'values.batchUpdate.HTTP200'}));
 }
 let formattingPending=false;
 if(plan.format.length)try{g.api(base+':batchUpdate','POST',{requests:plan.format});}catch{formattingPending=true;emit({event:'CLASS_VALUES_COMMITTED_FORMAT_RETRY',cells:cells.length});}
 return {cells,committedAt,totalUpdatedCells,formattingPending};
}
export function acknowledgedFeedback(receipts,{sheetId,row,col,text}){return receipts.find(r=>r.sheetId===sheetId&&r.row===row&&r.col===col&&r.updatedCells>0&&r.textHash===textDigest(text))||null;}
