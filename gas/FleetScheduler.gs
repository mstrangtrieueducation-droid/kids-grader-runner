function fleetNeedsUpload_(j){return !!j.snapshotId && j.media.some(m=>(j.forceFiles||m.size>KG.inlineLimit)&&!m.upload?.name);}
function modelCooldownUntil_(name,keyHash){return poolModelCooldownUntil_(name,keyHash);}
function setModelCooldown_(name,until,keyHash){return poolSetModelCooldown_(name,until,keyHash);}
function fleetModelPool_(){return [...new Set([configuredModel_(),...FALLBACK_MODEL_NAMES])];}
function model_(keyHash){return poolModel_(keyHash);}
function fallbackModelFor_(job){
 if(job.status!=='RETRY'||job.rawId||job.gradeId)return '';
 const current=job.generationModel||job.model;
 if(!(job.error==='HTTP_503'&&job.attempts>=2)&&modelCooldownUntil_(current,job.keyHash)<=Date.now())return '';
 const tried=new Set([job.model,job.generationModel,...(job.triedGenerationModels||[])]);
 return FALLBACK_MODEL_NAMES.find(m=>!tried.has(m)&&modelCooldownUntil_(m,job.keyHash)<=Date.now())||'';
}
