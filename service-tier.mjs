// Teacher12Nov: same model, same request, same feedback — billed on the Gemini Flex tier (50% of Standard).
// Flex may queue. When Flex has no capacity (429/503/504) the SAME request is sent once on Standard at
// once: a refused Flex call returns no result, so this is still one graded result per submission.
// Set the repository variable KIDS_SERVICE_TIER=standard to return to the old behaviour.
export const SERVICE_TIER_POLICY='kids-flex-first-v1-20261112';
export const FLEX_SERVER_TIMEOUT_S=100;
export const FLEX_CLIENT_TIMEOUT_MS=130000;
export const STANDARD_FALLBACK_MS=240000;
const FALLBACK_CODES=new Set([429,503,504]);
// Owner12Nov: in the evening rush (18:30-23:15 VN) families are waiting, so Flex gets at most
// 30 s before the same request goes to Standard; off-peak it keeps the full 100 s for the 50% price.
export const FLEX_PEAK_SERVER_TIMEOUT_S=30;
export function flexWaitSeconds(at=Date.now()){const m=Math.floor(((at/60000)+7*60)%(24*60));return m>=18*60+30&&m<23*60+15?FLEX_PEAK_SERVER_TIMEOUT_S:FLEX_SERVER_TIMEOUT_S;}

export function requestedTier(env=process.env){
 return String(env.KIDS_SERVICE_TIER||'flex').trim().toLowerCase()==='standard'?'standard':'flex';
}
export function withTier(body,tier){
 const p=typeof body==='string'?JSON.parse(body):structuredClone(body);
 if(tier==='flex')p.service_tier='flex';else delete p.service_tier;
 return JSON.stringify(p);
}
export function servedTierHeader(response){
 try{const h=response?.getAllHeaders?.()||{};for(const [k,v]of Object.entries(h))if(k.toLowerCase()==='x-gemini-service-tier'&&v)return String(v).toUpperCase();}catch{}
 return '';
}
// call(payload, extraOptions) performs one HTTP request and throws {httpCode} on a non-2xx answer.
export function sendTiered(job,body,call,{env=process.env,now=()=>new Date().toISOString(),clock=Date.now}={}){
 const tier=requestedTier(env),wait=flexWaitSeconds(clock());
 if(tier!=='flex'){const r=call(withTier(body,'standard'),{});job.servedServiceTier=servedTierHeader(r)||'STANDARD';return r;}
 try{
  const r=call(withTier(body,'flex'),{timeoutMs:wait===FLEX_SERVER_TIMEOUT_S?FLEX_CLIENT_TIMEOUT_MS:(wait+30)*1000,headers:{'X-Server-Timeout':String(wait)}});
  job.servedServiceTier=servedTierHeader(r)||'FLEX';job.serviceTierPolicy=SERVICE_TIER_POLICY;return r;
 }catch(e){
  if(!FALLBACK_CODES.has(Number(e?.httpCode)))throw e;
  job.flexFallbacks=[...(job.flexFallbacks||[]),{at:now(),http:Number(e.httpCode),policy:SERVICE_TIER_POLICY}];
  const r=call(withTier(body,'standard'),{});
  job.servedServiceTier=servedTierHeader(r)||'STANDARD';job.serviceTierPolicy=SERVICE_TIER_POLICY;return r;
 }
}
// Usage receipt input: the tier that actually served this response, without touching the saved raw response.
export function receiptRaw(raw,job){
 const u=raw?.usageMetadata;if(!u||u.serviceTier||!job?.servedServiceTier)return raw;
 return {...raw,usageMetadata:{...u,serviceTier:job.servedServiceTier}};
}
// Owner12Nov evening: never widen the generation reserve. Each queue item has a 5-minute
// budget; a larger reserve stopped every generation (the job stayed READY) and blocked intake.
export function installServiceTier(){}
