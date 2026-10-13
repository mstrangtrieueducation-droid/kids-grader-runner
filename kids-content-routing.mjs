import {phonicsSequenceColumn} from './phonics-destination-repair.mjs';
import {isPhonics,PHONICS_VERSION,PHONICS_LABELS,PHONICS_PROMPT,phonicsText,phonicsRich} from './phonics-template.mjs';
import {fullFeedback,networkRetry} from './kids-fault-tolerance.mjs';
import {normalizeCode} from './master-barem.mjs';

export const ROUTING_VERSION='kids-single-pass-v3';
export const submittedCode=r=>{
 if(/^PHONICS\s+1[–-]4$/i.test(r.sourceTab||'')&&/^A\s*\/\s*B$/i.test(r.code||''))return 'OP1-L01';
 const f=String(r.code||'').trim().match(/^F\s*(\d+)$/i);if(f&&/^FF[12]$/i.test(r.sourceTab||''))return r.sourceTab.toUpperCase()+'-Tiết '+Number(f[1]);
 return r.code;
};
export const RESUBMIT_AUDIO='⚠ CẦN NỘP LẠI\nCon quay lại phần bài được giao để nghe rõ tiếng con đọc rồi gửi lại nhé. Cô đợi bài của con.';
export const RESUBMIT_OLD='⚠ CẦN NỘP LẠI\nBài trong video con đã nộp trước đó rồi. Con gửi lại đúng bài của buổi này nhé. Cô đợi bài của con.';
export const fold=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const contentText=e=>JSON.stringify({topic:e.content.topic,words:e.content.words,sentences:e.content.sentences,transcript:e.content.transcript,questions:e.content.questions,outline:e.content.outline,documentText:e.content.documentText,text:e.content.text});
export function routingIndex(catalog){return [...catalog.entries.values()].filter(e=>e.subject==='kids'&&e.status==='READY'&&e.review?.approved&&e.autoEligible!==false&&!e.missing?.length&&e.route).map(e=>({entry:e,text:fold(contentText(e))}));}
export function rankLessons(index,transcript,formCode,limit=12){
 const words=[...new Set(fold(transcript).split(' ').filter(w=>w.length>2))],n=index.length;
 const frequencies=new Map(words.map(w=>[w,index.filter(e=>(' '+e.text+' ').includes(' '+w+' ')).length]));
 const ranked=index.map(x=>{const hits=words.filter(w=>(' '+x.text+' ').includes(' '+w+' '));return {...x,score:hits.reduce((s,w)=>s+Math.log(1+n/(1+frequencies.get(w))),0)/Math.sqrt(Math.max(1,x.text.split(' ').length/200))};}).sort((a,b)=>b.score-a.score);
 const selected=ranked.slice(0,limit),form=index.find(x=>normalizeCode(x.entry.code)===normalizeCode(formCode));
 if(form&&!selected.includes(form)&&!selected.some(x=>x.entry.sha256===form.entry.sha256))selected.push(form);
 return selected;
}
export function routeDecision(result,transcript,candidates){
 if(result.status!=='matched')return {status:'resubmit',reason:result.reason||'NO_MATCH'};
 const selected=candidates.find(x=>normalizeCode(x.entry.code)===normalizeCode(result.code));
 const quotes=(result.studentQuotes||[]).map(fold).filter(q=>q.split(' ').length>=3&&fold(transcript).includes(q));
 if(!selected||!Number.isFinite(result.confidence)||result.confidence<0.9||!quotes.length)return {status:'resubmit',reason:'CONTENT_NOT_IDENTIFIABLE'};
 return {status:'matched',entry:selected.entry,reason:result.reason,quotes};
}
export function referenceHold(job){return ['NEEDS_REVIEW','BLOCKED','STALE'].includes(job.status)&&/^(REFERENCE_|BAREM_|TYPE_|CODE_|GUIDE_|STALE_GUIDELINE)/.test(job.error||'')&&!job.rawId&&!job.gradeId&&!job.generateRequests&&!job.runnerGenerationStarted;}

// One paid generation per submission. Catalog selection and fuzzy matching are local.
export function localLessonMatch(index,text){
 const ranked=rankLessons(index,text,'',2),words=new Set(fold(text).split(' ').filter(w=>w.length>3));
 const first=ranked[0],second=ranked[1];
 if(!first||words.size<5||first.score<=0||second&&first.score<second.score*1.8)return null;
 const hits=[...words].filter(w=>(' '+first.text+' ').includes(' '+w+' '));
 return hits.length>=5?first.entry:null;
}
export function installContentRouting(c,catalog,{refresh,lock,emit=()=>{}}){
 const oldColumns=c.autoColumns_;if(oldColumns)c.autoColumns_=(headers,route)=>{try{return oldColumns(headers,route);}catch(e){const column=/^DESTINATION_AMBIGUOUS/.test(e.message)?phonicsSequenceColumn(headers,route.code):null;if(column!==null)return column;throw e;}};
 const originalGuide=c.guide_;c.guide_=route=>{const snapshot=originalGuide(route);if(isPhonics({route})){snapshot.form=[...PHONICS_LABELS];snapshot.barem={...snapshot.barem,phonicsTemplateVersion:PHONICS_VERSION};snapshot.guide+='\n'+PHONICS_PROMPT;}return snapshot;};
 const index=routingIndex(catalog),step=c.step_,handle=c.handleError_,generate=c.generate_;
 const persist=(j,row)=>c.persist_(j,row);
 const destination=(j,route=j.route)=>{refresh(j);return c.destination_(j.cls,route,j.receipt.student);};
 const occupied=cell=>c.hasFeedback_(cell.getDisplayValue())||!!cell.getFormula()||!!cell.getDataValidation();
 const stop=(j,row,status,error='')=>{j.status=status;j.error=error;j.nextAt=0;persist(j,row);};
 const writeGrade=c.writeGrade_;
 if(writeGrade)c.writeGrade_=(j,grade)=>{
  const original=c.destination_;
  c.destination_=(...args)=>{const dst=original(...args),cell=dst.cell,before=cell.getDisplayValue(),write=cell.setRichTextValue.bind(cell);cell.setRichTextValue=v=>{refresh(j);if(occupied(cell))throw Error('PREFLIGHT_EXISTING_FEEDBACK');if(cell.getDisplayValue()!==before)throw Error('DESTINATION_CHANGED');return write(v);};return dst;};
  try{return writeGrade(j,grade);}finally{c.destination_=original;}
 };
 function feedback(j,row,message,route=j.route,status='NEEDS_RESUBMISSION'){
  const dst=destination(j,route),cell=dst.cell,before=cell.getDisplayValue();
  if(occupied(cell)){stop(j,row,'SKIPPED_ALREADY_GRADED');return;}
  if(process.env.RUNNER_SHEET_BATCH!=='1')j.noticeBackupId=c.saveArtifact_('single-pass-before-'+j.id,{value:cell.getValue(),note:cell.getNote(),cell:cell.getA1Notation(),output:message,rawId:j.rawId});
  refresh(j);if(occupied(cell)||cell.getDisplayValue()!==before)throw Error('DESTINATION_CHANGED');
  cell.setRichTextValue(isPhonics(j)?phonicsRich(c,cell,message):c.coloredFeedback_(cell,message,null));if(process.env.RUNNER_SHEET_BATCH!=='1'){refresh(j);if(cell.getDisplayValue()!==message)throw Error('WRITE_READBACK_FAILED');}
  if(isPhonics(j))j.phonicsTemplateVersion=PHONICS_VERSION;delete j.pendingFeedback;j.cell=cell.getA1Notation();j.autoNotice=message;j.manualReviewRequired=false;stop(j,row,status);c.audit_(j.id,'SINGLE_PASS_FEEDBACK',message);
 }
 function draft(j){const raw=c.readArtifact_(j.rawId);return JSON.parse((raw.candidates?.[0]?.content?.parts||[]).filter(p=>p.text&&!p.thought).map(p=>p.text).join(''));}
 function limitedFeedback(j,row,error){
  j.technicalWarnings ||= [];j.technicalWarnings.push({error,rawId:j.rawId,at:new Date().toISOString()});
  const g=draft(j);const text=isPhonics(j)?phonicsText(g,j,destination(j).cell.getDisplayValue()):'— NHẬN XÉT GV —\n'+fullFeedback(g);
  j.pendingFeedback=text;persist(j,row);feedback(j,row,text,j.route,'RETURNED');
 } c.generate_=(j,parts,snapshot)=>{
  if(!j.rawId&&!j.retryGenerationAuthorized&&(j.generateRequests||j.runnerGenerationStarted||j.previousGradingAttempts?.length))throw Error('SINGLE_PASS_ALREADY_REQUESTED');
  delete j.retryGenerationAuthorized;const result=generate(j,parts,snapshot);if(j.rawId)throw Error('FULL_FEEDBACK_READY');return result;
 };
 c.step_=(j,row,deadline,options)=>{
  const release=lock(j);if(!release){j.nextAt=Date.now()+15000;persist(j,row);return;}
  try{
   if(j.pendingFeedback){feedback(j,row,j.pendingFeedback,j.route,'RETURNED');delete j.pendingFeedback;persist(j,row);return;}
   if(occupied(destination(j).cell)){stop(j,row,'SKIPPED_ALREADY_GRADED');return;}
   if(j.rawId){limitedFeedback(j,row,'SAVED_RESULT_RECOVERY');return;}
   if(!j.rawId&&!j.gradeId){
    // No recognition request. A valid Form code loads its approved local barem.
    const code=j.contentRouting?.actualCode||j.formCodeCanonical||submittedCode(j.receipt);
    const e=catalog.lookup('kids',code);
    let saved;try{saved=j.snapshotId?c.readArtifact_(j.snapshotId):null;}catch{}
    if((isPhonics(j)&&saved?.barem?.phonicsTemplateVersion!==PHONICS_VERSION)||!saved?.barem||(j.media||[]).some(m=>m.isReference)||normalizeCode(j.route.code)!==normalizeCode(e.code)||j.route.kind!==e.kind){j.route={...structuredClone(e.route),code:e.code,className:j.receipt.className,sourceTab:j.receipt.sourceTab};const s=c.guide_(j.route);j.previousSnapshotId=j.snapshotId;j.snapshotId=c.saveArtifact_('single-pass-input-'+j.id,s);j.sourceHash=c.hash_(s);j.media=(j.media||[]).filter(m=>!m.isReference);j.studentFileCount=j.media.length;persist(j,row);}
   }
   step(j,row,deadline,options);
   if(j.status==='SKIPPED_EXISTING_FEEDBACK')stop(j,row,'SKIPPED_ALREADY_GRADED');
   else if(j.status==='NEEDS_REVIEW'&&j.rawId)limitedFeedback(j,row,j.error||'UNASSESSABLE_OUTPUT');
  }finally{release();}
 };
 c.handleError_=(j,row,e)=>{
  if(networkRetry(j,e.message)){persist(j,row);emit({event:'NETWORK_REQUEUED',id:j.id,nextAt:j.nextAt});return;}
  if(e.message==='FULL_FEEDBACK_READY'){limitedFeedback(j,row,e.message);return;}
  if(e.message==='PREFLIGHT_EXISTING_FEEDBACK'){stop(j,row,'SKIPPED_ALREADY_GRADED');return;}
  if(e.recordingIssue?.category==='wrong_assignment'&&j.rawId){
   const g=draft(j),s=g.submissionCheck||{},actual=localLessonMatch(index,g.studentTranscript||[s.observedTask,s.basis].join(' '));
   if(actual){const route={...structuredClone(actual.route),code:actual.code,className:j.receipt.className,sourceTab:j.receipt.sourceTab};
    if(occupied(destination(j,route).cell)){feedback(j,row,RESUBMIT_OLD,j.formRoute||j.route);return;}
    j.contentRouting={...j.contentRouting,version:ROUTING_VERSION,actualCode:actual.code,method:'LOCAL_KEYWORDS_FROM_SINGLE_RESPONSE'};j.route=route;
   }
   limitedFeedback(j,row,actual?'WRONG_ASSIGNMENT_LOCAL_MATCH':'WRONG_ASSIGNMENT_UNCLEAR');return;
  }
  if(j.rawId&&/^(GRADE_|MODEL_)/.test(e.message)&&!/^GRADE_SUBMISSION_RESUBMIT$/.test(e.message)){limitedFeedback(j,row,e.message);return;}
  if(e.message==='AUDIO_NO_STREAM'){feedback(j,row,RESUBMIT_AUDIO);return;}
  if(/^HTTP_402$|^SINGLE_PASS_ALREADY_REQUESTED$/.test(e.message)){stop(j,row,'AUTOMATION_FAILED',e.message);return;}
  try{handle(j,row,e);}catch(handlerError){j.status='RETRY';j.error=e.message;j.handlerError=handlerError.message;j.nextAt=Date.now()+300000;persist(j,row);}
 };
 c.recoverContentRouting_=()=>{const result={reopened:0,ids:[],repaired:0};for(const {job:j,row} of c.loadJobs_()){
  if(j.status==='RETURNED'&&isPhonics(j)&&j.rawId&&j.phonicsTemplateVersion!==PHONICS_VERSION){try{const cell=destination(j).cell,before=cell.getDisplayValue();const expected=j.autoNotice||(j.backupId?c.readArtifact_(j.backupId)?.output:null);if(expected&&before===expected&&!cell.getFormula()&&!cell.getDataValidation()){const text=phonicsText(draft(j),j,before);const backup=c.saveArtifact_('phonics-hugo-before-'+j.id,{before,after:text,cell:cell.getA1Notation(),rawId:j.rawId});refresh(j);if(cell.getDisplayValue()!==before)continue;cell.setRichTextValue(phonicsRich(c,cell,text));j.autoNotice=text;j.phonicsTemplateVersion=PHONICS_VERSION;j.phonicsTemplateRepair={at:new Date().toISOString(),backup};persist(j,row);result.repaired++;}}catch(e){emit({event:'PHONICS_TEMPLATE_REPAIR_ERROR',id:j.id,error:e.message});}continue;}
  if(j.status==='RETURNED_WITH_LIMITATIONS'&&j.rawId&&j.autoNotice){try{
   const cell=destination(j).cell,before=cell.getDisplayValue();
   if(before===j.autoNotice&&!cell.getFormula()&&!cell.getDataValidation()){
    const g=draft(j);const text=isPhonics(j)?phonicsText(g,j,destination(j).cell.getDisplayValue()):'— NHẬN XÉT GV —\n'+fullFeedback(g);
    const backup=c.saveArtifact_('restore-full-feedback-'+j.id,{before,after:text,rawId:j.rawId,cell:cell.getA1Notation()});
    refresh(j);if(cell.getDisplayValue()!==before)continue;
    cell.setRichTextValue(c.coloredFeedback_(cell,text,null));refresh(j);if(cell.getDisplayValue()!==text)throw Error('WRITE_READBACK_FAILED');
    j.restoredFullFeedback={at:new Date().toISOString(),backup};j.autoNotice=text;j.status='RETURNED';persist(j,row);result.repaired++;
   }
  }catch(e){emit({event:'SAVED_FEEDBACK_REPAIR_ERROR',id:j.id,error:e.message});}continue;}
  if(isPhonics(j)&&['NEEDS_REVIEW','BLOCKED'].includes(j.status)&&!j.rawId&&!j.gradeId&&!j.generateRequests&&/^(DESTINATION_AMBIGUOUS|STUDENT_AMBIGUOUS)/.test(j.error||'')){try{catalog.lookup('kids',submittedCode(j.receipt));const dst=destination(j);if(occupied(dst.cell)){stop(j,row,'SKIPPED_ALREADY_GRADED');}else{j.destinationRepair={at:new Date().toISOString(),previousError:j.error,cell:dst.cell.getA1Notation()};j.status='READY';j.error='';j.nextAt=0;persist(j,row);result.reopened++;result.ids.push(j.id);}}catch{}continue;}
  if(['phonics','phonicsVideo'].includes(j.route?.kind)&&['NEEDS_REVIEW','BLOCKED','AUTOMATION_FAILED'].includes(j.status)&&!j.rawId&&!j.gradeId&&!j.generateRequests&&!j.runnerGenerationStarted&&!j.phonicsLocalBaremRecovery&&['PREFLIGHT_FILE_MISSING_OR_INVALID','BAREM_REFERENCE_MEDIA_FORBIDDEN','BAREM_LEGACY_SNAPSHOT_REQUIRES_MIGRATION'].includes(j.error)){
   try{catalog.lookup('kids',submittedCode(j.receipt));j.phonicsLocalBaremRecovery={at:new Date().toISOString(),previousError:j.error,previousSnapshotId:j.snapshotId};j.status='READY';j.error='';j.nextAt=0;persist(j,row);result.reopened++;result.ids.push(j.id);}catch(e){emit({event:'PHONICS_LOCAL_BAREM_HOLD',id:j.id,error:e.message});}continue;
  }
  if(['NEEDS_REVIEW','AUTOMATION_FAILED','BLOCKED'].includes(j.status)&&networkRetry(j,j.error||'')){persist(j,row);result.reopened++;result.ids.push(j.id);}
  else if(j.rawId&&['NEEDS_REVIEW','AUTOMATION_FAILED','BLOCKED'].includes(j.status)&&((!j.faultRecovery&&/^GRADE_|^MODEL_/.test(j.error||''))||j.error==='BAREM_LEGACY_SNAPSHOT_REQUIRES_MIGRATION')){j.faultRecovery=true;j.status='READY';j.nextAt=0;persist(j,row);result.reopened++;result.ids.push(j.id);}
 }return result;};
 const schema=c.kidsEvidenceSchema_;if(schema)c.kidsEvidenceSchema_=form=>{const s=schema(form);s.properties.roseSections={type:'array',minItems:3,maxItems:3,items:{type:'object',properties:{label:{type:'string'},text:{type:'string'}},required:['label','text'],additionalProperties:false}};s.required.push('roseSections');if(form?.join('|')===PHONICS_LABELS.join('|'))s.properties.roseSections.items.properties.label.enum=PHONICS_LABELS;return s;};
 c.kidsManualAssignmentHold_=()=>undefined;
 const system=c.kidsSystemInstruction_;if(system)c.kidsSystemInstruction_=()=>system()+'\nCHẤM MỘT LƯỢT: Nghe toàn bộ audio/video, đối chiếu barem kèm theo và trả ngay đủ các phần nhận xét trong schema. Không có lượt API nghe hay tìm barem riêng. YÊU CẦU MỚI NHẤT: roseSections gồm 3 phần nhận xét chuẩn ROSE đầy đủ bằng tiếng Việt để ghi nguyên văn: lời nhận xét phải giữ đủ tất cả lỗi, ví dụ câu sửa và cách luyện. Thiếu IPA hoặc mốc giây không làm mất bản chữa. Các trường kỹ thuật là phụ trợ; roseSections là bản nhận xét gửi con. Điền studentTranscript bằng nội dung học sinh thực nói (loại lời chào, tiếng người lớn và phim/nhạc nền) để máy đối soát cục bộ nếu cần. Nếu nội dung rõ là bài khác, submissionCheck wrong_assignment phải có bằng chứng cụ thể; vẫn nêu quan sát phát âm có căn cứ trong cùng kết quả. Đọc yếu, ngọng, vấp hoặc thiếu vài ý vẫn chấm phần nghe rõ và góp ý cụ thể, không coi là nộp nhầm bài. Không bịa lỗi, điểm hay quan sát. Xưng cô/con, không nhắc AI/hệ thống hoặc hứa kiểm tra thủ công. Lời nhắc nộp lại kết thúc bằng Cô đợi bài của con.';
 const generalSystem=c.kidsSystemInstruction_;let phonicsActive=false;c.kidsSystemInstruction_=()=>generalSystem()+(phonicsActive?'\n'+PHONICS_PROMPT:'');const gradeCall=c.generate_;c.generate_=(j,parts,snapshot)=>{phonicsActive=isPhonics(j);try{return gradeCall(j,parts,snapshot);}finally{phonicsActive=false;}};
 const display=c.kidsSheetDisplaySections_;c.kidsSheetDisplaySections_=g=>{const v={...g};delete v.autoRoutingNote;return display(v);};
 const fresh=c.freshReceipt_;c.freshReceipt_=j=>fresh({...j,route:{...j.route,code:j.receipt.code,sourceTab:j.receipt.sourceTab}});
 return {catalogSize:index.length,mode:'SINGLE_PASS',recognitionCalls:0};
}