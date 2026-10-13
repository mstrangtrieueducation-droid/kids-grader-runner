const KIDS_REVIEW_VERSION='kids-rubric-evidence-v15-20261013';
const KIDS_VISUAL_POLICY_VERSION='recording-delivery-gate-v2-20261012';
const KIDS_TASK_CONTRACTS=Object.freeze({
 grammar:'Đối chiếu mẫu câu/cấu trúc Unit; rà từng câu, chia động từ và âm đuôi; không dùng thuộc câu thay đúng ngữ pháp.',
 vocabulary:'Đối chiếu danh sách từ và nhiệm vụ nghĩa/ứng dụng; đọc từ không chứng minh hiểu nghĩa. Ngữ pháp chỉ áp dụng nếu con nói câu.',
 phonics:'PHONICS THEO SÁCH 1–4, mã OP1–OP4: đọc file học/PDF được giao, đối chiếu đúng âm/chữ, ghép âm, từ và câu thực có trong bài. Phân biệt tên chữ với âm chữ theo mẫu, không bắt đọc thêm tên/âm ngoài yêu cầu. Không ép thuộc từ, dịch nghĩa, tự nói hay lồng tiếng. Ngữ pháp chỉ áp dụng với câu; không phạt cấu trúc có sẵn trong mẫu.',
 reading:'Đối chiếu đọc đủ/đúng lời, phát âm, ngắt nghỉ; tách lỗi đọc đổi lời với lỗi có sẵn trong văn bản. Không suy hiểu nội dung từ đọc trôi chảy.',
 translation:'Đối chiếu cả lời đọc và từng ý dịch; chấp nhận cách diễn đạt tương đương đúng nghĩa, không ép nguyên văn; rà câu tiếng Anh.',
 de:'Xác minh nhiệm vụ thực trong đề là lời theo hình, đọc/lồng tiếng hay tự trình bày; rà đủ nội dung/khớp lời, NGỮ PHÁP VÀ PHÁT ÂM, trôi chảy/ngữ điệu. Không coi thuộc lời/tự nói đã được chứng minh nếu video không cho kiểm tra. Câu sai phải có câu thực nói và câu sửa, không khen chung thay đánh giá.',
 peppa:'Đối chiếu lời/nhịp phim/giọng học sinh và mẫu; ghi từ/cụm bỏ/thêm/đổi. Không yêu cầu ngôn ngữ cơ thể, nhìn camera hoặc tự sáng tạo lời; hình ảnh và biểu cảm nhân vật trong phim không phải của học sinh.',
 phonicsVideo:'PHONICS VIDEO TỰ LUYỆN, mã PHONICS-VIDEO: lồng tiếng toàn bài theo bản tách giọng; đối chiếu âm mục tiêu trong từng từ/câu, âm cuối, trọng âm, ngữ điệu và thời điểm vào câu. Không coi chỉ đọc danh sách từ là đủ video, không áp rubric tự thuyết trình hoặc bài PDF. Tách giọng học sinh khỏi giọng mẫu/nhạc; chưa phân biệt được thì ghi hạn chế, không công nhận giọng mẫu là con đọc đúng.',
 scienceK:'Đúng kiến thức và nói theo hình; rà từng câu từ vựng/ngữ pháp/phát âm. Đọc từ hoặc nói đúng vài hình không chứng minh hiểu toàn bài; phong thái chỉ từ hình học sinh thấy rõ, không suy tự nói từ trôi chảy.',
 science:'Đối chiếu từng ý mindmap và từng câu hỏi được giao riêng; chấp nhận diễn đạt khác mẫu đúng nghĩa, không xem nói lưu loát là hiểu đúng hay đã chứng minh nói độc lập; rà ngữ pháp mọi câu và cách quay theo đề.',
 critical:'Đối chiếu luận điểm, lý do, ví dụ và quan hệ ý theo đề/mindmap; chấp nhận lập luận đúng bằng lời riêng, tách tính đúng của lập luận với việc chưa xác minh đọc chữ/tự nói; rà ngữ pháp và trình bày có dẫn chứng.'
});
function kidsReviewPlan_(snapshot){
 const ref=String(snapshot.reference||''),source=String(snapshot.guide||'')+'\n'+ref;
 const start=/Câu hỏi của bài[^?]{0,180}/i.exec(ref);
 let questions=[];
 if(start){
  const block=ref.slice(start.index).split(/Video mẫu|Yêu cầu Video|Bước\s*[5-9]/i)[0].slice(0,6000);
  const found=block.match(/\b(?:What|Why|Where|When|Who|Which|How|Can|Does|Do|Is|Are)\b[^?\n]{1,400}\?/g)||[];
  questions=[...new Set(found.map(q=>q.replace(/\s+/g,' ').trim()))];
 }
 // Generic lesson instructions can mention mindmaps while the actual assigned
 // submission is a picture vocabulary task. Use the verified task contract.
 const contract=kidsTaskContract_(snapshot);
 const mindmap=['mindmap_qa','mindmap_presentation'].includes(contract.mode)||contract.mode!=='not_assigned'&&['science','critical'].includes(snapshot.kind)&&/mindmap|mind map|sơ đồ tư duy/i.test(source);
 return {kind:snapshot.kind,mindmap,questions:(mindmap||contract.mode==='explain_pictures')?questions:[]};
}
function validateKidsRubricDraft_(g,snapshot){
 prepareKidsEvidenceDraft_(g,snapshot);
 if(!g.assessable)return;
 const sections=Array.isArray(g.sections)?g.sections:Object.values(g.sections||{});
 const phonetic=/phát âm|âm (?:cuối|đuôi|đầu)|trọng âm|nguyên âm|phụ âm/iu;
 const evidence=(g.evidence||[]).filter(e=>e.type==='pronunciation');
 for(const e of evidence)require_(!/^(?:con\s+)?(?:chưa|không)\s+bật\s+(?:rõ|hơi)/iu.test(String(e.observed||'').trim()),'GRADE_UNRELEASED_STOP_NOT_ERROR_EVIDENCE');
 for(const s of sections){
  if(/^(?:Thuộc từ & nhớ nghĩa|Thuộc mặt chữ|Ngữ pháp|Dịch đúng, đủ ý|Đọc đúng, đủ nội dung)$/u.test(s.label))require_(!phonetic.test(s.text),'GRADE_RUBRIC_PRONUNCIATION_MISPLACED');
  const spans=validToneSpans_(s)?s.spans:legacyToneSpans_(s.text);
  for(const p of spans){
   const specificAdvice=/chú ý|cần|hãy|chưa|sai|thiếu|bỏ|mất|nhầm|luyện lại/iu.test(p.text);
   if(phonetic.test(p.text)&&(p.tone==='correction'||p.tone==='praise'&&specificAdvice)){
    const coaching=p.tone==='neutral'&&p.text.trim().startsWith('Gợi ý luyện tập chung (không phải lỗi đã xác nhận):');
    require_(coaching||evidence.some(e=>e.word?.trim()&&p.text.toLowerCase().includes(e.word.toLowerCase())&&/^\/[^/\n]+\/$/.test(e.ipa||'')&&e.observed?.trim()&&e.correction?.trim()),'GRADE_PRONUNCIATION_CLAIM_UNSUPPORTED');
   }
   if(p.tone==='praise'&&phonetic.test(p.text)&&/tất cả|mọi từ|toàn bộ|hoàn toàn chính xác/iu.test(p.text))require_(!evidence.length&&!(g.uncertainty||[]).length,'GRADE_PRONUNCIATION_PRAISE_CONTRADICTION');
  }
 }
 if(snapshot?.kind==='vocabulary'){
  const v=g.vocabularyAssessment;
  require_(v&&['read_text','name_picture','recall','translate','use_in_sentence','mixed','unclear'].includes(v.mode)&&['demonstrated','partial','not_tested','unclear'].includes(v.meaningStatus)&&typeof v.observed==='string'&&v.observed.trim(),'GRADE_VOCABULARY_BASIS_MISSING');
  require_(v.mode!=='read_text'||['not_tested','unclear'].includes(v.meaningStatus),'GRADE_VOCABULARY_MEANING_UNPROVEN');
  require_(!(v.englishAnswerVisible===true&&['name_picture','recall'].includes(v.mode)),'GRADE_VOCABULARY_VISIBLE_ANSWER_NOT_RECALL');
  require_(!(g.scene?.type==='audio_only'&&v.mode==='name_picture'),'GRADE_VOCABULARY_PICTURE_NOT_OBSERVED');
  const s=sections.find(s=>s.label==='Thuộc từ & nhớ nghĩa');
  if(['not_tested','unclear'].includes(v.meaningStatus))require_(!/(?:con|em)\s+(?:đã\s+)?(?:nhớ|hiểu|nắm vững|thuộc)(?:\s+(?:đúng|rõ|rất tốt|tốt))?\s+(?:nghĩa|từ|bài)/iu.test(s?.text||''),'GRADE_VOCABULARY_MEANING_UNPROVEN');
 }
}
function validateKidsReview_(g,fileCount,snapshot){
 validateKidsErrorGroups_(g);
 validateKidsLanguageVisual_(g,fileCount);
 // Legacy successful responses have no review fields and must not be billed again.
 if(g.contentChecks===undefined&&g.uncertainty===undefined)return;
 require_(Array.isArray(g.contentChecks)&&Array.isArray(g.uncertainty)&&typeof g.contentSourceLimitation==='string','GRADE_REVIEW_INVALID');
 const location=(x,allowUnknown)=>Number.isInteger(x.fileIndex)&&((x.fileIndex>=0&&x.fileIndex<fileCount&&/^\d{2,3}:[0-5]\d$/.test(x.time))||(allowUnknown&&x.fileIndex===-1&&x.time===''));
 const seen=new Set();
 for(const x of g.contentChecks){
  const id=x.task+':'+x.itemNumber;
  require_(['mindmap','question'].includes(x.task)&&Number.isInteger(x.itemNumber)&&x.itemNumber>0&&!seen.has(id)&&typeof x.item==='string'&&x.item.trim()&&['correct','partial','incorrect','missing','unclear'].includes(x.status)&&typeof x.heard==='string'&&typeof x.feedback==='string'&&x.feedback.trim(),'GRADE_CONTENT_CHECK_INVALID');seen.add(id);
  // No speech was quoted for a missing item. A model's placeholder timestamp
  // does not become evidence and must not block otherwise valid observations.
  if(x.status==='missing'&&x.heard===''){
   if(x.fileIndex!==-1||x.time!==''){g.missingLocationAudit=g.missingLocationAudit||[];g.missingLocationAudit.push({task:x.task,itemNumber:x.itemNumber,fileIndex:x.fileIndex,time:x.time});}
   x.fileIndex=-1;x.time='';
  }
  require_(location(x,['missing','unclear'].includes(x.status)),'GRADE_CONTENT_CHECK_LOCATION_INVALID');
  if(['correct','partial','incorrect'].includes(x.status))require_(x.heard.trim(),'GRADE_CONTENT_CHECK_OBSERVATION_REQUIRED');
  if(x.status==='missing')require_(x.fileIndex===-1&&x.time===''&&x.heard==='','GRADE_CONTENT_MISSING_WITH_OBSERVATION');
 }
 for(const x of g.uncertainty)require_(location(x,true)&&typeof x.phrase==='string'&&x.phrase.trim()&&typeof x.reason==='string'&&x.reason.trim(),'GRADE_UNCERTAINTY_INVALID');
 if(snapshot){
  const plan=kidsReviewPlan_(snapshot),checks=g.contentChecks.filter(x=>x.task==='question');
  if(plan.questions.length){
   require_(checks.length===plan.questions.length,'GRADE_QUESTION_COVERAGE_INCOMPLETE');
   checks.forEach(x=>require_(plan.questions[x.itemNumber-1]&&norm_(x.item)===norm_(plan.questions[x.itemNumber-1]),'GRADE_QUESTION_SOURCE_MISMATCH'));
  }
  if(plan.mindmap)require_(g.contentChecks.some(x=>x.task==='mindmap')||g.contentSourceLimitation.trim(),'GRADE_MINDMAP_REVIEW_MISSING');
 }
}
function kidsErrorGroupText_(g,group){
 const members=group.evidenceIndexes.map(i=>g.evidence[i]);
 const examples=members.slice(0,2).map(e=>'[Tệp '+(e.fileIndex+1)+' '+e.time+'] '+e.observed+' → '+e.correction).join('; ');
 const words=group.type==='pronunciation'?' Từ cần luyện: '+[...new Set(members.map(e=>e.word+' '+e.ipa))].join(', ')+'.':'';
 return '\nLỗi lặp — '+group.label+': '+group.guidance+' Ví dụ: '+examples+'.'+words;
}
function kidsGroupedEvidence_(g,index){
 return !!g.errorGroupsRendered&&(g.errorGroups||[]).some(group=>group.evidenceIndexes.includes(index)&&g.sections.some(s=>s.text.includes(kidsErrorGroupText_(g,group))));
}
function validateKidsErrorGroups_(g,requireRendered=true){
 if(g.errorGroups===undefined)return; // Reuse legacy successful generations.
 require_(Array.isArray(g.errorGroups)&&g.errorGroups.length<=100,'GRADE_ERROR_GROUPS_INVALID');
 const used=new Set();for(const group of g.errorGroups){
  require_(['grammar','pronunciation'].includes(group.type)&&typeof group.label==='string'&&group.label.trim()&&typeof group.guidance==='string'&&group.guidance.trim()&&Array.isArray(group.evidenceIndexes)&&group.evidenceIndexes.length>=2,'GRADE_ERROR_GROUP_INVALID');
  const positions=new Set();for(const index of group.evidenceIndexes){require_(Number.isInteger(index)&&index>=0&&index<(g.evidence||[]).length&&!used.has(index)&&g.evidence[index].type===group.type,'GRADE_ERROR_GROUP_MEMBERS_INVALID');used.add(index);const e=g.evidence[index];require_(typeof e.observed==='string'&&e.observed.trim()&&typeof e.correction==='string'&&e.correction.trim(),'GRADE_ERROR_GROUP_EVIDENCE_INVALID');positions.add(e.fileIndex+'|'+e.time+'|'+e.observed);if(group.type==='pronunciation')require_(typeof e.word==='string'&&e.word.trim()&&/^\/[^\n/<>]+\/$/.test(e.ipa||''),'GRADE_PRONUNCIATION_IPA_REQUIRED');}
  require_(positions.size>=2,'GRADE_ERROR_GROUP_NOT_REPEATED');
  if(requireRendered)require_(g.errorGroupsRendered&&g.sections.some(s=>s.text.includes(kidsErrorGroupText_(g,group))),'GRADE_ERROR_GROUP_NOT_RENDERED');
 }
}
function normalizeKidsErrorGroups_(g){
 if(g.errorGroups===undefined||g.errorGroupsRendered)return;
 validateKidsErrorGroups_(g,false);
 for(const group of g.errorGroups){
  const section=group.type==='grammar'?(g.sections.find(s=>/ngữ pháp/i.test(s.label))||g.sections.find(s=>/ngôn ngữ|từ vựng|đọc/i.test(s.label))||g.sections[0]):g.sections.find(s=>/phát âm/i.test(s.label));
  require_(section,'GRADE_ERROR_GROUP_SECTION_MISSING');
  const detail=kidsErrorGroupText_(g,group),spans=validToneSpans_(section)?section.spans:legacyToneSpans_(section.text);
  section.text+=detail;section.spans=spans.concat([{text:detail,tone:'correction'}]);
 }
 g.errorGroupsRendered=KIDS_REVIEW_VERSION;
}
function normalizeKidsReview_(g){
 if(g.reviewRendered||g.contentChecks===undefined&&g.uncertainty===undefined)return;
 const append=(section,text,tone)=>{if(!section)return;const spans=validToneSpans_(section)?section.spans:[{text:section.text,tone:'neutral'}];section.text+=text;section.spans=spans.concat([{text,tone}]);};
 const grammar=(g.sections||[]).find(s=>/ngữ pháp/i.test(s.label))||(g.sections||[]).find(s=>/ngôn ngữ|từ vựng/i.test(s.label))||g.sections?.[0];
 // Never let a detected grammar error disappear inside a combined rubric label.
 for(const [i,e] of (g.evidence||[]).entries())if(e.type==='grammar'&&!kidsGroupedEvidence_(g,i)&&!(g.sections||[]).some(s=>s.text.includes(e.observed)&&s.text.includes(e.correction)))append(grammar,'\n[Tệp '+(e.fileIndex+1)+' '+e.time+'] Ngữ pháp — Con nói: '+e.observed+' → Sửa: '+e.correction,'correction');
 const content=(g.sections||[]).find(s=>/nội dung|thuộc lời|đọc đúng/i.test(s.label))||g.sections?.[0];
 const labels={correct:'Đúng',partial:'Còn thiếu ý',incorrect:'Cần sửa',missing:'Chưa trả lời/trình bày',unclear:'Chưa xác định'};
 for(const x of g.contentChecks||[]){
  if(x.status==='unclear')continue; // Internal uncertainty is retained in the saved record.
  const tone=x.status==='correct'?'praise':x.status==='unclear'?'neutral':'correction';
  const loc=x.fileIndex>=0?' [Tệp '+(x.fileIndex+1)+' '+x.time+']':'';
  append(content,'\n'+(x.task==='question'?'Câu ':'Ý ')+x.itemNumber+' ('+x.item+'): '+labels[x.status]+loc+' — '+x.feedback,tone);
 }
 const pronunciation=(g.sections||[]).find(s=>/phát âm/i.test(s.label))||g.sections?.[0];
 g.reviewRendered=KIDS_REVIEW_VERSION;
}
function normalizeKidsPresentation_(g){
 const p=g.presentation;if(!p||p.observations===undefined)return; // Saved legacy grade, no new call.
 require_(Array.isArray(p.observations),'GRADE_VISUAL_OBSERVATIONS_INVALID');
 if(g.recordingChecks!==undefined){
  validateKidsRecording_(g,undefined,false);
  // Contradictory or unverifiable visual praise becomes a neutral limitation.
  // Original model observations remain in the audit, never silently discarded.
  p.recordingExcludedObservations=p.recordingExcludedObservations||[];
  p.observations=p.observations.map(x=>{
   const r=g.recordingChecks.find(r=>r.fileIndex===x.fileIndex);
   if(x.status!=='observed')return x;
   const unsupported=!r||r.speakerInFrame!=='clear'||x.aspect==='gaze'&&(!x.gazeBasis?.trim()||!['camera','reference','audience'].includes(x.gazeTarget)||x.gazeTarget==='camera'&&!r.cameraGazeVerifiable);
   if(!unsupported)return x;
   p.recordingExcludedObservations.push({...x});
   return {...x,status:'unclear',tone:'neutral',observation:x.aspect==='gaze'?'Chưa đủ hình ảnh để xác minh hướng nhìn của con.':'Chưa đủ hình ảnh để đánh giá cử chỉ hoặc tư thế của con.',assessment:''};
  });
 }
 if(g.performanceWindows!==undefined){
  validateKidsTemporalVisual_(g);
  p.excludedObservations=(p.excludedObservations||[]).concat(p.observations.filter(x=>x.phase!=='during_task'));
  p.observations=p.observations.filter(x=>x.phase==='during_task');
  g.visualPolicyVersion=KIDS_VISUAL_POLICY_VERSION;
 }
 if(g.scene?.type!=='student_visible'){require_(p.observations.length===0&&!p.assessable&&!p.text?.trim(),'GRADE_VISUAL_CONTEXT_INVALID');return;}
 const labels={gaze:'Ánh mắt/hướng nhìn',gestures:'Cử chỉ',posture:'Tư thế'};
 p.assessable=p.observations.some(x=>x.status==='observed');
 const spans=p.observations.map((x,i)=>({text:(i?'\n':'')+(labels[x.aspect]||x.aspect)+(x.fileIndex>=0?' [Tệp '+(x.fileIndex+1)+' '+x.time+']':'')+': '+x.observation+(x.assessment.trim()?' — '+x.assessment:''),tone:x.status==='observed'?x.tone:'neutral'}));
 p.text=p.assessable?spans.map(x=>x.text).join(''):'';p.spans=p.assessable?spans:[];
 if(!p.assessable)p.reason=spans.length?spans.map(x=>x.text).join(''):(g.performanceWindows!==undefined?'Chưa đủ quan sát trong phần làm bài để nhận xét phong thái.':p.reason||'Chưa đủ hình ảnh rõ để đánh giá ánh mắt, cử chỉ và tư thế.');
 if(g.protocol==='typed-evidence-v2'&&!p.assessable)p.reason='Chưa đủ căn cứ quan sát để đánh giá giao tiếp mắt và phong thái.';
 const previous=g.sections?.find?.(s=>s.label==='Phong thái & trình bày');if(previous){previous.text=p.assessable?p.text:p.reason;previous.spans=p.assessable?p.spans:[{text:p.reason,tone:'neutral'}];}
}
function validateKidsLanguageVisual_(g,fileCount){
 if(g.recordingChecks!==undefined)validateKidsRecording_(g,fileCount);
 if(g.performanceWindows!==undefined)validateKidsTemporalVisual_(g,fileCount);
 if(g.grammarReview===undefined&&g.presentation?.observations===undefined)return;
 require_(Array.isArray(g.grammarReview)&&g.grammarReview.length===fileCount,'GRADE_GRAMMAR_COVERAGE_INCOMPLETE');
 const seen=new Set();for(const x of g.grammarReview){
  require_(Number.isInteger(x.fileIndex)&&x.fileIndex>=0&&x.fileIndex<fileCount&&!seen.has(x.fileIndex)&&['errors_found','no_clear_error','unclear','not_applicable'].includes(x.status)&&typeof x.summary==='string'&&x.summary.trim(),'GRADE_GRAMMAR_REVIEW_INVALID');seen.add(x.fileIndex);
  const errors=(g.evidence||[]).filter(e=>e.type==='grammar'&&e.fileIndex===x.fileIndex);
  require_((x.status==='errors_found')===!!errors.length,'GRADE_GRAMMAR_EVIDENCE_MISMATCH');
  for(const e of errors)require_(kidsGroupedEvidence_(g,g.evidence.indexOf(e))||g.sections.some(s=>s.text.includes(e.observed)&&s.text.includes(e.correction)),'GRADE_GRAMMAR_NOT_RENDERED');
 }
 const p=g.presentation;require_(p&&Array.isArray(p.observations),'GRADE_VISUAL_OBSERVATIONS_INVALID');
 if(g.scene?.type!=='student_visible'){require_(!p.observations.length&&!p.assessable,'GRADE_VISUAL_CONTEXT_INVALID');return;}
 require_(p.observations.length<=3&&new Set(p.observations.map(x=>x.aspect)).size===p.observations.length,'GRADE_VISUAL_DUPLICATE_ASPECT');
 for(const x of p.observations){
  const located=Number.isInteger(x.fileIndex)&&x.fileIndex>=0&&x.fileIndex<fileCount&&/^\d{2,3}:[0-5]\d$/.test(x.time);
  require_(['gaze','gestures','posture'].includes(x.aspect)&&['observed','unclear','not_visible'].includes(x.status)&&typeof x.observation==='string'&&x.observation.trim()&&typeof x.assessment==='string'&&(x.assessment.trim()||x.tone!=='correction')&&['praise','correction','neutral'].includes(x.tone),'GRADE_VISUAL_OBSERVATION_INVALID');
  require_(x.status==='observed'?located:located||x.fileIndex===-1&&x.time==='','GRADE_VISUAL_LOCATION_INVALID');
  if(x.status!=='observed')require_(x.tone==='neutral','GRADE_VISUAL_UNCERTAIN_PRAISE');
 }
 require_(!!p.assessable===p.observations.some(x=>x.status==='observed'),'GRADE_VISUAL_ASSESSABLE_MISMATCH');
 require_(!g.sections.some(s=>s.label!=='Phong thái & trình bày'&&/ánh mắt|ngôn ngữ cơ thể|ngôn ngữ hình thể|tư thế|nhìn.*camera/i.test(s.text)),'GRADE_VISUAL_OUTSIDE_PRESENTATION');
}
function validateKidsRecording_(g,fileCount,checkObservations=true){
 require_(Array.isArray(g.recordingChecks)&&(fileCount===undefined||g.recordingChecks.length===fileCount),'GRADE_RECORDING_COVERAGE_INVALID');
 const seen=new Set();
 for(const r of g.recordingChecks){
  require_(Number.isInteger(r.fileIndex)&&r.fileIndex>=0&&(fileCount===undefined||r.fileIndex<fileCount)&&!seen.has(r.fileIndex),'GRADE_RECORDING_FILE_INVALID');seen.add(r.fileIndex);
  require_(['fixed_student','handheld_self','handheld_other','screen_book','mixed','audio_only','unclear'].includes(r.recordingMode)&&['clear','partial','not_visible','unclear'].includes(r.speakerInFrame)&&typeof r.cameraGazeVerifiable==='boolean'&&typeof r.basis==='string'&&r.basis.trim(),'GRADE_RECORDING_CONTEXT_INVALID');
  require_(['visible_reading','visible_prompt','not_determinable'].includes(r.textUseStatus)&&typeof r.textUseBasis==='string'&&r.textUseBasis.trim(),'GRADE_DELIVERY_BASIS_INVALID');
  require_(['face_presentation','screen_voiceover','reading','audio','unspecified'].includes(r.requirement)&&typeof r.requirementBasis==='string'&&['met','not_met','unclear','not_applicable'].includes(r.compliance)&&typeof r.feedback==='string','GRADE_RECORDING_REQUIREMENT_INVALID');
  require_(r.requirement==='unspecified'?['unclear','not_applicable'].includes(r.compliance):!!r.requirementBasis.trim(),'GRADE_RECORDING_REQUIREMENT_UNGROUNDED');
  require_(r.compliance!=='not_met'||r.feedback.trim(),'GRADE_RECORDING_GUIDANCE_MISSING');
  require_(!r.cameraGazeVerifiable||r.speakerInFrame==='clear'&&!['screen_book','audio_only','unclear'].includes(r.recordingMode),'GRADE_GAZE_CONTEXT_CONTRADICTION');
 }
 const text=(g.sections||[]).filter(s=>s.label!=='Phong thái & trình bày').map(s=>s.text).join('\n');
 require_(!/tự tin|biểu cảm (?:gương mặt|khuôn mặt)|giao tiếp (?:mắt|ánh mắt)|nhìn thẳng (?:vào )?(?:camera|máy quay)/iu.test(text),'GRADE_VISUAL_OUTSIDE_PRESENTATION');
 // Even a clear face cannot establish the absence of an off-screen script.
 require_(!/(?:con|em)\s+(?:(?:đã|rất|hoàn toàn)\s+)?(?:tự thuyết trình|không đọc chữ|thuộc (?:hết|toàn bộ)(?: lời| bài)?)/iu.test(text),'GRADE_INDEPENDENT_DELIVERY_UNPROVEN');
 for(const s of (g.sections||[]).filter(s=>/thuộc lời|tự nói/iu.test(s.label))){
  const praise=(validToneSpans_(s)?s.spans:legacyToneSpans_(s.text)).filter(p=>p.tone==='praise').map(p=>p.text).join(' ');
  require_(!/ghi nhớ|thuộc (?:lời|bài|hết|toàn bộ)|tự (?:nói|thuyết trình)|không đọc chữ/iu.test(praise),'GRADE_DELIVERY_MEMORY_UNPROVEN');
 }
 for(const x of checkObservations?g.presentation?.observations||[]:[])if(x.aspect==='gaze'&&x.status==='observed'){
  require_(['camera','reference','audience'].includes(x.gazeTarget)&&typeof x.gazeBasis==='string'&&x.gazeBasis.trim(),'GRADE_GAZE_BASIS_MISSING');
  require_(x.gazeTarget!=='camera'||g.recordingChecks.find(r=>r.fileIndex===x.fileIndex)?.cameraGazeVerifiable===true,'GRADE_GAZE_NOT_VERIFIABLE');
  const affirmative=String(x.observation).split(/[.;\n]/u).map(s=>s.replace(/(?:thay vì|chứ không|không phải)[^.;\n]*/giu,'').replace(/(?:không|chưa|ít)\s+(?:(?:thường xuyên|thẳng|trực tiếp)\s+)*(?:nhìn|hướng)[^,.;\n]*/giu,'')).join('. ');
  require_(!(x.gazeTarget!=='camera'&&/(?:nhìn|hướng).*?(?:camera|ống kính|máy quay)/iu.test(affirmative)),'GRADE_GAZE_TARGET_CONTRADICTION');
 }
}
function validateKidsTemporalVisual_(g,fileCount){
 const seconds=t=>/^\d{2,3}:[0-5]\d$/.test(t)?Number(t.split(':')[0])*60+Number(t.split(':')[1]):NaN;
 require_(Array.isArray(g.performanceWindows),'GRADE_TASK_WINDOWS_INVALID');
 for(const w of g.performanceWindows)require_(Number.isInteger(w.fileIndex)&&w.fileIndex>=0&&(fileCount===undefined||w.fileIndex<fileCount)&&Number.isFinite(seconds(w.startTime))&&seconds(w.endTime)>seconds(w.startTime),'GRADE_TASK_WINDOW_INVALID');
 for(const x of g.presentation?.observations||[]){
  require_(['during_task','before_task','after_task','unclear'].includes(x.phase)&&['single','repeated','unclear'].includes(x.repetition)&&Array.isArray(x.supportTimes)&&['standing','seated','unclear','not_applicable'].includes(x.posture)&&typeof x.postureBasis==='string','GRADE_VISUAL_SCOPE_INVALID');
  if(x.phase!=='during_task')continue; // Kept in raw audit; never student feedback.
  if(x.status!=='observed'){require_(x.tone==='neutral','GRADE_VISUAL_UNCERTAIN_PRAISE');continue;}
  // Include the existing primary observation location; never invent a time.
  const times=[...new Set([x.time,...x.supportTimes])];
  require_(times.length>=1&&times.includes(x.time)&&times.every(t=>Number.isFinite(seconds(t))&&g.performanceWindows.some(w=>w.fileIndex===x.fileIndex&&seconds(t)>=seconds(w.startTime)&&seconds(t)<=seconds(w.endTime))),'GRADE_VISUAL_OUTSIDE_TASK');
  const text=x.observation; // Recommendations are not claims of observed frequency.
  require_(!/suốt (?:bài|quá trình|thời lượng)|toàn bộ (?:bài|thời lượng)|từ đầu đến cuối/iu.test(text),'GRADE_VISUAL_OVERGENERALIZED');
  const repeated=/đôi lúc|thi thoảng|thỉnh thoảng|thường xuyên|liên tục|nhiều lần/iu.test(text);
  require_(!(x.repetition==='repeated'||repeated)||(x.repetition==='repeated'&&times.length>=2),'GRADE_VISUAL_REPETITION_UNSUPPORTED');
  if(x.aspect==='posture'){
   require_(['standing','seated'].includes(x.posture)&&x.postureBasis.trim(),'GRADE_POSTURE_BASIS_MISSING');
   require_(/chân|đầu gối|hông|thân dưới|ghế|mặt ngồi/iu.test(x.postureBasis),'GRADE_POSTURE_LOWER_BODY_NOT_OBSERVED');
   require_(!(x.posture==='standing'&&/\bngồi\b/iu.test(x.observation))&&!(x.posture==='seated'&&/đứng/iu.test(x.observation)),'GRADE_POSTURE_CONTRADICTION');
  }
 }
}
