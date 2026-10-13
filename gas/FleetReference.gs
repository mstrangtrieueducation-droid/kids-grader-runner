function referencePath_(base,path){
 require_(!/^(?:[a-z]+:|\/\/)/i.test(path),'REFERENCE_EXTERNAL_ASSET');const root='https://mstrangtrieueducation-droid.github.io/';require_(base.startsWith(root),'REFERENCE_HOST_UNSUPPORTED');
 const stack=(path.startsWith('/')?[]:base.slice(root.length).split('/').slice(0,-1));for(const part of path.split('/')){if(part==='..'){require_(stack.length>0,'REFERENCE_PATH_ESCAPE');stack.pop();}else if(part&&part!=='.')stack.push(part);}return root+stack.join('/');
}
function staticJson_(js){
 const m=js.match(/^\s*window\.[A-Z_]+\s*=\s*([\s\S]+?);?\s*$/);require_(m,'REFERENCE_DATA_NOT_JSON');try{return JSON.parse(m[1].replace(/;\s*$/,''));}catch(e){throw Error('REFERENCE_DATA_NOT_JSON');}
}
function guide_(route){
 const id=route.guideFile==='practice'?KG.practice:KG.classroom,s=SpreadsheetApp.openById(id).getSheetByName(route.guideTab);require_(s,'GUIDE_TAB_NOT_FOUND');
 const rows=s.getRange(1,1,s.getLastRow(),2).getDisplayValues().filter(r=>norm_(r[0])===norm_(route.guideKey));require_(rows.length===1&&rows[0][1].trim(),'GUIDE_MISSING_OR_AMBIGUOUS');const guide=rows[0][1],url=route.referenceUrl;
 require_(referenceUrls_(guide).includes(url),'REFERENCE_NOT_IN_GUIDE');require_(/^https:\/\/mstrangtrieueducation-droid\.github\.io\/(?:[a-z0-9-]+\/)+$/.test(url),'REFERENCE_HOST_UNSUPPORTED');
 const html=http_(url,{}).getContentText(),baseMatch=html.match(/<base[^>]*href=["']([^"']+)/i),base=baseMatch?referencePath_(url,baseMatch[1])+'/':url;
 let reference=referencePlainText_(html),structured=false;const media=[],assets=[];
 if(/^FF[12]$/.test(route.family)){
  require_(norm_(reference).includes('MA BAI '+norm_(route.code)),'REFERENCE_LESSON_MISMATCH');
  const reading=html.match(/\bconst\s+lines\s*=\s*(\[[\s\S]*?\])\s*;/);
  if(reading && route.kind==='translation'){
   const lines=[...reading[1].matchAll(/\btext\s*:\s*("(?:[^"\\]|\\.)*")/g)].map(m=>JSON.parse(m[1]));
   require_(lines.length>=2 && lines.every(x=>typeof x==='string'&&x.length<2000),'REFERENCE_READING_TEXT_INVALID');
   reference+='\nEXACT TEACHER READING TEXT:\n'+lines.join('\n');structured=true;
  }
 }
 for(const m of html.matchAll(/<script\b(?=[^>]*type=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi)){try{reference+='\n'+JSON.stringify(referenceDataOnly_(JSON.parse(m[1])));structured=true;}catch(e){throw Error('REFERENCE_INLINE_JSON_INVALID');}}
 // Some Family pages keep a literal JSON word bank inline rather than in a
 // separate data file. Preserve target words, not megabytes of embedded media.
 if(/^FF[12]$/.test(route.family)&&route.kind==='vocabulary'){
  const items=referenceItems_(html);if(items){reference+='\nTEACHER WORD DATA:\n'+JSON.stringify(referenceDataOnly_(items));structured=true;}
  const links=[...new Set([...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map(m=>m[1]).filter(p=>/(?:^|\/)tra-bai(?:-[a-z0-9-]+)?\.html$/.test(p)))];
  require_(links.length<=1,'REFERENCE_REVIEW_PAGE_AMBIGUOUS');
  if(links.length){const reviewHtml=http_(referencePath_(base,links[0]),{}).getContentText();reference+='\nLINKED SUBMISSION PAGE:\n'+referencePlainText_(reviewHtml);const details=pictureReviewDescription_(reviewHtml);require_(details,'REFERENCE_REVIEW_MODE_UNCLEAR');reference+='\n'+details;}
 }
 const scripts=[...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map(m=>m[1]).filter(x=>/(?:^|\/)(?:unit-data|lesson-data|reading-data|data|peppa-data|lessons|lesson)\.js(?:\?|$)/.test(x)&&!/^https?:/.test(x));
 for(const path of scripts){const text=http_(referencePath_(base,path),{}).getContentText();
  if(/peppa-data|lessons\.js/.test(path)){
   const data=staticJson_(text),a=assignmentIdentity_(route.code),matches=data.filter(r=>Number(r.number)===a.number);require_(matches.length===1,'REFERENCE_LESSON_AMBIGUOUS');const selected=matches[0];media.push(dubbingReferenceMedia_(route.kind,selected));reference+='\nTEACHER LESSON DATA:\n'+JSON.stringify(selected)+'\nREFERENCE ROLE: bản gốc có giọng ở videos[0] để đối chiếu lời/âm; bản tách giọng dùng cho học sinh luyện, không thay mẫu phát âm.';structured=true;
  }else if(/(?:^|\/)lesson\.js/.test(path)){
   const data=staticJson_(text);require_(Number(data.number)===assignmentIdentity_(route.code).number,'REFERENCE_LESSON_MISMATCH');reference+='\nTEACHER LESSON DATA:\n'+JSON.stringify(data);if(data.mindmap)assets.push(referencePath_(base,data.mindmap));if(data.questionsImage)assets.push(referencePath_(base,data.questionsImage));structured=true;
  }else{reference+='\nSOURCE DATA (not executable):\n'+text;structured=true;}
 }
 if(route.kind==='de'){
  const sample=[...html.matchAll(/data-drive-id=["']([-\w]+)["']\s+data-title=["']([^"']+)["']/g)].filter(m=>/BAN CO PHU DE/.test(norm_(m[2])));require_(sample.length===1,'REFERENCE_VIDEO_MISSING');media.push(sample[0][1]);
 }
 if(['phonics','scienceK','science'].includes(route.kind)&&!structured){
  const iframes=[...html.matchAll(/<iframe\b[^>]*src=["']https:\/\/drive\.google\.com\/file\/d\/([-\w]+)\/preview[^>]*>/g)].map(m=>({id:m[1],tag:m[0]}));
  if(route.kind==='phonics'){
   // The PDF is the exact reading task; instructional sample videos supply the target sounds.
   media.push(...phonicsReferenceFrames_(iframes));
  }else{
   const sample=iframes.filter(x=>/PHU DE|BAN LUYEN CAU/.test(norm_(x.tag)));require_(sample.length===1,'REFERENCE_VIDEO_MISSING');media.push(sample[0].id);
   if(route.kind==='science'){const mindmaps=[...html.matchAll(/<img\b[^>]*src=["']https:\/\/drive\.google\.com\/thumbnail\?id=([-\w]+)[^>]*alt=["']Mindmap/gi)];require_(mindmaps.length===1,'REFERENCE_MINDMAP_MISSING');media.push(mindmaps[0][1]);}
  }
 }
 if(route.kind==='critical'&&!structured){
  // Static lessons contain the mindmap and presentation prompt. Require explicit substantive content.
  require_(/MIND.?MAP|THUYET TRINH/.test(norm_(reference))&&reference.length>1500,'REFERENCE_PRESENTATION_CONTENT_MISSING');
  const imageTags=[...html.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/g)].filter(m=>/MIND.?MAP/.test(norm_(m[0])));require_(imageTags.length===1,'REFERENCE_MINDMAP_MISSING');assets.push(referencePath_(base,imageTags[0][1]));structured=true;
 }
 require_(structured||media.length,'REFERENCE_INCOMPLETE');require_(reference.length>100&&reference.length<100000,'REFERENCE_SIZE_INVALID');
 // Some lesson pages render the instructions from a shared app template. Read
 // its static strings as source data; never execute the downloaded JavaScript.
 const guidanceScripts=[...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map(m=>m[1]).filter(x=>/(?:^|\/)(?:app|lesson-app)\.js(?:\?|$)/.test(x)&&!/^https?:/.test(x));
 for(const path of guidanceScripts){
  const js=http_(referencePath_(base,path),{}).getContentText();
  const snippets=staticGuidanceText_(js);if(snippets)reference+='\nWEB SUBMISSION INSTRUCTIONS:\n'+snippets;
 }
 const result={guide,reference,kind:route.kind,form:FORMS[route.kind]};if(media.length)result.referenceMedia=[...new Set(media)];if(assets.length)result.referenceAssets=[...new Set(assets)];
 const contract=kidsTaskContract_(result);require_(contract.mode!=='not_assigned','GUIDE_NO_SPEAKING_TASK');require_(contract.mode!=='unknown','GUIDE_TASK_REQUIREMENTS_UNCLEAR');
 return result;
}
function staticGuidanceText_(js){
 require_(js.length<500000,'REFERENCE_GUIDANCE_SIZE');
 // Literal HTML nodes survive nested JS template expressions. Never evaluate JS.
 const literals=[...js.matchAll(/<(p|h[1-6]|li|figcaption)\b[^>]*>([^<>]*?)<\/\1>/gi)].map(m=>m[2]).filter(t=>!t.includes('${'));
 const templates=[...js.matchAll(/`([\s\S]*?)`/g)].map(m=>m[1].replace(/\$\{[^{}]*\}/g,'[dữ liệu bài]'));
 return [...new Set([...literals,...templates].map(referencePlainText_).filter(t=>/quay|lồng tiếng|nộp bài|phụ đề|mindmap|thuyết trình|nguyên bài|trả lời|từ khóa/iu.test(t)))].join('\n').slice(0,25000);
}
function referenceDataOnly_(x){
 if(typeof x==='string')return x.startsWith('data:')?'[embedded media omitted]':x;
 if(Array.isArray(x))return x.map(referenceDataOnly_);
 if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,referenceDataOnly_(v)]));
 return x;
}
function phonicsReferenceFrames_(frames){
 const labelled=frames.map(x=>({...x,label:norm_((x.tag.match(/\btitle=["']([^"']+)/i)||[])[1]||'')}));
 const reading=labelled.filter(x=>/PDF|DOCUMENT|BAI DOC|FILE(?: HINH)? LUYEN DOC/.test(x.label));require_(reading.length===1,'REFERENCE_READING_PDF_MISSING');
 const models=labelled.filter(x=>/^(?:VIDEO )?(?:LUYEN AM|SOUNDS?|WORDS?|PHONICS)\b/.test(x.label)&&x.id!==reading[0].id);
 require_(models.length>0,'REFERENCE_PHONICS_SOUND_MODEL_MISSING');
 return [reading[0].id,...models.map(x=>x.id)];
}
function dubbingReferenceMedia_(kind,lesson){
 // Both verified web apps label index 0 as the spoken original. Phonics index 1
 // is muted; Peppa index 2 is muted. Never substitute them as acoustic targets.
 require_(['peppa','phonicsVideo'].includes(kind),'REFERENCE_DUBBING_TYPE_UNKNOWN');
 require_(lesson.videos?.length>=3&&typeof lesson.videos[0]==='string'&&/^[-\w]{20,}$/.test(lesson.videos[0]),'REFERENCE_VIDEO_MISSING');
 return lesson.videos[0];
}
function referenceItems_(html){
 const m=/\bconst\s+items\s*=\s*(\[)/.exec(html);if(!m)return null;
 const start=m.index+m[0].length-1;let depth=0,string=false,escaped=false;
 for(let i=start;i<html.length;i++){const ch=html[i];if(string){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')string=false;continue;}if(ch==='"'){string=true;continue;}if(ch==='[')depth++;if(ch===']'&&--depth===0){try{const data=JSON.parse(html.slice(start,i+1));require_(data.length>0&&data.every(x=>typeof x.word==='string'),'REFERENCE_WORD_LIST_INVALID');return data;}catch{throw Error('REFERENCE_WORD_LIST_INVALID');}}}
 throw Error('REFERENCE_WORD_LIST_INVALID');
}
function pictureReviewDescription_(html){
 const title=referencePlainText_((html.match(/<title[^>]*>([^<]+)/i)||[])[1]||'');
 const image=/<img\b[^>]*id=["']art["']/i.test(html),letter=/<(?:p|div)\b[^>]*id=["'](?:initial|letter)["']/i.test(html);
 const binding=/(?:initial|letter)\.innerHTML\s*=\s*(?:`\$\{item\.initial\}|item\.i\s*\+)/.test(html);
 return /Trả bài/iu.test(title)&&image&&letter&&binding?'Giao diện trả bài đã kiểm tra: học sinh nhìn ảnh và tự nói từ; màn hình chỉ hiện hình ảnh và chữ cái đầu tiên, không hiện đáp án đầy đủ.':'';
}
function referenceAssetParts_(snapshot){return (snapshot.referenceAssets||[]).map(url=>{require_(url.startsWith('https://mstrangtrieueducation-droid.github.io/'),'REFERENCE_ASSET_HOST');const r=http_(url,{}),blob=r.getBlob(),mime=blob.getContentType();require_(/^image\//.test(mime),'REFERENCE_ASSET_TYPE');const bytes=blob.getBytes();require_(bytes.length>0&&bytes.length<=KG.inlineLimit,'REFERENCE_ASSET_SIZE');return {inlineData:{mimeType:mime,data:Utilities.base64Encode(bytes)}};});}
