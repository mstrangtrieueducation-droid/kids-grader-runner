import assert from 'node:assert/strict';
import {noticeDelivered,answeredQuarantine,closeAnsweredQuarantine} from './notice-delivery.mjs';
const silent='❌ CẦN NỘP LẠI — Video/Audio của con không có tiếng đọc bài. Con kiểm tra lại micro và nộp lại để cô nhận xét nhé!';
// The KIDS 33 case (12/11): free no-voice notice in the cell, no marker → finished, not held.
assert.equal(noticeDelivered({status:'COMPLETED_UNASSESSABLE',autoNotice:silent},silent),true);
assert.equal(noticeDelivered({status:'COMPLETED_NEEDS_RESUBMISSION',autoNotice:'✅ ĐÃ NỘP\n\n— NHẬN XÉT GV —\n❌ CẦN NỘP LẠI: x'},'✅ ĐÃ NỘP  — NHẬN XÉT GV — ❌ CẦN NỘP LẠI: x'),true);
// Cell does not hold the notice → still held for a person to look at.
assert.equal(noticeDelivered({status:'COMPLETED_UNASSESSABLE',autoNotice:silent},'✅ ĐÃ NỘP'),false);
assert.equal(noticeDelivered({status:'COMPLETED_UNASSESSABLE',autoNotice:silent},''),false);
// Not a terminal notice status, or a paid result exists → unchanged handling.
assert.equal(noticeDelivered({status:'READY',autoNotice:silent},silent),false);
assert.equal(noticeDelivered({status:'COMPLETED_UNASSESSABLE',autoNotice:silent,rawId:'r'},silent),false);
assert.equal(noticeDelivered({status:'RETURNED',autoNotice:silent},silent),false);
assert.equal(noticeDelivered({status:'COMPLETED_UNASSESSABLE',autoNotice:'Nhận xét thường'},'Nhận xét thường'),false);
// Already-quarantined items from before the fix (Jake FF1-Tiết 41) close once the cell is re-read.
{const job={id:'j1',status:'COMPLETED_UNASSESSABLE',autoNotice:silent};
 const item=()=>({state:'QUARANTINED',error:'NATIVE_RECONCILIATION_REQUIRED',queueQuarantine:{reason:'NATIVE_RECONCILIATION_REQUIRED',rawId:null,gradeId:null},attempts:[{state:'HELD',calls:0}],delivery:{jobId:'j1',status:'COMPLETED_UNASSESSABLE',rawId:null},savedArtifact:false});
 const a=item();assert.equal(closeAnsweredQuarantine(a,job,silent),true);assert.equal(a.state,'ALREADY_PRESENT');assert.equal(a.noticeRecovery.providerCalls,0);assert.equal(a.noticeRecovery.previousReason,'NATIVE_RECONCILIATION_REQUIRED');
 const b=item();assert.equal(closeAnsweredQuarantine(b,job,'✅ ĐÃ NỘP'),false);assert.equal(b.state,'QUARANTINED');
 const paid=item();paid.attempts[0].calls=1;assert.equal(answeredQuarantine(paid,job),false);
 const other=item();other.delivery.jobId='x';assert.equal(answeredQuarantine(other,job),false);
 assert.equal(answeredQuarantine({...item(),state:'DONE'},job),false);
 assert.equal(answeredQuarantine(item(),{...job,status:'READY'}),false);}
console.log('notice-delivery tests passed');
