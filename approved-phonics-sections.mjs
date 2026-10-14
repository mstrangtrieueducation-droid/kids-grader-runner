// Keep an already complete teacher-format response intact. Reclassification is
// reserved for older responses that do not carry the approved three headings.
const labels=['Phát âm âm đang học','Âm đuôi & trọng âm','Thuộc mặt chữ'];
export function approvedPhonicsSections(grade,before=''){
 if(/•\s*(?:Phát âm âm đang học|Âm đuôi & trọng âm|Thuộc mặt chữ)/.test(before))return null;
 const sections=grade?.roseSections;
 if(!Array.isArray(sections)||sections.length!==3)return null;
 if(!sections.every((s,i)=>s.label===labels[i]&&typeof s.text==='string'&&s.text.trim().length>25))return null;
 if(sections.some(s=>/^(?:Qua phần ghi âm|Cô chưa xác định|Đánh giá theo phần có căn cứ)/i.test(s.text.trim())))return null;
 return sections.map(({label,text})=>({label,text:text.trim()}));
}
