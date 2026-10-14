import assert from 'node:assert/strict';import {receiptOnlyCell,installDashboardFeedback,emptyTeacherBody} from './dashboard-feedback.mjs';
assert(emptyTeacherBody('☑ ĐÃ NỘP 12/09/2026 08:30\n— NHẬN XÉT GV —\n  '));assert(!emptyTeacherBody('— NHẬN XÉT GV —\nCon đọc tốt.'));
for(const v of ['', '✅ ĐÃ NỘP 04/10/2026 18:30\n— NHẬN XÉT GV —','☑ ĐÃ NỘP\n01/09/2026 08:00','⚠️ NỘP MUỘN · 2 lượt\nLượt 1: 01/09/2026 08:00\nLượt 2: 02/09/2026 09:00','🔁 ĐÃ NỘP 2 LẦN\nLần đầu: 01/09/2026 08:00\nLần mới: 02/09/2026 09:00'])assert(receiptOnlyCell(v),v);
for(const v of ['✅ ĐÃ NỘP\n— NHẬN XÉT GV —\nCon đọc rất tốt.','Chất lượng: đạt khoảng 85%.','❌ CẦN NỘP LẠI','Con đã nộp nhưng còn thiếu phần dịch.'])assert(!receiptOnlyCell(v),v);
const c={hasFeedback_:()=>true};installDashboardFeedback(c);assert(!c.hasFeedback_('✅ ĐÃ NỘP 01/09/2026 08:00'));assert(c.hasFeedback_('Chất lượng: đạt khoảng 85%.'));console.log('Dashboard receipt-only variants are eligible; existing comments and marks protected.');
