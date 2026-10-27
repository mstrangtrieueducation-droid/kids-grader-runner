import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
import {Sheet} from './google-adapter.mjs';
import {intakeDue,tailWindow,intakeNewKidsReceipts,INTAKE_INTERVAL,encodeIntakeState,decodeIntakeState,boundTailRows,takeIntakeRows} from './continuous-intake.mjs';
assert(intakeDue({},100));assert(!intakeDue({completedAt:100},101));assert(intakeDue({completedAt:100},100+INTAKE_INTERVAL));
assert.deepEqual(tailWindow({known:101,rowCount:200}),{acknowledged:101,start:102,end:151,empty:false});
assert.deepEqual(tailWindow({cursor:150,known:999,rowCount:200}),{acknowledged:150,start:151,end:200,empty:false});
assert(tailWindow({cursor:200,rowCount:200}).empty);
assert.throws(()=>tailWindow({rowCount:0}),/ROW_COUNT/);
const pages=Array.from({length:12},(_,tab)=>Array.from({length:50},(_,row)=>({tab,row}))),bounded=boundTailRows(pages);assert.equal(bounded.flat().length,24);assert(bounded.every(x=>x.length===2));assert.deepEqual(bounded[0],pages[0].slice(0,2),'each page advances only through selected contiguous rows');
const weighted=takeIntakeRows([{tail:pages[0],old:pages[1]}])[0];assert.equal(weighted.filter(x=>x.tab===0).length,18);assert.equal(weighted.filter(x=>x.tab===1).length,6);assert.equal(takeIntakeRows([{tail:pages[0],old:[]}])[0].length,24);
function fixture({network=false,issueFailure=false,rowFailure=false,wireRow=102,initial={}}={}){
 const config={clusters:[{controlId:'synthetic-control',classes:[{className:'KIDS 90',spreadsheetId:'synthetic-class'}]}]},saved=[],calls=[],parsed=[];let releases=0,invalidations=0,batchOpened=0,batchClosed=0,batchFlushes=0;
 const book={id:'synthetic-source',cache:new Map()},norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').trim().replace(/\s+/g,' ').toUpperCase();
 const c=vm.createContext({Date,Object,FLEET_CLUSTER:config.clusters[0],KG:{source:'synthetic-source'},norm_:norm,require_:(v,e)=>{if(!v)throw Error(e);},SpreadsheetApp:{openById:()=>book},runnerProperties:new Map()});
 vm.runInContext(fs.readFileSync('gas/Fleet.gs','utf8'),c);
 const tabs=Array.from(vm.runInContext('KIDS21_AUTO.tabs',c));
 book.sheets=tabs.map((title,i)=>new Sheet(book,{properties:{title,sheetId:i+1,gridProperties:{rowCount:200,columnCount:5}},merges:[]}));book.getSheetByName=name=>book.sheets.find(s=>s.getName()===name);
 const headers=['Dấu thời gian','Mã bài','Tên tiếng Anh','Lớp','Video'].map(x=>({effectiveValue:{stringValue:x},formattedValue:x}));
 const serial=(Date.parse('2026-10-27T10:00:00.000Z')+25200000)/86400000+25569;
 const content=[serial,'SCIENCE-G3-04','SYNTHETIC PUPIL','KIDS 90','file A file B'].map(x=>({effectiveValue:typeof x==='number'?{numberValue:x}:{stringValue:x},formattedValue:String(x)}));
 content[4].textFormatRuns=[{startIndex:0,format:{link:{uri:'https://example.test/a'}}},{startIndex:7,format:{link:{uri:'https://example.test/b'}}}];
 const g={book:()=>book,invalidate:()=>{invalidations++;book.cache.clear();},api:url=>{
  calls.push(url);assert(url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/synthetic-source?'));assert(!url.includes('generativelanguage'));
  if(network)throw Error('NETWORK_OUTCOME_UNKNOWN');
  return {sheets:tabs.map(title=>({properties:{title},data:[{rowData:[{values:headers}]},...(title==='SCIENCE G3'?[{startRow:wireRow-1,rowData:[{values:content}]}]:[])]}))};
 }};book.g=g;
 const makeState=()=>({initial,acquire:()=>{},save:properties=>saved.push(Object.fromEntries(properties)),release:()=>releases++});
 const options={config,google:g,buildContext:()=>c,makeState,startBatch:()=>{batchOpened++;return {flush:()=>batchFlushes++,close:()=>batchClosed++};},now:()=>Date.parse('2026-10-27T11:00:00Z'),readJobs:()=>[{job:{receipt:{sourceTab:'SCIENCE G3',row:101}}}],emit:()=>{},makeSweep:(context,cluster,google,options)=>{
  assert.equal(batchOpened,batchClosed+1,'native class inspection must run inside the existing RAM transaction');
  assert.equal(context,c);assert.equal(cluster,config.clusters[0]);assert.equal(google,g);parsed.push(...options.receipts);
  return {states:new Map([['one',rowFailure?{source:options.receipts[0],error:'NATIVE_SOURCE_FAILED'}:{source:options.receipts[0]}]]),flushIssues:()=>({failed:issueFailure?[{error:'NETWORK'}]:[]})};
 }};
 return {options,saved,calls,parsed,releases:()=>releases,invalidations:()=>invalidations,batches:()=>({opened:batchOpened,closed:batchClosed,flushes:batchFlushes})};
}
const f=fixture(),result=await intakeNewKidsReceipts(f.options);
assert.equal(result.providerCalls,0);assert.equal(f.calls.length,1,'one batched tail transport, no 28-class scan');assert.equal(f.parsed.length,1);
assert.equal(f.parsed[0].time,'2026-10-27T10:00:00.000Z');assert.equal(f.parsed[0].row,102);assert.equal(f.parsed[0].links,'https://example.test/a, https://example.test/b');
assert.deepEqual(f.batches(),{opened:1,closed:1,flushes:1});
const state=JSON.parse(f.saved[0].FLEET_SCAN_INTAKE_TAIL_V1);assert.equal(state.tabs['synthetic-source|11'],102);assert.equal(f.releases(),1);assert.equal(f.invalidations(),2,'refresh before inspection and discard partial grids after intake');
const network=fixture({network:true});await assert.rejects(()=>intakeNewKidsReceipts(network.options));assert.equal(network.saved.length,0);assert.equal(network.releases(),1);
for(const option of [{issueFailure:true},{rowFailure:true}]){
 const bad=fixture(option);const result=await intakeNewKidsReceipts(bad.options);assert(result.failed);const state=JSON.parse(bad.saved[0].FLEET_SCAN_INTAKE_TAIL_V1);assert(state.deferred.some(x=>x.row===102&&x.tab==='SCIENCE G3'),'failed row remains durably replayable without holding newer rows');assert.equal(bad.releases(),1);assert.equal(bad.invalidations(),2);
}
const idle=fixture({initial:{FLEET_SCAN_INTAKE_TAIL_V1:JSON.stringify({completedAt:Date.parse('2026-10-27T10:59:00Z'),tabs:{}})}});assert.equal((await intakeNewKidsReceipts(idle.options)).due,false);assert.equal(idle.calls.length,0);assert.equal(idle.releases(),1);
const filled=fixture({wireRow:151});assert((await intakeNewKidsReceipts(filled.options)).more,'a full tail page continues immediately rather than sleeping ten minutes');
const replayState={tabs:{'synthetic-source|11':150},deferred:[{source:'synthetic-source',tab:'SCIENCE G3',row:102,controlId:'synthetic-control',nextAt:0}]};
const replay=fixture({initial:{FLEET_SCAN_INTAKE_TAIL_V1:JSON.stringify(replayState)}});await intakeNewKidsReceipts(replay.options);assert.equal(replay.parsed[0].row,102);const resumed=decodeIntakeState(replay.saved[0].FLEET_SCAN_INTAKE_TAIL_V1);assert.equal(resumed.tabs['synthetic-source|11'],150);assert.equal(resumed.deferred.length,0,'deferred old row replays independently of the new tail cursor');
const many={tabs:{},deferred:Array.from({length:2000},(_,row)=>({source:'synthetic-source',tab:'SCIENCE G3',row,controlId:'synthetic-control',nextAt:0,reason:'NATIVE_ASSIGNMENT_PENDING'}))};const encoded=encodeIntakeState(many);assert(encoded.startsWith('gz:'));assert(encoded.length<32000);assert.deepEqual(decodeIntakeState(encoded),many);
console.log('Real native Form parser retains absolute rows, +07 timestamps and rich multi-links; bounded batched tails, durable cursor, failure replay, issue persistence and lease cleanup verified. 0 AI/0 live writes.');
