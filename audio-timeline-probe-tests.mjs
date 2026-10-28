import assert from 'node:assert/strict';import {probeIncompleteAudio} from './audio-timeline-probe.mjs';
const logs=[],j={receipt:{links:'synthetic source'},generateRequests:0},service={ids:()=>['synthetic-file'],metadata:()=>({mimeType:'video/mp4',size:'20000'}),localFile:()=> 'synthetic-input'};
probeIncompleteAudio([j],service,'.',{inspect:()=>({outcome:'TRANSIENT_MEDIA_INCOMPLETE_AUDIO',sourceClockSeconds:12,decodedSampleSeconds:10,providerCalls:0,sheetWrites:0}),emit:x=>logs.push(x)});
assert.equal(logs.length,1);assert.equal(logs[0].decodedSampleSeconds,10);assert.equal(j.generateRequests,0);assert(!JSON.stringify(logs).includes('synthetic source'));assert(!JSON.stringify(logs).includes('synthetic-file'));
probeIncompleteAudio([{rawId:'saved',receipt:j.receipt}],{ids:()=>assert.fail('saved result never reprobed')},'.',{emit:x=>logs.push(x)});assert(logs[1].protectedExistingOutcome);
console.log('PASS numeric hosted timeline diagnostic excludes source/pupil identifiers, leaves native jobs untouched and avoids saved/paid work; 0 provider calls.');
