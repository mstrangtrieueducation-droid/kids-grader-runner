import {delegateProviderRetries,providerRetryCandidate,providerRetryFailure,hasProviderResult} from './provider-retry-policy.mjs';
import {receiptOnlyCell} from './dashboard-feedback.mjs';
export function installKidsProviderRetry(c,{emit=()=>{}}={}){
 const api=c.api_;if(api)c.api_=(path,...args)=>{const response=api(path,...args),j=c.activeAudioPayloadJob_;if(String(path).includes(':generateContent')&&response.getResponseCode()===200&&j){j.providerResponseReceived={httpStatus:200,at:new Date().toISOString()};if(c.masterActiveRow)c.persist_(j,c.masterActiveRow);}return response;};
 c.recoverProviderRetries_=()=>{
  if(process.env.RUNNER_HOST!=='github'||process.env.AUTOMATIC_GRADING_AUTHORIZED!=='true'||process.env.MODEL_GRADING_AVAILABLE==='false')return {queued:0,providerCalls:0};
  const latest=new Map();for(const tab of c.masterSweepTabs_||[])for(const s of c.sourceRows_(tab)){const key=[c.norm_(s.className),s.sourceTab,c.norm_(s.student),c.norm_(s.code)].join('|'),old=latest.get(key);if(!old||Date.parse(s.time)>Date.parse(old.time)||s.time===old.time&&s.row>old.row)latest.set(key,s);}
  const isLatest=j=>{const s=j.receipt,fresh=latest.get([c.norm_(s.className),s.sourceTab,c.norm_(s.student),c.norm_(s.code)].join('|'));return fresh&&fresh.row===s.row&&fresh.links===s.links&&fresh.time===s.time;};
  return delegateProviderRetries(c.loadJobs_(),{lane:'kids',isLatest,emptyTarget:j=>{const cell=c.destination_(j.cls,j.route,j.receipt.student).cell,text=cell.getDisplayValue();return !cell.getFormula()&&!cell.getDataValidation()&&!c.hasFeedback_(text)&&receiptOnlyCell(text);},save:(j,row)=>c.persist_(j,row),emit});
 };
 const error=c.handleError_;c.handleError_=(j,row,e)=>{
  if(!hasProviderResult(j)&&Number(j.generateRequests||0)>0&&(/NETWORK_OUTCOME_UNKNOWN|NETWORK_RETRY|UNCERTAIN_GENERATION/.test(e.message||'')||[429,500,502,503,504].includes(Number(e.httpCode)))){
   j.error=e.message;j.providerFailure={http:e.httpCode||null,retryMs:[500,502,503,504].includes(Number(e.httpCode))&&!e.apiDetails?.retryDelay&&Number(e.retryAfter||0)<=60000?0:e.retryAfter||0,code:e.message};j.providerRetry={...j.providerRetry,failedAt:new Date().toISOString()};j.status='PENDING_RETRY';j.nextAt=Date.now()+60000;c.persist_(j,row);c.recoverProviderRetries_();return;
  }
  return error(j,row,e);
 };
}
