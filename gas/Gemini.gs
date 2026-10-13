function headersLower_(res) { return Object.fromEntries(Object.entries(res.getAllHeaders()).map(([k,v])=>[k.toLowerCase(),String(v)])); }
function http_(url, options) {
  let r;
  try { r = UrlFetchApp.fetch(url, Object.assign({muteHttpExceptions:true}, options)); }
  catch (_) { throw new Error('NETWORK_RETRY'); } // Never log URLs, keys or upload sessions.
  const code = r.getResponseCode();
  if (code < 200 || code >= 300) {
    const e = new Error('HTTP_' + code); e.httpCode = code;
    if(/^https:\/\/generativelanguage\.googleapis\.com\//.test(url)){e.apiDetails=safeGeminiError_(r);prop_().setProperty('FLEET_API_HEALTH',JSON.stringify({checkedAt:new Date().toISOString(),...e.apiDetails}));}
    e.retryAfter = Math.max(60000, Math.min(3600000, Number(headersLower_(r)['retry-after'] || 60)*1000));
    const delay=String(e.apiDetails?.retryDelay||'').match(/^(\d+(?:\.\d+)?)s$/);if(delay)e.retryAfter=Math.max(e.retryAfter,Math.min(86400000,Math.ceil(Number(delay[1])*1000)+5000));
    throw e;
  }
  return r;
}
function api_(path, key, options) {
  const opts = Object.assign({}, options || {});
  opts.headers = Object.assign({'x-goog-api-key':key}, opts.headers || {});
  try{return http_(KG.api + path, opts);}catch(e){if(e.apiDetails){e.apiDetails.keyHash=hash_(key);e.apiDetails.pathKind=path.includes(':generateContent')?'generate':'media';prop_().setProperty('FLEET_API_HEALTH',JSON.stringify({checkedAt:new Date().toISOString(),...e.apiDetails}));}throw e;}
}
function throttle_() { // Called under the one script lock; durable across executions and keys.
  const gap = Math.max(4100, Number(prop_().getProperty('MIN_REQUEST_GAP_MS') || 4100));
  const wait = gap - (Date.now() - Number(prop_().getProperty('LAST_GENERATE_AT') || 0));
  if (wait > 0) Utilities.sleep(wait);
  prop_().setProperty('LAST_GENERATE_AT', String(Date.now()));
}
function listGeminiModels() {
  const names = []; let token = '';
  do {
    const data = JSON.parse(api_('/v1beta/models?pageSize=100' + (token ? '&pageToken='+encodeURIComponent(token) : ''), keys_()[0]).getContentText());
    (data.models || []).filter(m=>(m.supportedGenerationMethods || []).includes('generateContent')).forEach(m=>names.push(m.name.replace('models/','')));
    token = data.nextPageToken || '';
  } while(token);
  Logger.log(JSON.stringify(names)); return names;
}
function checkModel_(key, model) {
  const cacheKey=hash_(key)+'|'+model;
  if(KIDS_EXECUTION_CACHE && KIDS_EXECUTION_CACHE[cacheKey])return;
  const data = JSON.parse(api_('/v1beta/models/' + model, key).getContentText());
  require_((data.supportedGenerationMethods || []).includes('generateContent'), 'MODEL_UNSUPPORTED');
  if(KIDS_EXECUTION_CACHE)KIDS_EXECUTION_CACHE[cacheKey]=true;
}
function fileMeta_(id, isReference) {
  const file = DriveApp.getFileById(id);
  require_(!file.isTrashed(), 'FILE_TRASHED');
  const mime = file.getMimeType();
  require_(/^(audio|video)\//.test(mime) || (isReference && (/^image\//.test(mime) || mime==='application/pdf')), 'UNSUPPORTED_MEDIA: ' + mime);
  require_(file.getSize() > 0 && file.getSize() <= KG.maxFile, 'MEDIA_SIZE_UNSUPPORTED');
  return {id, mime, size:file.getSize(), modified:file.getLastUpdated().toISOString()};
}
function uploadChunkBytes_(upload,headers){
  const advertised=Number(headers?.['x-goog-upload-chunk-granularity']||upload.granularity||8388608);
  require_(Number.isSafeInteger(advertised)&&advertised>0&&advertised<=40*1024*1024,'UPLOAD_GRANULARITY_UNSUPPORTED');
  upload.granularity=advertised;
  const bytes=Math.ceil(KG.chunk/advertised)*advertised;
  require_(bytes<=40*1024*1024,'UPLOAD_CHUNK_TOO_LARGE');return bytes;
}
function uploadTransferEnd_(offset,size,chunkBytes){
  const remaining=size-offset;
  // The final transfer may be unaligned; keep it below UrlFetch's 50 MB limit.
  return offset+Math.min(remaining,remaining<=45*1024*1024?remaining:chunkBytes)-1;
}
function mediaPart_(job, media, save, deadline) {
  const key = keyFor_(job), file = DriveApp.getFileById(media.id);
  if (!job.forceFiles && media.size <= KG.inlineLimit) return {inlineData:{mimeType:media.mime, data:Utilities.base64Encode(file.getBlob().getBytes())}};
  // Chunked upload avoids Apps Script's 50 MB UrlFetch request/response limit.
  if (!media.upload) {
    const r = api_('/upload/v1beta/files', key, {method:'post',contentType:'application/json',headers:{
      'X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start',
      'X-Goog-Upload-Header-Content-Length':String(media.size),'X-Goog-Upload-Header-Content-Type':media.mime
    }, payload:JSON.stringify({file:{display_name:'kids-' + job.id.slice(0,12)}})});
    const url = headersLower_(r)['x-goog-upload-url'];
    require_(url && /^https:\/\/generativelanguage\.googleapis\.com\//.test(url), 'UPLOAD_URL_INVALID');
    media.upload = {url,offset:0};uploadChunkBytes_(media.upload,headersLower_(r));save();
  }
  const u = media.upload;
  if (!u.name) {
    // Query server's committed byte count after every resumption, including uncertain network writes.
    const q = http_(u.url,{method:'post',headers:{'X-Goog-Upload-Command':'query'}});
    const h = headersLower_(q);
    const chunkBytes=uploadChunkBytes_(u,h);
    if (h['x-goog-upload-status'] === 'final') {
      // Lost final response: restart upload only; no grading call has been sent yet.
      delete media.upload; save(); return null;
    }
    if (h['x-goog-upload-size-received'] !== undefined) u.offset = Number(h['x-goog-upload-size-received']);
    require_(Number.isSafeInteger(u.offset) && u.offset >= 0 && u.offset < media.size, 'UPLOAD_OFFSET_INVALID');
    const uploadSliceEnd=Math.min(deadline-30000,Date.now()+KG.uploadSliceMs);let uploadedChunks=0;
    while (u.offset < media.size && Date.now() < uploadSliceEnd && uploadedChunks<KG.maxUploadChunksPerStep) {
      const end = uploadTransferEnd_(u.offset,media.size,chunkBytes);
      const drive = http_('https://www.googleapis.com/drive/v3/files/' + media.id + '?alt=media&supportsAllDrives=true',{
        headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken(),Range:'bytes='+u.offset+'-'+end}
      });
      require_(drive.getResponseCode() === 206, 'DRIVE_RANGE_NOT_SUPPORTED');
      const bytes = drive.getBlob();
      require_(headersLower_(drive)['content-range']==='bytes '+u.offset+'-'+end+'/'+media.size, 'DRIVE_CHUNK_MISMATCH');
      const final = end+1 === media.size;
      const r = http_(u.url,{method:'post',contentType:media.mime,headers:{'X-Goog-Upload-Offset':String(u.offset),'X-Goog-Upload-Command':final?'upload, finalize':'upload'},payload:bytes});
      u.offset = end+1;uploadedChunks++;
      if (final) {
        const f = JSON.parse(r.getContentText()).file;
        require_(f && f.name && f.uri, 'UPLOAD_RESULT_INVALID');
        u.name = f.name; u.uri = f.uri; delete u.url;
      }
      save();
    }
    if (!u.name) return null;
  }
  let f;
  try {f=JSON.parse(api_('/v1beta/' + u.name, key).getContentText());}
  catch(e) {
    // Uploaded files expire after 48h. A quota pause can outlive them; re-upload only media.
    if(e.httpCode===404 && !job.gradeId && !job.rawId) {delete media.upload;save();return null;}
    throw e;
  }
  require_(f.state !== 'FAILED', 'MEDIA_PROCESSING_FAILED');
  media.processingState=f.state;media.stateCheckedAt=Date.now();save();
  if (f.state !== 'ACTIVE') return null; // One check only; no polling/sleep loop.
  return {fileData:{mimeType:media.mime,fileUri:f.uri}};
}
function cleanupMedia_(job) {
  cleanupRetiredPoolFiles_(job);
  job.media.forEach(m => {
    if (!m.upload || !m.upload.name || m.upload.deleted) return;
    try { api_('/v1beta/'+m.upload.name,keyFor_(job),{method:'delete'}); m.upload.deleted=true; }
    catch (_) { /* Gemini deletes uploaded files after 48h; keep cleanup retry state. */ }
  });
}
function prompt_(snapshot) {
  return kidsEvidencePrompt_(snapshot);
}
function kidsSystemInstruction_(){return kidsEvidenceSystemInstruction_();}
function normalizeKidsGrade_(g){
 if(g.sections&&!Array.isArray(g.sections))g.sections=Object.keys(g.sections).sort((a,b)=>Number(a.slice(1))-Number(b.slice(1))).map(k=>g.sections[k]);
 normalizeKidsPresentation_(g);
 if(g.presentation?.assessable)require_(g.scene?.type==='student_visible','GRADE_VISUAL_CONTEXT_INVALID');
 if(g.scene&&g.scene.type!=='student_visible'){
  require_(!g.presentation?.text?.trim()&&!g.presentation?.spans?.length,'GRADE_VISUAL_CONTEXT_INVALID');
  require_(!(g.sections||[]).some(s=>/ánh mắt|ngôn ngữ cơ thể|tư thế|phong thái/i.test(s.text||'')),'GRADE_VISUAL_CONTEXT_INVALID');
 }
 if(g.scene?.type==='student_visible'){const p=g.presentation;require_(p,'GRADE_PRESENTATION_MISSING');const text=p.assessable?p.text:p.reason;require_(typeof text==='string'&&text.trim().length>3,'GRADE_PRESENTATION_MISSING');if(!(g.sections||[]).some(s=>s.label==='Phong thái & trình bày'))g.sections.push({label:'Phong thái & trình bày',text,spans:p.assessable?p.spans:[{text,tone:'neutral'}]});}
 if(g.assessable){normalizeKidsErrorGroups_(g);normalizePronunciationDetails_(g);}
 // Treat section.text as the assessment; spans are formatting metadata only.
 // A model may paraphrase text inside spans. Never substitute that paraphrase:
 // rebuild colors from the exact original section using the existing tone rules.
 if(g.assessable)for(const section of g.sections||[])if(typeof section.text==='string'){
  if(!validToneSpans_(section)){section.spans=legacyToneSpans_(section.text);g.colorRepair=g.colorRepair||[];g.colorRepair.push(section.label);}
  else section.spans=section.spans.flatMap(s=>s.tone==='neutral'&&!s.text.trim().startsWith('Gợi ý luyện tập chung (không phải lỗi đã xác nhận):')&&!(section.label==='Phong thái & trình bày'&&g.presentation?.observations)&&!(g.reviewRendered&&/^\n(?:Câu |Ý |Rà ngữ pháp|Giới hạn đối chiếu|Chưa nghe rõ)/.test(s.text))?legacyToneSpans_(s.text):[s]);
 }
 if(g.assessable)normalizeKidsReview_(g);
 return g;
}
function normalizePronunciationDetails_(g){
 const fold=s=>String(s||'').normalize('NFC').toLowerCase();
 for(const e of g.evidence||[]){
  if(e.type!=='pronunciation'||!e.word)continue;
  // Recover a missing IPA only from a single explicit correction supplied by
  // Gemini. Never derive pronunciation from a transcript or guess a new IPA.
  if(!e.ipa&&fold(e.correction).includes(fold(e.word))){const found=String(e.correction||'').match(/\/[^/\n<>]+\//g)||[];if(found.length===1)e.ipa=found[0];}
  if(!/^\/[^/\n<>]+\/$/.test(e.ipa||''))continue;
  if((g.sections||[]).some(s=>fold(s.text).includes(fold(e.word))&&s.text.includes(e.ipa)))continue;
  const pronunciation=(g.sections||[]).filter(s=>/phát âm/i.test(s.label||''));
  const section=pronunciation.length===1?pronunciation[0]:(g.sections||[]).find(s=>fold(s.text).includes(fold(e.word)));
  if(!section||!e.correction?.trim())continue;
  const correction=fold(e.correction).includes(fold(e.word))&&e.correction.includes(e.ipa)?e.correction.trim():e.word+' '+e.ipa+': '+e.correction.trim();
  const detail='\n['+e.time+'] '+correction;
  const original=validToneSpans_(section)?section.spans:legacyToneSpans_(section.text);
  section.text+=detail;section.spans=original.concat([{text:detail,tone:'correction'}]);
  g.evidenceRendered=g.evidenceRendered||[];g.evidenceRendered.push({word:e.word,ipa:e.ipa,time:e.time});
 }
}
function generate_(job, parts, snapshot) {
  throttle_();
  const started=Date.now();job.kidsReviewVersion=KIDS_REVIEW_VERSION;job.generateRequests=Number(job.generateRequests||0)+1;let r;
  try {r = api_('/v1beta/models/'+(job.generationModel||job.model)+':generateContent',keyFor_(job),{
    method:'post',contentType:'application/json',payload:JSON.stringify({systemInstruction:{parts:[{text:kidsSystemInstruction_()}]},contents:[{role:'user',parts:[{text:prompt_(snapshot)+'\nCHỈ CHẤM LOẠI: '+snapshot.kind+'\nTệp học sinh: chỉ số 0 đến '+((job.studentFileCount||job.media.length)-1)+'. Những tệp tiếp theo (nếu có) là VIDEO MẪU CỦA CÔ để đối chiếu nội dung/lời, tuyệt đối không chấm thành bài học sinh. evidence.fileIndex chỉ thuộc tệp học sinh.'}].concat(parts)}],generationConfig:kidsGenerationConfig_(job.generationModel||job.model,snapshot.form)})
  });} finally {
    job.lastGenerateMs=Date.now()-started;
    prop_().setProperty('KIDS_GENERATE_MAX_MS',String(Math.max(Number(prop_().getProperty('KIDS_GENERATE_MAX_MS')||0),job.lastGenerateMs)));
    const observed=JSON.parse(prop_().getProperty('KIDS_GENERATE_MS_BY_MODEL')||'{}'),actualModel=job.generationModel||job.model;
    observed[actualModel]=Math.max(Number(observed[actualModel]||0),job.lastGenerateMs);
    prop_().setProperty('KIDS_GENERATE_MS_BY_MODEL',JSON.stringify(observed));
  }
  const raw = JSON.parse(r.getContentText());
  job.usageRecordedAt=new Date().toISOString();job.apiUsage=kidsUsageReceipt_(raw,job.usageRecordedAt);
  job.rawId = saveArtifact_('raw-'+job.id+'-'+Date.now(),raw);
  const c = raw.candidates && raw.candidates[0];
  require_(c && c.finishReason === 'STOP', 'MODEL_INCOMPLETE_OR_BLOCKED');
  const text = (c.content.parts || []).filter(p=>!p.thought && typeof p.text==='string').map(p=>p.text).join('');
  let data; try { data = JSON.parse(text); } catch (_) { throw new Error('MODEL_INVALID_JSON'); }
  validateKidsRubricDraft_(data,snapshot);
  normalizeKidsGrade_(data);
  validateGrade_(data,snapshot.form,job.studentFileCount||job.media.length,snapshot);
  if(data.assessable) require_(data.sections.every(validToneSpans_),'GRADE_COLOR_SPANS_INVALID');
  return data;
}
function validateGrade_(g, form, fileCount, snapshot) {
  require_(typeof g.assessable === 'boolean', 'GRADE_ASSESSABLE_INVALID');
  if (!g.assessable) { require_(g.band === '' && typeof g.reason === 'string' && g.reason.trim(), 'GRADE_UNASSESSABLE_INVALID'); return; }
  require_(g.rubricEstimate?g.rubricEstimate.policy==='teacher-rubric-estimate-v1'&&g.band===g.rubricEstimate.percent+'%'&&g.rubricEstimate.percent>=0&&g.rubricEstimate.percent<=100:g.scoreCalculation?g.band===g.scoreCalculation.percent+'%'&&g.scoreCalculation.percent>=0&&g.scoreCalculation.percent<=100:KG.bands.includes(g.band), 'GRADE_BAND_INVALID');
  if(g.scene?.type==='student_visible')form=form.concat(['Phong thái & trình bày']);
  require_(Array.isArray(g.sections) && g.sections.length === form.length, 'GRADE_FORM_INVALID');
  g.sections.forEach((s,i)=>require_(s.label === form[i] && typeof s.text==='string' && s.text.trim().length>3 && s.text.length<10000 && !s.text.includes(KG.marker), 'GRADE_SECTION_INVALID'));
  require_(Array.isArray(g.evidence) && g.evidence.length <= 200, 'GRADE_EVIDENCE_INVALID');
  g.evidence.forEach(e=>require_(Number.isInteger(e.fileIndex) && e.fileIndex>=0 && e.fileIndex<fileCount && /^\d{2,3}:[0-5]\d$/.test(e.time) && typeof e.observed==='string' && e.observed.trim() && typeof e.correction==='string' && e.correction.trim(), 'GRADE_EVIDENCE_INVALID'));
  validateKidsReview_(g,fileCount,snapshot);
}
function feedbackHeading_(g) {
  const q=g.scoreCalculation,detail=''; // Counts and weights remain in the private score ledger.
  const band=/^\d+(?:\.\d+)?%$/.test(g.band)?Math.round(parseFloat(g.band))+'%':g.band;
  return 'Chất lượng: đạt khoảng ' + band + '.\n'+(/^\d+%$/.test(band)&&parseInt(band,10)<70?'⚠ Cần theo dõi\n':'')+detail;
}
function feedbackText_(g) {return feedbackHeading_(g)+kidsSheetDisplaySections_(g).map(s=>'• '+s.label+': '+s.text).join('\n');}
