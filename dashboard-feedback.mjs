// Dashboard content, not queue status, determines whether feedback exists.
export function emptyTeacherBody(value){const text=String(value??'').normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g,'');const marker=/[—–-]*\s*NHẬN XÉT GV\s*[—–-]*/iu.exec(text);return !!marker&&!text.slice(marker.index+marker[0].length).trim();}
export function receiptOnlyCell(value){
 let text=String(value??'').normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim();
 if(!text)return true;
 if(/\d+(?:[.,]\d+)?\s*%/.test(text))return false; // preserve an existing mark
 text=text.replace(/—\s*NHẬN XÉT GV\s*—/giu,'');
 text=text.replace(/\[?\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\]?/g,'');
 text=text.replace(/(?:Lần đầu|Lần mới|Thời gian|Lần nộp\s*\d+|Lần\s*\d+|Lượt\s*\d+)\s*:?/giu,'');
 text=text.replace(/\d+\s+(?:lượt|lần)/giu,'');
 text=text.replace(/(?:ĐÃ NỘP(?:\s+MUỘN|\s+\d+\s+LẦN)?|ĐÃ GHI NHẬN|NỘP MUỘN|CHƯA GHI NHẬN|CHƯA NỘP|NHẬN XÉT GV)/giu,'');
 return text.replace(/[✅☑✔❌⚠🔁\uFE0F\[\]():·—–\-\s]/gu,'')==='';
}
export function installDashboardFeedback(c){const original=c.hasFeedback_;c.hasFeedback_=value=>emptyTeacherBody(value)&&!/\d+(?:[.,]\d+)?\s*%/.test(String(value))||receiptOnlyCell(value)?false:original(value);}
