// Owner 2026-11-10: add the Peppa 17 (The School Fete) and Peppa 28 (Thunderstorm) barems
// from the original videos, in the same format as the existing episodes, inside the
// locked bundle. Runs only on the trusted GitHub runner; the key never leaves it.
// "inspect" writes a structure-only summary (field names, sizes, review state; never
// script text) to a private tab so the format can be checked before anything is built.
import fs from 'node:fs';import path from 'node:path';
import {createDecipheriv} from 'node:crypto';import {gunzipSync} from 'node:zlib';
import {normalizeCode} from './master-barem.mjs';
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
 contentShape:describe(e.content||{}),topLevel:Object.keys(e).join(',')});
export function peppaSummary(bundle){
 const entries=bundle.barem?.entries||[],peppa=entries.filter(e=>e.subject==='kids'&&/^PEPPA-\d+$/.test(normalizeCode(e.code)));
 const pick=new Set(['PEPPA-16','PEPPA-17','PEPPA-18','PEPPA-27','PEPPA-28','PEPPA-29']);
 return {schema:bundle.barem?.schema,entryCount:entries.length,peppaCount:peppa.length,
  peppaStatus:peppa.map(e=>normalizeCode(e.code)+':'+e.status+(e.missing?.length?'('+e.missing.join('|')+')':'')).join(' '),
  detail:peppa.filter(e=>pick.has(normalizeCode(e.code))).map(metadata)};
}
function decrypt(){
 const bytes=fs.readFileSync('approved-policy.enc');if(bytes.subarray(0,4).toString()!=='GB01')throw Error('PRIVATE_BUNDLE_SCHEMA_INVALID');
 const d=createDecipheriv('aes-256-gcm',Buffer.from(process.env.PRIVATE_BUNDLE_KEY||'','base64'),bytes.subarray(4,16));d.setAAD(Buffer.from(repository));d.setAuthTag(bytes.subarray(16,32));
 return JSON.parse(gunzipSync(Buffer.concat([d.update(bytes.subarray(32)),d.final()])).toString('utf8'));
}
async function main(){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!==repository||process.env.GITHUB_REF!=='refs/heads/main')throw Error('TRUSTED_RUNNER_REQUIRED');
 const request=JSON.parse(fs.readFileSync('barem-requests/peppa-17-28.json','utf8'));
 const bundle=decrypt(),summary=peppaSummary(bundle);
 const {Google}=await import('./google-adapter.mjs');const g=new Google(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON));
 const control=bundle.config.clusters[0].controlId,tab='BAREM BUILD';
 const meta=g.api('https://sheets.googleapis.com/v4/spreadsheets/'+control+'?fields=sheets.properties.title');
 if(!meta.sheets.some(s=>s.properties.title===tab))g.api('https://sheets.googleapis.com/v4/spreadsheets/'+control+':batchUpdate','POST',{requests:[{addSheet:{properties:{title:tab,gridProperties:{rowCount:200,columnCount:4}}}}]});
 // Reference files readable by the runner (size only).
 const files=[];for(const [code,ids] of Object.entries(request.videos))for(const id of ids){try{const m=g.api('https://www.googleapis.com/drive/v3/files/'+id+'?fields=id,name,size,mimeType,videoMediaMetadata&supportsAllDrives=true');files.push([code,id,m.mimeType,m.size,m.videoMediaMetadata?.durationMillis||'']);}catch(e){files.push([code,id,'UNREADABLE',e.message,'']);}}
 const rows=[['Cập nhật',new Date().toISOString(),'mode',request.mode],['schema',summary.schema,'entries',summary.entryCount],['peppa',summary.peppaCount,summary.peppaStatus.slice(0,45000),''],
  ...summary.detail.map(d=>[d.code,d.status,JSON.stringify(d).slice(0,45000),'']),...files.map(f=>['video',...f.slice(0,2),f.slice(2).join(' ')])];
 g.api('https://sheets.googleapis.com/v4/spreadsheets/'+control+'/values/'+encodeURIComponent("'"+tab+"'!A1:D200")+':clear','POST',{});
 g.api('https://sheets.googleapis.com/v4/spreadsheets/'+control+'/values/'+encodeURIComponent("'"+tab+"'!A1")+'?valueInputOption=RAW','PUT',{values:rows.map(r=>r.map(x=>String(x??'')))});
 console.log(JSON.stringify({inspect:true,rows:rows.length,providerCalls:0}));
}
if(process.env.BAREM_BUILDER_RUN==='1')await main();
