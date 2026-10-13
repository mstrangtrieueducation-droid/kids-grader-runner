const FORMS = Object.freeze({
  grammar: ['Ngữ pháp', 'Phát âm, âm đuôi & trọng âm'],
  vocabulary: ['Thuộc từ & nhớ nghĩa', 'Phát âm, âm đuôi & trọng âm'],
  phonics: ['Phát âm âm đang học','Âm đuôi & trọng âm','Thuộc mặt chữ'],
  reading: ['Đọc đúng, đủ nội dung','Phát âm, âm đuôi & trọng âm','Tốc độ & ngữ điệu'],
  translation: ['Đọc & phát âm','Dịch đúng, đủ ý','Tốc độ đọc/dịch'],
  de: ['Thuộc lời, tự nói theo hình','Ngữ pháp & phát âm','Trôi chảy, ngữ điệu & biểu cảm'],
  peppa: ['Khớp lời & nhịp phim','Phát âm & âm đuôi','Ngữ điệu & biểu cảm'],
  phonicsVideo: ['Phát âm từ/câu','Âm đuôi & trọng âm','Trôi chảy & ngữ điệu'],
  scienceK: ['Nội dung & nói theo hình','Từ vựng, ngữ pháp & phát âm','Trôi chảy, ngữ điệu & biểu cảm'],
  science: ['Nội dung (mindmap & câu hỏi)','Ngôn ngữ (từ vựng, ngữ pháp, phát âm)','Trình bày (trôi chảy, ngữ điệu, biểu cảm)'],
  critical: ['Mindmap & nội dung thuyết trình','Từ vựng, ngữ pháp & phát âm','Tự trình bày, ngữ điệu & biểu cảm']
});
const BANDS_TEXT = `100%: Đủ yêu cầu, tự thực hiện, không có lỗi đáng kể.
95%: Rất tốt, chỉ 1–2 lỗi nhỏ, không lặp lại.
90%: Tốt, còn vài lỗi nhỏ; nhìn chung rõ ràng, trôi chảy.
85%: Đủ nội dung nhưng còn một vài lỗi lặp lại.
80%: Hoàn thành phần lớn yêu cầu; lỗi khá thường xuyên, ngập ngừng hoặc cần gợi ý.
75%: Nắm bài nhưng nhiều chỗ chưa chắc; cần luyện lại phần đáng kể.
70%: Thực hiện được nội dung chính nhưng sai nhiều, thiếu ý hoặc phụ thuộc chữ/nhắc bài.
60–65%: Chỉ thực hiện được một phần; cần hướng dẫn và luyện lại nhiều.
Dưới 60%: Chưa đáp ứng phần lớn yêu cầu, cần học lại và làm lại.
Chọn theo tổng thể, độ dài, độ khó và mức ảnh hưởng; không đếm lỗi máy móc.
Âm thanh không rõ hoặc file không mở được: chưa đánh giá được, không cho điểm.`;
function detectKind_(code) {
  const n = norm_(code);
  if (/NGU PHAP|GRAMMAR/.test(n)) return 'grammar';
  if (/TU VUNG|VOCABULARY/.test(n)) return 'vocabulary';
  if (/DOC VA DICH|TRANSLATION/.test(n)) return 'translation';
  if (/READING|DOC BAI/.test(n)) return 'reading';
  if (/PEPPA/.test(n)) return 'peppa';
  if (/^(DE|D\.E)[ -]/.test(n)) return 'de';
  if (/PHONICS.*VIDEO/.test(n)) return 'phonicsVideo';
  if (/PHONICS/.test(n)) return 'phonics';
  if (/SCIENCE\s*K/.test(n)) return 'scienceK';
  if (/SCIENCE\s*G[123]/.test(n)) return 'science';
  if (/CRITICAL/.test(n)) return 'critical';
  throw new Error('TYPE_AMBIGUOUS: Cấu hình kind trong Routes cho ' + code);
}
function driveIds_(text) {
  const urls = String(text || '').match(/https?:\/\/[^\s,<>"']+/g) || [];
  const ids = [];
  urls.forEach(url => {
    require_(/^https:\/\/(drive|docs)\.google\.com\//i.test(url), 'UNSUPPORTED_LINK: Bài có link ngoài Drive, cần kiểm tra riêng.');
    const m = url.match(/(?:\/d\/|[?&]id=)([-\w]{15,})/);
    require_(m, 'INVALID_DRIVE_LINK'); ids.push(m[1]);
  });
  return [...new Set(ids)];
}
function latest_(rows, className, code, student) {
  const matches = rows.filter(r => r.className === norm_(className) && norm_(r.code) === norm_(code) && (!student || r.student === norm_(student)));
  const byStudent = {};
  matches.forEach(r => { // Rows are append-only; timestamp must be a real Date from Sheets.
    const ms = Date.parse(r.time); require_(Number.isFinite(ms), 'INVALID_TIMESTAMP: row ' + r.row);
    const prev = byStudent[r.student];
    if (!prev || ms > Date.parse(prev.time) || (ms === Date.parse(prev.time) && r.row > prev.row)) byStudent[r.student] = r;
  });
  return Object.values(byStudent);
}
function expandedHeaders_(s) {
  const r = s.getRange(1,1,4,s.getLastColumn()), values = r.getDisplayValues();
  r.getMergedRanges().forEach(m => {
    // The anchor is already in the fresh bulk read; avoid one remote read per merge.
    const text = values[m.getRow()-1][m.getColumn()-1];
    for (let row=m.getRow(); row<=Math.min(4,m.getLastRow()); row++)
      for (let col=m.getColumn(); col<=m.getLastColumn(); col++) values[row-1][col-1] = text;
  });
  return values;
}
function locateFromValues_(names, h, lesson, kind, code) {
  const type = {grammar:'NGU PHAP',vocabulary:'TU VUNG'}[kind];
  const cols = [];
  for (let c=0;c<h[0].length;c++) {
    const full = norm_(h.map(r=>r[c]).join('\n'));
    const lessonOK = lesson ? new RegExp('TIET(?: HOC)?(?: SO)?\\s*' + Number(lesson) + '(?!\\d)').test(full) : full.includes(norm_(code));
    if (lessonOK && /VIDEO/.test(full) && (!type || full.includes(type))) cols.push(c+1);
  }
  require_(cols.length === 1, 'DESTINATION_AMBIGUOUS: Có ' + cols.length + ' cột phù hợp. Không ghi.');
  require_(names.length === 1, 'STUDENT_AMBIGUOUS: Không có hoặc trùng tên trong lớp.');
  return {row:names[0], column:cols[0]};
}
function destination_(cls, route, student) {
  const s = SpreadsheetApp.openById(cls.spreadsheetId).getSheetByName(cls.sheetName);
  require_(s, 'DESTINATION_TAB_NOT_FOUND');
  const names = s.getRange(4,3,s.getLastRow()-3,1).getDisplayValues().flat();
  const rows = names.map((n,i)=>norm_(n) === norm_(student) ? i+4 : 0).filter(Boolean);
  const pos = route.autoManaged ? {row:rows[0],column:autoColumns_(expandedHeaders_(s),route)} : locateFromValues_(rows, expandedHeaders_(s), route.lesson, route.kind || detectKind_(route.code), route.code);
  require_(rows.length===1,'STUDENT_AMBIGUOUS');
  return {sheet:s, cell:s.getRange(pos.row,pos.column), row:pos.row, column:pos.column};
}
function hasFeedback_(text) {
  const s = String(text || ''), at = s.indexOf(KG.marker);
  // A plain resubmission notice is not a completed grade. A newer submission
  // must be eligible to replace it after passing the recording gate.
  if(at>=0){const body=s.slice(at+KG.marker.length).trim();if(body.startsWith('⚠ CẦN NỘP LẠI\n')&&!/Chất lượng:|•|\d+\s*%/u.test(body)&&/(?:Cô chờ bài nộp lại của con nhé\.|Con nộp lại đúng yêu cầu để cô chấm nhé\.|Cô đợi bài của con\.)$/u.test(body))return false;}
  if (at >= 0) return s.slice(at+KG.marker.length).trim().length > 0 || hasFeedback_(s.slice(0,at));
  // A late/repeated receipt is not teacher feedback. Match complete known lines;
  // unknown prose, scores or any extra line remain teacher-owned and occupied.
  const lines=s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!lines.length)return false;
  const status=/^(?:✅ ĐÃ NỘP(?: MUỘN)?|⚠️ ĐÃ NỘP MUỘN|🔁 ĐÃ NỘP \d+ LẦN(?: · MUỘN)?|— CHƯA GHI NHẬN|CHƯA NỘP)$/;
  const time=/^(?:(?:Lần đầu|Lần mới|Thời gian):\s*)?\[?\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?\]?$/;
  if(status.test(lines[0]))return lines.slice(1).some(line=>!time.test(line));
  return lines.some(line=>!time.test(line));
}
