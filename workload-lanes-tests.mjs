import assert from 'node:assert/strict';
import {mediaWorkload,workerAccepts,serviceMinutes,workConflict,serviceDeadline,SERVICE_MS} from './workload-lanes.mjs';
const vn=(d,h,m=0)=>Date.UTC(2026,10,d,h-7,m);
const small={media:[{id:'one',size:49_999_999}]},large={media:[{id:'two',size:50_000_000}]},unknown={media:[]};
for(let i=0;i<3;i++){assert(workerAccepts(small,i));assert(!workerAccepts(large,i));assert(workerAccepts(unknown,i));}
assert(workerAccepts(large,3));assert(!workerAccepts(unknown,3));assert(!workerAccepts(small,3));assert(workerAccepts(small,3,{heavyWaiting:false}));
assert.equal(mediaWorkload({media:[{size:30_000_000},{size:30_000_000}]}).lane,'heavy');
assert.equal(mediaWorkload({...large,rawId:'saved'}).lane,'fast');assert(serviceMinutes(300*60000,0)>290);
assert(workConflict({source:{className:'TEST A'}},{source:{className:'TEST A'}}));assert(!workConflict({source:{className:'TEST A'},...small},{source:{className:'TEST B'},...large}));
// Handover timing, in Vietnam time.
assert.equal(serviceDeadline(vn(4,10,30)),vn(4,15,30),'a daytime run keeps five hours');
assert.equal(serviceDeadline(vn(4,15,30)),vn(4,18,30),'an end at 20:30 moves before the peak');
assert.equal(serviceDeadline(vn(4,13,31)),vn(4,18,30),'first end inside the peak moves');
assert.equal(serviceDeadline(vn(4,13,30)),vn(4,18,30),'an end exactly at the boundary stays there');
assert.equal(serviceDeadline(vn(4,18,31)),vn(4,23,31),'a run started at the boundary covers the whole peak');
assert.equal(serviceDeadline(vn(4,18,20)),vn(4,23,20),'an end after the peak stays');
assert.equal(serviceDeadline(vn(4,18,0)),vn(4,23,0),'under 45 minutes of service keeps the normal end');
assert.equal(serviceDeadline(vn(4,17,45)),vn(4,18,30),'45 minutes of service is enough to move');
assert.equal(serviceDeadline(vn(4,20,0)),vn(5,1,0),'a replacement started during the peak keeps five hours');
assert.equal(serviceDeadline(vn(4,23,50)),vn(5,4,50),'a night run keeps five hours');
for(let t=vn(1,0);t<vn(4,0);t+=7*60000){const d=serviceDeadline(t);assert(d>t&&d-t<=SERVICE_MS);}
console.log('PASS unknown/small inputs default fast; confirmed large inputs heavy; saved-result priority, class/media exclusion and five-hour budget; 0 provider calls.');

assert(workerAccepts(small,3,{heavyWaiting:true,ownerSlot:3}),'prepared files never become inaccessible when their heavy owner learns the true small size');

assert.equal(workConflict({_runtimeRowKey:'test|row1',source:{className:'TEST SAME',name:'LEARNER A'}},{_runtimeRowKey:'test|row2',source:{className:'TEST SAME',name:'LEARNER B'}}),false);
assert.equal(workConflict({source:{className:'TEST SAME',name:'LEARNER A'},target:{address:'A1'}},{source:{className:'TEST SAME',name:'LEARNER B'},target:{address:'A1'}}),true);

assert.equal(workConflict({_runtimeRowKey:'native|row1',source:{className:'TEST SAME',name:'DECLARED NAME A'}},{_runtimeRowKey:'native|row1',source:{className:'TEST SAME',name:'DECLARED NAME B'}}),true,'different source spellings cannot process the same native pupil row concurrently');
