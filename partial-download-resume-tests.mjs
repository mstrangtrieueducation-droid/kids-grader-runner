import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {createMediaService,reusePreparedDownload} from './universal-media.mjs';import {sourceFailure} from './submission-source-policy.mjs';
const previous=process.env.SHEET_TRUTH_SYNC;process.env.SHEET_TRUTH_SYNC='true';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-download-resume-')),m={id:'synthetic_media_fixture',mime:'video/mp4',size:64000,modified:'2026-10-01T00:00:00Z'};let calls=0,savedPath;
const g={fileMeta:()=>({}),api:()=>({}),token:()=> 'synthetic_token'};
try{
 const service=createMediaService({g,root,download:q=>{calls++;savedPath=q.outputFile;
  if(calls===1){assert.equal(q.headers.Range,'bytes=0-63999');fs.writeFileSync(q.outputFile,Buffer.alloc(24000));throw Error('NETWORK_OUTCOME_UNKNOWN');}
  assert.equal(q.headers.Range,'bytes=24000-63999');assert.equal(q.append,true);fs.appendFileSync(q.outputFile,Buffer.alloc(40000));return{getResponseCode:()=>206,getAllHeaders:()=>({'content-range':'bytes 24000-63999/64000'})};
 }});
 assert.throws(()=>service.verifyDownload(m),{message:'TRANSIENT_MEDIA_DOWNLOAD_TIMEOUT'});assert.equal(fs.statSync(savedPath).size,24000);
 const pending=sourceFailure(Error('TRANSIENT_MEDIA_DOWNLOAD_TIMEOUT'));assert.equal(pending.retryAfterMs,2000);assert.equal(pending.aiEligible,false);
 assert.deepEqual(service.verifyDownload(m),{complete:true,bytes:64000});assert.equal(calls,2);assert.deepEqual(service.verifyDownload(m),{complete:true,bytes:64000});assert.equal(calls,2);
 const destination=path.join(root,'validated-original');reusePreparedDownload(service,m,destination);assert.equal(fs.statSync(destination).size,m.size);assert.equal(calls,2,'frame/audio path must not fetch the student file a second time');
 assert.equal(reusePreparedDownload({localFile:()=>{throw Error('MUST_NOT_DOWNLOAD');}},m,destination),destination);
 const copied=path.join(root,'copy-fallback');reusePreparedDownload(service,m,copied,{link:()=>{throw Object.assign(Error('CROSS_DEVICE'),{code:'EXDEV'});}});assert.equal(fs.statSync(copied).size,m.size);assert.equal(calls,2);
 assert.throws(()=>reusePreparedDownload({localFile:()=>copied},{...m,size:m.size+1},path.join(root,'mismatch')),{message:'TRANSIENT_MEDIA_DOWNLOAD_SIZE'});assert(!fs.existsSync(path.join(root,'mismatch')));
 // No progress is not a fast continuation. Never infer access failure or send AI.
 const failed=createMediaService({g:{...g,universalTransientInstalled:false},root:path.join(root,'no-progress'),download:()=>{throw Error('NETWORK_OUTCOME_UNKNOWN');}});
 assert.throws(()=>failed.verifyDownload(m),{message:'NETWORK_OUTCOME_UNKNOWN'});assert.equal(sourceFailure(Error('NETWORK_OUTCOME_UNKNOWN')).reason,'SOURCE_CHECK_RETRY');
 // A changed source identity must not resume bytes of the old version.
 const changed=createMediaService({g:{...g,universalTransientInstalled:false},root,download:q=>{assert.equal(q.headers.Range,'bytes=0-63999');throw Error('NETWORK_OUTCOME_UNKNOWN');}});
 assert.throws(()=>changed.verifyDownload({...m,modified:'2026-10-02T00:00:00Z'}),{message:'NETWORK_OUTCOME_UNKNOWN'});
 // Ordinary legacy mode retains its existing transport policy.
 process.env.SHEET_TRUTH_SYNC='false';const legacy=createMediaService({g:{...g,universalTransientInstalled:false},root:path.join(root,'legacy'),download:q=>{fs.writeFileSync(q.outputFile,Buffer.alloc(10));throw Error('NETWORK_OUTCOME_UNKNOWN');}});
 assert.throws(()=>legacy.verifyDownload(m),{message:'NETWORK_OUTCOME_UNKNOWN'});
 console.log('PASS interrupted validated byte ranges resume exactly; no-progress and changed-source protections; preparation only, 0 provider calls, 0 Sheet writes.');
}finally{if(previous===undefined)delete process.env.SHEET_TRUTH_SYNC;else process.env.SHEET_TRUTH_SYNC=previous;assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('synthetic-download-resume-'));fs.rmSync(root,{recursive:true,force:true});}
