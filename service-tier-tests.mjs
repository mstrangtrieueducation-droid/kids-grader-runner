import assert from 'node:assert/strict';
import {sendTiered,receiptRaw,withTier,requestedTier,installServiceTier,FLEX_CLIENT_TIMEOUT_MS} from './service-tier.mjs';
import {phonicsFrameParts} from './phonics-frame.mjs';

const ok=(tier)=>({getResponseCode:()=>200,getAllHeaders:()=>tier?{'X-Gemini-Service-Tier':tier}:{}});
const fail=code=>{const e=Error('HTTP_'+code);e.httpCode=code;return e;};
const body=JSON.stringify({contents:[{parts:[{text:'x'}]}]});

// Flex is requested by default, with the long timeout and a server hint.
{const j={},calls=[];sendTiered(j,body,(p,x)=>{calls.push({p:JSON.parse(p),x});return ok('');},{env:{}});
 assert.equal(calls.length,1);assert.equal(calls[0].p.service_tier,'flex');assert.equal(calls[0].x.timeoutMs,FLEX_CLIENT_TIMEOUT_MS);assert.ok(calls[0].x.headers['X-Server-Timeout']);assert.equal(j.servedServiceTier,'FLEX');}
// The served-tier header wins.
{const j={};sendTiered(j,body,()=>ok('standard'),{env:{}});assert.equal(j.servedServiceTier,'STANDARD');}
// No Flex capacity: the same request goes once to Standard, nothing else changes.
for(const code of [429,503,504]){const j={},calls=[];sendTiered(j,body,(p,x)=>{calls.push(JSON.parse(p));if(calls.length===1)throw fail(code);return ok('');},{env:{}});
 assert.equal(calls.length,2);assert.equal(calls[1].service_tier,undefined);assert.deepEqual({...calls[0],service_tier:undefined},{...calls[1],service_tier:undefined});assert.equal(j.servedServiceTier,'STANDARD');assert.equal(j.flexFallbacks.length,1);}
// Other failures keep the existing handling: no second request.
for(const code of [400,500]){const calls=[];assert.throws(()=>sendTiered({},body,()=>{calls.push(1);throw fail(code);},{env:{}}));assert.equal(calls.length,1);}
{const calls=[];assert.throws(()=>sendTiered({},body,()=>{calls.push(1);throw Error('NETWORK_OUTCOME_UNKNOWN');},{env:{}}));assert.equal(calls.length,1);}
// Switch back to Standard with the repository variable.
{assert.equal(requestedTier({KIDS_SERVICE_TIER:'standard'}),'standard');const calls=[];sendTiered({},body,(p)=>{calls.push(JSON.parse(p));return ok('');},{env:{KIDS_SERVICE_TIER:'standard'}});assert.equal(calls[0].service_tier,undefined);}
assert.equal(JSON.parse(withTier(body,'flex')).service_tier,'flex');
// Receipt sees the served tier; the saved raw response is untouched.
{const raw={usageMetadata:{promptTokenCount:1}};const r=receiptRaw(raw,{servedServiceTier:'FLEX'});assert.equal(r.usageMetadata.serviceTier,'FLEX');assert.equal(raw.usageMetadata.serviceTier,undefined);}
// Workers keep enough time for a Flex call plus a Standard fallback before a deadline.
// The generation reserve is never changed: a queue item has a 5-minute budget (ITEM_MS).
{const c={generationReserve_:()=>90000};installServiceTier(c,{});assert.equal(c.generationReserve_(),90000);assert.ok(FLEX_CLIENT_TIMEOUT_MS<5*60000-90000);}
// A frame already sent at the same time is not sent twice; its screen label stays.
{const frame=t=>({path:'f'+t,timeSeconds:t,mime:'image/jpeg'});
 const job={route:{kind:'science'},media:[{mime:'video/mp4',runnerContextFrames:[frame(10),frame(40)],runnerScreenFrames:[{...frame(1),version:'screen-first-v1-20261015'},{...frame(40),version:'screen-first-v1-20261015'}]}]};
 const parts=phonicsFrameParts(job,{read:()=>Buffer.from('img'),exists:()=>true});
 assert.equal(parts.filter(p=>p.inlineData).length,3);assert.equal(job.screenGroundingFrames.length,2);
 assert.ok(parts.some(p=>p.text?.includes('chính là ảnh đã gửi ở trên')));}
console.log('service-tier tests passed');
