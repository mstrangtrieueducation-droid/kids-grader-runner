import assert from 'node:assert/strict';
import {writeManifestItems} from './manifest-writer.mjs';
function fixture({rows=1000,columns=26,failGrowth=false,failValues=false}={}){
 const old=Array.from({length:995},(_,i)=>({id:'old-'+i,state:'DONE',writeReceipt:{textHash:'saved-'+i}})),fresh=Array.from({length:44},(_,i)=>({id:'new-'+i,state:'PENDING_VALIDATION',attempts:[]})),queue={items:[...old,...fresh],membershipHash:'new-membership'},prior=JSON.stringify(old),calls=[];
 let actualRows=rows,actualColumns=columns,checkpoint=0;
 const sheet={book:{id:'synthetic-control'},meta:{properties:{gridProperties:{rowCount:rows,columnCount:columns}}},getName:()=> 'KidsTodo',getSheetId:()=>7};
 const g={api(url,method,payload){calls.push({url,method,payload});assert(url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/synthetic-control'));assert.equal(method,'POST');if(url.endsWith('/values:batchUpdate')){if(failValues)throw Error('NETWORK_OUTCOME_UNKNOWN');for(const d of payload.data){const end=Number(d.range.match(/:F(\d+)$/)[1]);if(end>actualRows||actualColumns<6)throw Error('GOOGLE_HTTP_400');}return {totalUpdatedCells:payload.data.length*6};}
  assert(url.endsWith(':batchUpdate'));if(failGrowth)throw Error('GOOGLE_HTTP_503');for(const r of payload.requests){assert.equal(r.appendDimension.sheetId,7);if(r.appendDimension.dimension==='ROWS')actualRows+=r.appendDimension.length;else actualColumns+=r.appendDimension.length;}return {};}};
 return {g,sheet,queue,old,fresh,calls,prior,get actualRows(){return actualRows;},get checkpoint(){return checkpoint;},write:items=>writeManifestItems(g,sheet,queue,items,{runId:'synthetic-run',saveLocal:()=>checkpoint++})};
}
const f=fixture();
assert.throws(()=>f.g.api('https://sheets.googleapis.com/v4/spreadsheets/synthetic-control/values:batchUpdate','POST',{data:[{range:"'KidsTodo'!A1040:F1040",values:[[]]}]}),/GOOGLE_HTTP_400/,'reproduce the old 995+44 overflow');f.calls.length=0;
f.write(f.queue.items);assert.equal(f.calls.length,2);assert(f.calls[0].url.endsWith(':batchUpdate'));assert(f.calls[1].url.endsWith('/values:batchUpdate'));assert.equal(f.actualRows,1250);assert.equal(f.checkpoint,1);assert.equal(JSON.stringify(f.old),f.prior,'history, receipts and call evidence are unchanged');assert.equal(f.calls[1].payload.data.length,1039);assert.equal(f.calls[1].payload.data.at(-1).range,"'KidsTodo'!A1040:F1040");assert(f.calls[1].payload.data.every(d=>d.values[0][4]==='new-membership'));
f.write(f.fresh);assert.equal(f.calls.length,3,'no second growth after successful extension');assert.equal(f.checkpoint,2);
const ready=fixture({rows:2000});ready.write(ready.fresh);assert.equal(ready.calls.length,1);
const narrow=fixture({rows:1040,columns:4});narrow.write(narrow.fresh);assert.equal(narrow.actualRows,1040);assert.equal(narrow.calls[0].payload.requests[0].appendDimension.dimension,'COLUMNS');
const stopped=fixture({failGrowth:true});assert.throws(()=>stopped.write(stopped.fresh),/GOOGLE_HTTP_503/);assert.equal(stopped.sheet.meta.properties.gridProperties.rowCount,1000);assert.equal(stopped.checkpoint,0);assert.equal(stopped.calls.length,1,'failed growth cannot send out-of-grid values');
const uncertain=fixture({failValues:true});assert.throws(()=>uncertain.write(uncertain.fresh),/NETWORK_OUTCOME_UNKNOWN/);assert.equal(uncertain.checkpoint,0,'an unacknowledged write never advances the local queue');
assert.throws(()=>ready.write([{id:'unknown',state:'PENDING_VALIDATION'}]),/BINDING/);assert.throws(()=>ready.write([{...ready.fresh[0]}]),/BINDING/);assert.throws(()=>writeManifestItems(ready.g,{...ready.sheet,getName:()=> 'TRACKER'},ready.queue,ready.fresh),/TABLE/);
console.log('PASS real writer regression: 995 existing +44 pending beyond 1000 rows; grow before values, preserve history/membership, capacity reuse, narrow columns, failed/uncertain acknowledgements and target ownership; 0 provider/live class writes.');
