import assert from 'node:assert/strict';
import {noticeDelivered} from './notice-delivery.mjs';
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
console.log('notice-delivery tests passed');
