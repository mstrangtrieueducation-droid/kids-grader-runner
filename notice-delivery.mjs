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
// Teacher12Nov: items already quarantined by the missing-marker mistake are closed once,
// after the live class cell is re-read and still holds the job's own notice.
export function answeredQuarantine(item,job){
 return item?.state==='QUARANTINED'&&!item.savedArtifact&&!item.delivery?.rawId&&!item.delivery?.gradeId&&!item.queueQuarantine?.rawId&&!item.queueQuarantine?.gradeId
  &&!(item.attempts||[]).some(a=>Number(a.calls)>0)&&!!job?.id&&item.delivery?.jobId===job.id&&NOTICE_TERMINAL.has(job.status)&&!job.rawId&&!job.gradeId;
}
export function closeAnsweredQuarantine(item,job,cellText,now=new Date()){
 if(!answeredQuarantine(item,job)||!noticeDelivered(job,cellText))return false;
 item.noticeRecovery={policy:'kids-notice-delivered-20261112',at:now.toISOString(),previousState:item.state,previousReason:item.queueQuarantine?.reason||item.error||null,providerCalls:0};
 item.state='ALREADY_PRESENT';item.verifiedAt=now.toISOString();item.error=null;item.nextAt=0;
 return true;
}
