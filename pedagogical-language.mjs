import {SCREEN_FIRST_INSTRUCTION} from './screen-grounding.mjs';
import {receiptDate} from './master-policy.mjs';
export const PEDAGOGIC_BRIDGE='Tuy nhiên, để bài nói/bài đọc được hoàn thiện và chuẩn xác hơn, con chú ý một số điểm sau đây nhé:';
// Teacher09Nov: families read many pieces of feedback; one fixed formula bores them.
// The bridge between praise and correction is chosen per pupil, lesson and criterion.
export const PEDAGOGIC_BRIDGES=[PEDAGOGIC_BRIDGE,
 'Bên cạnh đó, cô muốn con lưu ý thêm vài điểm nhỏ để bài của con trọn vẹn hơn:',
 'Để lần sau bài của con tiến bộ hơn nữa, con cùng cô xem lại mấy chỗ này nhé:',
 'Cô có vài gợi ý nhỏ giúp con nói và đọc chuẩn hơn:',
 'Chỉ còn một vài điểm nhỏ con chỉnh lại là bài sẽ rất tốt:',
 'Tuy vậy, con để ý thêm những chỗ sau để bài hoàn chỉnh hơn nhé:',
 'Con đã làm được nhiều điều tốt rồi, giờ cô chỉ cho con thêm vài chỗ cần sửa nhé:',
 'Cô tin con sẽ làm tốt hơn nữa nếu chú ý những điểm dưới đây:'];
export const PEDAGOGIC_VARIETY_FROM=Date.UTC(2026,10,9);
// Feedback written before 9 November keeps its exact text when re-rendered.
export const varietySeed=receipt=>{const at=receiptDate(receipt?.at??receipt?.time,new Date(0)).getTime();return at>=PEDAGOGIC_VARIETY_FROM?[receipt?.className,String(receipt?.name||receipt?.student||'').normalize('NFC').trim().toUpperCase(),receipt?.code,at].join('|'):undefined;};
const hash=s=>{let h=2166136261;for(const ch of String(s)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0;}return h;};
export const bridgeFor=seed=>seed==null?PEDAGOGIC_BRIDGE:PEDAGOGIC_BRIDGES[hash(seed)%PEDAGOGIC_BRIDGES.length];
export const isBridgeLine=text=>PEDAGOGIC_BRIDGES.includes(String(text||'').trim());
// A transition the model wrote itself counts; the runner never stacks a second one on it.
const authoredBridge=/Tuy nhiên,\s*để bài (?:nói|đọc)(?:\/bài đọc)?\b/iu;
// Encouragement is not a correction: no bridge is placed before it (new renders only).
const faultWords=/chưa|nhầm|thiếu|sai|sửa|chú ý|lưu ý|cần|tránh|nên|đọc thành|→|\/[^\/\n]+\/|không/iu;
const encouragement=/tiếp tục|duy trì|phát huy|giữ vững|cô khen|rất đáng khen/iu;
const pureEncouragement=text=>encouragement.test(text||'')&&!faultWords.test(text||'');
const authoredTransition=/^\s*(?:Tuy nhiên|Tuy vậy|Dù vậy|Bên cạnh đó|Ngoài ra|Để (?:bài|phần|lần sau)|Cô (?:có|chỉ|muốn|tin|gợi ý|nhắc)|Chỉ (?:còn|có)|Một (?:điểm|chút|vài|số)|Có (?:một|vài)|Con chỉ cần|Giờ )/u;
export const PEDAGOGY_INSTRUCTION=SCREEN_FIRST_INSTRUCTION+`\nQUY CHUẨN SƯ PHẠM DÙNG CHUNG: Viết như một cô giáo vừa nghe xong chính bài này của con, bằng giọng tự nhiên, ấm áp và quan tâm thật, không viết theo khuôn mẫu. Mỗi bài có cách mở lời, cách khen, cách chuyển ý và cách kết khác nhau; không bắt đầu mọi mục bằng cùng một kiểu câu. Lời khen phải nêu đúng điều con làm được trong bài này (từ, câu, đoạn, mốc giây cụ thể), không khen chung chung kiểu "con làm tốt". Trong MỖI tiêu chí có cả ưu điểm và lỗi, sau phần khen và trước phần sửa BẮT BUỘC có một câu dẫn chuyển ý bằng lời của cô, tự nhiên và khác nhau giữa các tiêu chí và các bài (ví dụ: "${PEDAGOGIC_BRIDGES[1]}", "${PEDAGOGIC_BRIDGES[3]}", "${PEDAGOGIC_BRIDGES[4]}"); không dùng mãi một mẫu câu. Lời động viên và lời nhắc cuối mục viết từ chính bài này: nhắc điều con vừa làm được, chỉ rõ việc cụ thể con nên luyện tiếp; không lặp cùng một câu kết (như "...nộp lại cho cô nhé!") ở mọi mục, mỗi bài chỉ một lời động viên kết. Quan tâm thật nhưng không xã giao, không bịa cảm xúc hay sự tiến bộ chưa có căn cứ; thẳng thắn với phần chưa đạt. Gom lỗi cùng bản chất trong chính tiêu chí tương ứng: ngữ pháp/cấu trúc, phát âm/âm đuôi, dịch nghĩa; không liệt kê rời theo thứ tự mốc giây. CẤM dòng cộc lốc dạng "mm:ss: A -> B". Ngữ pháp: giải thích bằng tiếng Việt con thiếu to-be, dùng thừa từ hay thiếu số nhiều..., trích cách con nói và câu đúng; TUYỆT ĐỐI không gán IPA cho cả câu ngữ pháp. Phát âm: nói rõ con đọc từ nào thành từ nào hoặc thiếu âm nào, giữ IPA của từ đích và mốc giây thật nếu có, viết thành câu hướng dẫn. Dịch nghĩa: trích nguyên câu tiếng Anh gốc cùng bản dịch đúng, chỉ rõ chỗ con dịch nhầm; không nói vu vơ "câu này dịch sai". Không bịa nguyên nhân hoặc câu gốc chưa có căn cứ. Giữ đầy đủ lỗi thật, không xóa lời chữa vì thiếu IPA/mốc; không gọi AI thêm để sửa văn phong. Các trường evidence/scoreLedger là dữ liệu nội bộ; phần nhận xét gửi phụ huynh phải là lời cô giáo hoàn chỉnh.`;
export function pedagogicSpans(spans,seed){
 const out=[],bridge=bridgeFor(seed);let praise=false,bridged=false;for(const p of spans){
  if(p.text?.includes('• ')){praise=false;bridged=false;}
  if(PEDAGOGIC_BRIDGES.some(b=>p.text?.includes(b))||authoredBridge.test(p.text||'')||p.tone==='correction'&&praise&&authoredTransition.test(p.text||''))bridged=true;
  if(p.tone==='correction'&&praise&&!bridged&&!(seed!=null&&pureEncouragement(p.text))){out.push({text:'\n'+bridge+(seed!=null&&String(p.text||'').startsWith('\n')?'':'\n'),tone:'neutral'});bridged=true;}
  out.push(p);if(p.tone==='praise')praise=true;
 }return out;
}
export function pedagogicSection(section,seed){
 const spans=pedagogicSpans(section.spans||[],seed==null?undefined:seed+'|'+(section.label||''));return spans.length?{...section,spans,text:spans.map(p=>p.text).join('')}:section;
}
