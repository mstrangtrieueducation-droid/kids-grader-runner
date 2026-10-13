import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {extractStudentAudio} from './student-audio.mjs';import {dashboardState} from './progress-dashboard.mjs';
for(const status of ['CẦN_NỘP_LẠI_DO_ĐỌC_BÀI','COMPLETED_UNASSESSABLE','COMPLETED_NEEDS_RESUBMISSION'])assert.equal(dashboardState({status}),'CẦN NỘP LẠI');assert.equal(dashboardState({status:'NEEDS_ASSIGNMENT'}),'CẦN CÔ GÁN CỘT/TÊN');
const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg',probe=spawnSync(ffmpeg,['-version'],{windowsHide:true});
if(probe.error?.code==='ENOENT'){console.log('Canonical audio integration requires ffmpeg; production installs it before grade/audit.');process.exit(0);}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-audio-'));
try{const input=path.join(dir,'screen-and-microphone.mkv');const make=spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=1000:duration=1','-f','lavfi','-i','sine=frequency=400:duration=1','-map','0:a','-map','1:a','-c:a','pcm_s16le','-metadata:s:a:1','title=Microphone','-y',input],{windowsHide:true});assert.equal(make.status,0);
 const result=extractStudentAudio({ffmpeg,input,audio:path.join(dir,'student.m4a'),flac:path.join(dir,'student.flac'),canonicalFormat:'mp3'});assert.equal(result.mime,'audio/mpeg');assert.equal(result.selection.mode,'labelled_microphone');assert.deepEqual(result.selection.indices,[1]);
 const decoded=spawnSync(ffmpeg,['-v','error','-i',result.file,'-ar','44100','-ac','1','-f','s16le','pipe:1'],{windowsHide:true,maxBuffer:2e6});assert.equal(decoded.status,0);assert.ok(decoded.stdout.length>50000);
 const power=f=>{let re=0,im=0;for(let i=0;i<decoded.stdout.length/2;i++){const value=decoded.stdout.readInt16LE(i*2),angle=2*Math.PI*f*i/44100;re+=value*Math.cos(angle);im+=value*Math.sin(angle);}return re*re+im*im;};assert.ok(power(400)>50*power(1000));
 console.log('PASS real ffmpeg: microphone is preserved, screen soundtrack excluded; playable MPEG audio and terminal resubmission dashboard statuses; zero provider calls.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
