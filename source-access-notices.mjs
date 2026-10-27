import {sourceInput,sourceFailure,sourceResult} from './submission-source-policy.mjs';
import {sourceInMasterScope} from './master-submission-scope.mjs';
import {hasRequest,hasSavedResult} from './universal-media.mjs';
import {settleSheetTruth,sheetTruthEnabled} from './sheet-truth-sync.mjs';
export const SOURCE_ACCESS_NOTICE_VERSION='teacher-source-access-notices-20261024';
export function sourceAccessCandidate(j,now=Date.now()){
 return sourceInMasterScope(j.receipt)&&!hasRequest(j)&&!hasSavedResult(j)&&!j.presentationResubmissionRequired&&
  !/^(?:SKIPPED_|COMPLETED_|RETURNED|DONE)/.test(j.status||'')&&
  /SYSTEM_AUDIO_INPUT_SOURCE_UNAVAILABLE|SOURCE_INPUT_(?:ACCESS|INVALID|MISSING)|INVALID_DRIVE_LINK/.test(j.error||j.sourceInputFailure?.cause||'')&&
  !(j.sourceAccessCheck?.version===SOURCE_ACCESS_NOTICE_VERSION&&Number(j.sourceAccessCheck.retryAfter)>now);
}
// Metadata only: no downloads, uploads, token preflights or generation. A valid
// folder is not an invalid video, and downloader/bot errors are never privacy proof.
export function inspectSourceAccess(text,metadata){
 const input=sourceInput(text);if(input.state)return input;
 let checked=0;
 for(const raw of input.urls){const u=new URL(raw);if(!['drive.google.com','docs.google.com'].includes(u.hostname))continue;
  const id=u.pathname.match(/\/(?:d|folders)\/([-\w]{15,})/)?.[1]||u.searchParams.get('id');
  if(!/^[-\w]{15,}$/.test(id||''))continue;
  try{const m=metadata(id);checked++;if(m.trashed)return sourceResult('invalid','DRIVE_LINK_UNAVAILABLE',{accessEvidence:{id,http:200,trashed:true}});
   if(m.mimeType!=='application/vnd.google-apps.folder'&&m.size!==undefined&&Number(m.size)===0)return sourceResult('invalid','EMPTY_OR_REMOVED_FILE',{accessEvidence:{id,http:200,bytes:0}});
  }catch(e){const result=sourceFailure(e),code=Number(e.httpCode||String(e.message||'').match(/(?:HTTP[_ ]|SOURCE_HTTP_)(\d{3})/)?.[1]||0);
   if(!e.driveEvidence?.technical&&[403,404].includes(code))return {...result,reason:[401,403].includes(code)?'DRIVE_ACCESS_DENIED':'DRIVE_LINK_UNAVAILABLE',accessEvidence:{id,http:code}};
   return sourceResult('pending','SOURCE_CHECK_RETRY');
  }
 }
 return sourceResult('pending',checked?'DRIVE_ACCESS_OK':'SOURCE_ACCESS_NOT_CONFIRMED');
}
export function installSourceAccessNotices(c,{g,isLatest,emit=()=>{}}){
 c.hasUnavailableSources_=()=>sheetTruthEnabled()&&c.loadJobs_().some(x=>sourceAccessCandidate(x.job));
 c.reconcileUnavailableSources_=({deadline=Date.now()+90000,limit=6}={})=>{
  let checked=0,notices=0,held=0;
  if(!sheetTruthEnabled())return {checked,notices,held,providerCalls:0};
  const jobs=c.loadJobs_().filter(x=>sourceAccessCandidate(x.job)).sort((a,b)=>Number(/\/folders\//.test(b.job.receipt?.links||''))-Number(/\/folders\//.test(a.job.receipt?.links||'')));
  for(const {job:j,row}of jobs){if(checked>=limit||Date.now()>deadline)break;
   try{if(c.currentRoster_&&!c.currentRoster_(j.receipt,{fresh:true})||!isLatest(j))continue;
    const cell=c.destination_(j.cls,j.route,j.receipt.student).cell;
    if(cell.getFormula()||cell.getDataValidation()||c.hasFeedback_(cell.getDisplayValue()))continue;
    checked++;const result=inspectSourceAccess(j.receipt.links,id=>g.fileMeta(id));
    j.sourceAccessCheck={version:SOURCE_ACCESS_NOTICE_VERSION,at:new Date().toISOString(),reason:result.reason,evidence:result.accessEvidence||null,providerCalls:0,retryAfter:Date.now()+3600000};
    if(['missing','invalid','access'].includes(result.state)){
     j.sourceIntake={...result,receivedAt:j.receipt.time};
     settleSheetTruth({job:j,resolve:()=>c.destination_(j.cls,j.route,j.receipt.student).cell,save:()=>c.persist_(j,row),emit});
     if(j.status==='COMPLETED_NEEDS_RESUBMISSION'){notices++;c.teacherApprovalSession_?.finish(j);}else held++;
    }else held++;
    c.persist_(j,row);
   }catch(e){held++;emit({event:'SOURCE_ACCESS_NOTICE_DEFERRED',reason:/^[A-Z0-9_]+$/.test(e.message||'')?e.message:'SOURCE_CHECK_RETRY',providerCalls:0});}
  }
  return {checked,notices,held,providerCalls:0};
 };
}
