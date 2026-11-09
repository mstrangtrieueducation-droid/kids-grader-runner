import {canRecheckYouTubeNotice} from './submission-source-policy.mjs';
// Shared, explicit class-cell states. A queue acknowledgement is not a grade.
import {receiptDate,generationSpent} from './master-policy.mjs';
import {repeatedNoticedFile} from './zero-cost-gates.mjs';
export const SHEET_TRUTH_VERSION='teacher-sheet-truth-20261023';
export const PENDING_BODY='⏳ ĐANG CHỜ CHẤM — Hệ thống đã nhận bài và đang xử lý. Không cần nộp lại.';
export const TECHNICAL_BODY='⏳ ĐANG CHỜ XỬ LÝ — Hệ thống đang kiểm tra hoặc khôi phục kết quả. Không cần nộp lại.';
export const sheetTruthEnabled=()=>process.env.SHEET_TRUTH_SYNC==='true';
export const isWaitingFeedback=text=>{const body=String(text||'').split(/NHẬN XÉT GV\s*[—–-]*/u).slice(1).join('').trim();return body===PENDING_BODY||body===TECHNICAL_BODY;};
export const isResubmissionFeedback=text=>/(?:^|\n)\s*(?:❌\s*)?CẦN[ _]NỘP[ _]LẠI|^ĐÃ NỘP — Link (?:cần mở quyền xem|không hợp lệ)|^⛔\s*BÀI CHƯA HỢP LỆ/u.test(String(text||''));
export const sourceTime=s=>receiptDate(s?.at??s?.time,new Date(0)).getTime();
export const sourceTask=s=>[s?.className,String(s?.name||s?.student||'').normalize('NFC').trim().toUpperCase(),s?.code].join('|');
export function receiptTimeFromCell(text){const m=String(text||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);return m?Date.parse(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T${m[4].padStart(2,'0')}:${m[5]}:${m[6]||'00'}+07:00`):0;}
const noticeBody=text=>String(text||'').split(/NHẬN XÉT GV\s*[—–-]*/u).slice(1).join('');
export const machineCodeNotice=text=>/(?<![\p{L}\p{N}_])[A-Za-z]{2,}(?:_[A-Za-z]{2,})+(?![\p{L}\p{N}_])/u.test(noticeBody(text));
export function mayReopenNotice(source,text,jobs=[],approved=false){
 if(!isResubmissionFeedback(text))return false;if(approved)return true;
 if(jobs.some(j=>sourceTask(j.source||j.receipt)===sourceTask(source)&&sourceTime(j.source||j.receipt)===sourceTime(source)&&canRecheckYouTubeNotice(j,text)))return true;
 // Teacher06Nov: once, from the saved result only; a failed rebuild leaves the job held, not looping.
 if(machineCodeNotice(text)&&jobs.some(j=>sourceTask(j.source||j.receipt)===sourceTask(source)&&sourceTime(j.source||j.receipt)===sourceTime(source)&&!!j.rawId&&/^COMPLETED_(?:UNASSESSABLE|NEEDS_RESUBMISSION)$/.test(j.status||'')&&machineCodeNotice(j.autoNotice)))return true;
 // Teacher09Nov: a resubmission goes through the zero-cost gates and then one more request, while the task has fewer than two paid requests; afterwards nothing is graded again.
 if(resubmissionDecision(source,text,jobs).retry)return true;
 // Teacher09Nov: a same-file notice whose files do not in fact repeat is withdrawn; no request was spent on it.
 if(/vẫn là tệp/u.test(noticeBody(text)||String(text||''))){const own=jobs.map(x=>x.job||x).find(j=>j&&sourceTask(j.source||j.receipt)===sourceTask(source)&&sourceTime(j.source||j.receipt)===sourceTime(source));if(own&&!paidJob(own)&&!repeatedNoticedFile(own,jobs))return true;}
 return false;
}
// Whole minutes: the class stamp carries no seconds, so the noticed submission itself must not look newer.
export function resubmittedAfterNotice(source,text,jobs=[]){
 if(!isResubmissionFeedback(text))return false;
 const held=jobs.filter(x=>sourceTask(x.source||x.receipt)===sourceTask(source)&&isResubmissionFeedback(x.autoNotice||'')).map(x=>sourceTime(x.source||x.receipt));
 const previous=held.length?Math.max(...held):receiptTimeFromCell(text),minute=t=>Math.floor(t/60000);return previous>0&&minute(sourceTime(source))>minute(previous);
}
// Teacher09Nov: owner decision. Link, silence and old-file notices are re-checked for free by the worker before any request;
// wrong-task and presentation notices get one more request; a task never receives a third paid request.
export const GATED_RESUBMISSION_POLICY='teacher-gated-resubmission-20261109';
export const MAX_TASK_PROVIDER_CALLS=2;
const paidJob=j=>!!(j.rawId||j.gradeId||j.apiUsage||j.usage||j.generateRequests||j.approvedGenerateRequests||j.physicalGenerateRequests||j.masterGenerationReserved||j.generationAttempt?.calls||j.providerResponseReceived?.httpStatus===200||generationSpent(j));
export const taskProviderCalls=(source,jobs=[])=>jobs.map(x=>x.job||x).filter(j=>j&&sourceTask(j.source||j.receipt)===sourceTask(source)&&paidJob(j)).length;
export function noticeKind(text){
 const b=noticeBody(text)||String(text||'');
 if(/quyền xem|không hợp lệ|chưa đính kèm|không truy cập|rỗng|không còn tồn tại|riêng tư|đã bị xóa/iu.test(b))return 'link';
 if(/không có tiếng|chưa nghe rõ/iu.test(b))return 'silent';
 if(/nhầm file của bài cũ|đã dùng cho bài cũ|vẫn là tệp/iu.test(b))return 'old_file';
 if(/chưa đúng bài được giao|sai bài|nhầm bài/iu.test(b))return 'wrong_task';
 if(/quay lại|trực diện|thuyết trình|quay màn hình|thấy người/iu.test(b))return 'presentation';
 return 'other';
}
export function resubmissionDecision(source,text,jobs=[]){
 if(!resubmittedAfterNotice(source,text,jobs))return {resubmission:false,retry:false,closed:false};
 const calls=taskProviderCalls(source,jobs),closed=calls>=MAX_TASK_PROVIDER_CALLS;
 return {resubmission:true,kind:noticeKind(text),calls,retry:!closed,closed,policy:GATED_RESUBMISSION_POLICY};
}
export function sourceInputReason(j){
 const s=j.sourceIntake;if(s?.reason==='DRIVE_LINK_UNAVAILABLE'||s?.reason==='DRIVE_ACCESS_DENIED')return 'Link video/file hoặc thư mục hiện không truy cập được. Vui lòng mở quyền “Bất kỳ ai có đường liên kết” hoặc nộp lại link video/file mở được để cô nhận xét.';if(s?.state==='missing')return 'Bài nộp chưa đính kèm link video/file. Vui lòng nộp lại kèm tệp hoặc link bài.';
 if(s?.state==='access')return 'Không truy cập được tệp (quyền xem bị từ chối). Vui lòng bật quyền bất kỳ ai có link đều xem được rồi nộp lại.';
 if(s?.state==='invalid')return s.reason==='EMPTY_OR_REMOVED_FILE'?'Tệp bài nộp rỗng hoặc đã bị xóa. Vui lòng tải lại tệp đầy đủ.':s.reason==='UNSUPPORTED_FILE_FORMAT'?'Tệp đính kèm không chứa định dạng bài được giao. Vui lòng kiểm tra và nộp lại đúng tệp.':'Link bài nộp không hợp lệ hoặc tệp không còn tồn tại. Vui lòng kiểm tra và nộp lại link đúng.';
 const e=String(j.error||j.internalDiagnostic||'');
 if(/^(?:SOURCE_HTTP_403|SOURCE_ACCESS_REQUIRED|YOUTUBE_PRIVATE)$/.test(e))return 'Link bài nộp chưa mở quyền xem. Vui lòng bật quyền công khai/bất kỳ ai có link rồi nộp lại.';
 if(/^(?:SOURCE_HTTP_(?:404|410)|SOURCE_NOT_FOUND|SPEAKING_AUDIO_EMPTY|PREFLIGHT_FILE_MISSING_OR_INVALID)$/.test(e))return 'Tệp bài nộp rỗng, đã xóa hoặc không còn tồn tại. Vui lòng tải lại tệp đầy đủ.';
 // A model's assessable=false is NOT evidence of acoustic silence or a bad video.
 if((j.media||[]).filter(m=>!m.isReference).length&&(j.media||[]).filter(m=>!m.isReference).every(m=>m.localSilence?.silent===true))return 'Tệp không có tiếng nói theo kiểm tra âm thanh trực tiếp. Vui lòng kiểm tra micro và nộp lại bản có tiếng.';
 if(e==='LOCAL_OLD_GRADED_FILE')return 'Tệp này đã dùng cho bài cũ được nhận xét trước đó. Vui lòng nộp đúng tệp của bài hiện tại.';
 if(e==='LOCAL_SAME_FILE_RESUBMITTED')return 'Tệp con vừa nộp lại vẫn là tệp cô đã xem và yêu cầu nộp lại trước đó. Con quay hoặc ghi âm bài mới rồi nộp lại nhé.';
 return null;
}
