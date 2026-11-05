// Plain list for the teacher of submissions that cannot finish alone. It only
// reads ledger state; it never writes to a class cell or tells a family anything.
export const ATTENTION_TAB='[BÀI CẦN XỬ LÝ]';
const HEADER=['Cập nhật','Lớp','Học sinh','Mã bài','Giờ nộp','Tình trạng','Việc cần làm','Mã kỹ thuật'];
const OVERDUE=2*3600000,OPEN_OVERDUE=6*3600000,LIMIT=900;
export function attentionMessage(code){
 const c=String(code||'');
 if(c==='RESUBMITTED_AFTER_NOTICE')return ['Học sinh đã nộp lại sau thông báo CẦN NỘP LẠI','Nhân viên chấm tay, không gọi Gemini'];
 if(c==='PAID_NO_RESULT')return ['Đã dùng lượt Gemini nhưng không có nhận xét','Nhân viên chấm tay, không gọi lại Gemini'];
 if(c==='SYSTEM_HELD')return ['Hệ thống đang giữ bài do lỗi kỹ thuật','Nhân viên chấm tay hoặc kỹ thuật kiểm tra'];
 if(c==='OPEN_TOO_LONG')return ['Bài nằm trong hàng chấm quá lâu','Kỹ thuật kiểm tra'];
 if(c==='BAREM_NOT_FOUND'||/^CODE_UNSUPPORTED/.test(c))return ['Mã bài không có trong danh mục, có thể bị gõ sai','Nhân viên kiểm tra mã bài trên Form'];
 if(/^BAREM_|^SKIPPED_NOT_ASSIGNED/.test(c))return ['Bài chưa có lời chuẩn hoặc barem nên chưa chấm tự động được','Cô bổ sung barem, hoặc nhân viên chấm tay'];
 if(/^DESTINATION/.test(c))return ['Không xác định được cột của bài trên bảng theo dõi','Cô kiểm tra cột của bài, hoặc nhân viên chấm tay'];
 if(/^STUDENT/.test(c))return ['Tên học sinh không khớp duy nhất trong lớp','Cô kiểm tra tên học sinh'];
 return ['Lỗi kỹ thuật khi đọc bài','Kỹ thuật kiểm tra'];
}
const taskKey=x=>[x.className,String(x.student||'').normalize('NFC').trim().toUpperCase(),x.code].join('|');
export function attentionRows(state,{now=Date.now()}={}){
 const latest=new Map(),offer=x=>{const at=Date.parse(x.time);if(!x.className||!Number.isFinite(at))return;const p=latest.get(taskKey(x));if(!p||at>Date.parse(p.time))latest.set(taskKey(x),x);};
 for(const d of state.deferred||[])if(['NATIVE_ASSIGNMENT_PENDING','NATIVE_ROW_DEFERRED'].includes(d.reason)&&now-Date.parse(d.time)>=OVERDUE)offer({...d,issue:d.detail||d.reason});
 for(const x of Object.values(state.attention||{}))if(now-Date.parse(x.time)>=(x.issue==='OPEN_TOO_LONG'?OPEN_OVERDUE:x.issue==='RESUBMITTED_AFTER_NOTICE'?0:OVERDUE))offer(x);
 return [...latest.values()].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)).slice(0,LIMIT).map(x=>[x.className,x.student,x.code,x.time,...attentionMessage(x.issue),x.issue]);
}
export function writeAttentionList(g,controlId,rows,{now=Date.now(),previousCount=0}={}){
 const book=g.book(controlId);book.getSheetByName(ATTENTION_TAB)||book.insertSheet(ATTENTION_TAB);
 const base='https://sheets.googleapis.com/v4/spreadsheets/'+controlId+'/values/',tab="'"+ATTENTION_TAB+"'!";
 const stamp=new Date(now).toISOString(),values=[HEADER,...rows.map(r=>[stamp,...r])];
 if(previousCount>rows.length)g.api(base+encodeURIComponent(tab+'A'+(rows.length+2)+':H'+(previousCount+1))+':clear','POST',{});
 g.api(base+encodeURIComponent(tab+'A1:H'+values.length)+'?valueInputOption=RAW','PUT',{values});
 return rows.length;
}
