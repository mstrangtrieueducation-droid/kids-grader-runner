import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
export function acquireMediaSlot(dir,{limit=4,now=Date.now,sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms)}={}){
 fs.mkdirSync(dir,{recursive:true});const deadline=now()+300000;
 while(now()<deadline){for(let i=0;i<limit;i++){const slot=path.join(dir,String(i));try{fs.mkdirSync(slot);fs.writeFileSync(path.join(slot,'owner'),String(process.pid));return ()=>{fs.rmSync(slot,{recursive:true,force:true});};}catch(e){if(e.code!=='EEXIST')throw e;try{const pid=Number(fs.readFileSync(path.join(slot,'owner'),'utf8'));try{process.kill(pid,0);}catch(x){if(x.code==='ESRCH')fs.rmSync(slot,{recursive:true,force:true});}}catch{}}}sleep(50);}
 throw Error('TRANSIENT_FFMPEG_SLOT_TIMEOUT');
}
export function mediaLimiterEnv(root){
 if(process.platform==='win32')return {};
 const wrapper=path.join(root,'private','ffmpeg-limited');fs.mkdirSync(path.dirname(wrapper),{recursive:true});
 fs.writeFileSync(wrapper,'#!/usr/bin/env node\nimport('+JSON.stringify(new URL('./ffmpeg-limiter.mjs',import.meta.url).href)+').then(m=>m.runLimited());\n',{mode:0o700});fs.chmodSync(wrapper,0o700);
 return {FFMPEG_PATH:wrapper,FFMPEG_REAL_PATH:process.env.FFMPEG_PATH||'ffmpeg',FFMPEG_SEMAPHORE_DIR:path.join(root,'private','ffmpeg-slots')};
}
export function retainWorkerMedia(root){
 // Hardlink existing worker media into the shared file-ID cache. Keep originals;
 // native source/version/hash validation still decides whether a file is usable.
 function merge(src,dest){if(!fs.existsSync(src))return;fs.mkdirSync(dest,{recursive:true});for(const e of fs.readdirSync(src,{withFileTypes:true})){const a=path.join(src,e.name),b=path.join(dest,e.name);if(e.isDirectory())merge(a,b);else if(e.isFile()&&!fs.existsSync(b)){try{fs.linkSync(a,b);}catch{fs.copyFileSync(a,b);}}}}
 for(let slot=0;slot<8;slot++)for(const name of ['cache','universal-media','silence-audit','shadow-reference'])merge(path.join(root,'private','campaign-workers',String(slot),'private',name),path.join(root,'private',name));
}
export function runLimited(){const release=acquireMediaSlot(process.env.FFMPEG_SEMAPHORE_DIR);try{const r=spawnSync(process.env.FFMPEG_REAL_PATH||'ffmpeg',process.argv.slice(2),{stdio:'inherit',timeout:300000,windowsHide:true});process.exitCode=r.status??1;}finally{release();}}
if(process.argv[1]===fileURLToPath(import.meta.url))runLimited();
