import {createHash} from 'node:crypto';
import {completeScoredResponse} from './scored-assessment-policy.mjs';
import {decodeSavedDraft} from './saved-draft.mjs';
import {savedFeedback,savedFeedbackRich} from './saved-feedback.mjs';
import {isPhonics,phonicsText,phonicsRich} from './phonics-template.mjs';
import {oldGradedSubmission} from './zero-cost-gates.mjs';
import {cellEvidence,expectedBindings,guardClassRequests} from './sheet-truth-write-guard.mjs';
import {commitClassValues} from './class-values-commit.mjs';
export const RECOVERY_VERSION='scored-native-feedback-authority-20261030';
const marker='— NHẬN XÉT GV —';
const body=s=>String(s||'').includes(marker)?String(s).slice(String(s).indexOf(marker)+marker.length).trim():String(s||'').trim();
export function machineMismatchNotice(job,text=job.autoNotice){
 if(!text||/Chất lượng:\s*đạt(?: khoảng)?\s*\d+(?:[.,]\d+)?\s*%/iu.test(text))return false;
 // Select only machine-authored mismatch notices for restoration. These words
 // never classify the pupil's assignment, transcript, or returned assessment.
 return /^(?:❌|⚠️?|\s)*\s*CẦN NỘP LẠI/iu.test(body(text))&&/nộp nhầm|bài trong video con đã nộp|bài cần nộp ở buổi này|trong video, con đang thực hiện/iu.test(body(text));
}
export function mayReplaceMachineNotice(job,text){return machineMismatchNotice(job)&&body(text)===body(job.autoNotice);}
export function restoreScoredFeedback(c,g,entries,{emit=()=>{},commit=commitClassValues,guard=guardClassRequests,heartbeat=()=>{}}={}){
 const groups=new Map(),report={version:RECOVERY_VERSION,restored:[],skipped:[],errors:[],providerCalls:0};
 for(const entry of entries){const j=entry.job;if(!machineMismatchNotice(j)||!j.rawId&&!j.gradeId)continue;
  try{
   heartbeat();
   const raw=c.readArtifact_(j.rawId||j.gradeId),draft=decodeSavedDraft(raw);if(!completeScoredResponse(raw,draft)){report.skipped.push({id:j.id,reason:'NO_COMPLETE_VALID_SCORED_RESPONSE'});continue;}
   if(!c.currentRoster_?.(j.receipt,{fresh:true})){report.skipped.push({id:j.id,reason:'NOT_IN_CURRENT_ROSTER'});continue;}
   const fresh=c.freshReceipt_(j);if(!fresh||c.hash_(fresh)!==c.hash_(j.receipt))throw Error('STALE_RECEIPT');
   const work={...j,route:j.formRoute||j.route};
   const prior=oldGradedSubmission(work,entries,p=>{try{const text=c.destination_(p.cls,p.route,p.receipt.student).cell.getDisplayValue();return /Chất lượng:\s*đạt(?: khoảng)?\s*\d+(?:[.,]\d+)?\s*%/iu.test(text);}catch{return false;}});
   if(prior){report.skipped.push({id:j.id,reason:'EXACT_PRIOR_GRADED_MEDIA',priorId:prior.id});continue;}
   let {sheet,cell}=c.destination_(work.cls,work.route,work.receipt.student);
   if(g.preloadSource){g.preloadSource(work.cls.spreadsheetId,sheet.meta.properties.gridProperties.columnCount,[sheet.getName()]);({sheet,cell}=c.destination_(work.cls,work.route,work.receipt.student));}
   const before=cell.getDisplayValue();if(!mayReplaceMachineNotice(j,before)||cell.getFormula()||cell.getDataValidation())throw Error('CURRENT_CELL_NOT_UNCHANGED_MACHINE_NOTICE');
   const snapshot=j.snapshotId?c.readArtifact_(j.snapshotId):{},rendered=isPhonics(work)?null:savedFeedback(draft,work,before,snapshot),text=rendered?.text||phonicsText(draft,work,before,snapshot);
   if(!/Chất lượng:\s*đạt(?: khoảng)?\s*\d+(?:[.,]\d+)?\s*%/iu.test(text))throw Error('SCORED_RENDER_REQUIRED');
   const rich=rendered?savedFeedbackRich(c,cell,text,rendered.sections):phonicsRich(c,cell,text),master=sheet.book.cache.get(sheet.getName()+'|master'),row=cell.getRow()-1,col=cell.getColumn()-1;
   if(!master?.cells)throw Error('NATIVE_CELL_EVIDENCE_REQUIRED');
   const expected={key:[sheet.getSheetId(),row,col].join('|'),sheetId:sheet.getSheetId(),title:sheet.getName(),row,col,before:structuredClone(cellEvidence(master.cells[row]?.values?.[col])),...expectedBindings(sheet,master,row,col)};
   const runs=rich.runs.map(r=>{const hex=r.style.color||'#0D47A1',format={...(r.style.format||{}),bold:!!r.style.bold,foregroundColorStyle:{rgbColor:{red:parseInt(hex.slice(1,3),16)/255,green:parseInt(hex.slice(3,5),16)/255,blue:parseInt(hex.slice(5,7),16)/255}}};delete format.foregroundColor;return {startIndex:r.start,format};});
   const request={updateCells:{range:{sheetId:sheet.getSheetId(),startRowIndex:row,endRowIndex:row+1,startColumnIndex:col,endColumnIndex:col+1},rows:[{values:[{userEnteredValue:{stringValue:text},textFormatRuns:runs,userEnteredFormat:{wrapStrategy:'WRAP',horizontalAlignment:'LEFT',verticalAlignment:'TOP'}}]}],fields:'userEnteredValue,textFormatRuns,userEnteredFormat.wrapStrategy,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment'}};
   const backup=c.saveArtifact_('scored-feedback-before-'+j.id,{version:RECOVERY_VERSION,rawId:j.rawId||j.gradeId,before,after:text,cell:cell.getA1Notation(),note:cell.getNote(),providerCalls:0});
   const planned={entry,text,expected,request,backup,cell:cell.getA1Notation(),route:work.route,score:rendered?.score??Number(String(draft.band).replace('%',''))};
   const list=groups.get(j.cls.spreadsheetId)||[];list.push(planned);groups.set(j.cls.spreadsheetId,list);
  }catch(e){report.errors.push({id:j.id,reason:e.message});}
 }
 for(const [id,list]of groups)for(let start=0;start<list.length;start+=10){const chunk=list.slice(start,start+10),expected=chunk.map(x=>x.expected),plan=guard(g,id,chunk.map(x=>x.request),expected);
  if(!plan.requests.length){report.errors.push(...chunk.map(x=>({id:x.entry.job.id,reason:'DESTINATION_CHANGED_BEFORE_COMMIT'})));continue;}
  const proof=commit(g,id,plan.requests,expected,{emit});
  for(const x of chunk){if(!plan.requests.includes(x.request))continue;const receipt=proof.cells.find(r=>r.sheetId===x.expected.sheetId&&r.row===x.expected.row&&r.col===x.expected.col&&r.textHash===createHash('sha256').update(x.text).digest('hex'));if(!receipt)throw Error('SCORED_REPAIR_WRITE_ACK_REQUIRED');
   const j=x.entry.job;j.returnedScoreRepair={version:RECOVERY_VERSION,at:receipt.committedAt,rawId:j.rawId||j.gradeId,backup:x.backup,previousStatus:j.status,previousNotice:j.autoNotice,writeReceipt:receipt,providerCalls:0};j.route=x.route;j.autoNotice=x.text;j.cell=x.cell;j.status='RETURNED';j.error='';j.nextAt=0;c.persist_(j,x.entry.row);
   report.restored.push({id:j.id,rawId:j.rawId||j.gradeId,student:j.receipt.student,className:j.cls.className,code:j.receipt.code,cell:x.cell,score:x.score,writeReceipt:receipt});
  }
 }
 emit({event:'SCORED_FEEDBACK_RESTORED',version:RECOVERY_VERSION,restored:report.restored.length,skipped:report.skipped.length,errors:report.errors.reduce((a,x)=>(a[x.reason]=(a[x.reason]||0)+1,a),{}),providerCalls:0});return report;
}
