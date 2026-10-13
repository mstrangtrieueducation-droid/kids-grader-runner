export const PHONICS_VERSION='hugo-phonics-v1';
export const PHONICS_LABELS=['Phát âm âm đang học','Âm đuôi & trọng âm','Thuộc mặt chữ'];
export const isPhonics=j=>['phonics','phonicsVideo'].includes(j.route?.kind)||/phonics|\bOP[1-4][ -]?L\d+/i.test([j.receipt?.code,j.route?.code,j.receipt?.sourceTab].join(' '));
export const PHONICS_PROMPT=`PHONICS — MẪU HUGO, THAY THẾ TIÊU CHÍ TỐC ĐỘ & NGỮ ĐIỆU CHUNG:
roseSections phải có đúng 3 mục, đúng thứ tự: Phát âm âm đang học; Âm đuôi & trọng âm; Thuộc mặt chữ.
Phát âm âm đang học: lấy đúng âm/nhóm chữ mục tiêu trong barem bài được giao, nêu cụ thể con phát âm thế nào ở từng từ nghe được, từ đúng và từ cần sửa. Không đoán âm mục tiêu từ tên Phonics chung.
Âm đuôi & trọng âm: chỉ rõ từ, âm cuối/trọng âm thực sai, IPA chuẩn nếu có, cách sửa và mốc mm:ss khi xác định được. Nếu chưa xác định mốc/IPA vẫn trả đủ lời chữa, không bịa. Không thêm lỗi nếu không nghe thấy.
Thuộc mặt chữ: nhận diện chữ, đọc từ, sight words và bài đọc/Story của đúng tiết. Phonics đọc PDF được nhìn chữ trong tài liệu cô giao. Không suy trí nhớ/thuộc lòng từ đọc trôi chảy. Nếu chỉ có audio hoặc không nhìn rõ chữ, nêu đúng phần đọc nghe được và giới hạn nhận diện, không tự chứng nhận nhìn hình/mặt chữ. Không dùng Tốc độ & ngữ điệu làm tiêu chí riêng.
rubricBand là chất lượng ước tính 0–100% dựa đủ ba mục, theo barem; không tự cho 100% khi còn thiếu căn cứ. Viết chi tiết, xưng cô/con, giữ đầy đủ từ, câu sửa và cách luyện.`;
const strings=x=>Array.isArray(x)?x:Object.values(x||{});
export function phonicsSections(g){
 const supplied=strings(g.roseSections||g.sections),exact=PHONICS_LABELS.map(label=>supplied.find(s=>String(s.label||'').replace(/^•\s*/, '').trim()===label));
 if(exact.every(Boolean))return exact.map(s=>({label:String(s.label).replace(/^•\s*/,''),text:s.text}));
 // Reconstruct historical typed replies from their saved observations only.
 const sounds=[],endings=[],letters=[];
 for(const e of g.evidence||[]){const text=[e.word,e.ipa,e.observed,e.correction,e.time].filter(Boolean).join(' — ');if(!text)continue;(/missing_final|stress/.test(e.mechanism||'')||/âm cuối|âm đuôi|trọng âm/i.test(e.correction||'')?endings:sounds).push(text);}
 for(const s of supplied){if(!s.text)continue;(/âm đuôi|trọng âm/i.test(s.label)?endings:/thuộc|mặt chữ|đọc|tốc độ|trôi chảy/i.test(s.label)?letters:sounds).push(s.text);}
 for(const [key,findings] of Object.entries(g.rubricFindings||{}))for(const f of findings.strengths||[]){const text=f.basis;if(!text)continue;(/letter_recognition|prompted_words|content_covered/.test(f.skill)?letters:sounds).push(text);}
 for(const x of g.contentChecks||[])if(x.feedback)letters.push(x.feedback);
 const blocks=[sounds,endings,letters];
 return PHONICS_LABELS.map((label,i)=>({label,text:[...new Set(blocks[i])].join('\n')||['Con luyện rõ từng âm và nhóm chữ đang học trong bài nhé.','Ở phần này, cô chưa xác định rõ lỗi âm đuôi hoặc trọng âm để nhắc con.','Cô chưa xác định rõ mức độ nhận diện mặt chữ ở phần này.'][i]}));
}
export function phonicsText(g,j,before=''){
 const sections=phonicsSections(g),raw=g.rubricBand||g.band||'',m=String(raw).match(/^(\d+(?:\.\d+)?)%$/)||before.match(/Chất lượng:\s*(?:đạt khoảng\s*)?(\d+(?:\.\d+)?)%/i),score=m&&Number(m[1])>=0&&Number(m[1])<=100?Number(m[1]):null;
 let date=new Date(j.receipt?.time);if(!Number.isFinite(date.getTime()))date=new Date();
 const stamp=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'}).format(date);
 const marker='— NHẬN XÉT GV —',prefix=before.includes(marker)&&before.slice(0,before.indexOf(marker)).includes('ĐÃ NỘP')?before.slice(0,before.indexOf(marker)):'✅ ĐÃ NỘP '+stamp+'\n';
 return prefix+marker+'\n'+(score===null?'Chất lượng: cô chưa xác định rõ phần trăm ở bài này.':'Chất lượng: đạt khoảng '+score+'%.')+(score!==null&&score<75?'\n⚠️ Cần theo dõi':'')+'\n'+sections.map(s=>'• '+s.label+'\n'+s.text).join('\n\n');
}
export function phonicsRich(c,cell,text){
 const builder=c.coloredFeedback_(cell,text,null).copy();
 for(const label of PHONICS_LABELS){const title='• '+label,start=text.indexOf(title);if(start<0)continue;const end=start+title.length;builder.setTextStyle(start,end,c.SpreadsheetApp.newTextStyle().setForegroundColor('#0D47A1').build());
  const next=text.indexOf('\n\n• ',end),bodyStart=end+1,bodyEnd=next<0?text.length:next;
  const body=text.slice(bodyStart,bodyEnd),parts=c.legacyToneSpans_?c.legacyToneSpans_(body):[{text:body,tone:'neutral'}];let offset=bodyStart;
  for(const part of parts){const color=part.tone==='correction'?'#C2185B':/chưa|không xác định|không đủ/i.test(part.text)?'#0D47A1':'#1B5E20';builder.setTextStyle(offset,offset+part.text.length,c.SpreadsheetApp.newTextStyle().setForegroundColor(color).build());offset+=part.text.length;}
 }
 const warning=text.indexOf('⚠️ Cần theo dõi');if(warning>=0)builder.setTextStyle(warning,warning+'⚠️ Cần theo dõi'.length,c.SpreadsheetApp.newTextStyle().setForegroundColor('#C2185B').build());
 return builder.build();
}
