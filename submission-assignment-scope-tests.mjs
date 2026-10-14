import assert from 'node:assert/strict';import {installSubmissionAssignmentScope} from './submission-assignment-scope.mjs';
const prior=process.env.MASTER_CROSS_CLASS_SWEEP;process.env.MASTER_CROSS_CLASS_SWEEP='true';let calls=0;const c={currentAssignment_:()=>false,autoColumns_:h=>{if(h.ambiguous)throw Error('DESTINATION_AMBIGUOUS');return 7;},step_:j=>{calls++;return c.currentAssignment_(j.headers||{},{});}};installSubmissionAssignmentScope(c);
assert.equal(c.step_({receipt:{time:'2026-09-13T22:39:00+07:00'},headers:{lessonDate:'2026-08-21'}}),true);assert.equal(calls,1);
assert.equal(c.step_({receipt:{time:'2026-08-31T23:59:00+07:00'}}),undefined);assert.equal(calls,1);
assert.equal(c.step_({receipt:{time:'invalid'}}),undefined);assert.equal(calls,1);
assert.throws(()=>c.step_({receipt:{time:'2026-10-15T01:00:00+07:00'},headers:{ambiguous:true}}),/DESTINATION_AMBIGUOUS/);
assert.equal(c.currentAssignment_({},{}),false);process.env.MASTER_CROSS_CLASS_SWEEP='false';assert.equal(c.step_({receipt:{time:'2026-10-15T01:00:00+07:00'}}),false);
if(prior===undefined)delete process.env.MASTER_CROSS_CLASS_SWEEP;else process.env.MASTER_CROSS_CLASS_SWEEP=prior;
console.log('September Form receipt is eligible despite an August lesson header; old/invalid receipts and ambiguous destinations remain protected; no scope leak.');
