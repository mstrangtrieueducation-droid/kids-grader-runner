import {createHash} from 'node:crypto';
import {sourceInMasterScope} from './master-submission-scope.mjs';
export const PROVIDER_RETRY_AUTH='teacher-kids-shadow-provider-retry-20261016';
export function hasProviderResult(x,seen=new Set()){
 if(!x||typeof x!=='object'||seen.has(x))return false;seen.add(x);
 if(['rawId','gradeId','verificationRawId','resultHash','usage','apiUsage','verificationUsage','autoNotice','pendingFeedback','pendingFeedbackRender','pendingMasterFeedback','pendingMasterReading'].some(k=>!!x[k])||x.gradeUsable===true||x.providerResponseReceived?.httpStatus===200||x.candidates?.length)return true;
 return Object.values(x).some(v=>v&&typeof v==='object'&&hasProviderResult(v,seen));
}
const norm=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').replace(/[đĐ]/g,'d').replace(/\s+/g,' ').trim().toUpperCase();
export const providerWorkKey=j=>[norm(j.cls?.className||j.source?.className),norm(j.receipt?.student||j.source?.name),norm(j.route?.code||j.source?.code||j.receipt?.code)].join('|');
const attempted=j=>Number(j.generateRequests||j.approvedGenerateRequests||j.physicalGenerateRequests||0)>0||j.masterGenerationReserved||j.runnerGenerationStarted||j.generationAttempt?.calls>0;
export function providerRetryFailure(j){
 const last=j.technicalFailures?.at(-1),http=Number(j.providerFailure?.http||j.systemGradingFailure?.httpCode||last?.httpCode||String(j.error||'').match(/(?:HTTP_|HTTP:)(\d{3})/)?.[1]||(j.error==='PROVIDER_QUOTA_REJECTED'?429:0));
 if([429,500,502,503,504].includes(http))return {kind:'HTTP_'+http,http,outcomeUnknown:http!==429};
 const error=[j.error,j.systemGradingFailure?.cause,last?.code].filter(Boolean).join('|');
 if(/NETWORK_OUTCOME_UNKNOWN|UNCERTAIN_GENERATION(?:_OR_VERIFICATION)?|NETWORK_RETRY|MEDIA_TRANSFER_RETRY/.test(error))return {kind:'NETWORK_NO_RESPONSE',outcomeUnknown:true};
 return null;
}
export function providerRetryCandidate(j){
 return sourceInMasterScope(j.receipt||j.source)&&!/^IELTS\s*4[0-4]$/i.test(j.cls?.className||j.source?.className||'')&&!/^(RETURNED|DONE|COMPLETED_|SKIPPED_|SUPERSEDED_)/.test(j.status||'')
  &&!j.supersededByProviderRetry&&!j.supersededByDashboardRegrade&&!j.presentationResubmissionRequired&&!j.technicalInputFailure&&attempted(j)&&!hasProviderResult(j)&&!!providerRetryFailure(j);
}
export const providerRetryId=id=>createHash('sha256').update(PROVIDER_RETRY_AUTH+'|'+id).digest('hex');
export function providerRetryAfter(response,error,now=Date.now()){
 const info=(error?.details||[]).find(x=>String(x['@type']).endsWith('RetryInfo')),seconds=String(info?.retryDelay||'').match(/^(\d+(?:\.\d+)?)s$/),headers=response.getAllHeaders?.()||{},entry=Object.entries(headers).find(([k])=>k.toLowerCase()==='retry-after'),value=String(entry?.[1]||'');
 return Math.max(seconds?Number(seconds[1])*1000:0,/^\d+$/.test(value)?Number(value)*1000:Math.max(0,Date.parse(value)-now)||0);
}
export function planProviderRetries(jobs,{lane,isLatest,emptyTarget,now=Date.now()}){
 const plans=[],chosen=new Set();
 for(const parent of jobs){
  if(!providerRetryCandidate(parent))continue;
  const key=providerWorkKey(parent),related=jobs.filter(j=>providerWorkKey(j)===key),id=providerRetryId(parent.id);
  if(chosen.has(key)||related.some(j=>hasProviderResult(j))||jobs.some(j=>j.id===id||j.providerRetryOrigin?.parentId===parent.id))continue;
  if(related.some(j=>j!==parent&&!/^(SKIPPED_|SUPERSEDED_|FAILED_|NEEDS_REVIEW|SYSTEM_|WAITING_PROVIDER_QUOTA|PENDING_RETRY)/.test(j.status||'')&&!providerRetryFailure(j)))continue;
  if(!isLatest(parent))continue;
  try{if(!emptyTarget(parent))continue;}catch{continue;}
  const depth=Number(parent.providerRetryOrigin?.depth||0)+1,failure=providerRetryFailure(parent),delay=Math.max(failure.http===429?(depth===1?60000:120000):(depth%3===0?600000:5000),Number(parent.providerFailure?.retryMs||parent.apiError?.retryMs||parent.apiError?.retryAfter||0));
  const failedAt=Date.parse(parent.providerRetry?.failedAt||parent.updatedAt||parent.lastAttemptAt||parent.masterGenerationStartedAt||'');
  const nextAt=Math.max(now,Number.isFinite(failedAt)?failedAt+delay:now+delay);
  const origin={authorization:PROVIDER_RETRY_AUTH,parentId:parent.id,rootId:parent.providerRetryOrigin?.rootId||parent.id,depth,previousFailure:failure,createdAt:new Date(now).toISOString(),priorRequestCount:Number(parent.generateRequests||parent.approvedGenerateRequests||0)};
  const child=lane==='kids'?{id,status:'WAITING_INPUT',receipt:structuredClone(parent.receipt),cls:structuredClone(parent.cls),route:structuredClone(parent.route),autoManaged:true,media:[],attempts:0,error:'',nextAt,providerRetryOrigin:origin}:{id,status:'READY',source:structuredClone(parent.source),route:structuredClone(parent.route||{kind:'shadowing',code:parent.source.code}),error:'',nextAt,providerRetryOrigin:origin};
  plans.push({parent,child,failure,nextAt});chosen.add(key);
 }
 return plans;
}
export function delegateProviderRetries(items,{lane,isLatest,emptyTarget,save,emit=()=>{},now=Date.now()}){
 const plans=planProviderRetries(items.map(x=>x.job),{lane,isLatest,emptyTarget,now});let queued=0;
 for(const {parent,child,failure,nextAt}of plans){
  const item=items.find(x=>x.job.id===parent.id);const row=save(child);
  // A deterministic child checkpoint is written first. A restart finds that ID
  // and never creates a second attempt for the same rejection.
  parent.providerRetry={authorization:PROVIDER_RETRY_AUTH,phase:'DELEGATED',childId:child.id,nextAt,failure,previousStatus:parent.status,previousError:parent.error,failedAt:parent.updatedAt};parent.supersededByProviderRetry=child.id;parent.status='SUPERSEDED_BY_PROVIDER_RETRY';save(parent,item.row);items.push({job:child,row});queued++;emit({event:'PROVIDER_PENDING_RETRY',lane,id:child.id,parentId:parent.id,nextAt,providerCalls:0});
 }
 return {queued,providerCalls:0};
}
