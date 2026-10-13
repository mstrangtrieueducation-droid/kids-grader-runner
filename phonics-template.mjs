export const PHONICS_VERSION='hugo-phonics-v4';
export const PHONICS_LABELS=['Phát âm âm đang học','Âm đuôi & trọng âm','Thuộc mặt chữ'];
export const isPhonics=j=>['phonics','phonicsVideo'].includes(j.route?.kind)||/phonics|\bOP[1-4][ -]?L\d+/i.test([j.receipt?.code,j.route?.code,j.receipt?.sourceTab].join(' '));
export const PHONICS_PROMPT=`PHONICS — MẪU HUGO, THAY THẾ TIÊU CHÍ TỐC ĐỘ & NGỮ ĐIỆU CHUNG:
roseSections phải có đúng 3 mục, đúng thứ tự: Phát âm âm đang học; Âm đuôi & trọng âm; Thuộc mặt chữ.
Phát âm âm đang học: lấy đúng âm/nhóm chữ mục tiêu trong barem bài được giao, nêu cụ thể con phát âm thế nào ở từng từ nghe được, từ đúng và từ cần sửa. Không đoán âm mục tiêu từ tên Phonics chung.
Âm đuôi & trọng âm: chỉ rõ từ, âm cuối/trọng âm thực sai, IPA chuẩn nếu có, cách sửa và mốc mm:ss khi xác định được. Nếu chưa xác định mốc/IPA vẫn trả đủ lời chữa, không bịa. Không thêm lỗi nếu không nghe thấy.
Thuộc mặt chữ: nhận diện chữ, đọc từ, sight words và bài đọc/Story của đúng tiết. Phonics đọc PDF được nhìn chữ trong tài liệu cô giao. Không suy trí nhớ/thuộc lòng từ đọc trôi chảy. Nếu chỉ có audio hoặc không nhìn rõ chữ, nêu đúng phần đọc nghe được và giới hạn nhận diện, không tự chứng nhận nhìn hình/mặt chữ. Không dùng Tốc độ & ngữ điệu làm tiêu chí riêng.
rubricBand là chất lượng ước tính 0–100% dựa đủ ba mục, theo barem; không tự cho 100% khi còn thiếu căn cứ. Viết chi tiết, xưng cô/con, giữ đầy đủ từ, câu sửa và cách luyện.`;
const strings=x=>Array.isArray(x)?x:Object.values(x||{});
const ending=/âm (?:cuối|đuôi)|âm cuối|cuối từ|trọng âm|nuốt âm|missing_final|final_consonant|stress/i;
const recognition=/mặt chữ|nhận diện|nhận biết.*chữ|nhìn.*chữ|sight words/i;
const voice=/giọng|nhịp|ngữ điệu|nhạc|hào hứng|âm lượng/i;
const clean=s=>String(s||'').replace(/^\s*(?:Âm đuôi|Phát âm)\s*:\s*/i,'').trim();
const key=s=>clean(s).toLocaleLowerCase('vi').replace(/[\s.,:;!]+/g,' ').trim();
export function sectionsFromText(text){
 const matches=[...String(text||'').matchAll(/•\s*(Phát âm âm đang học|Phát âm từ\/câu|Âm đuôi & trọng âm|Thuộc mặt chữ|Trôi chảy & ngữ điệu)\s*:?[ \t]*(?:\n)?/g)];
 return matches.map((m,i)=>({label:m[1],text:text.slice(m.index+m[0].length,matches[i+1]?.index??text.length).trim()}));
}
function lessonTopic(snapshot){
 try{const ref=String(snapshot?.reference||''),start=ref.indexOf('{'),end=ref.indexOf('\nBƯỚC 0:',start);return JSON.parse(ref.slice(start,end<0?undefined:end)).content?.topic||'';}catch{return snapshot?.barem?.topic||'';}
}
// Classify the observations themselves, including replies already carrying the
// three headings. A heading alone never establishes the assessed skill.
export function phonicsSections(g,{before='',snapshot=null}={}){
 const current=sectionsFromText(before),supplied=current.length===3?current:strings(g.roseSections||g.sections);
 const blocks=[[],[],[]],seen=new Set();
 function add(text,hint='',mechanism=''){
  text=clean(text);if(!text||seen.has(key(text)))return;
  // Do not turn the saved teacher assessment into a limitation notice.
  if(/^Bài luyện:|^Qua phần ghi âm, cô nhận xét|^Cô chưa xác định|^Ở phần này, cô chưa xác định|^Đánh giá theo phần có căn cứ|^Tuy nhiên, con cần sửa những chỗ sau/i.test(text))return;
  if(voice.test(text)&&!ending.test(text)&&!recognition.test(text)&&!/đọc (?:được|đúng|đủ|trôi chảy)|hoàn thành.*(?:đọc|nội dung)/i.test(text))return;
  let i=ending.test(text+' '+mechanism)||(/ — /.test(text)&&/âm đuôi|trọng âm/i.test(hint))?1:recognition.test(text)||/đọc (?:được|đúng|đủ|trôi chảy)|hoàn thành.*(?:bài|đọc)|đánh vần/i.test(text)?2:voice.test(text)?0:/thuộc|mặt chữ/i.test(hint)?2:0;
  // Generic voice praise must not stand in for endings or word recognition.
  if(voice.test(text)&&!ending.test(text)&&!recognition.test(text)&&!/đọc (?:được|đúng|đủ|trôi chảy)|hoàn thành/i.test(text))i=0;
  if(/^(?:Tốt|Khá tốt|Đánh giá theo phần có căn cứ dưới đây)[.!]?$/i.test(text))return;
  if(seen.has(key(text)))return;seen.add(key(text));blocks[i].push(text);
 }
 const currentText=supplied.map(s=>s.text||'').join('\n');
 for(const s of supplied)for(const line of String(s.text||'').split(/\n+|(?=Con chú ý từ )/).filter(Boolean)){
  // Keep a word's explanation together; split unrelated prose sentences.
  const units=/ — |Con chú ý từ /.test(line)?[line]:line.split(/(?<=[.!?])\s+(?=(?:Con|Cô|Giọng|Tuy nhiên|Âm đuôi|Phát âm)\b)/u);
  for(const unit of units)add(unit,s.label);
 }
 for(const e of g.evidence||[]){
  if(!e.word&&!e.observed&&!e.correction)continue;
  // Existing teacher corrections take precedence; never replace them by an
  // older raw response or repeat the same word's correction a second time.
  const escaped=String(e.word||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(current.length===3&&e.mechanism==='vowel'&&escaped&&new RegExp('\\b'+escaped+'\\b','i').test(currentText)&&ending.test(e.correction||'')){
   const specific=[e.word,e.ipa,e.heardFeature,e.expectedFeature?'Con luyện rõ âm '+e.expectedFeature+'.':e.correction,e.time].filter(Boolean).join(' — ');
   if(!seen.has(key(specific))){seen.add(key(specific));blocks[0].push(specific);}
  }
  if(escaped&&new RegExp('\\b'+escaped+'\\b','i').test(currentText)&&/chú ý|chưa|thiếu|nhầm|sửa| — |cần|lưu ý/i.test(currentText))continue;
  add([e.word,e.ipa,e.observed,e.correction,e.time].filter(Boolean).join(' — '),'',e.mechanism||'');
 }
 for(const findings of Object.values(g.rubricFindings||{}))for(const f of findings.strengths||[]){
  if(f.skill==='audible_voice')continue;
  if(f.basis)add(f.basis,/letter_recognition|prompted_words|content_covered/.test(f.skill)?'Thuộc mặt chữ':'');
 }
 for(const x of g.contentChecks||[])if(x.feedback)add(x.feedback,'Thuộc mặt chữ');
 const fallback=['Con tiếp tục luyện rõ từng âm và nhóm chữ của bài nhé.','Con tiếp tục chú ý phát âm đủ âm cuối và nhấn đúng trọng âm khi luyện lại bài nhé.','Con luyện nhìn chữ, đọc từng từ và sight words, rồi đọc lại câu trong bài nhé.'];
 if(blocks[0].some(t=>/âm|vần|nhóm chữ/i.test(t)&&!/^Con tiếp tục|^Con luyện/i.test(t)))blocks[0]=blocks[0].filter(t=>!/^Con đọc rõ một số từ trong bài[.!]?$/.test(t));
 // Restore meaningful reading observations from the saved assessment. A
 // complete word ledger supports completion, without inventing visual detail.
 const savedLetters=strings(g.roseSections||g.sections).find(s=>/thuộc|mặt chữ/i.test(s.label));
 if(savedLetters?.text&&!/^Cô chưa|^Qua phần|^Con tiếp tục/i.test(savedLetters.text)){
  blocks[2]=blocks[2].filter(t=>!/^Con tiếp tục|^Con luyện|^Cô chưa/i.test(t));add(savedLetters.text,'Thuộc mặt chữ');
 }
 if(!blocks[2].length&&g.scoreLedger?.complete&&g.scoreLedger.units?.targets?.length&&!g.scoreLedger.units.unclearIndexes?.length)add('Con đọc được các từ và câu được giao trong bài.','Thuộc mặt chữ');
 return PHONICS_LABELS.map((label,i)=>({label,text:blocks[i].join('\n')||fallback[i]}));
}
export function phonicsText(g,j,before='',snapshot=null,sourceText=before){
 const sections=phonicsSections(g,{before:sourceText,snapshot}),raw=g.rubricBand||g.band||'',m=before.match(/Chất lượng:\s*(?:đạt khoảng\s*)?(\d+(?:\.\d+)?)%/i)||String(raw).match(/^(\d+(?:\.\d+)?)%$/),score=m&&Number(m[1])>=0&&Number(m[1])<=100?Number(m[1]):null;
 let date=new Date(j.receipt?.time);if(!Number.isFinite(date.getTime()))date=new Date();
 const stamp=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'}).format(date);
 const marker='— NHẬN XÉT GV —',prefix=before.includes(marker)&&before.slice(0,before.indexOf(marker)).includes('ĐÃ NỘP')?before.slice(0,before.indexOf(marker)):'✅ ĐÃ NỘP '+stamp+'\n';
 return prefix+marker+'\n'+(score===null?'':'Chất lượng: đạt khoảng '+score+'%.\n')+(score!==null&&score<75?'⚠️ Cần theo dõi\n':'')+sections.map(s=>'• '+s.label+': '+s.text).join('\n');
}
export function phonicsRich(c,cell,text){
 const builder=c.coloredFeedback_(cell,text,null).copy();
 for(const label of PHONICS_LABELS){const title='• '+label+':',start=text.indexOf(title);if(start<0)continue;const end=start+title.length;builder.setTextStyle(start,end,c.SpreadsheetApp.newTextStyle().setForegroundColor('#0D47A1').setBold(true).build());
  const next=text.indexOf('\n• ',end),bodyStart=end+1,bodyEnd=next<0?text.length:next;
  const body=text.slice(bodyStart,bodyEnd),parts=body.split(/(?<=\n)|(?<=[.!?])(?=\s+(?:Con|Cô|Tuy nhiên)\b)/u);let offset=bodyStart;
  for(const part of parts){const correction=/chưa|nhầm|thiếu|sai|nuốt|nghe:|đọc thành|Con (?:cần|chú ý|nhớ|luyện|tiếp tục)|cần sửa|lưu ý| — /i.test(part)&&!(/(?:rất tốt|phát âm (?:đúng|rõ|tốt)|đọc (?:đúng|rõ|tốt)|nhận diện.*tốt)/i.test(part)&&!/chưa|nhầm|thiếu|sai|nuốt|nghe:|đọc thành| — /i.test(part));const color=correction?'#C2185B':'#1B5E20';builder.setTextStyle(offset,offset+part.length,c.SpreadsheetApp.newTextStyle().setForegroundColor(color).build());offset+=part.length;}
 }
 const warning=text.indexOf('⚠️ Cần theo dõi');if(warning>=0)builder.setTextStyle(warning,warning+'⚠️ Cần theo dõi'.length,c.SpreadsheetApp.newTextStyle().setForegroundColor('#C2185B').build());
 return builder.build();
}
