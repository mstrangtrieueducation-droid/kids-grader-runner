import {QUESTION_COMPONENT_INSTRUCTION} from './presentation-component-policy.mjs';
// Teacher master policy, 23 October 2026. Old paid responses remain byte-exact.
export const COMPACT_VERSION='teacher-master-compact-20261023';
export const OUTPUT_TOKENS=2048;
// Teacher06Nov: a private declaration of the pupil's voice decides the existing no-voice notice.
export const HEARD_INSTRUCTION='KHAI BÁO NGHE (bắt buộc, điền TRƯỚC khi chấm, không hiển thị cho phụ huynh): heard.voice=student chỉ khi thực sự nghe được giọng học sinh nói tiếng Anh trong tệp nộp; khi đó heard.quotes ghi 1 đến 3 câu ngắn đúng nguyên văn điều học sinh đã nói, mỗi câu kèm mốc thời gian mm:ss và tối đa 12 từ. Chỉ ghi điều nghe được từ giọng học sinh; không chép từ barem, phụ đề, lời mẫu, giọng nhân vật hoặc giọng giáo viên trong video luyện tập. Nếu tệp không có tiếng học sinh nói tiếng Anh (im lặng, chỉ nhạc nền, tiếng động, chỉ có lời mẫu của video): heard.voice=no_student_voice, heard.quotes=[], ok=false, score=null, why=NO_SPEECH_DETECTED, sections=[]; tuyệt đối không viết nhận xét hay cho điểm. Giọng nhỏ, ngập ngừng hoặc chỉ nghe được một phần vẫn là student. Chỉ dùng unclear khi có tiếng người nhưng không thể xác định đó có phải học sinh hay không.';
export const COMPACT_INSTRUCTION=`QUY CHUẨN MỚI ƯU TIÊN: Nghe đủ mọi tệp trong MỘT request. Chỉ trả JSON theo schema gọn; không xuất transcript, bảng đếm từ, coverage dài hoặc tự thuật suy nghĩ. Tối đa 300 từ tiếng Việt toàn phản hồi; khen có căn cứ và sửa cụ thể, gộp lỗi cùng loại. Lời sửa có ví dụ đúng và giải thích ngắn, IPA chỉ cho từ đơn, không gán IPA cho câu ngữ pháp. Chất lượng % là bội số 5; không có dữ liệu thì để score=null, không bịa điểm. Chỉ lấy số câu thực hành trên web/ảnh bài được giao, không cộng ví dụ sách. Với Science G1/G2/G3 nghe đủ cả mindmap và câu hỏi, ghi số câu trả lời đúng/thiếu trong mục Nội dung. Với D.E, Science K, Critical: kiểm tra đủ ba ảnh tại 15%, 50%, 80% thời lượng; chỉ khi ảnh rõ cho thấy chỉ quay màn hình, không thấy người, capture=screen_only/filming_screen và nêu bằng chứng; score=null, không chấm chi tiết. Hình thiếu/mờ không đủ để kết luận. Không viết lời thanh minh về transcript/audio mẫu. Trả xong JSON đầy đủ trong 2048 token.
${HEARD_INSTRUCTION}
${QUESTION_COMPONENT_INSTRUCTION}`;
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const str={type:'string'};
export const heardNoVoice=g=>g?.heard?.voice==='no_student_voice'&&!(g.heard.quotes||[]).some(q=>String(q?.text||'').trim());
export function compactSchema(labels,{speaking=false,foundation=false,visual=false}={}){
 return obj({v:{type:'string',enum:[COMPACT_VERSION]},heard:obj({voice:{type:'string',enum:['student','no_student_voice','unclear']},quotes:{type:'array',minItems:0,maxItems:3,items:obj({t:str,text:str})}}),ok:{type:'boolean'},...(foundation?{scale:{type:'string',enum:['feedback_only']}}:{}),score:foundation?{type:['number','null'],enum:[null]}:{type:['number','null'],minimum:0,maximum:speaking?9:100},why:str,
  ...(visual?{componentRole:{type:'string',enum:['presentation','question_answers','mixed','unknown']},capture:{type:'string',enum:['student','screen_only','filming_screen','unknown']},visualBasis:str,fileIndex:{type:'integer',minimum:0}}:{}),
  sections:{type:'array',minItems:0,maxItems:labels.length,items:obj({label:{type:'string',enum:labels},praise:str,correction:str,...(speaking&&!foundation?{band:{type:['number','null'],minimum:0,maximum:9}}:{})})}});
}
export function compactResponse(raw){
 const text=(raw?.candidates?.[0]?.content?.parts||[]).filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g,'');
 let g;try{g=JSON.parse(text);}catch{return null;}if(g?.v!==COMPACT_VERSION)return null;
 if(raw.candidates?.[0]?.finishReason&&raw.candidates[0].finishReason!=='STOP')throw Error('COMPACT_RESPONSE_INCOMPLETE');
 if(heardNoVoice(g))return g;
 if(typeof g.ok!=='boolean'||!Array.isArray(g.sections)||g.ok&&!g.sections.length||g.sections.some(s=>!s.label||typeof s.praise!=='string'||typeof s.correction!=='string'||!(s.praise+s.correction).trim())||g.ok&&!(g.scale==='feedback_only'&&g.score===null)&&(!Number.isFinite(g.score)||g.score<0)||!g.ok&&!String(g.why||g.visualBasis||'').trim())throw Error('COMPACT_RESULT_INCOMPLETE');
 return g;
}
export function expandKidsCompact(raw){
 const g=compactResponse(raw);if(!g)return null;
 if(heardNoVoice(g))return {assessable:false,band:'',rubricBand:'',reason:'NO_SPEECH_DETECTED',speechStatus:'NO_SPEECH_DETECTED',presentationVisualCheck:{componentRole:g.componentRole||'unknown',confirmed:false,studentVisible:g.capture==='student',capture:g.capture||'unknown',basis:'',sourceFileIndex:g.fileIndex||0},roseSections:[],compactPolicy:COMPACT_VERSION};
 if(g.ok&&(!Number.isFinite(g.score)||g.score>100))throw Error('COMPACT_SCORE_INVALID');const score=g.ok&&g.score<=100?Math.round(g.score/5)*5:null;
 return {assessable:g.ok,band:score===null?'':score+'%',rubricBand:score===null?'':score+'%',reason:g.why||'',speechStatus:'UNCERTAIN',
  presentationVisualCheck:{componentRole:g.componentRole||'unknown',confirmed:!!g.visualBasis&&['screen_only','filming_screen'].includes(g.capture),studentVisible:g.capture==='student',capture:g.capture||'unknown',basis:g.visualBasis||'',sourceFileIndex:g.fileIndex||0},
  roseSections:g.sections.map(s=>{const spans=[s.praise?{text:s.praise,tone:'praise'}:null,s.correction?{text:(s.praise?'\n':'')+s.correction,tone:'correction'}:null].filter(Boolean);return {label:s.label,text:spans.map(p=>p.text).join(''),spans};}),compactPolicy:COMPACT_VERSION};
}
export function expandShadowCompact(raw){
 const g=compactResponse(raw);if(!g)return null;if(g.ok&&!Number.isFinite(g.score)||g.score!==null&&g.score>100)throw Error('COMPACT_SCORE_INVALID');
 return {assessable:g.ok,overallPercent:g.ok?Math.round(g.score/5)*5:null,reason:g.why||'',sections:g.sections.map(s=>({...s,score:null})),evidence:[],uncertainty:[],compactPolicy:COMPACT_VERSION};
}
export function compactGeneration(config,model){
 // Flash 3.8 rejects the 2.5-only thinkingBudget=0/minimal setting.
 // Keep the lowest validated setting instead of issuing a known-invalid request.
 return {...config,maxOutputTokens:OUTPUT_TOKENS,thinkingConfig:model.startsWith('gemini-2.5-')?{thinkingBudget:0,includeThoughts:false}:{thinkingLevel:model==='gemini-3.8-flash'?'low':'minimal',includeThoughts:false}};
}
export function installCompactKids(c){
 const system=c.kidsSystemInstruction_;c.kidsSystemInstruction_=()=>system()+'\n'+COMPACT_INSTRUCTION;
 c.kidsEvidenceSchema_=form=>compactSchema(form,{visual:true});
 const config=c.kidsGenerationConfig_;c.kidsGenerationConfig_=(model,form)=>compactGeneration(config(model,form),model);
}
