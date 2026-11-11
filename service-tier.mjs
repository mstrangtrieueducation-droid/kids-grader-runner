// Teacher12Nov: same model, same request, same feedback — billed on the Gemini Flex tier (50% of Standard).
// Flex may queue. When Flex has no capacity (429/503/504) the SAME request is sent once on Standard at
// once: a refused Flex call returns no result, so this is still one graded result per submission.
// Set the repository variable KIDS_SERVICE_TIER=standard to return to the old behaviour.
export const SERVICE_TIER_POLICY='kids-flex-first-v1-20261112';
export const FLEX_SERVER_TIMEOUT_S=180;
export const FLEX_CLIENT_TIMEOUT_MS=300000;
export const STANDARD_FALLBACK_MS=240000;
const FALLBACK_CODES=new Set([429,503,504]);

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
export function sendTiered(job,body,call,{env=process.env,now=()=>new Date().toISOString()}={}){
 const tier=requestedTier(env);
 if(tier!=='flex'){const r=call(withTier(body,'standard'),{});job.servedServiceTier=servedTierHeader(r)||'STANDARD';return r;}
 try{
  const r=call(withTier(body,'flex'),{timeoutMs:FLEX_CLIENT_TIMEOUT_MS,headers:{'X-Server-Timeout':String(FLEX_SERVER_TIMEOUT_S)}});
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
export function installServiceTier(c,env=process.env){
 const reserve=c.generationReserve_;
 if(typeof reserve==='function'&&requestedTier(env)==='flex')c.generationReserve_=()=>Math.max(reserve(),FLEX_CLIENT_TIMEOUT_MS+STANDARD_FALLBACK_MS+30000);
}
