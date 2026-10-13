const KIDS_TASK_MODEL_POLICY='all-flash-3.8-v2';
function kidsTaskModel_(snapshot){
 const contract=kidsTaskContract_(snapshot);
 return {version:KIDS_TASK_MODEL_POLICY,model:'gemini-3.8-flash',reason:'teacher_approved_flash_for_all_kids',kind:snapshot.kind,taskMode:contract.mode};
}
function applyKidsTaskModel_(job){
 if(job.rawId||job.gradeId||job.status==='GENERATING')return;
 require_(job.snapshotId,'MODEL_ROUTE_SNAPSHOT_MISSING');
 const choice=kidsTaskModel_(readArtifact_(job.snapshotId)),current=job.generationModel||job.model;
 // Keep an audited stronger-model fallback; never bounce back after rejection.
 if(job.modelRouting?.version===choice.version&&job.modelRouting.model===choice.model&&
    (current===choice.model||(choice.model.endsWith('flash-lite')&&current===configuredModel_())))return;
 const ready=[choice.model,...(choice.model.endsWith('flash-lite')?[configuredModel_()]:[])];
 let binding;
 for(const model of ready){for(const key of keys_())if(poolModelCooldownUntil_(model,hash_(key))<=Date.now()){
  binding={keyHash:hash_(key),model};break;
 }if(binding)break;}
 require_(binding,'KEY_POOL_EXHAUSTED');
 // Reuse the existing project-aware media transition and never replay a saved response.
 if(binding.keyHash!==job.keyHash||binding.model!==current)bindPoolJob_(job,binding);
 job.modelRouting={...choice,selectedModel:binding.model};
 job.costPolicy=KIDS_COST_POLICY;
}
