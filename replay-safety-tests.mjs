import assert from 'node:assert/strict';import {networkRetry} from './kids-fault-tolerance.mjs';
const preparation={generateRequests:0};assert.equal(networkRetry(preparation,'NETWORK_OUTCOME_UNKNOWN',0),true);assert.equal(preparation.status,'RETRY');
for(const state of [{generateRequests:1},{runnerGenerationStarted:true},{generationReservation:'reserved'}]){const j={...state};assert.equal(networkRetry(j,'NETWORK_OUTCOME_UNKNOWN',0),true);assert.equal(j.status,'NEEDS_REVIEW');assert.equal(j.retryGenerationAuthorized,false);assert.equal(j.nextAt,0);}
for(const saved of [{rawId:'frozen'},{gradeId:'validated'}]){const before=JSON.stringify(saved);assert.equal(networkRetry(saved,'NETWORK_OUTCOME_UNKNOWN',0),false);assert.equal(JSON.stringify(saved),before);}
console.log('Preparation retries remain available; an uncertain provider request is never authorized for automatic replay.');
