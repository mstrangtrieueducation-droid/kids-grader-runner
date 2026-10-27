import assert from 'node:assert/strict';
import {runKidsService} from './continuous-kids-service.mjs';
let clock=0,intakes=0,processed=0,pending=false,scans=0,reads=0,throws=true;const sleeps=[];
await runKidsService({deadline:32*60000,now:()=>clock,sleep:async ms=>{sleeps.push(ms);clock+=ms;},emit:()=>{},
 intake:async()=>{if(throws){throws=false;throw Error('NETWORK_OUTCOME_UNKNOWN');}intakes++;if((clock<60000||clock>=10*60000)&&processed<2&&!pending){pending=true;return {due:true,handled:1};}return {due:false,handled:0};},
 runFrozen:async()=>({counts:{HELD:19,RETRY:4},providerCalls:0}),
 prepareTodo:async()=>{reads++;return {entries:processed+Number(pending),queue:{items:pending?[{state:'PENDING_VALIDATION'}]:[{state:'VERIFIED_WRITTEN'}]}};},
 discover:async()=>{scans++;},runTodo:async()=>{assert(pending);pending=false;processed++;return {counts:{VERIFIED_WRITTEN:processed},providerCalls:1};}});
assert.equal(processed,2,'old held jobs must not block new arrivals, including a later arrival after idle');assert.equal(scans,0,'never scan all classes while frozen work is unresolved');assert.equal(sleeps[0],10000);assert(sleeps.some(x=>x>=9*60000));assert(intakes>2&&reads>2);
console.log('Continuous work survives a network error, consumes new work despite old held rows, sleeps while idle, wakes for later submissions and retains full-scan exclusion; 0 real provider calls.');
