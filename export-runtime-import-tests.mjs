// Import the actual deployed runner, not just individual policy helpers.
import assert from 'node:assert/strict';
process.env.RUNNER_CONFIG=JSON.stringify({clusters:[]});process.env.GOOGLE_CREDENTIALS='{}';process.env.GEMINI_API_KEY='fake-test-key';
const runner=await import('./grader_runner.mjs');assert.equal(typeof runner.buildContext,'function');
assert.deepEqual(runner.runShadowingPass(),{finished:0,paidCalls:0});
console.log('PASS actual public Kids runtime imports without other-lane dependencies or any provider/network call.');
