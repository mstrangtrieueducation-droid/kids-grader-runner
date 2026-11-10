import assert from 'node:assert/strict';
import {describe,peppaSummary} from './barem-builder.mjs';
const script='Peppa: secret script line that must never be printed.';
const bundle={barem:{schema:'s',entries:[{subject:'kids',code:'Peppa-16',kind:'dubbing',status:'READY',review:{approved:true},content:{text:script,transcript:script,timedCues:[{t:1,text:script}]},requirements:{submissionText:'Con lồng tiếng đoạn 1, 2, 3.'}},{subject:'kids',code:'Peppa-17',kind:'dubbing',status:'DRAFT',missing:['COMPLETE_TRANSCRIPT'],content:{text:script},requirements:{submissionText:'x'}}]}};
const out=JSON.stringify(peppaSummary(bundle));
assert(!out.includes('secret script'),'episode text never leaves the bundle');
assert.match(out,/PEPPA-17:DRAFT\(COMPLETE_TRANSCRIPT\)/);assert.match(out,/transcript:str\(\d+\)/);assert.match(out,/timedCues:arr\(1\)\[\{t:number=1, text:str/);
assert.equal(describe('abc'),'str(3)');
console.log('PASS barem inspection reports structure only, never episode text');
