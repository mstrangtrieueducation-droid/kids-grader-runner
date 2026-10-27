import assert from 'node:assert/strict';
import {runKidsService} from './continuous-kids-service.mjs';
let clock=0,intakes=0,processed=0,pending=false,scans=0,reads=0,throws=true;const sleeps=[];
await runKidsService({deadline:32*60000,now:()=>clock,sleep:async ms=>{sleeps.push(ms);clock+=ms;},emit:()=>{},
 intake:async()=>{if(throws){throws=false;throw Error('NETWORK_OUTCOME_UNKNOWN');}intakes++;if((clock<60000||clock>=10*60000)&&processed<2&&!pending){pending=true;return {due:true,handled:1};}return {due:false,handled:0};},
 runFrozen:async()=>({counts:{HELD:19,RETRY:4},providerCalls:0}),
 prepareTodo:async()=>{reads++;return {entries:processed+Number(pending),queue:{items:pending?[{state:'PENDING_VALIDATION'}]:[{state:'VERIFIED_WRITTEN'}]}};},
 discover:async()=>{scans++;},runTodo:async()=>{assert(pending);pending=false;processed++;return {counts:{VERIFIED_WRITTEN:processed},providerCalls:1};}});
assert.equal(processed,2,'old held jobs must not block new arrivals, including a later arrival after idle');assert.equal(scans,0,'never scan all classes while frozen work is unresolved');assert.equal(sleeps[0],10000);assert(sleeps.some(x=>x>=9*60000));assert(intakes>2&&reads>2);
clock=0;let waiting=3;const starts=[];
await runKidsService({deadline:4*60000,now:()=>clock,sleep:async ms=>{clock+=ms;},emit:()=>{},intake:async()=>({due:false,handled:0}),runFrozen:async()=>({counts:{HELD:1},providerCalls:0}),prepareTodo:async()=>({entries:3,queue:{items:[{state:waiting?'RETRY':'VERIFIED_WRITTEN'}]}}),discover:async()=>assert.fail('full scan'),runTodo:async()=>{starts.push(clock);waiting--;return {providerCalls:0,preparationAdvanced:1,counts:{VERIFIED_WRITTEN:3-waiting,RETRY:waiting}};}});
assert.equal(waiting,0);assert.deepEqual(starts,[0,0,0],'forward progress must drain consecutive slices without a ten-minute idle delay');
clock=0;let fresh=true;const order=[];
await runKidsService({deadline:4*60000,now:()=>clock,sleep:async ms=>{clock+=ms;},emit:()=>{},intake:async()=>({due:false,added:fresh?1:0,handled:fresh?1:0}),prepareTodo:async()=>({queue:{items:[{state:fresh?'PENDING_VALIDATION':'VERIFIED_WRITTEN'}]}}),runTodo:async()=>{order.push('new-work');fresh=false;return {counts:{VERIFIED_WRITTEN:1},providerCalls:1};},runFrozen:async()=>{order.push('old-held');return {counts:{HELD:19},providerCalls:0};},discover:async()=>assert.fail('full scan')});
assert(order.indexOf('new-work')<order.indexOf('old-held'),'newly staged native work must enter workers before rechecking old held rows');
console.log('Continuous work survives a network error, consumes new work despite old held rows, sleeps while idle, wakes for later submissions and retains full-scan exclusion; 0 real provider calls.');
