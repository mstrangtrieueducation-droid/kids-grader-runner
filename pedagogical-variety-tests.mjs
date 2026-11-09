// Teacher09Nov: the bridge between praise and correction, and the closing words, vary between pupils and lessons.
import assert from 'node:assert/strict';
import {PEDAGOGIC_BRIDGE,PEDAGOGIC_BRIDGES,PEDAGOGY_INSTRUCTION,pedagogicSpans,pedagogicSection,varietySeed,bridgeFor,isBridgeLine} from './pedagogical-language.mjs';
import {savedFeedback,savedSections} from './saved-feedback.mjs';
import {repairQuestionFeedback} from './presentation-component-policy.mjs';
const spans=()=>[{text:'Con đọc to, rõ ràng và đúng hầu hết các từ.',tone:'praise'},{text:'\nCon chú ý từ ship /ʃɪp/ ở đoạn 00:12, con đọc thành sheep.',tone:'correction'}];
// Old renders keep their exact text.
assert.equal(varietySeed({className:'KIDS 36',student:'HUGO',code:'Phonics-Video-06',time:'2026-10-31T14:37:44.341Z'}),undefined);
assert.equal(pedagogicSpans(spans())[1].text,'\n'+PEDAGOGIC_BRIDGE+'\n','no seed keeps the legacy bridge');
// New receipts get a bridge chosen from the approved list; the choice is stable for the same piece.
const receipt={className:'KIDS 36',student:'HUGO',code:'Phonics-Video-07',time:'2026-11-09T13:00:00.000Z'};
const seed=varietySeed(receipt);assert.ok(seed);assert.equal(varietySeed({...receipt,name:'Hugo',student:undefined}),seed,'name and student spell the same seed');
assert.ok(PEDAGOGIC_BRIDGES.includes(bridgeFor(seed)));assert.equal(bridgeFor(seed),bridgeFor(seed));
// Different pupils, lessons and criteria spread over the list.
const seen=new Set();for(const s of ['ANNA','BEN','CORA','DAVID','ELLA','HUGO','IVY','KAI','LUKAS','MIA','RYAN','ROSE'])for(const code of ['Phonics-Video-07','DE-Video-15','SCIENCE-K-22'])seen.add(bridgeFor(varietySeed({...receipt,student:s,code})));
assert.ok(seen.size>=5,'at least five different bridges across 36 pieces, got '+seen.size);
const a=pedagogicSection({label:'Phát âm',spans:spans()},seed).spans[1].text,b=pedagogicSection({label:'Nội dung',spans:spans()},seed).spans[1].text;
assert.ok(isBridgeLine(a)&&isBridgeLine(b));
let labels=new Set();for(const label of ['Phát âm','Nội dung','Ngữ pháp','Trôi chảy','Thuộc bài','Phong thái'])labels.add(pedagogicSection({label,spans:spans()},seed).spans[1].text);
assert.ok(labels.size>=2,'criteria of one piece do not all share one bridge');
// The model's own transition is kept, never doubled.
for(const own of ['Tuy nhiên, con đọc thiếu âm cuối ở từ cat.','Bên cạnh đó, cô muốn con chú ý từ ship.','Để bài đọc tròn hơn, con sửa từ ship nhé.','Cô có một gợi ý nhỏ: con đọc lại từ ship.','Chỉ còn từ ship con đọc thành sheep.']){
 const out=pedagogicSpans([{text:'Con đọc rõ.',tone:'praise'},{text:'\n'+own,tone:'correction'}],seed);assert.equal(out.length,2,'authored transition kept: '+own);}
const out=pedagogicSpans([{text:'Con đọc rõ.',tone:'praise'},{text:'\n'+PEDAGOGIC_BRIDGES[4]+'\nCon chú ý từ ship.',tone:'correction'}],seed);assert.equal(out.length,2,'a listed bridge written by the model is not doubled');
// A correction that starts with the fault itself still gets a bridge.
assert.equal(pedagogicSpans([{text:'Con đọc rõ.',tone:'praise'},{text:'\nCon đọc thiếu âm cuối ở từ cat.',tone:'correction'}],seed).length,3);
// Whole saved feedback: new receipt varies, text and spans stay aligned for colouring.
const g={assessable:true,band:'85%',rubricBand:'85%',roseSections:[{label:'Phát âm',text:spans().map(p=>p.text).join(''),spans:spans()},{label:'Nội dung',text:'Con kể đủ ý.\nCon thiếu câu kết bài.',spans:[{text:'Con kể đủ ý.',tone:'praise'},{text:'\nCon thiếu câu kết bài.',tone:'correction'}]}]};
const fb=savedFeedback(structuredClone(g),{receipt:receipt,route:{kind:'kids'}},'');
for(const s of fb.sections)assert.equal(s.spans.map(p=>p.text).join(''),s.text);
assert.ok(fb.sections.every(s=>s.spans.some(p=>isBridgeLine(p.text))));
assert.ok(fb.text.includes('Chất lượng: đạt khoảng 85%'));
const old=savedFeedback(structuredClone(g),{receipt:{...receipt,time:'2026-10-20T10:00:00.000Z'},route:{kind:'kids'}},'');
assert.ok(old.sections.every(s=>s.spans.some(p=>p.text.includes(PEDAGOGIC_BRIDGE))),'old receipts render the legacy bridge');
assert.deepEqual(savedSections(structuredClone(g),{},seed).map(s=>s.text),fb.sections.map(s=>s.text),'the rich-text fallback renders the same text as the saved cell');
// Removing a question-component complaint also drops a varied bridge left hanging.
const snapshot={form:['Phát âm'],assignment:{components:[{role:'question_answers',partNumber:2}]},components:[{role:'question_answers',partNumber:2}]};
const draft={roseSections:[{label:'Phát âm',text:'Con đọc rõ.\n'+PEDAGOGIC_BRIDGES[2]+'\nVideo 2 con chưa nhìn vào camera khi thuyết trình.'}]};
const repaired=repairQuestionFeedback(draft,snapshot);
if(repaired.changes.length)assert.ok(!repaired.draft.roseSections[0].text.includes(PEDAGOGIC_BRIDGES[2]),'hanging bridge removed');
// The model is told to vary its wording, in every runner that shares the instruction.
assert.ok(PEDAGOGY_INSTRUCTION.includes('không dùng mãi một mẫu câu'));assert.ok(PEDAGOGY_INSTRUCTION.includes('không viết theo khuôn mẫu'));assert.ok(PEDAGOGY_INSTRUCTION.includes('quan tâm thật'));assert.ok(PEDAGOGY_INSTRUCTION.includes('không khen chung chung'));
// Shadowing pieces are seeded from their source row (className, name, code, time).
assert.ok(varietySeed({className:'SHADOWING L1',name:'Minh Anh',code:'Unit 3',time:'2026-11-09T12:00:00.000Z'}));assert.ok(PEDAGOGY_INSTRUCTION.includes('mỗi bài chỉ một lời động viên kết'));
assert.ok(!PEDAGOGY_INSTRUCTION.includes('BẮT BUỘC có câu dẫn: "'),'no single mandatory formula');
console.log('PASS feedback wording varies by pupil and lesson; old renders unchanged; authored transitions never doubled.');
