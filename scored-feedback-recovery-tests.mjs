import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {RichBuilder,Style} from './google-adapter.mjs';
import {restoreScoredFeedback,mayReplaceMachineNotice,reconcileScoredTodo,preloadRecoveryClass,cachedReceiptAuthority} from './scored-feedback-recovery.mjs';
const notice='❌ CẦN NỘP LẠI — Con nộp nhầm file của bài cũ đã có điểm rồi. Con kiểm tra và nộp lại đúng bài này nhé!';
const draft={assessable:true,band:'80%',roseSections:[{label:'Ngữ pháp',text:'Con đọc rõ, con chú ý âm cuối.'}],submissionCheck:{status:'wrong_assignment',observedTask:'Related reading',basis:'A different skill label'}};
const raw={candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(draft)}]}}]};
function run({edited=false,blocked=false,roster=true,conflict=false,questions=false}={}){
 const receipt={student:'PUPIL A',className:'CLASS',code:'D1-Tiết 51-Ngữ pháp',time:'2026-10-17T13:00:00Z',links:'https://example.test/submission'},job={id:'fixture',status:'COMPLETED_NEEDS_RESUBMISSION',autoNotice:notice,rawId:'raw',receipt,cls:{className:'CLASS',spreadsheetId:'book'},route:{kind:'grammar',code:receipt.code},media:[]};
 const qa={assessable:true,band:'85%',roseSections:[{label:'Nội dung',text:'Con trả lời đủ câu hỏi.'},{label:'Trình bày',text:'Con nói rõ.\nỞ video 2, con chỉ quay màn hình; con nhớ quay chính diện nhé.'}]},snapshot={barem:{requirements:{requiredParts:['Video 1: thuyết trình theo mindmap','Video 2: trả lời các câu hỏi']}}};if(questions){job.status='RETURNED';job.snapshotId='snapshot';job.generateRequests=1;job.rawId='raw';job.autoNotice='Chất lượng: đạt khoảng 85%.\nỞ video 2, con nhớ quay chính diện nhé.';}
 const before=edited?'Teacher correction':job.autoNotice,master={cells:[{values:[{formattedValue:before,userEnteredValue:{stringValue:before}}]}]};
 const sheet={getName:()=> 'TRACKER',getSheetId:()=>7,meta:{properties:{gridProperties:{frozenRowCount:0}},merges:[]},book:{cache:new Map([['TRACKER|master',master]])}};
 const cell={sheet,getDisplayValue:()=>before,getFormula:()=>'',getDataValidation:()=>null,getNote:()=>'',getRow:()=>1,getColumn:()=>1,getA1Notation:()=> 'A1'};
 let calls=0,writes=0,persisted=0;
 const c={readArtifact_:id=>id==='snapshot'?snapshot:blocked?{promptFeedback:{blockReason:'PROHIBITED_CONTENT'}}:questions?{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(qa)}]}}]}:raw,currentRoster_:()=>roster,freshReceipt_:()=>receipt,hash_:JSON.stringify,destination_:()=>({sheet,cell}),saveArtifact_:()=> 'backup',persist_:()=>{persisted++;},coloredFeedback_:(_c,text)=>new RichBuilder().setText(text).build(),SpreadsheetApp:{newTextStyle:()=>new Style()}};
 const report=restoreScoredFeedback(c,{api:()=>{calls++;throw Error('NO_NETWORK');}},[{job,row:2}],{questionComponents:questions,guard:(_g,_id,requests)=>({requests:conflict?[]:requests}),commit:(_g,_id,requests)=>{writes++;const text=requests[0].updateCells.rows[0].values[0].userEnteredValue.stringValue;return {cells:[{sheetId:7,row:0,col:0,updatedCells:1,textHash:createHash('sha256').update(text).digest('hex'),committedAt:'2026-10-30T00:00:00Z',transport:'values.batchUpdate.HTTP200'}]};}});
 return {report,job,calls,writes,persisted};
}
const ok=run();assert.equal(ok.report.restored.length,1);assert.equal(ok.job.status,'RETURNED');assert.ok(ok.job.autoNotice.includes('80%'));assert.equal(ok.calls,0);assert.equal(ok.writes,1);assert.equal(ok.persisted,1);assert.ok(ok.job.returnedScoreRepair.backup);
for(const opts of [{edited:true},{blocked:true},{roster:false},{conflict:true}]){const r=run(opts);assert.equal(r.report.restored.length,0);assert.equal(r.writes,0);assert.equal(r.persisted,0);assert.equal(r.calls,0);}
assert.equal(mayReplaceMachineNotice({autoNotice:notice},notice+'\nTeacher note'),false);
console.log('PASS complete cached grade restored without media or provider; before-image backup and write ACK required; teacher edits, roster removal, blocked raw and concurrent changes protected.');

const todo={id:'todo',target:{spreadsheetId:'book',className:'CLASS',student:'PUPIL A',code:'D1-Tiết 51-Ngữ pháp',submissionAt:'2026-10-17T13:00:00Z'},state:'QUARANTINED',attempts:[{state:'HELD'}]};
assert.equal(reconcileScoredTodo([todo],[{job:ok.job}]).length,1);assert.equal(todo.state,'DONE');assert.equal(todo.attempts.length,1);assert.equal(reconcileScoredTodo([todo],[{job:ok.job}]).length,0);

let boundedUrl='';const boundedSheet={meta:{properties:{gridProperties:{columnCount:130,rowCount:10000}}},book:{id:'book',cache:new Map()},getName:()=> 'TRACKER',getSheetId:()=>7,getLastRow:()=>35};
const bounded=preloadRecoveryClass({api:url=>{boundedUrl=url;return {sheets:[{properties:{sheetId:7},data:[{rowData:[]}]}]};}},boundedSheet,15);assert.equal(bounded,"'TRACKER'!A1:DZ35");assert.ok(!decodeURIComponent(boundedUrl).includes('10000'));assert.ok(boundedSheet.book.cache.has('TRACKER|master'));

const archived={receipt:{className:'CLASS',student:'PUPIL A',code:'D1-Tiết 51',sourceTab:'FORM',time:'2026-10-17T13:37:20Z',links:'saved-file'}};
assert.equal(cachedReceiptAuthority(archived,{...archived.receipt,row:99}).allowed,true);
assert.equal(cachedReceiptAuthority(archived,{...archived.receipt,time:'2026-10-17T13:26:45Z',links:'older-file'}).allowed,true);
assert.equal(cachedReceiptAuthority(archived,{...archived.receipt,time:'2026-10-18T13:26:45Z',links:'new-file'}).allowed,false);
assert.equal(cachedReceiptAuthority(archived,{...archived.receipt,student:'PUPIL B'}).allowed,false);
assert.equal(cachedReceiptAuthority(archived,null,'STALE_RECEIPT').allowed,true);
assert.equal(cachedReceiptAuthority(archived,null,'NETWORK_OUTCOME_UNKNOWN').allowed,false);

const questionRepair=run({questions:true});assert.equal(questionRepair.report.restored.length,1);assert.equal(questionRepair.job.generateRequests,1);assert.equal(questionRepair.job.rawId,'raw');assert.ok(questionRepair.job.autoNotice.includes('85%'));assert.ok(!questionRepair.job.autoNotice.includes('chính diện'));assert.ok(questionRepair.job.returnedQuestionRepair.writeReceipt.updatedCells);for(const opts of [{edited:true},{blocked:true},{roster:false},{conflict:true}])assert.equal(run({...opts,questions:true}).writes,0);
