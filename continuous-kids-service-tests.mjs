import assert from 'node:assert/strict';
import {runKidsService as productionService} from './continuous-kids-service.mjs';
const runKidsService=options=>productionService({...options,checkUpgrade:async()=>false});
let clock=0,intakes=0,processed=0,pending=false,scans=0,reads=0,throws=true;const sleeps=[];
await runKidsService({deadline:32*60000,now:()=>clock,sleep:async ms=>{sleeps.push(ms);clock+=ms;},emit:()=>{},
 intake:async()=>{if(throws){throws=false;throw Error('NETWORK_OUTCOME_UNKNOWN');}intakes++;if((clock<60000||clock>=10*60000)&&processed<2&&!pending){pending=true;return {due:true,handled:1};}return {due:false,handled:0};},
 runFrozen:async()=>({counts:{HELD:19,RETRY:4},providerCalls:0}),
 prepareTodo:async()=>{reads++;return {entries:processed+Number(pending),queue:{items:pending?[{state:'PENDING_VALIDATION'}]:[{state:'VERIFIED_WRITTEN'}]}};},
 discover:async()=>{scans++;},runTodo:async()=>{assert(pending);pending=false;processed++;return {counts:{VERIFIED_WRITTEN:processed},providerCalls:1};}});
assert.equal(processed,2,'old held jobs must not block new arrivals, including a later arrival after idle');assert.equal(scans,0,'never scan all classes while frozen work is unresolved');assert.equal(sleeps[0],10000);assert(sleeps.some(x=>x>=9*60000));assert(intakes>2&&reads>2);
clock=0;let waiting=3;const starts=[];
await runKidsService({deadline:14*60000,now:()=>clock,sleep:async ms=>{clock+=ms;},emit:()=>{},intake:async()=>({due:false,handled:0}),runFrozen:async()=>({counts:{HELD:1},providerCalls:0}),prepareTodo:async()=>({entries:3,queue:{items:[{state:waiting?'RETRY':'VERIFIED_WRITTEN'}]}}),discover:async()=>assert.fail('full scan'),runTodo:async()=>{starts.push(clock);waiting--;return {providerCalls:0,preparationAdvanced:1,counts:{VERIFIED_WRITTEN:3-waiting,RETRY:waiting}};}});
assert.equal(waiting,0);assert.deepEqual(starts,[0,0,0],'forward progress must drain consecutive slices without a ten-minute idle delay');
clock=0;let fresh=true;const order=[];
await runKidsService({deadline:14*60000,now:()=>clock,sleep:async ms=>{clock+=ms;},emit:()=>{},intake:async()=>({due:false,added:fresh?1:0,handled:fresh?1:0}),prepareTodo:async()=>({queue:{items:[{state:fresh?'PENDING_VALIDATION':'VERIFIED_WRITTEN'}]}}),runTodo:async()=>{order.push('new-work');fresh=false;return {counts:{VERIFIED_WRITTEN:1},providerCalls:1};},runFrozen:async()=>{order.push('old-held');return {counts:{HELD:19},providerCalls:0};},discover:async()=>assert.fail('full scan')});
assert(order.indexOf('new-work')<order.indexOf('old-held'),'newly staged native work must enter workers before rechecking old held rows');
console.log('Continuous work survives a network error, consumes new work despite old held rows, sleeps while idle, wakes for later submissions and retains full-scan exclusion; 0 real provider calls.');

// A source notice was repaired by a previous coordinator. No new Form row or
// membership append is needed to make its native PENDING_VALIDATION work ready.
clock=0;let restored=3;const restoredOrder=[];
await runKidsService({deadline:14*60000,now:()=>clock,sleep:async ms=>{clock+=ms;},emit:()=>{},intake:async()=>({due:false,added:0,handled:0}),prepareTodo:async()=>({added:0,queue:{items:[{state:restored?'PENDING_VALIDATION':'VERIFIED_WRITTEN'}]}}),runTodo:async()=>{restoredOrder.push('restored-native');restored--;return {counts:{VERIFIED_WRITTEN:3-restored,PENDING_VALIDATION:restored},providerCalls:1};},runFrozen:async()=>{restoredOrder.push('old-frozen');return {counts:{HELD:12},providerCalls:0};},discover:async()=>assert.fail('no full scan while history unresolved')});
assert.equal(restored,0);assert.deepEqual(restoredOrder.slice(0,4),['restored-native','restored-native','restored-native','old-frozen'],'existing reopened work starts first without a new intake event and retains 3:1 fairness');
console.log('PASS durable reopened native work starts before frozen backlog, even with intake.added=0 and todo.added=0; original four-worker execution and protected native eligibility retained.');

clock=0;let longBudget;
await runKidsService({deadline:300*60000,now:()=>clock,sleep:async ms=>{clock+=ms;},emit:()=>{},intake:async()=>({due:false,added:1}),prepareTodo:async()=>({queue:{items:[{state:'PENDING_VALIDATION'}]}}),runTodo:async minutes=>{longBudget=minutes;clock=300*60000;return {counts:{VERIFIED_WRITTEN:1},providerCalls:1};},runFrozen:async()=>assert.fail('not before native'),discover:async()=>assert.fail('no full scan')});
assert(longBudget>290,'pending work receives the remaining five-hour window rather than an eight-minute slice');

clock=0;let upgrades=0,committed=0;
const handover=await productionService({deadline:300*60000,checkUpgrade:async()=>false,now:()=>clock,sleep:async ms=>{clock+=ms;},emit:()=>{},intake:async()=>({added:1}),prepareTodo:async()=>({queue:{items:[{state:'PENDING_VALIDATION'}]}}),runTodo:async()=>{committed++;return {upgradeRequested:true,counts:{VERIFIED_WRITTEN:1},providerCalls:1};},runFrozen:async()=>assert.fail('no old-code work after drained upgrade'),discover:async()=>assert.fail('no scan')});
assert.equal(committed,1);assert.equal(handover.upgradeRequested,true);
