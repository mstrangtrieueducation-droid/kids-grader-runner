import fs from 'node:fs';
import path from 'node:path';
import {tryFileLock} from './shared-gate.mjs';

const GiB=1024**3;
// Only files registered by this runner are removable. Never touch Drive files,
// artifacts, credentials, or another worker's actively locked media.
export class MediaCache {
 constructor(root,{limitBytes=4*GiB,reserveBytes=2*GiB,freeBytes}={}){
  this.root=path.resolve(root);this.limitBytes=limitBytes;this.reserveBytes=reserveBytes;
  fs.mkdirSync(this.root,{recursive:true});
  this.freeBytes=freeBytes||(()=>{const s=fs.statfsSync(this.root);return Number(s.bavail)*Number(s.bsize);});
 }
 register(tag,lock){
  if(!/^[A-Za-z0-9_-]+$/.test(tag)||!lock.endsWith('.lock')||path.dirname(path.resolve(lock))!==path.join(this.root,'locks'))throw Error('MEDIA_CACHE_PATH_INVALID');
  fs.writeFileSync(path.join(this.root,tag+'.cache.json'),JSON.stringify({lock:path.basename(lock)}));
 }
 files(tag){if(!/^[A-Za-z0-9_-]+$/.test(tag))throw Error('MEDIA_CACHE_PATH_INVALID');return ['.original','.original.part','.m4a','.flac','.context.mp4','.working.m4a','.working.flac','.working.mp4','.context.jpg'].map(s=>path.join(this.root,tag+s));}
 remove(paths){let bytes=0;for(const file of paths){try{const stat=fs.lstatSync(file);if(stat.isFile()&&!stat.isSymbolicLink()){fs.unlinkSync(file);bytes+=stat.size;}}catch(e){if(e.code!=='ENOENT')throw e;}}return bytes;}
 dropOriginal(tag){return this.remove(this.files(tag).slice(0,2));}
 dropUnlocked(tag){
  this.files(tag);
  const manifest=path.join(this.root,tag+'.cache.json');if(!fs.existsSync(manifest))return 0;
  const meta=JSON.parse(fs.readFileSync(manifest));if(path.basename(meta.lock)!==meta.lock)throw Error('MEDIA_CACHE_PATH_INVALID');
  const release=tryFileLock(path.join(this.root,'locks',meta.lock));if(!release)return 0;
  try{return this.remove([...this.files(tag),manifest]);}finally{release();}
 }
 sweep(extraBytes=0){
  const release=tryFileLock(path.join(this.root,'locks','cache-sweep.lock'));
  if(!release){if(this.freeBytes()<this.reserveBytes+extraBytes)throw Error('RUNNER_DISK_PRESSURE');return 0;}
  try{
  const groups=fs.readdirSync(this.root).filter(n=>/^[A-Za-z0-9_-]+\.cache\.json$/.test(n)).flatMap(n=>{try{
   const tag=n.slice(0,-11),files=this.files(tag).filter(p=>fs.existsSync(p));
   return [{tag,partial:files.some(p=>p.endsWith('.original.part')),bytes:files.reduce((s,p)=>s+fs.statSync(p).size,0),at:fs.statSync(path.join(this.root,n)).mtimeMs}];
  }catch(e){if(e.code==='ENOENT')return [];throw e;}
  }).sort((a,b)=>a.at-b.at);
  let total=groups.reduce((s,g)=>s+g.bytes,0),removed=0;
  for(const group of groups){if(total<=this.limitBytes&&this.freeBytes()>=this.reserveBytes+extraBytes)break;if(group.partial)continue;const freed=this.dropUnlocked(group.tag);total-=Math.min(group.bytes,freed);removed+=freed;}
  if(this.freeBytes()<this.reserveBytes+extraBytes)throw Error('RUNNER_DISK_PRESSURE');
  return removed;
  }finally{release();}
 }
}
