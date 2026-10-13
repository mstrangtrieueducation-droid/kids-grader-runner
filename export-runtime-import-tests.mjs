// Import the actual deployed runner, not just individual policy helpers.
import assert from 'node:assert/strict';import vm from 'node:vm';
const cluster={controlId:'test-control',email:'teacher@example.invalid',artifactFolder:'test-artifacts',classes:[]};
process.env.RUNNER_CONFIG=JSON.stringify({clusters:[cluster],serviceAccount:'sa@example.invalid'});process.env.GOOGLE_CREDENTIALS=JSON.stringify({client_email:'sa@example.invalid'});process.env.GEMINI_API_KEY='fake-test-key';
process.env.KIDS_NATIVE_CONFIG=JSON.stringify({source:'test-source',classroom:'test-classroom',practice:'test-practice'});
const runner=await import('./grader_runner.mjs');assert.equal(typeof runner.buildContext,'function');
assert.deepEqual(runner.runShadowingPass(),{finished:0,paidCalls:0});
const c=runner.buildContext(cluster);assert.equal(vm.runInContext('KG.source',c),'test-source');assert.equal(c.configuredModel_(),'gemini-2.5-flash');assert.deepEqual(c.fleetModelPool_(),['gemini-2.5-flash']);
console.log('PASS actual public Kids runtime imports without other-lane dependencies or any provider/network call.');
