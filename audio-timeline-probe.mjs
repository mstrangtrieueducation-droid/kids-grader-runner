// Numeric, read-only preparation diagnostic. Never publishes pupil/file IDs,
// source text, stderr, media bytes, or a grading request.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {transcodeUniversal} from './universal-media.mjs';
const seconds=text=>{const m=String(text||'').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);return m?+m[1]*3600 + +m[2]*60 + +m[3]:null;};
const progress=r=>{const times=[...String(r.stdout||'').matchAll(/out_time_us=(\d+)/g)].map(x=>+x[1]/1e6);return r.status===0?times.at(-1)??null:null;};
export function inspectAudioTimeline(input,output,{run=spawnSync,ffmpeg=process.env.FFMPEG_PATH||'ffmpeg'}={}){
 const probe=file=>run(ffmpeg,['-nostdin','-hide_banner','-i',file],{encoding:'utf8',windowsHide:true,timeout:60000});
 const original=probe(input);let outcome;try{transcodeUniversal({input,output,ffmpeg,run,sourceId:'diagnostic',modified:'diagnostic',sourceSize:fs.statSync(input).size});outcome='PASS';}catch(e){outcome=/^[A-Z0-9_]+$/.test(e.message||'')?e.message:'PREPARATION_FAILED';}
 const converted=fs.existsSync(output)?output:output+'.working.mp3';
 const common=['-nostdin','-v','error','-nostats','-progress','pipe:1','-i',input,'-map','0:a:0','-vn'];
 const originalClock=run(ffmpeg,[...common,'-f','null','-'],{encoding:'utf8',windowsHide:true,timeout:180000});
 const sampleClock=run(ffmpeg,[...common,'-af','asetpts=N/SR/TB','-f','null','-'],{encoding:'utf8',windowsHide:true,timeout:180000});
 const inputDuration=seconds(original.stderr),outputDuration=fs.existsSync(converted)?seconds(probe(converted).stderr):null;
 return {outcome,inputDuration,outputDuration,sourceClockSeconds:progress(originalClock),decodedSampleSeconds:progress(sampleClock),audioStreamCount:(String(original.stderr).match(/Stream[^\n]+Audio:/g)||[]).length,convertedBytes:fs.existsSync(converted)?fs.statSync(converted).size:0,providerCalls:0,sheetWrites:0};
}
export function probeIncompleteAudio(jobs,service,root,{now=Date.now,inspect=inspectAudioTimeline,emit=()=>{}}={}){
 for(const [jobIndex,j]of jobs.entries()){
  if(j.rawId||j.gradeId||j.generateRequests||j.masterGenerationReserved||j.runnerGenerationStarted||j.generationReservation){emit({event:'AUDIO_TIMELINE_RESULT',jobIndex,protectedExistingOutcome:true,providerCalls:0,sheetWrites:0});continue;}
  for(const [fileIndex,id]of service.ids(j.receipt.links).entries()){
   if(id.startsWith('yt_'))throw Error('PROBE_DRIVE_AUDIO_ONLY');const meta=service.metadata(id),m={id,mime:meta.mimeType,size:Number(meta.size),modified:meta.modifiedTime},until=now()+180000;let input;
   while(now()<until)try{input=service.localFile(m);break;}catch(e){if(e.message!=='TRANSIENT_MEDIA_DOWNLOAD_TIMEOUT')throw e;}
   if(!input){emit({event:'AUDIO_TIMELINE_RESULT',jobIndex,fileIndex,downloadPending:true,providerCalls:0,sheetWrites:0});continue;}
   emit({event:'AUDIO_TIMELINE_RESULT',jobIndex,fileIndex,...inspect(input,path.join(root,'probe-'+jobIndex+'-'+fileIndex+'.mp3'))});
  }
 }
}
