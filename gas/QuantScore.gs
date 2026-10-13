const QUANT_SCORE_VERSION='quant-score-v3-integer-20261012';
function quantScoreSchema_(){
 const str={type:'string'},obj=p=>({type:'object',properties:p,required:Object.keys(p),additionalProperties:false});
 const units=obj({targets:{type:'array',items:str},unclearIndexes:{type:'array',items:{type:'integer'}},errors:{type:'array',items:obj({unitIndex:{type:'integer'},evidenceIndexes:{type:'array',items:{type:'integer'}}})}});
 return obj({mode:{type:'string',enum:['words','sentences','weighted','existing_rubric']},sourceBasis:str,complete:{type:'boolean'},units,prosody:units,fluency:units});
}
function quantScoreInstruction_(){return `ĐIỂM ĐỊNH LƯỢNG: Không tự ước lượng % cho vocabulary/phonics/phonicsVideo (mode=words), grammar (sentences), peppa/shadowing (weighted). Lập scoreLedger theo toàn bộ mục tiêu của đề/mẫu, đúng thứ tự; không chọn riêng phần con đã nói đúng, không đếm các lần luyện lại thành nhiều từ mục tiêu. Mỗi bảng units/prosody/fluency dùng {targets:[...],unclearIndexes:[],errors:[{unitIndex,evidenceIndexes}]}. targets chứa ĐỦ danh sách mục tiêu theo thứ tự nguồn. CHỈ errors ghi các đơn vị sai/thiếu có bằng chứng; không tạo bảng đúng/sai hoặc tự đếm lại. unclearIndexes ghi chỉ số mục chưa nghe rõ. Khi complete=true, tất cả mục tiêu không có trong errors/unclearIndexes là phần đã đối chiếu đúng. Code tự đếm số đơn vị đúng, không yêu cầu model đếm. Một từ có nhiều lỗi chỉ có một errors entry, liên kết đủ evidenceIndexes. Tất cả chỉ số 0-based. Thiếu từ/câu phải có evidence nêu chính xác mục tiêu thiếu và cách bổ sung. sourceBasis chỉ rõ nguồn danh sách mục tiêu, complete=false nếu chưa đủ nguồn hoặc chưa đối chiếu hết.
Chỉ hiển thị phần trăm số nguyên: CODE làm tròn kết quả cuối cùng, không làm tròn các thành phần trước khi cộng. Phần trăm do CODE tính: words/sentences = số đơn vị đúng/tổng mục tiêu *100. Weighted = 50% tỉ lệ từ đúng +25% ngữ điệu +25% khớp nhịp/trôi chảy. Với weighted, prosody và fluency là các cụm/câu trong toàn bài mẫu theo đúng thứ tự, mỗi cụm ghi mục tiêu ngữ điệu/ngắt nghỉ hoặc nhịp đối chiếu; mỗi cụm sai phải dẫn tới evidence.type=intonation/fluency có đoạn thực nghe và hướng dẫn cụ thể. Không tự đặt 90/95 vì 'còn có thể cải thiện'. Phần không áp dụng dùng {targets:[],unclearIndexes:[],errors:[]}. Không đủ nguồn thì không tạo mẫu số, không tự cho 100. Không có lỗi, toàn bộ mục tiêu đã đối chiếu và đều đúng thì đúng 100%. Với D.E/Science/Reading/Translation/Critical chưa có công thức mới: mode=existing_rubric, giữ thang hiện tại; mọi điểm trừ phải có dẫn chứng, không suy giảm điểm từ giới hạn quan sát.`;}
function weightedWordInstruction_(){return `RÀNG BUỘC weighted.units.targets: MỖI PHẦN TỬ CHỈ MỘT TỪ, theo toàn bộ lời mẫu; không đưa cả câu/cụm vào một phần tử. “This is my bag” phải là ["This","is","my","bag"]. Giữ từng lần từ xuất hiện trong lời gốc, KHÔNG loại từ lặp; không tính lần học sinh tập lại. Contractions như I'm/don't là một từ. Tự sửa đúng ngay không tự coi là sai phát âm; nếu làm ngắt nhịp, ghi bằng chứng ở fluency. Mỗi từ thiếu/sai có evidence.word đúng MỘT từ mục tiêu, kể cả thiếu 'is'. Một occurrence có nhiều lỗi âm chỉ trừ một lần, liên kết đủ lỗi. Ngữ pháp vẫn ghi đầy đủ câu sai→sửa nhưng liên kết từ thiếu/sai, không trừ cả câu. Toàn bộ phép tính, trọng số, số đếm và tên trường là hồ sơ NỘI BỘ; không đưa vào lời nhận xét học sinh.`;}
function quantScore_(ledger,evidence,expectedMode){
 const check=(ok,code)=>{if(!ok)throw Error('GRADE_SCORE_'+code);};
 check(ledger&&ledger.mode===expectedMode,'MODE_INVALID');
 if(expectedMode==='existing_rubric')return null;
 check(ledger.complete===true&&typeof ledger.sourceBasis==='string'&&ledger.sourceBasis.trim(),'SOURCE_INCOMPLETE');
 const used=new Set(),details={};
 const norm=s=>String(s||'').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 function ratio(list,name){
  if(!Array.isArray(list)){
   if(list&&list.outcomes===undefined){
    check(Array.isArray(list.targets)&&Array.isArray(list.unclearIndexes)&&Array.isArray(list.errors),'COMPACT_INVALID');
    check(list.unclearIndexes.length===0,'UNCLEAR');
    const marked=new Set(list.errors.map(x=>x.unitIndex));
    list={...list,outcomes:list.targets.map((_,i)=>marked.has(i)?'I':'C').join('')};
   }
   check(list&&Array.isArray(list.targets)&&typeof list.outcomes==='string'&&list.outcomes.length===list.targets.length&&/^[CIMU]*$/.test(list.outcomes)&&Array.isArray(list.errors),'COMPACT_INVALID');
   const links=new Map();for(const x of list.errors){check(Number.isInteger(x.unitIndex)&&x.unitIndex>=0&&x.unitIndex<list.targets.length&&!links.has(x.unitIndex),'DUPLICATE_ERROR_LINK');links.set(x.unitIndex,x.evidenceIndexes);}
   list=list.targets.map((target,i)=>({target,status:{C:'correct',I:'incorrect',M:'missing',U:'unclear'}[list.outcomes[i]],evidenceIndexes:links.get(i)||[]}));
  }
  check(Array.isArray(list)&&list.length>0,'DENOMINATOR_MISSING');let correct=0;
  for(const u of list){
   check(typeof u.target==='string'&&u.target.trim()&&['correct','incorrect','missing','unclear'].includes(u.status)&&Array.isArray(u.evidenceIndexes),'UNIT_INVALID');
   if(name==='units'&&expectedMode==='weighted')check(/^[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*$/u.test(u.target.trim()),'WORD_UNIT_REQUIRED');
   check(u.status!=='unclear','UNCLEAR');
   if(u.status==='correct'){check(u.evidenceIndexes.length===0,'CORRECT_WITH_ERROR');correct++;continue;}
   check(u.evidenceIndexes.length>0,'DEDUCTION_WITHOUT_EVIDENCE');
   for(const i of u.evidenceIndexes){check(Number.isInteger(i)&&i>=0&&i<evidence.length,'EVIDENCE_INDEX_INVALID');const e=evidence[i];check(e.observed?.trim()&&e.correction?.trim(),'EVIDENCE_EMPTY');
    if(name==='units'&&['words','weighted'].includes(expectedMode)&&e.type==='pronunciation')check(norm(e.word)&&(' '+norm(u.target)+' ').includes(' '+norm(e.word)+' '),'WORD_MISMATCH');
    if(name==='units'&&expectedMode==='weighted')check(['pronunciation','grammar','content','vocabulary'].includes(e.type)&&norm(e.word)===norm(u.target),'WORD_MISMATCH');
    if(name==='units'&&expectedMode==='sentences')check(['grammar','content'].includes(e.type),'SENTENCE_EVIDENCE_INVALID');
    if(name==='prosody')check(e.type==='intonation','PROSODY_EVIDENCE_INVALID');
    if(name==='fluency')check(e.type==='fluency','FLUENCY_EVIDENCE_INVALID');
    check(!used.has(i),'EVIDENCE_DOUBLE_COUNTED');used.add(i);
   }
  }
  details[name]={correct,total:list.length,percent:100*correct/list.length};return details[name].percent;
 }
 const words=ratio(ledger.units,'units');
 const result=expectedMode==='weighted'?0.5*words+0.25*ratio(ledger.prosody,'prosody')+0.25*ratio(ledger.fluency,'fluency'):words;
 for(const [i,e] of evidence.entries())if(expectedMode==='weighted'||expectedMode==='words'&&['pronunciation','vocabulary','content'].includes(e.type)||expectedMode==='sentences'&&e.type==='grammar')check(used.has(i),'UNACCOUNTED_ERROR');
 return {version:QUANT_SCORE_VERSION,mode:expectedMode,percent:Math.round(result),unroundedPercent:result,details};
}
