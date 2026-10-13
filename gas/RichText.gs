const FEEDBACK_COLORS = {praise:'#1B5E20', correction:'#C2185B'};
function feedbackAttentionRange_(text){const marker=text.indexOf(KG.marker);if(marker<0)return null;const i=text.indexOf('⚠ Cần theo dõi',marker);return i<0?null:{start:i,end:i+'⚠ Cần theo dõi'.length,color:'#B71C1C'};}
const KIDS_SHEET_DISPLAY_VERSION='kids-grouped-feedback-v8-20261012';
function kidsPronunciationSentence_(e){
 const heard=String(e.observed||'').trim(),fix=String(e.correction||'').trim();
 const observation=/^Con\s/iu.test(heard)?heard:/^Đọc\s/u.test(heard)?'Con '+heard[0].toLowerCase()+heard.slice(1):'Con đọc thành '+heard;
 const ending=/[.!?]$/u.test(observation)?'':'.';
 // An identical heard/fix string is not a usable correction. Keep the recorded
 // observation and use the standard IPA already in this evidence, never ASR.
 const sound=s=>String(s).replace(/[\/\[\]ˈˌ.\s]/gu,'');
 const unchanged=sound(heard)===sound(fix);
 const feature=/^\/[\p{L}ˈˌːˑ]+\/$/u;
 const featureRepair=unchanged&&feature.test(e.expectedFeature||'')&&feature.test(e.heardFeature||'')&&e.expectedFeature!==e.heardFeature&&e.ipa.includes(e.expectedFeature.slice(1,-1));
 const advice=featureRepair?'Con đổi âm '+e.heardFeature+' thành '+e.expectedFeature+' và đọc lại cả từ '+e.ipa+'.':unchanged?'Con luyện đọc lại từ này theo cách đọc '+e.ipa+'.':/^Con\s/iu.test(fix)?fix:'Con sửa lại: '+fix;
 return 'Con chú ý từ '+e.word+' '+e.ipa+': '+observation+ending+' '+advice;
}
function kidsCompactLanguage_(grade){
 const sections=grade.sections.map(s=>({...s,spans:(validToneSpans_(s)?s.spans:legacyToneSpans_(s.text)).map(x=>({...x}))}));
 const evidence=grade.evidence||[],groups=grade.errorGroups||[];
 if(!grade.grammarReview||!evidence.length)return sections; // Legacy grades keep their wording.
 const language=evidence.filter(e=>['grammar','pronunciation'].includes(e.type));
 if(!language.length)return sections;
 const key=s=>String(s||'').normalize('NFC').toLowerCase().replace(/[‘’“”'".,:;!?()]/g,' ').replace(/\s+/g,' ').trim();
 const target=type=>type==='grammar'?(sections.find(s=>/ngữ pháp/i.test(s.label))||sections.find(s=>/ngôn ngữ|từ vựng|đọc/i.test(s.label))||sections[0]):sections.find(s=>/phát âm/i.test(s.label));
 const anchors=e=>[e.observed,e.correction,e.type==='pronunciation'?e.word:''].map(key).filter(x=>x.length>2);
 const linked=span=>{
  const t=key(span.text);
  return /^\s*(?:Lỗi lặp —|\[(?:Tệp \d+ )?\d{2,3}:[0-5]\d\]\s*(?:Ngữ pháp|Phát âm))/u.test(span.text)||language.some(e=>anchors(e).some(a=>t.includes(a)))||groups.some(g=>t.includes(key(g.label)));
 };
 // Remove redundant language summaries only from the language rubric. Keep
 // unrelated content/vocabulary/fluency reminders and neutral uncertainty.
 for(const s of sections)if(s===target('grammar')||s===target('pronunciation')){
  s.spans=s.spans.filter(span=>span.tone!=='correction'||!linked(span));
  if(s.spans.length)s.spans[s.spans.length-1].text=s.spans[s.spans.length-1].text.replace(/[,;]\s*$/u,'.');
 }
 const add=(type,text)=>{const s=target(type);require_(s,'COMPACT_LANGUAGE_SECTION_MISSING');s.spans.push({text:'\n'+text,tone:'correction'});};
 const distinct=list=>[...new Set(list.map(x=>String(x).trim()).filter(Boolean))];
 const sentence=correction=>{const t=String(correction).replace(/\s*\([^()]*\)\s*[.]?$/u,'').trim();return t||correction;};
 const used=new Set(),paragraphGroups=new Map(),pronunciationLines=new Map();
 const pronGroup=e=>{
  if(e.mechanism==='missing_final')return 'Âm đuôi';
  const index=evidence.indexOf(e),rows=grade.phoneticAudit?.items||[];
  const internal=rows.some(r=>r.evidenceIndexes?.includes(index)&&['absent','substituted'].includes(r.internalFricative));
  if(internal&&/^\/[szfvθðʃʒ]\/$/u.test(e.expectedFeature||''))return 'Âm gió giữa từ';
  return 'Phát âm';
 };
 const addPron=e=>{const label=pronGroup(e);if(!pronunciationLines.has(label))pronunciationLines.set(label,[]);const line=kidsPronunciationSentence_(e);if(!pronunciationLines.get(label).includes(line))pronunciationLines.get(label).push(line);};
 for(const group of groups){
  const members=group.evidenceIndexes.map(i=>{require_(evidence[i]?.type===group.type&&!used.has(i),'COMPACT_GROUP_INVALID');used.add(i);return evidence[i];});
  if(group.type==='pronunciation'){members.forEach(addPron);continue;}
  let detail;
  if(group.type==='grammar')detail=distinct(members.map(e=>e.observed+' → '+sentence(e.correction))).map(t=>/[.!?]$/u.test(t)?t:t+'.').join(' ');
  else detail=distinct(members.map(e=>kidsPronunciationSentence_(e))).join(' ');
  const guide=members.every(e=>e.mechanism==='missing_be')?'Con nhớ thêm động từ to be trong các câu sau:':group.guidance.replace(/^Sửa theo cấu trúc /u,'Con nhớ dùng ').replace(/^Giữ âm\/cách đọc đích /u,'Con luyện cách đọc ');
  const intro=guide!==group.guidance?guide:group.label+': '+guide;
  const groupKey=group.type+'|'+intro;
  if(!paragraphGroups.has(groupKey))paragraphGroups.set(groupKey,{type:group.type,intro,details:[]});
  paragraphGroups.get(groupKey).details.push(detail);
 }
 for(const group of paragraphGroups.values())add(group.type,'Ngữ pháp: '+group.intro+' '+group.details.join(' '));
 const seen=new Set();
 for(const [i,e] of evidence.entries()){
  if(!['grammar','pronunciation'].includes(e.type)||used.has(i))continue;
  const detail=e.type==='grammar'?e.observed+' → '+e.correction:kidsPronunciationSentence_(e);
  const id=e.type+'|'+key(detail);if(seen.has(id))continue;seen.add(id);
  if(e.type==='pronunciation')addPron(e);else add('grammar','Ngữ pháp: Con sửa câu: '+detail);
 }
 for(const label of ['Âm đuôi','Âm gió giữa từ','Phát âm'])if(pronunciationLines.has(label))add('pronunciation',label+': '+pronunciationLines.get(label).join(' '));
 // Fail rather than publish an incomplete evidence projection.
 const body=sections.flatMap(s=>s.spans).map(s=>s.text).join('\n');
 for(const [i,e] of evidence.entries())if(['grammar','pronunciation'].includes(e.type)){
  require_(body.toLowerCase().includes(e.observed.toLowerCase()),'COMPACT_ERROR_COVERAGE_MISSING');
  if(e.type==='grammar')require_(body.includes(used.has(i)?sentence(e.correction):e.correction),'COMPACT_CORRECTION_MISSING');
  else require_(body.includes(kidsPronunciationSentence_(e)),'COMPACT_IPA_MISSING');
 }
 // Praise observations already describe the strength. Avoid repeating the same
 // behavior in a second evaluative sentence; retain every corrective assessment.
 const p=grade.presentation,visual=sections.find(s=>s.label==='Phong thái & trình bày');
 if(visual&&p?.assessable&&p.observations?.length){
  const reminder=x=>x.status==='observed'&&(x.tone==='correction'||x.tone==='neutral'&&/(?:^|[\s,;])(?:nên|cần|hãy|tránh)\s/iu.test(x.assessment));
  const strength=p.observations.find(x=>x.status==='observed'&&x.tone==='praise');
  // Select one useful strength, retain EVERY supported reminder. No truncation
  // of corrections to satisfy a cosmetic sentence cap; raw observations stay.
  visual.spans=[];if(strength)visual.spans.push({text:strength.observation,tone:'praise'});
  for(const x of p.observations.filter(reminder))visual.spans.push({text:(visual.spans.length?' ':'')+(x.assessment.trim()||x.observation),tone:'correction'});
  const limits=p.observations.filter(x=>x.status!=='observed');
  if(limits.length)visual.spans.push({text:(visual.spans.length?' ':'')+limits.map(x=>x.observation).join(' '),tone:'neutral'});
  if(!visual.spans.length)visual.spans=[{text:'Chưa có vấn đề phong thái cần nhắc trong phần quan sát được.',tone:'neutral'}];
 }
 return sections.map(s=>({...s,text:s.spans.map(x=>x.text).join('')}));
}
function kidsSheetDisplaySections_(grade){
 const sections=kidsCompactLanguage_(grade);
 // Keep only actual recording corrections, not internal uncertainty messages.
 if(grade.recordingChecks?.length){
  const target=sections.find(s=>s.label==='Phong thái & trình bày')||sections[0];
  for(const text of [...new Set(grade.recordingChecks.filter(r=>r.compliance==='not_met').map(r=>r.feedback.trim()).filter(Boolean))]){
   if(target&&!target.text.includes(text)){target.spans.push({text:' '+text,tone:'correction'});target.text=target.spans.map(x=>x.text).join('');}
  }
 }
 return sections.map(section=>{
  const text=section.text,cuts=[...text.matchAll(/\[(?:(?:Tệp|File)\s+\d+\s+)?\d{2,3}:[0-5]\d\][ \t]*/giu)].map(m=>({start:text[m.index+m[0].length]===':'&&text[m.index-1]===' '?m.index-1:m.index,end:m.index+m[0].length}));
  if(!cuts.length)return kidsStudentLanguageSection_(section,!!grade.evidence?.length);
  const spans=validToneSpans_(section)?section.spans:legacyToneSpans_(text);let cursor=0;
  const projected=[];
  for(const span of spans){
   const start=cursor,end=cursor+span.text.length;let from=start,out='';cursor=end;
   for(const cut of cuts){if(cut.end<=from||cut.start>=end)continue;out+=text.slice(from,Math.max(from,cut.start));from=Math.min(end,cut.end);}
   out+=text.slice(from,end);if(out)projected.push({...span,text:out});
  }
  return kidsStudentLanguageSection_({...section,text:projected.map(s=>s.text).join(''),spans:projected},!!grade.evidence?.length);
 }).filter(s=>s.text.trim());
}
function kidsStudentLanguageSection_(section,connect=false){
 const replacements={"Con gọi tên được các hình trong phần đã đối chiếu.": "Con gọi tên được các hình trong bài.", "Con trả lời được yêu cầu về nghĩa từ trong phần đã đối chiếu.": "Con giải thích được nghĩa của từ.", "Con sử dụng được cấu trúc đang học ở các câu đã đối chiếu.": "Con đã biết dùng mẫu câu đang học.", "Con trình bày được các ý đã đối chiếu với yêu cầu bài.": "Con nêu được những ý phù hợp với bài học.", "Lời con đọc khớp với các đoạn mẫu đã đối chiếu.": "Con đọc khớp lời bài mẫu.", "Con chuyển tải được nghĩa của các ý đã đối chiếu.": "Con dịch được ý của bài.", "Các âm mục tiêu được ghi nhận đúng trong phần đã đối chiếu.": "Con đọc rõ một số từ trong bài.", "Con nói liền mạch ở các đoạn đã quan sát.": "Con có những đoạn nói liền mạch.", "Con ngắt nghỉ phù hợp ở các đoạn đã đối chiếu.": "Con biết ngắt nghỉ khi đọc.", "Con thể hiện được ngữ điệu ở các đoạn đã đối chiếu.": "Con biết lên xuống giọng khi đọc.", "Con theo kịp nhịp của các đoạn mẫu đã đối chiếu.": "Con bắt được nhịp bài mẫu.", "Giọng con đủ nghe rõ.": "Giọng con rõ, dễ nghe."};
 const internal=/đối chiếu|căn cứ|xác minh|âm mục tiêu|ghi nhận đúng|đánh giá theo phần|giới hạn|chưa xác định|chưa kết luận|chưa đủ (?:hình ảnh|quan sát)|phần quan sát được|rà ngữ pháp tệp/iu;
 const seen=new Set(),out=[];
 for(const span of (validToneSpans_(section)?section.spans:legacyToneSpans_(section.text))){
  let text=span.text;
  for(const [from,to] of Object.entries(replacements))text=text.split(from).join(to);
  text=text.replace(/từ mục tiêu/giu,'từ trong bài').replace(/câu mục tiêu/giu,'câu trong bài').replace(/âm mục tiêu/giu,'âm đang luyện');
  text=text.replaceAll('Con có những từ đọc rõ, đúng âm.','Con đọc rõ một số từ trong bài.');
  // Uncertainty is not an error. Never silently drop a confirmed correction.
  if(span.tone!=='correction'&&internal.test(text))continue;
  if(span.tone!=='correction'){
   const key=text.trim();if(seen.has(key))continue;seen.add(key);
  }
  if(text.trim())out.push({...span,text});
 }
 const firstCorrection=out.findIndex(x=>x.tone==='correction');
 if(connect&&!out[firstCorrection]?.text.startsWith('\n')&&section.label!=='Phong thái & trình bày'&&firstCorrection>0&&out.slice(0,firstCorrection).some(x=>x.tone==='praise')){
  const first=out[firstCorrection];
  if(!/^\s*(?:Tuy nhiên|Nhưng|Con chú ý sửa các câu sau)/u.test(first.text)){
   first.text=first.text.trimStart().replace(/^Con\b/u,'con');
   out.splice(firstCorrection,0,{text:' Tuy nhiên, ',tone:'correction'});
  }
 }
 return {...section,spans:out,text:out.map(x=>x.text).join('')};
}
function legacyToneSpans_(text) {
  const spans=[];
  const chunks=text.match(/[^.!?\n]+(?:[.!?]+|\n|$)|[.!?\n]+/g)||[text];
  chunks.forEach(chunk=>{
    const contrast=/\s+(?:nhưng|tuy nhiên)\b|;\s*(?=con\s+(?:nên|cần))/i.exec(chunk);
    const pieces=contrast?[chunk.slice(0,contrast.index),chunk.slice(contrast.index)]:[chunk];
    pieces.forEach(piece=>{
      const n=norm_(piece);
      const correction=/CHU Y|CAN |CON NEN |LUYEN THEM|TRÁNH|TRANH |MAC LOI|CON SAI|CHUA |THIEU |KHONG THEM|KHONG DUNG|PHAI |NHO |SUA |NHUNG|TUY NHIEN/.test(n);
      const praise=/TU TIN|TOT|RO RANG|HOAN THANH|CHINH XAC|TIEN BO|DUNG|TRÔI CHẢY|TROI CHAY|LUU LOAT|RAT HIEU|KHA ON DINH|DA KHOP|TU NHIEN/.test(n);
      spans.push({text:piece,tone:correction?'correction':praise?'praise':'neutral'});
    });
  });
  require_(spans.map(s=>s.text).join('')===text,'COLOR_TEXT_MISMATCH');
  return spans;
}
function legacyFeedbackColorRanges_(text){
 const marker=text.indexOf(KG.marker);require_(marker>=0,'LEGACY_FEEDBACK_MARKER_MISSING');
 const body=text.slice(marker+KG.marker.length);require_(/Chất lượng:\s*đạt khoảng\s+[^\n]+%/i.test(body),'LEGACY_FEEDBACK_NOT_RUBRIC');
 const alert=feedbackAttentionRange_(text),ranges=alert?[alert]:[],re=/(?:^|\n)• ([^:\n]+): ([\s\S]*?)(?=\n• |$)/g;let match;
 while((match=re.exec(body))){let cursor=marker+KG.marker.length+match.index+match[0].length-match[2].length;for(const span of legacyToneSpans_(match[2])){const color=FEEDBACK_COLORS[span.tone];if(color)ranges.push({start:cursor,end:cursor+span.text.length,color});cursor+=span.text.length;}}
 require_(ranges.length,'LEGACY_FEEDBACK_NO_SEMANTIC_COLORS');return ranges;
}
function validToneSpans_(section) {
  return Array.isArray(section.spans) && section.spans.length>0 && section.spans.length<=100 &&
    section.spans.every(s=>typeof s.text==='string' && s.text.length>0 && ['praise','correction','neutral'].includes(s.tone)) &&
    section.spans.map(s=>s.text).join('')===section.text;
}
function feedbackColorRanges_(text,grade) {
  const alert=feedbackAttentionRange_(text),ranges=alert?[alert]:[];
  if(text.startsWith('✅ ĐÃ NỘP')) ranges.push({start:0,end:'✅ ĐÃ NỘP'.length,color:FEEDBACK_COLORS.praise});
  if(!grade || !grade.assessable) return ranges;
  const feedback=feedbackText_(grade), marker=text.indexOf(KG.marker),offset=text.indexOf(feedback,marker>=0?marker+KG.marker.length:0);
  // Status prefixes vary (late, repeated); whitespace added by a tracker is framing.
  require_(offset>=0 && text.slice(offset+feedback.length).trim()==='' && (marker<0||text.slice(marker+KG.marker.length,offset).trim()===''),'COLOR_GRADE_MISMATCH');
  let cursor=offset+feedbackHeading_(grade).length;
  const displaySections=kidsSheetDisplaySections_(grade);
  displaySections.forEach((section,index)=>{
    cursor+=('• '+section.label+': ').length;
    const spans=validToneSpans_(section)?section.spans:legacyToneSpans_(section.text);
    spans.forEach(span=>{
      const color=FEEDBACK_COLORS[span.tone];
      if(color) ranges.push({start:cursor,end:cursor+span.text.length,color});
      cursor+=span.text.length;
    });
    if(index<displaySections.length-1) cursor++;
  });
  require_(cursor===offset+feedback.length,'COLOR_OFFSETS_INVALID');
  return ranges;
}
function coloredFeedback_(cell,text,grade) {
  const previous=cell.getRichTextValue();
  const same=previous && previous.getText()===text;
  const builder=same?previous.copy():SpreadsheetApp.newRichTextValue().setText(text).setTextStyle(cell.getTextStyle());
  const ranges=feedbackColorRanges_(text,grade);
  const runs=same?previous.getRuns():[];
  // Retain the exact tracker-owned prefix styling when adding a new feedback block.
  if(!same&&previous){const old=previous.getText();let common=0;while(common<old.length&&common<text.length&&old[common]===text[common])common++;previous.getRuns().forEach(run=>{const end=Math.min(common,run.getEndIndex());if(run.getStartIndex()<end){builder.setTextStyle(run.getStartIndex(),end,run.getTextStyle());const link=run.getLinkUrl();if(link)builder.setLinkUrl(run.getStartIndex(),end,link);}});}
  ranges.forEach(range=>{
    if(!same) {
      builder.setTextStyle(range.start,range.end,cell.getTextStyle().copy().setForegroundColor(range.color).build());
      return;
    }
    // Change foreground only, retaining each existing font, emphasis and hyperlink.
    runs.forEach(run=>{
      const start=Math.max(range.start,run.getStartIndex()),end=Math.min(range.end,run.getEndIndex());
      if(start<end) builder.setTextStyle(start,end,run.getTextStyle().copy().setForegroundColor(range.color).build());
    });
  });
  return builder.build();
}
function verifyFeedbackColors_(cell,text,grade) {
  const rich=cell.getRichTextValue();
  require_(rich && rich.getText()===text,'COLOR_READBACK_TEXT_FAILED');
  feedbackColorRanges_(text,grade).forEach(range=>{
    rich.getRuns().forEach(run=>{
      if(run.getStartIndex()<range.end && run.getEndIndex()>range.start)
        require_(run.getTextStyle().getForegroundColor().toUpperCase()===range.color.toUpperCase(),'COLOR_READBACK_STYLE_FAILED');
    });
  });
}
