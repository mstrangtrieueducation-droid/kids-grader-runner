import assert from 'node:assert/strict';
import {emptyTeacherBody,hasTeacherReview,receiptOnlyCell} from './teacher-feedback-state.mjs';
import {reconcileSavedDelivery,savedDeliveryCandidates} from './saved-delivery-repair.mjs';
const receipt='✅ ĐÃ NỘP\n11/10/2026 08:54\n\n— NHẬN XÉT GV —\n✅ ĐÃ NỘP\n11/10/2026 08:54:31';
for(const text of [receipt,receipt+'\n— NHẬN XÉT GV —',receipt.replace('✅ ĐÃ NỘP\n11/10/2026 08:54:31','🔁 ĐÃ NỘP 2 LẦN\nLần đầu: 11/10/2026 08:54\nLần mới: 11/10/2026 08:54:31')]){assert(emptyTeacherBody(text));assert(!hasTeacherReview(text));assert(receiptOnlyCell(text));}
for(const body of ['Con đã nộp nhưng cần luyện thêm.','Chất lượng: 0%.','60%','❌ CẦN NỘP LẠI: File không mở được.','Cô đã chữa.']){const text=receipt+'\n'+body;assert(hasTeacherReview(text));assert(!receiptOnlyCell(text));}
let current=receipt,writes=0,saves=0,formula='',validation=null,roster=true,stale=false;
const make=()=>({id:'synthetic-cached',status:'RETURNED',rawId:'saved:fixture',generateRequests:1,physicalGenerateRequests:1,apiUsage:{paidRateEquivalentUsd:.01},cls:{className:'KIDS 99'},route:{code:'D1-Tiết 1-Đọc'},receipt:{student:'SYNTHETIC LEARNER',className:'KIDS 99',time:'2026-10-11T01:54:31Z',links:'https://example.invalid/source'},nextAt:0});
const cell={getDisplayValue:()=>current,getFormula:()=>formula,getDataValidation:()=>validation};
const c={currentRoster_:()=>roster,destination_:()=>({cell}),currentSource_:()=>{if(stale)throw Error('STALE_RECEIPT');},persist_:()=>saves++};
let job=make(),before=JSON.stringify([job.rawId,job.generateRequests,job.physicalGenerateRequests,job.apiUsage]);
assert.equal(reconcileSavedDelivery(c,[{job,row:2}]).requeued,1);assert.equal(job.status,'READY');assert.equal(saves,1);assert.equal(JSON.stringify([job.rawId,job.generateRequests,job.physicalGenerateRequests,job.apiUsage]),before);assert.equal(writes,0);assert.equal(savedDeliveryCandidates([{job}]).length,0);
for(const mode of ['positive','formula','checkbox','roster','stale','old','noRaw','uncertain']){
 job=make();current=receipt;formula='';validation=null;roster=true;stale=false;
 if(mode==='positive')current+='\nChất lượng: 85%.\nCon nói rõ.';
 if(mode==='formula')formula='=1';if(mode==='checkbox')validation={checkbox:true};if(mode==='roster')roster=false;if(mode==='stale')stale=true;
 if(mode==='old')job.receipt.time='2026-08-31T01:00:00Z';if(mode==='noRaw')delete job.rawId;if(mode==='uncertain'){delete job.rawId;job.status='GENERATING';}
 assert.equal(reconcileSavedDelivery(c,[{job,row:2}]).requeued,0,mode);assert.notEqual(job.status,'READY',mode);
}
assert.equal(saves,1);assert.equal(writes,0);console.log('PASS repeated receipt body, zero-percent/manual comments, exact cached recovery, source/roster/formula/checkbox/scope and immutable request history; 0 AI/0 Sheet writes.');
