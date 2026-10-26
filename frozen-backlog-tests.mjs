import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {validateBacklog,selectExisting,matchesTarget,claimAllowed,readNativeQueue,resolveFrozenTarget} from './frozen-backlog-policy.mjs';
import {Book,Sheet,RichBuilder} from './google-adapter.mjs';import {beginSheetBatch} from './kids-sheet-batch.mjs';
import {installFrozenGenerationGuard} from './frozen-generation-guard.mjs';
const target={spreadsheetId:'fixture-class',sheetId:20,cell:'D5',student:'FIXTURE PUPIL',className:'KIDS 90',code:'SCIENCE-G1-01',submissionAt:'2026-10-25T10:00:00Z'};
const job={id:'fixture-job',status:'READY',cls:{spreadsheetId:target.spreadsheetId,className:target.className},receipt:{student:target.student,className:target.className,code:target.code,time:target.submissionAt,links:'fixture-source'},route:{code:target.code},media:[{id:'fixture-media'}]};
const entry={row:2,job},item={id:'fixture-item',target};const q={schema:'kids-frozen-backlog-v1',total:1,workers:4,items:[item],membershipHash:createHash('sha256').update(JSON.stringify([item.id])).digest('hex')};
assert.equal(validateBacklog(q),q);assert.throws(()=>validateBacklog({...q,items:[item,item],total:2}),/DUPLICATE/);assert.throws(()=>validateBacklog({...q,membershipHash:'wrong'}),/MEMBERSHIP/);
assert(matchesTarget(job,target));assert(!matchesTarget(job,{...target,submissionAt:'2026-10-25T11:00:00Z'}));assert(!matchesTarget(job,{...target,spreadsheetId:'other'}));
assert.equal(selectExisting(target,[entry]),entry);
for(const evidence of [{generateRequests:1},{physicalGenerateRequests:1},{rawId:'fixture-raw',status:'NEEDS_REVIEW'},{apiUsage:{tokens:1}}])assert.equal(selectExisting(target,[entry,{row:3,job:{...job,...evidence,id:'paid-parent'}}]),null,'paid duplicate never licenses the uncalled copy');
const saved={row:3,job:{...job,id:'saved',rawId:'fixture-raw'}};assert.equal(selectExisting(target,[entry,saved]),saved);assert.equal(selectExisting(target,[{row:2,job:{...job,nextAt:Date.now()+60000}}]),null);
assert.equal(selectExisting(target,[entry,{...saved,job:{...saved.job,status:'RETURNED'}}]).job.rawId,'fixture-raw','interrupted class flush restores a closed saved result without new AI');
assert(!claimAllowed(job,[{...job,id:'other',route:{code:'different'}}]));assert(!claimAllowed(job,[{...job,cls:{...job.cls,spreadsheetId:'other'},receipt:{...job.receipt,student:'OTHER FIXTURE'}}]));assert(claimAllowed(job,[{...job,cls:{...job.cls,spreadsheetId:'other'},receipt:{...job.receipt,student:'OTHER FIXTURE'},media:[{id:'different-media'}]}]));
const pages=[];const queue=readNativeQueue({book:()=>({getSheetByName:()=>({getLastRow:()=>803})}),api(url){pages.push(decodeURIComponent(url));const m=/F(\d+):F(\d+)$/.exec(decodeURIComponent(url));return {values:Array.from({length:Number(m[2])-Number(m[1])+1},(_,i)=>[JSON.stringify({id:'fixture-'+(Number(m[1])+i)})])};}},'fixture-control');assert.equal(queue.length,802);assert.equal(queue.at(-1).row,803);assert.equal(pages.length,3);assert(pages.every(x=>!x.includes('Form')));
const previous=process.env.SHEET_TRUTH_SYNC;process.env.SHEET_TRUTH_SYNC='false';const temp=fs.mkdtempSync(path.join(os.tmpdir(),'campaign-batch-fixture-')),calls=[];let appendRow=10;
const metadata=(id)=>({spreadsheetId:id,sheets:[{properties:{title:id==='control'?'RunnerArtifacts':'TRACKER',sheetId:id==='control'?10:20,gridProperties:{rowCount:100,columnCount:6}},data:[{rowData:Array.from({length:15},()=>({values:Array.from({length:6},()=>({userEnteredValue:{stringValue:''},effectiveValue:{stringValue:''},formattedValue:''}))}))}]}]});
const g={books:new Map(),api(url,method='GET',body){calls.push({url,method,body});if(url.includes(':append')){const n=body.values.length,start=appendRow;appendRow+=n;return {updates:{updatedRange:'RunnerArtifacts!A'+start+':C'+(appendRow-1)}};}if(method==='POST')return {};return metadata(url.includes('/control')?'control':'class');},book(id){return this.books.get(id);}};
for(const id of ['control','class']){const meta=metadata(id),b=Object.assign(Object.create(Book.prototype),{g,id,cache:new Map(),meta,sheets:[]});b.sheets=meta.sheets.map(s=>new Sheet(b,s));g.books.set(id,b);}
try{
 const batch=beginSheetBatch(g,{controlId:'control',classes:[{spreadsheetId:'class',sheetName:'TRACKER'}]},temp,{classOnly:true});assert.equal(calls.length,0,'class-only worker must not snapshot the shared control');
 const a=g.book('control').getSheetByName('RunnerArtifacts');a.appendRows([['raw-a',0,'one']]);assert.equal(a.lastAppendRow,10);a.appendRows([['raw-b',0,'two']]);assert.equal(a.lastAppendRow,11);assert.equal(calls.filter(x=>x.url.includes(':append')).length,2,'artifact reservation uses server allocated rows immediately');
 const s=g.book('class').getSheetByName('TRACKER');for(let n=1;n<=10;n++)s.getRange(n,4).setRichTextValue(new RichBuilder().setText('fixture feedback '+n).build());
 assert.equal(calls.filter(x=>x.url.endsWith('class:batchUpdate')).length,0);batch.flush();const writes=calls.filter(x=>x.url.endsWith('class:batchUpdate'));assert.equal(writes.length,1);assert.equal(writes[0].body.requests.length,10);batch.close();assert(!g.book('control').ramBatch);
}finally{for(const f of fs.readdirSync(temp))fs.unlinkSync(path.join(temp,f));fs.rmdirSync(temp);if(previous===undefined)delete process.env.SHEET_TRUTH_SYNC;else process.env.SHEET_TRUTH_SYNC=previous;}
let generated=0;const originalCells=Array.from({length:5},()=>({values:Array.from({length:4},()=>({}))}));originalCells[4].values[3]={userEnteredValue:{stringValue:'receipt'},formattedValue:'receipt'};
const originalMaster={cells:originalCells},guardSheet={book:{cache:new Map([['TRACKER|master',originalMaster]])},meta:{properties:{gridProperties:{frozenRowCount:4}},merges:[]},getName:()=> 'TRACKER',getSheetId:()=>20},guardCell={sheet:guardSheet,getRow:()=>5,getColumn:()=>4};let remoteCells=structuredClone(originalCells);
const context={destination_:()=>({cell:guardCell}),generate_:()=>{generated++;return 'fixture result';}},guardGoogle={api:()=>({sheets:[{properties:{sheetId:20},merges:[],data:[{startRow:0,startColumn:0,rowData:remoteCells}]}]})};
installFrozenGenerationGuard(context,guardGoogle);assert.equal(context.generate_(job),'fixture result');assert.equal(generated,1);
remoteCells[4].values[3].note='teacher edited';assert.throws(()=>context.generate_(job),/PREFLIGHT_DESTINATION_CHANGED/);assert.equal(generated,1);
remoteCells=structuredClone(originalCells);remoteCells[4].values[2]={userEnteredValue:{stringValue:'different pupil'},formattedValue:'different pupil'};assert.throws(()=>context.generate_(job),/PREFLIGHT_DESTINATION_CHANGED/);assert.equal(generated,1);
console.log('PASS immutable targets, cross-class/source binding, saved-first and duplicate-paid protection, pupil/media conflict claims, paged persistent ledger, server allocated artifacts and ten class writes in one batch; 0 AI/0 live Sheet writes.');

const moved={sheet:{getSheetId:()=>20},getA1Notation:()=> 'G8'};
const native={destination_:(cls,route,student)=>{assert.equal(student,target.student);assert.equal(route.code,target.code);return {cell:moved};}};
assert.equal(resolveFrozenTarget(native,job,target).target.cell,'G8');
assert.equal(target.cell,'D5','frozen source membership must remain unchanged');
assert.throws(()=>resolveFrozenTarget(native,{...job,receipt:{...job.receipt,student:'OTHER'}},target),/BINDING/);
assert.throws(()=>resolveFrozenTarget({...native,destination_:()=>{throw Error('AMBIGUOUS');}},job,target),/AMBIGUOUS/);
assert.throws(()=>resolveFrozenTarget({...native,destination_:()=>({cell:{...moved,sheet:{getSheetId:()=>99}}})},job,target),/SHEET_CHANGED/);
console.log('PASS native relocation, immutable receipt identity, ambiguous names and cross-sheet refusal; 0 AI.');
