// Teacher09Nov: feedback on a resubmission says so, and names what the pupil put right.
import {noticeKind} from './sheet-truth-state.mjs';
export const isGatedRetry=j=>j?.sheetTruth?.reopenedBy==='newer_form_timestamp'&&!!j?.sheetTruth?.previousNotice;
const LINES={
 silent:['Cô đã nhận được bản con nộp lại, lần này có tiếng rõ rồi, cô nghe và nhận xét bài của con nhé.','Bản nộp lại của con đã có tiếng đọc rõ ràng, cô nhận xét bài này cho con nhé.'],
 link:['Cô đã nhận được link con gửi lại, lần này mở được rồi, cô nhận xét bài của con nhé.','Link con nộp lại đã mở được, cô đã xem và nhận xét bài của con.'],
 old_file:['Cô đã nhận được đúng tệp bài này con nộp lại, cô nhận xét cho con nhé.','Lần này con đã gửi đúng tệp của bài, cô nhận xét bài của con nhé.'],
 wrong_task:['Cô đã nhận được bài con nộp lại, lần này con làm đúng bài được giao rồi, cô nhận xét nhé.','Bản nộp lại của con đã đúng bài được giao, cô nhận xét bài này cho con.'],
 presentation:['Cô đã nhận được video con quay lại, lần này đã thấy con tự trình bày trước camera rồi, cô nhận xét nhé.','Video con quay lại đã thấy rõ con trình bày, cô nhận xét bài này cho con nhé.'],
 other:['Cô đã nhận được bài con nộp lại, cô nhận xét bài này cho con nhé.','Con đã nộp lại bài, cô đã xem và nhận xét cho con.']};
const hash=s=>{let h=2166136261;for(const ch of String(s)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0;}return h;};
export function resubmissionAcknowledgement(j){
 if(!isGatedRetry(j))return '';
 const kind=noticeKind(j.sheetTruth.previousNotice),lines=LINES[kind]||LINES.other,r=j.receipt||j.source||{};
 return lines[hash([r.className,r.student||r.name,r.code,r.time].join('|'))%lines.length];
}
// A resubmission that is still not right is told so, instead of being treated as a first attempt.
export function retryNoticeReason(j,kind){
 if(!isGatedRetry(j))return null;
 if(kind==='wrong_task')return 'Cô đã nhận được bài con nộp lại, nhưng nội dung lần này vẫn chưa đúng bài được giao của buổi này.\nCon xem kỹ lại đề bài rồi gửi đúng phần bài được giao nhé. Cô đợi bài của con.';
 if(kind==='silent')return 'Cô đã nhận được bản con nộp lại, nhưng lần này vẫn chưa có tiếng con đọc bài. Con kiểm tra micro, nghe thử bản quay rồi gửi lại giúp cô nhé.';
 return null;
}
