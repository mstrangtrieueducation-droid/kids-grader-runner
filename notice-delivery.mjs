// Teacher12Nov: a submission already answered with a free "CẦN NỘP LẠI" notice is finished.
// Some notices (e.g. "Video/Audio của con không có tiếng đọc bài") carry no "— NHẬN XÉT GV —"
// marker, so the queue mistook them for held work and mailed a false "bị giữ lại" alert.
// Read-only check: it never writes a cell, never resets paid history and never calls Gemini.
import {MASTER_TERMINAL} from './master-policy.mjs';
const clean=v=>String(v??'').normalize('NFC').replace(/[​-‍﻿]/g,'').replace(/\s+/g,' ').trim();
export const NOTICE_TERMINAL=new Set([...MASTER_TERMINAL].filter(s=>/^COMPLETED_|^CẦN_NỘP_LẠI/u.test(s)));
export function noticeDelivered(job,cellText){
 if(!job||!NOTICE_TERMINAL.has(job.status)||job.rawId||job.gradeId)return false;
 const cell=clean(cellText),notice=clean(job.autoNotice);
 return !!notice&&/CẦN NỘP LẠI/u.test(notice)&&cell.includes(notice);
}
