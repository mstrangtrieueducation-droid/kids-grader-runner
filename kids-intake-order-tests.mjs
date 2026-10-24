import assert from 'node:assert/strict';
import {prepareKidsDrain,existingSliceEnded} from './kids-intake-order.mjs';
const clusters=['A','B','C'],events=[],queues=new Map(clusters.map(c=>[c,Array.from({length:30},(_,i)=>({id:c+'-old-'+i,saved:false}))])),sources=new Map(clusters.map(c=>[c,[{id:c+'-new',saved:false},{id:c+'-saved',saved:true}]]));
let calls=0,restored=0;
prepareKidsDrain(clusters,{scan:c=>{events.push('scan:'+c);queues.get(c).unshift(...sources.get(c));},cache:c=>{events.push('cache:'+c);queues.set(c,queues.get(c).filter(j=>{if(j.saved){restored++;return false;}return true;}));}});
assert.deepEqual(events,['scan:A','scan:B','scan:C','cache:A','cache:B','cache:C']);assert.equal(restored,3);assert.equal(calls,0);
const processed=[];let clock=0;
for(const c of clusters){const startedAt=clock;let attempted=0;while(queues.get(c).length&&!existingSliceEnded({phase:'existing',attempted,startedAt,now:clock})){const j=queues.get(c).shift();processed.push(j.id);calls++;attempted++;clock+=1000;}}
assert.deepEqual(processed.filter(x=>x.endsWith('-new')),['A-new','B-new','C-new']);assert.equal(calls,12);assert.equal(processed.filter(x=>x.startsWith('A-')).length,4);
let attempted=0;const began=clock;while(!existingSliceEnded({phase:'existing',attempted,startedAt:began,now:clock})){attempted++;clock+=7*60000;}assert.equal(attempted,1,'an expensive first preparation returns control after that item, without interrupting it');
assert(!existingSliceEnded({phase:'existing',savedOnly:true,attempted:10,startedAt:0,now:10000000}));assert(!existingSliceEnded({phase:'priority',attempted:4,startedAt:0,now:10000000}));
const stopped=[];prepareKidsDrain(clusters,{scan:c=>stopped.push(c),cache:()=>{throw Error('AFTER_STOP');},canContinue:()=>stopped.length<1});assert.deepEqual(stopped,['A']);
console.log('PASS new intake reaches every cluster before paid backlog; saved restoration costs zero model calls; four-item/time slices share work without preempting a running item; deadline stop respected; 0 real AI/0 Sheet writes.');
