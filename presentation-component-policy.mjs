// The assignment's declared components, never a pupil name or source ID, own
// the recording requirement. A Q&A component is not a second presentation.
export const COMPONENT_POLICY='presentation-and-question-components-20261030';
export const QUESTION_COMPONENT_INSTRUCTION='QUY ĐỊNH CỦA CÔ THEO TỪNG PHẦN: Chỉ phần tự THUYẾT TRÌNH theo hình/mindmap mới bắt buộc cách trình bày và quay người theo yêu cầu. Phần TRẢ LỜI CÂU HỎI được trả lời trực tiếp, không cần mở bài/kết bài/dàn ý như thuyết trình, không bắt buộc thấy mặt, nhìn camera, cử chỉ hoặc quay chính diện; quay màn hình câu hỏi vẫn hợp lệ nếu nghe rõ lời trả lời của học sinh. Không trừ điểm hay nhắc nộp lại vì các yêu cầu hình thức thuyết trình ở phần câu hỏi. Vẫn kiểm tra đủ câu, độ đúng ý, ngữ pháp, phát âm và độ rõ/trôi chảy. Quy tắc này ưu tiên hơn chỉ dẫn quay chính diện áp chung trong web/barem cũ. Một file có cả hai phần thì đánh giá từng đoạn đúng vai trò; xác định vai trò từ nội dung thực tế và các phần được giao, không mặc định theo thứ tự file. Nếu không xác định được vai trò, không kết luận vi phạm hình thức. componentRole trong bằng chứng chỉ được là presentation, question_answers, mixed hoặc unknown.';
const question=/trả lời|câu hỏi|questions?|question_answers|\bq\s*&\s*a\b/iu;
const presentation=/thuyết trình|trình bày|mindmap|presentation/iu;
const requirements=s=>s?.barem?.requirements||s?.requirements||{};
export function assignmentComponents(value={}){
 const r=value.barem||value.requirements?requirements(value):value;
 const parts=Array.isArray(r.requiredParts)?r.requiredParts:[];
 return parts.map((p,i)=>{const text=typeof p==='string'?p:p.text||p.description||'',q=question.test(text),pr=presentation.test(text);return {index:i,partNumber:Number(text.match(/\b(?:video|part|phần)\s*(\d+)\s*:/iu)?.[1])||null,role:q?(pr?'mixed':'question_answers'):(pr?'presentation':'unknown'),text};});
}
export function hasQuestionComponent(value){return assignmentComponents(value).some(x=>['question_answers','mixed'].includes(x.role));}
export function scopedRequirements(original={}){
 const r=structuredClone(original);if(r.componentPolicyVersion===COMPONENT_POLICY)return r;const components=assignmentComponents(r);
 if(!components.some(x=>['question_answers','mixed'].includes(x.role))||!(r.contract?.capture==='face'||['mindmap_qa','mindmap_presentation','picture_recitation','explain_pictures'].includes(r.contract?.mode)))return r;
 r.componentPolicyVersion=COMPONENT_POLICY;
 r.assessmentComponents=components.map(x=>({...x,capture:x.role==='presentation'?'face':x.role==='question_answers'?'any':'component_specific',requiresPresentation:x.role==='presentation',allowsDirectAnswers:['question_answers','mixed'].includes(x.role)}));
 r.contract={...r.contract,capture:'component_specific',fullTextReading:'component_specific',componentPolicyVersion:COMPONENT_POLICY};
 r.teacherOverride=[r.teacherOverride,QUESTION_COMPONENT_INSTRUCTION].filter(Boolean).join('\n');
 r.submissionText=[r.submissionText,'\n'+QUESTION_COMPONENT_INSTRUCTION].filter(Boolean).join('\n');
 return r;
}
export function presentationApplies(check={},job={},snapshot={}){
 if(check.componentRole==='question_answers'||check.componentRole==='mixed')return false;
 if(!hasQuestionComponent(snapshot))return true;
 // Old whole-assignment visual flags do not prove which part was filmed.
 // The model must explicitly bind its direct observation to presentation.
 return check.componentRole==='presentation';
}
const formatComplaint=/quay (?:chính diện|màn hình|trực diện)|khuôn mặt|nhìn (?:vào )?camera|hướng mặt|cử chỉ|thấy (?:mặt|người)|mở bài|kết bài|dàn ý|thuyết trình/iu;
const bridge=/^\s*Tuy nhiên, để bài nói\/bài đọc được hoàn thiện và chuẩn xác hơn, con chú ý một số điểm sau đây nhé:\s*$/u;
export function repairQuestionFeedback(draft,snapshot={}){
 const components=assignmentComponents(snapshot),numbers=new Set(components.filter(x=>x.role==='question_answers'&&x.partNumber).map(x=>x.partNumber));
 if(!hasQuestionComponent(snapshot))return {draft,changes:[]};
 const changes=[];
 const clean=(text,record=true)=>{
  const lines=String(text||'').split('\n'),kept=[];let removed=false;
  for(const line of lines){const refs=[...line.matchAll(/\bvideo\s*(\d+)\b/giu)].map(x=>Number(x[1])),explicitQuestion=/phần (?:trả lời|câu hỏi)|video (?:trả lời|câu hỏi)/iu.test(line);
   // Only an explicit Q&A reference can authorize this narrow policy edit.
   // Do not remove pronunciation/grammar/content corrections in mixed lines.
   const language=/phát âm|ngữ pháp|đọc (?:sai|thành)|thiếu (?:ý|câu)|trả lời (?:sai|thiếu)|\/[^/\n]+\//iu.test(line);
   if(formatComplaint.test(line)&&!language&&(explicitQuestion||refs.length>0&&refs.every(n=>numbers.has(n)))){if(record)changes.push({before:line,reason:'QUESTION_COMPONENT_HAS_NO_PRESENTATION_FORMAT_REQUIREMENT'});removed=true;continue;}
   kept.push(line);
  }
  if(removed){while(kept.length&&(!kept.at(-1).trim()||bridge.test(kept.at(-1))))kept.pop();}
  return kept.join('\n');
 };
 const out=structuredClone(draft);
 for(const s of Array.isArray(out.roseSections)?out.roseSections:[]){const before=s.text,after=clean(before);if(after!==before){s.text=after;s.spans=(s.spans||[]).map(p=>({...p,text:clean(p.text,false)})).filter(p=>p.text.trim());if(s.spans.map(p=>p.text).join('')!==after)s.spans=[{text:after,tone:'neutral'}];}}
 return {draft:changes.length?out:draft,changes};
}

export function questionFeedbackCandidate(job){const s=String(job.autoNotice||'');return /Chất lượng:\s*đạt(?: khoảng)?\s*\d+(?:[.,]\d+)?\s*%/iu.test(s)&&formatComplaint.test(s)&&(/\bvideo\s*\d+/iu.test(s)||/phần (?:trả lời|câu hỏi)|video (?:trả lời|câu hỏi)/iu.test(s));}
