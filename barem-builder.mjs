// Owner 2026-11-10: add the Peppa 17 (The School Fete) and Peppa 28 (Thunderstorm) barems
// from the original videos, in the same format as the existing episodes, inside the
// locked bundle. Runs only on the trusted GitHub runner; the key never leaves it.
// "inspect" writes a structure-only summary (field names, sizes, review state; never
// script text) to a private tab so the format can be checked before anything is built.
import fs from 'node:fs';import path from 'node:path';
import {createDecipheriv,createCipheriv,randomBytes} from 'node:crypto';import {gunzipSync,gzipSync} from 'node:zlib';import {spawnSync} from 'node:child_process';
import {normalizeCode,digest,MasterBaremCatalog} from './master-barem.mjs';
const repository='mstrangtrieueducation-droid/kids-grader-runner';
export function describe(value,depth=0){
 if(value===null||value===undefined)return String(value);
 if(typeof value==='string')return 'str('+value.length+')';
 if(typeof value!=='object')return typeof value+'='+String(value).slice(0,40);
 if(Array.isArray(value))return 'arr('+value.length+')'+(value.length&&depth<3?'['+describe(value[0],depth+1)+']':'');
 if(depth>=3)return 'obj{'+Object.keys(value).join(',')+'}';
 return '{'+Object.entries(value).map(([k,v])=>k+':'+describe(v,depth+1)).join(', ')+'}';
}
// Teacher-written metadata only (never episode content).
const metadata=e=>({code:e.code,subject:e.subject,kind:e.kind,status:e.status,missing:e.missing||[],review:e.review||null,
 requirements:e.requirements?Object.fromEntries(Object.entries(e.requirements).map(([k,v])=>[k,typeof v==='string'?v.slice(0,400):describe(v)])):null,
 contentShape:describe(e.content||{}),topLevel:Object.keys(e).join(','),provenance:describe(e.provenance),provenanceScalars:Object.fromEntries(Object.entries(e.provenance||{}).filter(([k,v])=>typeof v!=='object'||v===null).map(([k,v])=>[k,String(v).slice(0,160)])),sourceUrl:String(e.sourceUrl||'').slice(0,200),route:describe(e.route),cueSpan:(e.content?.timedCues||[]).length?[e.content.timedCues[0].startSeconds,e.content.timedCues.at(-1).endSeconds]:null,textMinusTranscript:(e.content?.text||'').length-(e.content?.transcript||'').length});
export function peppaSummary(bundle){
 const entries=bundle.barem?.entries||[],peppa=entries.filter(e=>e.subject==='kids'&&/^PEPPA-\d+$/.test(normalizeCode(e.code)));
 const pick=new Set(['PEPPA-16','PEPPA-17','PEPPA-18','PEPPA-27','PEPPA-28','PEPPA-29']);
 return {schema:bundle.barem?.schema,entryCount:entries.length,peppaCount:peppa.length,
  peppaStatus:peppa.map(e=>normalizeCode(e.code)+':'+e.status+(e.missing?.length?'('+e.missing.join('|')+')':'')).join(' '),
  detail:peppa.filter(e=>pick.has(normalizeCode(e.code))).map(metadata)};
}
// A compiled episode must look like the approved ones: one cue per spoken line, in order,
// inside the original episode's length. Anything else stops the build; nothing is written.
export function validCues(cues,durationSeconds){
 if(!Array.isArray(cues)||cues.length<30)return 'TOO_FEW_CUES';
 let last=0;for(const c of cues){if(!(typeof c.text==='string'&&c.text.trim()))return 'EMPTY_CUE';if(!(Number.isFinite(c.startSeconds)&&Number.isFinite(c.endSeconds)&&c.endSeconds>c.startSeconds))return 'CUE_TIME_INVALID';if(c.startSeconds+0.5<last)return 'CUES_OUT_OF_ORDER';last=c.startSeconds;}
 if(cues[0].startSeconds>40)return 'LATE_FIRST_CUE';if(Number.isFinite(durationSeconds)&&cues.at(-1).endSeconds>durationSeconds+3)return 'CUE_AFTER_END';if(Number.isFinite(durationSeconds)&&cues.at(-1).endSeconds<durationSeconds*0.6)return 'TRANSCRIPT_TRUNCATED';
 return null;
}
export function readyEntry(draft,compiled,{videos,model,durationSeconds,meta,at=new Date().toISOString()}){
 const cues=compiled.timedCues.map(c=>({startSeconds:Math.round(c.startSeconds*100)/100,endSeconds:Math.round(c.endSeconds*100)/100,text:c.text.trim()}));
 const transcript=compiled.timedCues.map(c=>(c.speaker?.trim()?c.speaker.trim()+': ':'')+c.text.trim()).join('\n');
 const {sha256,...body}=structuredClone(draft);
 body.status='READY';body.missing=[];
 body.content={...body.content,words:[],sentences:[],questions:[],transcript,text:[String(draft.content?.text||'').trim(),transcript].filter(Boolean).join('\n'),sourcePassages:cues.map(c=>({text:c.text})),topic:String(compiled.topic||'').trim(),outline:(compiled.outline||[]).map(o=>({point:String(o.point||'').trim(),sourceQuote:String(o.sourceQuote||'').trim()})),timedCues:cues};
 body.review={approved:true,sourceStatus:'SOURCE_PREPARED_FROM_REFERENCE_VIDEO',teacherGradingApproval:true,approvalScope:'KIDS_AUTOMATIC_NEW_BAREM',approvedAt:at,previousHash:sha256,approval:'Cô yêu cầu 10/11: thêm barem Peppa 17/28 lấy video gốc làm chuẩn, cùng định dạng các tập đã có'};
 body.provenance={...body.provenance,compiledSource:{artifact:'reference-video-asr',id:videos[0],inputHash:digest(videos.join('|')),model,meta:{...meta,durationSeconds}},practiceMedia:videos.slice(1)};
 return {...body,sha256:digest(body)};
}
export function encryptBundle(bundle,key,repo=repository){
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(repo));
 const data=Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(bundle),'utf8'))),c.final()]);
 return Buffer.concat([Buffer.from('GB01'),iv,c.getAuthTag(),data]);
}
export function decryptBytes(bytes,key,repo=repository){
 if(bytes.subarray(0,4).toString()!=='GB01')throw Error('PRIVATE_BUNDLE_SCHEMA_INVALID');
 const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(4,16));d.setAAD(Buffer.from(repo));d.setAuthTag(bytes.subarray(16,32));
 return JSON.parse(gunzipSync(Buffer.concat([d.update(bytes.subarray(32)),d.final()])).toString('utf8'));
}
const CUE_SCHEMA={type:'object',properties:{topic:{type:'string'},outline:{type:'array',items:{type:'object',properties:{point:{type:'string'},sourceQuote:{type:'string'}},required:['point','sourceQuote']}},timedCues:{type:'array',items:{type:'object',properties:{startSeconds:{type:'number'},endSeconds:{type:'number'},speaker:{type:'string'},text:{type:'string'}},required:['startSeconds','endSeconds','speaker','text']}}},required:['topic','outline','timedCues']};
async function compileEpisode({audioFile,durationSeconds,template,model,key,code}){
 const instruction='You prepare the teacher\'s private grading reference for a children\'s dubbing homework ('+code+'). Listen to the whole audio of the original cartoon episode. '+
  'Return every spoken line in order as timedCues: one cue per utterance, startSeconds/endSeconds measured from the start of this audio, speaker = the character name, text = the exact English words spoken (no narration added, no paraphrase, include the narrator when the narrator speaks). '+
  'Do not skip lines; the cues must cover the episode to its end ('+Math.round(durationSeconds)+' s). topic = the episode title. outline = '+(template.outline?.length||5)+' short points describing the scenes, written in the same language and style as these examples: '+JSON.stringify((template.outline||[]).map(o=>o.point))+'; sourceQuote = one short line spoken in that scene.';
 const body={contents:[{role:'user',parts:[{text:instruction},{inlineData:{mimeType:'audio/mpeg',data:fs.readFileSync(audioFile).toString('base64')}}]}],generationConfig:{temperature:0,responseMimeType:'application/json',responseSchema:CUE_SCHEMA}};
 const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body)});
 if(!r.ok)throw Error('COMPILE_HTTP_'+r.status);
 const j=await r.json(),text=j.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('');if(!text)throw Error('COMPILE_EMPTY_'+(j.candidates?.[0]?.finishReason||j.promptFeedback?.blockReason||'UNKNOWN'));
 return JSON.parse(text);
}
async function download(g,id,file){
 const r=await fetch('https://www.googleapis.com/drive/v3/files/'+id+'?alt=media&supportsAllDrives=true',{headers:{Authorization:'Bearer '+g.token()}});
 if(!r.ok)throw Error('REFERENCE_DOWNLOAD_'+r.status);fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));
}
function toAudio(input,output){
 const r=spawnSync(process.env.FFMPEG_PATH||'ffmpeg',['-nostdin','-v','error','-i',input,'-vn','-ac','1','-ar','16000','-c:a','libmp3lame','-b:a','32k','-y',output],{encoding:'utf8',timeout:600000});
 if(r.status!==0||!fs.existsSync(output))throw Error('REFERENCE_AUDIO_FAILED');
 const p=spawnSync(process.env.FFMPEG_PATH||'ffmpeg',['-nostdin','-hide_banner','-i',output],{encoding:'utf8'}),m=String(p.stderr).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
 return m?+m[1]*3600 + +m[2]*60 + +m[3]:NaN;
}
function decrypt(){
 const bytes=fs.readFileSync('approved-policy.enc');if(bytes.subarray(0,4).toString()!=='GB01')throw Error('PRIVATE_BUNDLE_SCHEMA_INVALID');
 const d=createDecipheriv('aes-256-gcm',Buffer.from(process.env.PRIVATE_BUNDLE_KEY||'','base64'),bytes.subarray(4,16));d.setAAD(Buffer.from(repository));d.setAuthTag(bytes.subarray(16,32));
 return JSON.parse(gunzipSync(Buffer.concat([d.update(bytes.subarray(32)),d.final()])).toString('utf8'));
}
async function main(){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!==repository||process.env.GITHUB_REF!=='refs/heads/main')throw Error('TRUSTED_RUNNER_REQUIRED');
 const request=JSON.parse(fs.readFileSync('barem-requests/peppa-17-28.request','utf8'));
 const bundle=decrypt(),summary=peppaSummary(bundle);
 const {Google}=await import('./google-adapter.mjs');const g=new Google(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON));
 const control=bundle.config.clusters[0].controlId,tab='BAREM BUILD';
 const meta=g.api('https://sheets.googleapis.com/v4/spreadsheets/'+control+'?fields=sheets.properties.title');
 if(!meta.sheets.some(s=>s.properties.title===tab))g.api('https://sheets.googleapis.com/v4/spreadsheets/'+control+':batchUpdate','POST',{requests:[{addSheet:{properties:{title:tab,gridProperties:{rowCount:200,columnCount:4}}}}]});
 // Reference files readable by the runner (size only).
 const files=[];for(const [code,ids] of Object.entries(request.videos))for(const id of ids){try{const m=g.api('https://www.googleapis.com/drive/v3/files/'+id+'?fields=id,name,size,mimeType,videoMediaMetadata&supportsAllDrives=true');files.push([code,id,m.mimeType,m.size,m.videoMediaMetadata?.durationMillis||'']);}catch(e){files.push([code,id,'UNREADABLE',e.message,'']);}}
 const write=rows=>{g.api('https://sheets.googleapis.com/v4/spreadsheets/'+control+'/values/'+encodeURIComponent("'"+tab+"'!A1:D200")+':clear','POST',{});g.api('https://sheets.googleapis.com/v4/spreadsheets/'+control+'/values/'+encodeURIComponent("'"+tab+"'!A1")+'?valueInputOption=RAW','PUT',{values:rows.map(r=>r.map(x=>String(x??'')))});};
 if(request.mode==='build'){
  const key=Buffer.from(process.env.PRIVATE_BUNDLE_KEY||'','base64'),gemini=process.env.GEMINI_API_KEY,model=bundle.config.kids.model;if(!gemini)throw Error('GEMINI_KEY_REQUIRED');
  const entries=bundle.barem.entries,template=entries.find(e=>e.subject==='kids'&&normalizeCode(e.code)==='PEPPA-16')?.content||{},report=[['Cập nhật',new Date().toISOString(),'mode','build']];let calls=0;
  const work=path.join(process.env.RUNNER_TEMP||'/tmp','barem-build');fs.mkdirSync(work,{recursive:true});
  for(const [code,videos] of Object.entries(request.videos)){
   const at=entries.findIndex(e=>e.subject==='kids'&&normalizeCode(e.code)===code),draft=entries[at];
   if(at<0){report.push([code,'NOT_FOUND','','']);continue;}if(draft.status==='READY'){report.push([code,'ALREADY_READY','','']);continue;}
   const video=path.join(work,code+'.video'),audio=path.join(work,code+'.mp3');await download(g,videos[0],video);const durationSeconds=toAudio(video,audio);fs.rmSync(video,{force:true});
   const m=g.api('https://www.googleapis.com/drive/v3/files/'+videos[0]+'?fields=id,mimeType,modifiedTime,md5Checksum,size,videoMediaMetadata&supportsAllDrives=true');
   calls++;const compiled=await compileEpisode({audioFile:audio,durationSeconds,template,model,key:gemini,code});fs.rmSync(audio,{force:true});
   const bad=validCues(compiled.timedCues,durationSeconds);if(bad){report.push([code,'REJECTED',bad,'cues '+(compiled.timedCues?.length||0)+' / '+Math.round(durationSeconds)+'s']);continue;}
   entries[at]=readyEntry(draft,compiled,{videos,model,durationSeconds,meta:m});
   report.push([code,'READY','cues '+entries[at].content.timedCues.length+', transcript '+entries[at].content.transcript.length+' chars, '+Math.round(durationSeconds)+'s','sha '+entries[at].sha256.slice(0,12)]);
  }
  const catalog=new MasterBaremCatalog(bundle.barem);for(const r of report.slice(1))if(r[1]==='READY')catalog.lookup('kids',r[0]);
  if(report.some(r=>r[1]==='READY')){const bytes=encryptBundle(bundle,key),back=decryptBytes(bytes,key);if(JSON.stringify(back)!==JSON.stringify(bundle))throw Error('BUNDLE_ROUND_TRIP_FAILED');fs.writeFileSync('approved-policy.enc',bytes);report.push(['bundle','WRITTEN','entries '+back.barem.entries.length,'']);}
  report.push(['providerCalls',calls,'','']);write(report);console.log(JSON.stringify({build:true,ready:report.filter(r=>r[1]==='READY').map(r=>r[0]),providerCalls:calls}));return;
 }
 const rows=[['Cập nhật',new Date().toISOString(),'mode',request.mode],['schema',summary.schema,'entries',summary.entryCount],['peppa',summary.peppaCount,summary.peppaStatus.slice(0,45000),''],
  ...summary.detail.map(d=>[d.code,d.status,JSON.stringify(d).slice(0,45000),'']),...files.map(f=>['video',...f.slice(0,2),f.slice(2).join(' ')])];
 g.api('https://sheets.googleapis.com/v4/spreadsheets/'+control+'/values/'+encodeURIComponent("'"+tab+"'!A1:D200")+':clear','POST',{});
 g.api('https://sheets.googleapis.com/v4/spreadsheets/'+control+'/values/'+encodeURIComponent("'"+tab+"'!A1")+'?valueInputOption=RAW','PUT',{values:rows.map(r=>r.map(x=>String(x??'')))});
 console.log(JSON.stringify({inspect:true,rows:rows.length,providerCalls:0}));
}
if(process.env.BAREM_BUILDER_RUN==='1')await main();
