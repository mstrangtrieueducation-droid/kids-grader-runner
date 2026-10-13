import fs from 'node:fs';import {spawnSync} from 'node:child_process';
export function extractPhonicsFrame({ffmpeg,input,output,durationSeconds,run=spawnSync}){
 const at=Number.isFinite(durationSeconds)&&durationSeconds>0?Math.min(30,durationSeconds*0.1):2;
 const args=time=>['-nostdin','-v','error','-ss',String(time),'-i',input,'-map','0:v:0','-frames:v','1','-vf','scale=min(1600\\,iw):-2','-q:v','3','-y',output];
 let time=at,result=run(ffmpeg,args(time),{encoding:'utf8',timeout:60000,windowsHide:true});
 if(result.status!==0||!fs.existsSync(output)||!fs.statSync(output).size){time=0;result=run(ffmpeg,args(time),{encoding:'utf8',timeout:60000,windowsHide:true});}
 if(result.status!==0||!fs.existsSync(output)||!fs.statSync(output).size||fs.statSync(output).size>1024*1024)throw Error('KIDS_PHONICS_FRAME_UNAVAILABLE');
 return {path:output,timeSeconds:time,bytes:fs.statSync(output).size,mime:'image/jpeg'};
}
export function phonicsFrameParts(job,{read=fs.readFileSync,exists=fs.existsSync}={}){
 if(job.route?.kind!=='phonics'||job.rawId||job.gradeId)return [];
 const parts=[];
 for(const [i,m] of (job.media||[]).filter(m=>!m.isReference).entries()){
  if(!m.mime.startsWith('video/'))continue;
  if(!m.runnerPdfFrame?.path||!exists(m.runnerPdfFrame.path))throw Error('KIDS_PHONICS_FRAME_UNAVAILABLE');
  parts.push({text:`Ảnh duy nhất từ FILE HỌC SINH ${i+1}, tại ${m.runnerPdfFrame.timeSeconds}s. Đây là khung hình của cùng tệp âm thanh, không phải tệp/bài mới. Kiểm tra chữ/hình trên trang có khớp PDF Phonics được giao không. Một ảnh không chứng minh tất cả trang, sự trôi chảy, trí nhớ hay tư thế suốt bài.`},{inlineData:{mimeType:'image/jpeg',data:read(m.runnerPdfFrame.path).toString('base64')}});
 }
 return parts;
}
