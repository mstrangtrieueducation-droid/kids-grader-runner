import assert from 'node:assert/strict';import {approvedPhonicsSections} from './approved-phonics-sections.mjs';import {phonicsSections} from './phonics-template.mjs';
const g={roseSections:[{label:'Phát âm âm đang học',text:'Con phát âm các âm mục tiêu /k/ và /l/ rất rõ ràng, nhận diện và phát âm chuẩn kangaroo, king, lion, leaf, lemon.'},{label:'Âm đuôi & trọng âm',text:'Con đã có ý thức bật âm đuôi ở từ lamp. Tuy nhiên, con chú ý từ kite /kaɪt/ ở đoạn 00:33 nhé.'},{label:'Thuộc mặt chữ',text:'Con nhận diện mặt chữ rất tốt, đọc đúng câu chuyện Story và bảng Sight words. Con chú ý từ the /ðə/ ở đoạn 02:38 nhé.'}]};
assert.deepEqual(phonicsSections(g),g.roseSections);
assert.equal(approvedPhonicsSections(g,'• Thuộc mặt chữ: Cô đã sửa lời nhận xét.'),null);
assert.equal(approvedPhonicsSections({roseSections:g.roseSections.slice(0,2)}),null);
assert.equal(approvedPhonicsSections({roseSections:g.roseSections.map((s,i)=>({...s,label:i===0?'Tốc độ & ngữ điệu':s.label}))}),null);
console.log('Approved Phonics sections: original headings, words, IPA and timestamps preserved; existing teacher edits protected.');
