import {createHash} from 'node:crypto';
import {sourceInMasterScope} from './master-submission-scope.mjs';
import {generationSpent,normalizeName} from './master-policy.mjs';
import {normalizeCode} from './master-barem.mjs';
import {receiptOnlyCell} from './dashboard-feedback.mjs';

export const CRITICAL_HOMEWORK_POLICY='critical-homework-authority-v1-20261017';
export const CRITICAL_CORRECTION_AUTH='teacher-critical-rubric-regrade-20261017';
export const CRITICAL_CORRECTION_STATUS='SUPERSEDED_BY_AUTHORIZED_CRITICAL_CORRECTION';
export const criticalTextHash=text=>createHash('sha256').update(String(text)).digest('hex');
const nativeHash=text=>createHash('sha256').update(JSON.stringify(String(text))).digest('hex');
const critical=j=>j?.route?.kind==='critical'&&/^CRITICAL-C[123]-L\d+$/.test(normalizeCode(j.route.code));
const authAllowed=a=>a?.approved===true&&a.id===CRITICAL_CORRECTION_AUTH&&a.scope==='critical_proven_wrong_barem';

export function validateCriticalHomework(entry){
 if(entry?.kind!=='critical'||entry.requirements?.contract?.mode!=='mindmap_presentation')return null;
 const b=entry.provenance?.assignmentBinding;
 if(b?.version!=='critical-web-homework-20261017'||b.sourcePriority!=='exact_web_homework_then_presentation_in_the_linked_same_lesson_slide'||b.webUrl!==entry.sourceUrl||!b.webSha256||!b.homeworkSha256||!b.slideId||!b.presentationSlideIds?.length||!entry.content?.assignment?.homework?.length||!entry.content?.sourcePassages?.length)throw Error('CRITICAL_HOMEWORK_SOURCE_UNVERIFIED');
 if(entry.provenance.assignedTheory||entry.content.classroomPracticeScope||entry.content.assignment.promptsAreSeparateQATask!==false)throw Error('CRITICAL_HOMEWORK_AUTHORITY_CONFLICT');
 if(criticalTextHash(entry.content.assignment.homework.join('\n'))!==b.homeworkSha256||entry.content.sourcePassages.some(p=>p.sourceCode!==entry.code||!b.presentationSlideIds.includes(p.slideId)))throw Error('CRITICAL_HOMEWORK_SOURCE_BINDING_CHANGED');
 return {policy:CRITICAL_HOMEWORK_POLICY,baremHash:entry.sha256,webSha256:b.webSha256,homeworkSha256:b.homeworkSha256,slideId:b.slideId,presentationSlideIds:b.presentationSlideIds};
}

export function criticalCorrectionPlan(parent,snapshot,entry,{authorization,currentText,childId,isLatest=true,protectedCell=false}={}){
 if(!authAllowed(authorization)||!critical(parent)||!sourceInMasterScope(parent.receipt)||!isLatest||protectedCell||!parent.rawId||!snapshot?.barem||parent.criticalCorrection||parent.supersededByCriticalCorrection||parent.presentationResubmissionRequired||parent.technicalInputFailure||parent.status==='SKIPPED_OLD_SUBMISSION'||parent.status==='GENERATING')return null;
 const authority=validateCriticalHomework(entry),oldHash=snapshot.barem.sha256;
 if(!authority||normalizeCode(snapshot.barem.code)!==normalizeCode(entry.code)||normalizeCode(parent.receipt.code)!==normalizeCode(entry.code)||oldHash===entry.sha256||!entry.provenance.assignmentBinding.supersedesBaremHashes?.includes(oldHash))return null;
 const managed=!!parent.autoNotice&&String(currentText)===parent.autoNotice||!!parent.resultHash&&nativeHash(currentText)===parent.resultHash;
 if(!managed&&!receiptOnlyCell(currentText))return null;
 // An explicit correction is a new record, never a reset of a paid record.
 // Old raw, usage, counters, reservations, and all archives remain in the parent.
 return {id:childId,status:'WAITING_INPUT',route:{...structuredClone(entry.route),code:parent.receipt.code,className:parent.cls.className,sourceTab:parent.receipt.sourceTab},receipt:structuredClone(parent.receipt),cls:structuredClone(parent.cls),media:[],generateRequests:0,attempts:0,nextAt:0,error:'',autoManaged:true,regradeParentId:parent.id,criticalCorrection:{version:CRITICAL_HOMEWORK_POLICY,authorization:authorization.id,parentId:parent.id,rootId:parent.id,oldBaremHash:oldHash,baremHash:entry.sha256,sourceFingerprint:criticalTextHash(JSON.stringify(parent.receipt)),expectedTextHash:criticalTextHash(currentText),targetSpreadsheetId:parent.cls.spreadsheetId,requestedAt:new Date().toISOString()},masterSweep:{version:'master-cross-class-20261014',baseline:'EMPTY',mode:'AUTHORIZED_CRITICAL_BAREM_CORRECTION',at:new Date().toISOString()}};
}

// Read the live class cell, headers and pupil row independently of a RAM batch.
// A teacher edit/row or column insertion during generation must not be overwritten.
export function verifyLiveCriticalTarget(c,google,j,cell){
 const sheet=cell.sheet,name=sheet.getName().replaceAll("'","''"),ranges=["'"+name+"'!1:4","'"+name+"'!B"+cell.r+':C'+cell.r,"'"+name+"'!"+cell.getA1Notation()],data=google.api('https://sheets.googleapis.com/v4/spreadsheets/'+sheet.book.id+'?'+ranges.map(r=>'ranges='+encodeURIComponent(r)).join('&')+'&includeGridData=true&fields=sheets(properties(sheetId),merges,data(startRow,startColumn,rowData(values(formattedValue,userEnteredValue,dataValidation))))'),s=data.sheets.find(x=>x.properties.sheetId===sheet.getSheetId());if(!s)return false;
 const rows=[];for(const block of s.data||[])for(const [i,r]of (block.rowData||[]).entries()){const row=rows[(block.startRow||0)+i] ||= [];for(const [k,v]of (r.values||[]).entries())row[(block.startColumn||0)+k]=v;}
 const headers=Array.from({length:4},(_,i)=>(rows[i]||[]).map(v=>v?.formattedValue||''));for(const m of s.merges||[]){if(m.startRowIndex>=4)continue;for(let i=m.startRowIndex;i<Math.min(4,m.endRowIndex);i++)for(let k=m.startColumnIndex;k<m.endColumnIndex;k++)headers[i][k]=rows[m.startRowIndex]?.[m.startColumnIndex]?.formattedValue||'';}
 const target=rows[cell.r-1]?.[cell.c-1],names=rows[cell.r-1]||[];return !!target&&!target.userEnteredValue?.formulaValue&&!target.dataValidation&&[names[1]?.formattedValue,names[2]?.formattedValue].some(n=>normalizeName(n)===normalizeName(j.receipt.student))&&c.autoColumns_(headers,j.route)===cell.c&&criticalTextHash(target.formattedValue||'')===j.criticalCorrection.expectedTextHash;
}

export function installCriticalHomeworkPolicy(c,catalog,{authorization,emit=()=>{},isLatest,verifyReplacement}={}){
 const guide=c.guide_,prompt=c.kidsEvidencePrompt_,system=c.kidsSystemInstruction_,step=c.step_,generate=c.generate_,hasFeedback=c.hasFeedback_,batchQueue=c.batchQueue_;
 const instruction='CRITICAL — THẨM QUYỀN ĐỀ BÀI: yêu cầu HOMEWORK của đúng trang nộp bài và phần MINDMAP/PRESENTATION của slide gắn ngay trên trang đó là chuẩn chấm. Không thay bằng chủ đề lý thuyết ở buổi trước, tiêu đề Vocabulary & Revision, số Lesson nội bộ cũ trong slide, hoặc nhận xét/lịch sử chấm trước. Câu hỏi gợi ý là nhánh triển khai mindmap, không tự thêm bài hỏi đáp/video thứ hai. Chấp nhận ví dụ đúng thuộc chủ đề rộng, mindmap cá nhân, cách diễn đạt tương đương; không bắt thuộc nguyên văn hoặc nói đủ mọi ví dụ trên slide. Chỉ kết luận wrong_assignment khi nội dung thực sự không thuộc phạm vi HOMEWORK đã nạp; không phạt học sinh vì các tài liệu nguồn của giáo viên mâu thuẫn.';
 c.guide_=route=>{const s=guide(route);if(route.kind!=='critical')return s;const entry=catalog.lookup('kids',route.code),authority=validateCriticalHomework(entry);if(!authority)return s;return {...s,form:s.form.map((label,i)=>i===0?'Nội dung thuyết trình theo mindmap':label),criticalHomework:authority};};
 c.kidsEvidencePrompt_=s=>prompt(s)+(s.kind==='critical'?'\n'+instruction:'');
 c.kidsSystemInstruction_=()=>system()+'\n'+instruction;
 const latest=j=>isLatest?isLatest(j):false;
 function identity(j){const p=j.criticalCorrection;if(!critical(j)||!p||p.version!==CRITICAL_HOMEWORK_POLICY||p.authorization!==authorization?.id||!authAllowed(authorization)||!sourceInMasterScope(j.receipt)||p.sourceFingerprint!==criticalTextHash(JSON.stringify(j.receipt))||p.targetSpreadsheetId!==j.cls?.spreadsheetId)return false;const e=catalog.lookup('kids',j.route.code);return validateCriticalHomework(e)&&e.sha256===p.baremHash&&e.provenance.assignmentBinding.supersedesBaremHashes?.includes(p.oldBaremHash);}
 c.criticalCorrectionMayReplace_=(j,cell)=>!!identity(j)&&latest(j)&&!cell.getFormula()&&!cell.getDataValidation()&&criticalTextHash(cell.getDisplayValue())===j.criticalCorrection.expectedTextHash;
 c.isPendingCriticalCorrection_=j=>!!identity(j)&&!['RETURNED','SKIPPED_ALREADY_GRADED','SKIPPED_OLD_SUBMISSION'].includes(j.status);
 c.hasFeedback_=text=>c.activeCriticalCorrection_&&criticalTextHash(text)===c.activeCriticalCorrection_.expectedTextHash?false:hasFeedback(text);
 const destination=c.destination_;c.destination_=(...args)=>{const dst=destination(...args),active=c.activeCriticalCorrectionJob_;if(active&&args[0]?.spreadsheetId===active.cls.spreadsheetId&&normalizeCode(args[1]?.code)===normalizeCode(active.route.code)&&normalizeName(args[2])===normalizeName(active.receipt.student)){const write=dst.cell.setRichTextValue?.bind(dst.cell);if(write)dst.cell.setRichTextValue=rich=>{if(verifyReplacement&&!verifyReplacement(active,dst.cell))throw Error('CRITICAL_CORRECTION_TARGET_CHANGED');return write(rich);};}return dst;};
 if(batchQueue)c.batchQueue_=items=>batchQueue(items).sort((a,b)=>Number(!!b.job.criticalCorrection)-Number(!!a.job.criticalCorrection));
 c.recoverCriticalCorrections_=()=>{
  const result={queued:0,preserved:0,providerCalls:0};if(process.env.RUNNER_HOST!=='github'||process.env.AUTOMATIC_GRADING_AUTHORIZED!=='true'||!authAllowed(authorization))return result;
  const jobs=c.loadJobs_(),ids=new Map(jobs.map(x=>[x.job.id,x]));
  for(const item of [...jobs]){
   const j=item.job;if(!critical(j)||!j.rawId||j.criticalCorrection||j.supersededByCriticalCorrection||!sourceInMasterScope(j.receipt))continue;
   try{const entry=catalog.lookup('kids',j.route.code),binding=entry.provenance?.assignmentBinding;if(!binding?.supersedesBaremHashes?.length)continue;
    const snapshot=j.snapshotId?c.readArtifact_(j.snapshotId):null;if(!binding.supersedesBaremHashes.includes(snapshot?.barem?.sha256))continue;
    const sourceFingerprint=criticalTextHash(JSON.stringify(j.receipt)),childId=c.hash_([CRITICAL_CORRECTION_AUTH,j.cls?.spreadsheetId,normalizeCode(j.route.code),sourceFingerprint]),existing=ids.get(childId);if(existing){if(existing.job.criticalCorrection?.sourceFingerprint!==sourceFingerprint||existing.job.criticalCorrection?.targetSpreadsheetId!==j.cls?.spreadsheetId)throw Error('CRITICAL_CORRECTION_ID_CONFLICT');j.criticalCorrectionPreviousStatus ||= j.status;j.supersededByCriticalCorrection=childId;j.status=CRITICAL_CORRECTION_STATUS;c.persist_(j,item.row);continue;}
    const dst=c.destination_(j.cls,j.route,j.receipt.student),cell=dst.cell,text=cell.getDisplayValue(),child=criticalCorrectionPlan(j,snapshot,entry,{authorization,currentText:text,childId,isLatest:latest(j),protectedCell:!!cell.getFormula()||!!cell.getDataValidation()});if(!child){result.preserved++;continue;}
    const rich=cell.getRichTextValue?.();child.criticalCorrection.beforeArtifactId=c.saveArtifact_('critical-correction-before-'+j.id,{parent:structuredClone(j),snapshotId:j.snapshotId,rawId:j.rawId,text,cell:cell.getA1Notation(),spreadsheetId:j.cls.spreadsheetId,sheetId:dst.sheet?.getSheetId?.(),richText:rich?{text:rich.getText(),runs:rich.getRuns().map(r=>({start:r.getStartIndex(),end:r.getEndIndex(),text:r.getText(),link:r.getLinkUrl(),style:r.getTextStyle()}))}:null});
    const row=c.persist_(child);ids.set(childId,{job:child,row});j.criticalCorrectionPreviousStatus=j.status;j.supersededByCriticalCorrection=childId;j.status=CRITICAL_CORRECTION_STATUS;c.persist_(j,item.row);result.queued++;emit({event:'CRITICAL_CORRECTION_AUTHORIZED',parentId:j.id,id:childId,code:j.route.code,providerCalls:0});
   }catch(e){emit({event:'CRITICAL_CORRECTION_PRESERVED',id:j.id,error:e.message,providerCalls:0});}
  }return result;
 };
 c.generate_=(j,parts,snapshot)=>{if(critical(j)&&!j.rawId){const entry=catalog.lookup('kids',j.route.code),authority=validateCriticalHomework(entry);if(authority&&(snapshot?.criticalHomework?.baremHash!==entry.sha256||snapshot.barem?.sha256!==entry.sha256))throw Error('CRITICAL_HOMEWORK_SNAPSHOT_STALE');if(j.criticalCorrection){const cell=c.destination_(j.cls,j.route,j.receipt.student).cell;if(!c.criticalCorrectionMayReplace_(j,cell)||verifyReplacement&&!verifyReplacement(j,cell))throw Error('CRITICAL_CORRECTION_TARGET_CHANGED');}}return generate(j,parts,snapshot);};
 c.step_=(j,row,...args)=>{
  if(!critical(j))return step(j,row,...args);
  const active=c.activeCriticalCorrection_,activeJob=c.activeCriticalCorrectionJob_;
  try{
   if(j.criticalCorrection){const cell=c.destination_(j.cls,j.route,j.receipt.student).cell;if(!c.criticalCorrectionMayReplace_(j,cell)){if(j.autoNotice&&cell.getDisplayValue()===j.autoNotice&&j.rawId){j.status='RETURNED';j.error='';c.persist_(j,row);return;}j.status='NEEDS_REVIEW';j.error='CRITICAL_CORRECTION_TARGET_CHANGED';c.persist_(j,row);return;}c.activeCriticalCorrection_=j.criticalCorrection;c.activeCriticalCorrectionJob_=j;}
   if(!j.rawId&&!j.gradeId&&!generationSpent(j)&&j.snapshotId){const saved=c.readArtifact_(j.snapshotId),fresh=c.guide_(j.route);if(fresh.criticalHomework&&(saved.criticalHomework?.baremHash!==fresh.criticalHomework.baremHash||saved.barem?.sha256!==fresh.barem.sha256)){j.criticalSnapshotMigration={previousSnapshotId:j.snapshotId,previousSourceHash:j.sourceHash,at:new Date().toISOString()};j.snapshotId=c.saveArtifact_('critical-homework-source-'+j.id,fresh);j.sourceHash=c.hash_(fresh);c.persist_(j,row);}}
   return step(j,row,...args);
  }finally{c.activeCriticalCorrection_=active;c.activeCriticalCorrectionJob_=activeJob;}
 };
 emit({event:'CRITICAL_HOMEWORK_POLICY_INSTALLED',version:CRITICAL_HOMEWORK_POLICY,correctionAuthorized:authAllowed(authorization),providerCalls:0});
}
