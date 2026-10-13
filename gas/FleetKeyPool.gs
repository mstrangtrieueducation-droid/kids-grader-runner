function keys_(){
 const values=(prop_().getProperty('GEMINI_API_KEYS')||prop_().getProperty('GEMINI_API_KEY')||'').split(',').map(s=>s.trim()).filter(Boolean);
 require_(values.length,'Thiếu GEMINI_API_KEYS trong Script Properties.');return [...new Set(values)];
}
function allStoredKeys_(){return [...new Set(keys_().concat((prop_().getProperty('GEMINI_API_KEY')||'').split(',').map(s=>s.trim()).filter(Boolean)))];}
function keyFor_(job){const key=allStoredKeys_().find(k=>hash_(k)===job.keyHash);require_(key,'KEY_REMOVED: giữ key cũ trong GEMINI_API_KEY cho file đã upload.');return key;}
function poolScope_(keyHash){
 const keys=keys_(),projects=(prop_().getProperty('GEMINI_KEY_PROJECT_IDS')||'').split(',').map(s=>s.trim()),index=keys.findIndex(k=>hash_(k)===keyHash);
 return index>=0&&projects[index]?'project:'+projects[index]:'key:'+keyHash;
}
function poolModelCooldownUntil_(model,keyHash){keyHash=keyHash||hash_(keys_()[0]);return Number(JSON.parse(prop_().getProperty('GEMINI_POOL_COOLDOWNS')||'{}')[poolScope_(keyHash)+'|'+model]||0);}
function poolSetModelCooldown_(model,until,keyHash){
 keyHash=keyHash||hash_(keys_()[0]);const p=prop_(),map=JSON.parse(p.getProperty('GEMINI_POOL_COOLDOWNS')||'{}'),id=poolScope_(keyHash)+'|'+model;
 map[id]=Math.max(Number(map[id]||0),until);p.setProperty('GEMINI_POOL_COOLDOWNS',JSON.stringify(map));
}
function initialPoolBinding_(){
 for(const model of fleetModelPool_())for(const key of keys_())if(poolModelCooldownUntil_(model,hash_(key))<=Date.now())return {key,keyHash:hash_(key),model};
 throw Error('KEY_POOL_EXHAUSTED');
}
function poolModel_(keyHash){return keyHash?fleetModelPool_().find(m=>poolModelCooldownUntil_(m,keyHash)<=Date.now())||configuredModel_():initialPoolBinding_().model;}
function nextPoolBinding_(job){
 const model=job.generationModel||job.model;
 for(const key of keys_())if(hash_(key)!==job.keyHash&&poolModelCooldownUntil_(model,hash_(key))<=Date.now())return {key,keyHash:hash_(key),model};
 for(const alternate of FALLBACK_MODEL_NAMES)for(const key of keys_())if(alternate!==model&&poolModelCooldownUntil_(alternate,hash_(key))<=Date.now())return {key,keyHash:hash_(key),model:alternate};
 return null;
}
function jobHasPoolAlternative_(job){
 if(!['RETRY','READY','WAITING_MEDIA','PROCESSING','QUEUED'].includes(job.status)||job.gradeId||job.rawId)return false;
 const active=keys_().some(k=>hash_(k)===job.keyHash);
 return (!active||poolModelCooldownUntil_(job.generationModel||job.model,job.keyHash)>Date.now())&&!!nextPoolBinding_(job);
}
function bindPoolJob_(job,binding){
 require_(!job.gradeId&&!job.rawId,'POOL_SWITCH_SAVED_RESULT');
 const changed=job.keyHash!==binding.keyHash;
 const sameProject=changed&&poolScope_(job.keyHash).startsWith('project:')&&poolScope_(job.keyHash)===poolScope_(binding.keyHash);
 if(changed&&!sameProject){
  for(const media of job.media){
   if(media.upload?.name){job.retiredFiles=job.retiredFiles||[];job.retiredFiles.push({name:media.upload.name,keyHash:job.keyHash});}
   delete media.upload;delete media.processingState;delete media.stateCheckedAt;
  }
 }
 if(changed){job.keyHash=binding.keyHash;job.keySwitches=Number(job.keySwitches||0)+1;}
 if(binding.model!==job.model)job.generationModel=binding.model;else delete job.generationModel;
 job.status=changed&&!sameProject&&job.forceFiles?'WAITING_MEDIA':'READY';job.nextAt=0;job.error='';
}
function preparePoolRetry_(job,row){
 if(!jobHasPoolAlternative_(job))return;
 const binding=nextPoolBinding_(job);bindPoolJob_(job,binding);persist_(job,row);
 audit_(job.id,'KEY_POOL_RESUME',JSON.stringify({keyIndex:keys_().findIndex(k=>hash_(k)===job.keyHash)+1,model:binding.model,reuploadRequired:fleetNeedsUpload_(job)}));
}
function cleanupRetiredPoolFiles_(job){
 for(const file of job.retiredFiles||[]){if(file.deleted)continue;const key=allStoredKeys_().find(k=>hash_(k)===file.keyHash);if(!key)continue;try{api_('/v1beta/'+file.name,key,{method:'delete'});file.deleted=true;}catch(_){} }
}
