const KIDS_COST_POLICY='kids-full-length-latest-v3-20261010';
function kidsUsageReceipt_(raw,measuredAt){
 const u=raw?.usageMetadata;if(!u)return {available:false,reason:'API_USAGE_MISSING'};
 const model=String(raw.modelVersion||''),p=Number(u.promptTokenCount),o=Number(u.candidatesTokenCount),t=Number(u.thoughtsTokenCount||0),cache=Number(u.cachedContentTokenCount||0);
 const audio=(u.promptTokensDetails||[]).filter(x=>x.modality==='AUDIO').reduce((n,x)=>n+Number(x.tokenCount||0),0);
 const lite25=/^gemini-2\.5-flash-lite(?:-|$)/.test(model),lite35=/^gemini-3\.5-flash-lite(?:-|$)/.test(model),flash=/^gemini-3\.[68]-flash(?:-|$)/.test(model),tier=String(u.serviceTier||'STANDARD').toUpperCase();
 const pricingAsOf=String(measuredAt||new Date().toISOString()).slice(0,10),future=pricingAsOf>='2027-01-01';
 const rates=flash?{input:future?1.50:0.75,audio:future?1.50:0.75,output:future?7.50:3.75,cache:future?0.15:0.075}:lite25?{input:0.10,audio:0.30,output:0.40,cache:0.01}:{input:0.30,audio:0.30,output:2.50,cache:0.03};
 const valid=(lite25||lite35||flash)&&tier==='STANDARD'&&[p,o,t,cache,audio].every(n=>Number.isInteger(n)&&n>=0)&&cache<=p&&audio<=p&&(!lite25||cache===0&&Array.isArray(u.promptTokensDetails));
 return {available:true,model,serviceTier:tier,promptTokens:p,audioInputTokens:audio,responseTokens:o,thinkingTokens:t,cachedInputTokens:cache,totalTokens:u.totalTokenCount,
  paidRateEquivalentUsd:valid?((p-cache-audio)*rates.input+audio*rates.audio+cache*rates.cache+(o+t)*rates.output)/1e6:null,
  invoiceChargeUsd:null,pricingAsOf,basis:'API_MEASURED_TOKENS_AT_PUBLISHED_STANDARD_RATE; RECONCILE_WITH_BILLING',pricingSource:'https://ai.google.dev/gemini-api/docs/pricing'};
}
function kidsGradeSchema_(form){
 const str={type:'string'},obj=p=>({type:'object',properties:p,required:Object.keys(p),additionalProperties:false});
 const span=obj({text:str,tone:{type:'string',enum:['praise','correction','neutral']}}),spans={type:'array',items:span};
 const sections=Object.fromEntries(form.map((label,i)=>['s'+i,obj({label:{type:'string',enum:[label]},text:str,spans})]));
 const evidence={type:'object',properties:{fileIndex:{type:'integer'},time:str,type:{type:'string',enum:['grammar','vocabulary','pronunciation','content','presentation']},observed:str,correction:str,word:str,ipa:str},required:['fileIndex','time','type','observed','correction','word','ipa'],additionalProperties:false};
 const contentCheck=obj({task:{type:'string',enum:['mindmap','question']},itemNumber:{type:'integer'},item:str,status:{type:'string',enum:['correct','partial','incorrect','missing','unclear']},fileIndex:{type:'integer'},time:str,heard:str,feedback:str});
 const uncertainty=obj({fileIndex:{type:'integer'},time:str,phrase:str,reason:str});
 const grammarReview=obj({fileIndex:{type:'integer'},status:{type:'string',enum:['errors_found','no_clear_error','unclear','not_applicable']},summary:str});
 const errorGroups={type:'array',items:obj({type:{type:'string',enum:['grammar','pronunciation']},label:str,guidance:str,evidenceIndexes:{type:'array',items:{type:'integer'}}})};
 const recording=obj({fileIndex:{type:'integer'},recordingMode:{type:'string',enum:['fixed_student','handheld_self','handheld_other','screen_book','mixed','audio_only','unclear']},speakerInFrame:{type:'string',enum:['clear','partial','not_visible','unclear']},cameraGazeVerifiable:{type:'boolean'},basis:str,textUseStatus:{type:'string',enum:['visible_reading','visible_prompt','not_determinable']},textUseBasis:str,requirement:{type:'string',enum:['face_presentation','screen_voiceover','reading','audio','unspecified']},requirementBasis:str,compliance:{type:'string',enum:['met','not_met','unclear','not_applicable']},feedback:str});
 const visual=obj({aspect:{type:'string',enum:['gaze','gestures','posture']},status:{type:'string',enum:['observed','unclear','not_visible']},fileIndex:{type:'integer'},time:str,observation:str,assessment:str,tone:{type:'string',enum:['praise','correction','neutral']},phase:{type:'string',enum:['during_task','before_task','after_task','unclear']},repetition:{type:'string',enum:['single','repeated','unclear']},supportTimes:{type:'array',items:str},posture:{type:'string',enum:['standing','seated','unclear','not_applicable']},postureBasis:str,gazeTarget:{type:'string',enum:['camera','reference','audience','unclear','not_applicable']},gazeBasis:str});
 const vocabulary=form.includes('Thuộc từ & nhớ nghĩa')?{vocabularyAssessment:obj({mode:{type:'string',enum:['read_text','name_picture','recall','translate','use_in_sentence','mixed','unclear']},meaningStatus:{type:'string',enum:['demonstrated','partial','not_tested','unclear']},englishAnswerVisible:{type:'boolean'},observed:str})}:{};
 return obj({assessable:{type:'boolean'},band:str,reason:str,...vocabulary,scene:obj({type:{type:'string',enum:['student_visible','screen','book','audio_only','unclear']},description:str}),sections:obj(sections),presentation:obj({assessable:{type:'boolean'},reason:str,text:str,spans,observations:{type:'array',items:visual,maxItems:3}}),recordingChecks:{type:'array',items:recording},performanceWindows:{type:'array',items:obj({fileIndex:{type:'integer'},startTime:str,endTime:str})},evidence:{type:'array',items:evidence},contentChecks:{type:'array',items:contentCheck},contentSourceLimitation:str,uncertainty:{type:'array',items:uncertainty},grammarReview:{type:'array',items:grammarReview},errorGroups});
}
function kidsGenerationConfig_(model,form){
 const config={maxOutputTokens:8192,thinkingConfig:model.startsWith('gemini-2.5-')?{thinkingBudget:0,includeThoughts:false}:{thinkingLevel:model==='gemini-3.8-flash'?'low':'minimal',includeThoughts:false}};
 if(!form){config.responseMimeType='application/json';return config;}
 if(model.startsWith('gemini-2.5-')){config.responseMimeType='application/json';config.responseJsonSchema=kidsEvidenceSchema_(form);}
 else config.responseFormat={text:{mimeType:'APPLICATION_JSON',schema:kidsEvidenceSchema_(form)}};
 return config;
}
function kidsCostPreflight_(job){
 const dest=destination_(job.cls,job.route,job.receipt.student);
 require_(!hasFeedback_(dest.cell.getDisplayValue()),'PREFLIGHT_EXISTING_FEEDBACK');
 require_(!dest.cell.getFormula(),'DESTINATION_FORMULA');
 const ids=driveIds_(job.receipt.links);require_(ids.length>0&&ids.length<=8,'MEDIA_INVENTORY_INVALID');
 const previous=job.costPreflight?.files||[];
 const files=ids.map(id=>{
  let meta;try{meta=fileMeta_(id);}catch(_){throw Error('PREFLIGHT_FILE_MISSING_OR_INVALID');}
  if(!meta.mime.startsWith('video/'))return {...meta,durationSeconds:null};
  const old=previous.find(f=>f.id===id&&f.modified===meta.modified&&f.size===meta.size&&Number.isFinite(f.durationSeconds));
  if(old)return old;
  const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?supportsAllDrives=true&fields=id,size,trashed,videoMediaMetadata(durationMillis)';
  let res;try{res=UrlFetchApp.fetch(url,{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});}catch(_){throw Error('KIDS_DURATION_METADATA_UNAVAILABLE');}
  require_(res.getResponseCode()===200,'KIDS_DURATION_METADATA_UNAVAILABLE');
  const info=JSON.parse(res.getContentText()),ms=Number(info.videoMediaMetadata?.durationMillis);
  require_(!info.trashed&&Number(info.size)===meta.size,'PREFLIGHT_FILE_MISSING_OR_INVALID');
  return {...meta,durationSeconds:Number.isFinite(ms)&&ms>0?ms/1000:null};
 });
 job.costPreflight={policy:KIDS_COST_POLICY,checkedAt:new Date().toISOString(),files};
 return files;
}
function routeKidsCostModel_(job){
 if(job.rawId||job.gradeId||job.status==='GENERATING')return;
 if(['simple-lite-v1','all-flash-3.8-v2'].includes(prop_().getProperty('KIDS_MODEL_ROUTING')))return applyKidsTaskModel_(job);
 const models=fleetModelPool_();
 if(models.includes(job.generationModel||job.model))return;
 const model=models.find(m=>poolModelCooldownUntil_(m,job.keyHash)<=Date.now());
 require_(model,'KEY_POOL_EXHAUSTED');
 job.generationModel=model;job.nextAt=0;job.costPolicy=KIDS_COST_POLICY;
}
function repairKidsCostQueue_(){
 let routed=0,reopened=0,visited=0;const deadline=Date.now()+45000;
 for(const {job,row} of loadJobs_()){
  if(Date.now()>deadline||visited>=25)break;
  if(!assignedClass_(job.cls.className)||job.rawId||job.gradeId||job.status==='GENERATING')continue;
  let changed=false;
  const priorSizeHold=['KIDS_MEDIA_OVER_30_MB','KIDS_VIDEO_OVER_180_SECONDS','KIDS_DURATION_METADATA_UNAVAILABLE'].includes(job.error);
  const uploadRejection=job.error==='HTTP_400'&&!job.generateRequests&&(job.media||[]).some(m=>m.upload&&!m.upload.name);
  if(['NEEDS_REVIEW','BLOCKED'].includes(job.status)&&(priorSizeHold||uploadRejection||/^HTTP_(404|429|500|502|503|504)$/.test(job.error||'')&&job.apiError)){
   job.previousReview={reason:job.error,policy:KIDS_COST_POLICY,at:new Date().toISOString()};
   job.status=job.snapshotId?'READY':'WAITING_INPUT';job.error='';job.nextAt=0;reopened++;changed=true;
  }
  if(!['WAITING_INPUT','QUEUED','READY','WAITING_MEDIA','PROCESSING','RETRY'].includes(job.status))continue;
  const old=job.generationModel||job.model;
  if(job.snapshotId)routeKidsCostModel_(job);
  if(old!==(job.generationModel||job.model)){routed++;changed=true;}
  if(changed){persist_(job,row);visited++;}
 }
 return {routed,reopened};
}
