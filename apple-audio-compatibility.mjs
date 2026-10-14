import fs from 'node:fs';import {spawnSync} from 'node:child_process';
import {audioStreams} from './student-audio.mjs';
import {repairAudioLocally} from './audio-payload-guard.mjs';
// Apple documents AAC as the compatibility version of its APAC spatial track:
// https://developer.apple.com/videos/play/wwdc2025/251/
export function appleCompatibilityTrack(stderr){
 const tracks=audioStreams(stderr),aac=tracks.filter(t=>/Audio: aac\b/.test(t.description)&&/stereo/.test(t.description)&&/\(default\)/.test(t.description)),apac=tracks.filter(t=>/Audio: none \(apac\b/.test(t.description));
 if(tracks.length!==2||aac.length!==1||apac.length!==1||!/(?:com\.apple\.quicktime\.make\s*:\s*Apple)/.test(stderr))throw Error('APPLE_COMPATIBILITY_TRACK_NOT_PROVEN');
 return {index:aac[0].index,spatialIndex:apac[0].index};
}
export function prepareAppleCompatibleAudio({prepare,job,m,g,root,ffmpeg,save,repair=repairAudioLocally,run=spawnSync}){
 try{return prepare();}catch(error){
  if(error.message!=='AUDIO_EXTRACTION_FAILED')throw error;
  const recovered=repair({m,job,g,root,ffmpeg,extract:({input,audio})=>{
   const probe=run(ffmpeg,['-nostdin','-hide_banner','-i',input],{encoding:'utf8',windowsHide:true,timeout:30000}),track=appleCompatibilityTrack(probe.stderr||''),file=audio.replace(/\.m4a$/,'.mp3');
   const result=run(ffmpeg,['-nostdin','-v','error','-i',input,'-map','0:'+track.index,'-vn','-ac','1','-ar','22050','-c:a','libmp3lame','-b:a','64k','-y',file],{encoding:'utf8',windowsHide:true,timeout:120000});
   if(result.status!==0||!fs.existsSync(file)||fs.statSync(file).size<=10240)throw Error('APPLE_AAC_RECOVERY_FAILED');
   m.audioSelection={mode:'apple_stereo_compatibility',indices:[track.index],alternativeSpatialTrack:track.spatialIndex};return {file,mime:'audio/mpeg'};
  }});
  m.appleAACRecovered=true;save();return {inlineData:{mimeType:recovered.mime,data:fs.readFileSync(recovered.file).toString('base64')}};
 }
}
