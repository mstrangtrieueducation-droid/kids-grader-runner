function cluster_(){return FLEET_CLUSTER;}
function assignedClass_(name){return cluster_().classes.find(c=>norm_(c.className)===norm_(name));}
function retiredTextbookHomework_(r){return /^D[34]-\s*TIET\s*\d+/.test(norm_(r.code||''));}
function retireTextbookHomeworkJobs_(){
 let retired=0;const mutable=['WAITING_INPUT','QUEUED','PROCESSING','WAITING_MEDIA','READY','RETRY','GRADED','NEEDS_REVIEW','BLOCKED','STALE'];
 for(const {job,row} of loadJobs_())if(retiredTextbookHomework_(job.receipt||job.route||{})&&mutable.includes(job.status)){
  job.previousStatus=job.status;job.status='SKIPPED_NOT_ASSIGNED';job.error='DISCOVER_3_4_HOMEWORK_RETIRED';job.nextAt=0;persist_(job,row);retired++;
 }
 return retired;
}
function inAutoScope_(r){return !retiredTextbookHomework_(r)&&!!assignedClass_(r.className) && Number.isFinite(Date.parse(r.time)) && Date.parse(r.time)>=Date.parse(KIDS21_AUTO.cutoff);}
const KIDS21_AUTO=Object.freeze({cutoff:'2026-09-01T00:00:00+07:00',dailyRuntimeMs:75*60*1000,tabs:['DISCOVER 1','DISCOVER 2','DISCOVER ENGLISH','FF1','FF2','PEPPA PIG','PHONICS VIDEO','PHONICS 1–4','SCIENCE K','SCIENCE G1 & G2','SCIENCE G3','CRITICAL 1–3']});
function assertClusterOwner_(){
 // The root folder belongs to the executing user's My Drive. Reuse the Drive permission
 // already needed for media and tracker access, without an additional email OAuth scope.
 const owner=DriveApp.getRootFolder().getOwner();
 require_(owner && owner.getEmail().toLowerCase()===cluster_().email.toLowerCase(),'WRONG_CLUSTER_ACCOUNT');
}
function sourceSchema_(headers,tab){
 const h=headers.map(norm_),one=(re,label)=>{const a=h.map((x,i)=>re.test(x)?i:-1).filter(i=>i>=0);require_(a.length===1,'SOURCE_SCHEMA_'+label);return a[0];};
 const schema={time:one(/^DAU THOI GIAN$/,'TIME'),student:one(/TEN.*TIENG ANH/,'STUDENT'),className:one(/^LOP$/,'CLASS'),code:h.indexOf('MA BAI'),media:[]};
 if(schema.code<0 && tab==='DISCOVER 1' && h[1]==='COT 2')schema.code=1;
 require_(schema.code>=0,'SOURCE_SCHEMA_CODE');
 h.forEach((x,i)=>{if(i!==schema.code && /VIDEO|LINK LIEN KET/.test(x))schema.media.push(i);});
 require_(schema.media.length>0,'SOURCE_SCHEMA_MEDIA');return schema;
}
function receiptAt_(values,rich,schema,row,tab){
 const links=schema.media.map(c=>{const urls=rich&&rich[c]?rich[c].getRuns().map(r=>r.getLinkUrl()).filter(Boolean):[];return urls.length?urls.join(', '):String(values[c]||'');}).join(' ');
 return {row,time:values[schema.time] instanceof Date?values[schema.time].toISOString():String(values[schema.time]),code:String(values[schema.code]||''),student:norm_(values[schema.student]),className:norm_(values[schema.className]),links,sourceTab:tab};
}
function sourceRows_(tab){
 const s=SpreadsheetApp.openById(KG.source).getSheetByName(tab);require_(s,'SOURCE_TAB_NOT_FOUND');
 const width=Math.min(7,s.getLastColumn()),schema=sourceSchema_(s.getRange(1,1,1,width).getDisplayValues()[0],tab);if(s.getLastRow()<2)return [];
 const r=s.getRange(2,1,s.getLastRow()-1,width),v=r.getValues(),rich=r.getRichTextValues();return v.map((a,i)=>receiptAt_(a,rich[i],schema,i+2,tab));
}
function freshReceipt_(job){
 const tab=job.route.sourceTab,s=SpreadsheetApp.openById(KG.source).getSheetByName(tab);require_(s&&s.getLastRow()>1,'STALE_RECEIPT');
 const schema=sourceSchema_(s.getRange(1,1,1,Math.min(7,s.getLastColumn())).getDisplayValues()[0],tab);
 const index=s.getRange(2,1,s.getLastRow()-1,4).getValues().map((v,i)=>receiptAt_(v,null,Object.assign({},schema,{media:[]}),i+2,tab));
 const a=latest_(index,job.cls.className,job.route.code,job.receipt.student);require_(a.length===1,'STALE_RECEIPT');
 const r=s.getRange(a[0].row,1,1,Math.min(7,s.getLastColumn()));return receiptAt_(r.getValues()[0],r.getRichTextValues()[0],schema,a[0].row,tab);
}
function guideCatalog_(){
 const result={};for(const [kind,id] of [['classroom',KG.classroom],['practice',KG.practice]]){
  const ss=SpreadsheetApp.openById(id);result[kind]={};ss.getSheets().forEach(s=>{result[kind][s.getName()]=s.getRange(1,1,s.getLastRow(),2).getDisplayValues();});
 }return result;
}
function assignmentIdentity_(code){
 const n=norm_(code);let m;
 if(m=n.match(/^(D[1-4]|FF[12])-\s*TIET\s*(\d+)(?:\s*-\s*(.*))?$/))return {family:m[1],number:Number(m[2]),detail:m[3]||'',practice:false,guideTab:m[1][0]==='D'?'Discover '+m[1][1]:'Family & Friends '+m[1].slice(-1)};
 if(m=n.match(/^OP([1-4])-L0*(\d+)(?:-(.*))?$/))return {family:'OP'+m[1],number:Number(m[2]),detail:m[3]||'',practice:false,guideTab:'Phonics'};
 if(m=n.match(/^CRITICAL-C([1-3])-L0*(\d+)(?:-(.*))?$/))return {family:'C'+m[1],number:Number(m[2]),detail:m[3]||'',practice:false,guideTab:'Critical thinking & Science '+m[1]};
 if(m=n.match(/^(DE|PEPPA|PHONICS-VIDEO|SCIENCE-K|SCIENCE-G[123])-0*(\d+)$/))return {family:m[1],number:Number(m[2]),practice:true,guideTab:{DE:'DE',PEPPA:'PEPPA','PHONICS-VIDEO':'Phonics Video','SCIENCE-K':'Science K','SCIENCE-G1':'Science G1','SCIENCE-G2':'Science G2','SCIENCE-G3':'Science G3'}[m[1]]};
 throw Error('CODE_UNSUPPORTED_CURRENT_FLOW: '+code);
}
function guideNumberMatches_(key,a){
 const n=norm_(key),numbers=n.match(/\d+/g)||[];
 if(a.family.startsWith('OP'))return new RegExp('^PHONICS '+a.family.slice(2)+' - TIET 0*'+a.number+'$').test(n);
 if(/^C\d$/.test(a.family))return new RegExp('^CRITICAL '+a.family.slice(1)+' - TIET 0*'+a.number+'$').test(n);
 if(a.practice)return numbers.length>0 && Number(numbers[numbers.length-1])===a.number;
 return new RegExp('^TIET 0*'+a.number+'$').test(n);
}
function referenceUrls_(content){return [...new Set(String(content).match(/https:\/\/mstrangtrieueducation-droid\.github\.io\/(?:[a-z0-9-]+\/)+/g)||[])];}
function sectionKind_(label){const n=norm_(label);return /NGU PHAP|GRAMMAR/.test(n)?'grammar':/DOC.*DICH|TRANSLATION/.test(n)?'translation':/TU VUNG|TU MOI|VOCABULARY/.test(n)?'vocabulary':/^(DOC|READING)(?:\s|$)/.test(n)?'reading':'';}
function referencePlainText_(html){
 return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')
  .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n)))
  .replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g,m=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '})[m]).replace(/\s+/g,' ').trim();
}
function referencePageKind_(html){
 const title=(html.match(/<title[^>]*>([^<]+)/i)||[])[1]||'',kind=sectionKind_(referencePlainText_(title));if(kind)return kind;
 // FF pages often title only the book/unit; classify from explicit exercise banners.
 const text=norm_(referencePlainText_(html)),kinds=[];
 if(/VOCABULARY PRACTICE/.test(text))kinds.push('vocabulary');
 if(/GRAMMAR PRACTICE/.test(text))kinds.push('grammar');
 if(/NGHE\s*[-–—]\s*DOC\s*[-–—]\s*DICH/.test(text))kinds.push('translation');
 require_(kinds.length===1,'TYPE_AMBIGUOUS_CURRENT_REFERENCE');return kinds[0];
}
const FLEET_PAGE_KIND_CACHE={};
function pageKind_(url){if(FLEET_PAGE_KIND_CACHE[url])return FLEET_PAGE_KIND_CACHE[url];return FLEET_PAGE_KIND_CACHE[url]=referencePageKind_(http_(url,{}).getContentText());}
function routeForReceipt_(receipt,catalog){
 const a=assignmentIdentity_(receipt.code),file=a.practice?'practice':'classroom',rows=catalog[file][a.guideTab]||[],matches=rows.filter(r=>guideNumberMatches_(r[0],a));
 require_(matches.length===1 && matches[0][1],'GUIDE_MISSING_OR_AMBIGUOUS');const [key,content]=matches[0];
 let kind=a.practice?{DE:'de',PEPPA:'peppa','PHONICS-VIDEO':'phonicsVideo','SCIENCE-K':'scienceK','SCIENCE-G1':'science','SCIENCE-G2':'science','SCIENCE-G3':'science'}[a.family]:a.family.startsWith('OP')?'phonics':/^C\d$/.test(a.family)?'critical':sectionKind_(a.detail);
 const refs=[];let label='';for(const line of content.split(/\r?\n/)){const k=sectionKind_(line.replace(/^[-•]\s*/,''));if(k&&!/HTTPS?:/.test(norm_(line)))label=k;referenceUrls_(line).forEach(url=>refs.push({kind:label,url}));}
 let selected;if(a.practice||kind==='phonics'||kind==='critical')selected=refs;
 else if(kind)selected=refs.filter(r=>r.kind===kind || (kind==='translation'&&r.kind==='reading'));
 else {const types=[...new Set(refs.map(r=>r.kind).filter(Boolean))];if(types.length===1)kind=types[0];if(kind)selected=refs.filter(r=>r.kind===kind);else if(refs.length===1){kind=pageKind_(refs[0].url);selected=refs;}}
 // A single unlabelled FF homework page can be used only after its title identifies the task.
 if((!selected||!selected.length)&&refs.length===1&&!refs[0].kind){const inferred=pageKind_(refs[0].url);if(!kind)kind=inferred;require_(kind===inferred,'REFERENCE_TYPE_MISMATCH');selected=refs;}
 require_(kind && selected && selected.length===1,'CURRENT_REFERENCE_MISSING_OR_AMBIGUOUS');
 return {className:receipt.className,code:receipt.code,sourceTab:receipt.sourceTab,kind,guideFile:file,guideTab:a.guideTab,guideKey:key,lesson:a.practice?0:a.number,family:a.family,number:a.number,referenceUrl:selected[0].url,referenceText:'',autoManaged:true,enabled:true};
}
function bookMatches_(full,a){const n=norm_(full);if(/^D\d$/.test(a.family))return new RegExp('(?:OXFORD )?DISCOVER '+a.family[1]+'(?!\\d)').test(n)&&!/DISCOVER ENGLISH/.test(n);if(/^FF/.test(a.family))return new RegExp('FAMILY (?:&|AND) FRIENDS? '+a.family.slice(-1)+'(?!\\d)').test(n);if(/^OP/.test(a.family))return new RegExp('(?:OXFORD )?PHONICS '+a.family.slice(2)+'(?!\\d)').test(n);return new RegExp('CRITICAL.*(?:SCIENCE )?'+a.family.slice(1)+'(?!\\d)').test(n);}
function practiceMatches_(full,a){const n=norm_(full);if(a.family==='DE')return /DISCOVER ENGLISH/.test(n);if(a.family==='PEPPA')return /PEPPA/.test(n);if(a.family==='PHONICS-VIDEO')return /PHONICS/.test(n)&&/TU LUYEN/.test(n);const level=a.family.replace('SCIENCE-','');return new RegExp('SCIENCE[ -]*'+(level.startsWith('G')?'G?'+level.slice(1):level)+'(?!\\d)').test(n);}
function fleetHeaders_(h){
 // Some trackers start student records on row 4; never read their feedback as a header.
 const fourth=norm_(h[3][2]);
 return fourth && !/^(HO TEN HOC VIEN|TEN TIENG ANH|TEN HOC SINH|ENGLISH NAME|NAME)$/.test(fourth)
  ? h.slice(0,3).concat([h[3].map(()=> '')]) : h;
}
function autoColumns_(h,route){
 h=fleetHeaders_(h);
 const a=assignmentIdentity_(route.code),cols=[];for(let c=0;c<h[0].length;c++){
  const full=norm_(h.map(r=>r[c]).join('\n')),detail=norm_(h[3][c]);
  const top=norm_(h.slice(0,3).map(r=>r[c]).join('\n'));
  if(a.practice){if(practiceMatches_(full,a)&&new RegExp('VIDEO\\s*0*'+a.number+'(?!\\d)').test(top)&&!/DIEM NGHE|LISTENING/.test(full))cols.push(c+1);continue;}
  if(!bookMatches_(full,a)||!/VIDEO/.test(top)||!new RegExp('TIET(?: HOC)?(?: SO)?\\s*0*'+a.number+'(?!\\d)').test(full))continue;
  const label=sectionKind_(detail)||sectionKind_(h[2][c]);if(!label||label===route.kind)cols.push(c+1);
 }require_(cols.length===1,'DESTINATION_AMBIGUOUS: '+cols.length+' cột cho '+route.code);return cols[0];
}
function currentAssignment_(headers,route){
 if(assignmentIdentity_(route.code).practice)return true;
 const col=autoColumns_(headers,route),date=fleetHeaders_(headers).slice(0,2).map(r=>r[col-1]).join('\n').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);require_(date,'ASSIGNMENT_DATE_MISSING');
 return Date.parse(date[3]+'-'+date[2].padStart(2,'0')+'-'+date[1].padStart(2,'0')+'T00:00:00+07:00')>=Date.parse(KIDS21_AUTO.cutoff);
}
function targetSnapshot_(cls){const sheet=SpreadsheetApp.openById(cls.spreadsheetId).getSheetByName(cls.sheetName);require_(sheet,'DESTINATION_TAB_NOT_FOUND');const range=sheet.getDataRange();return {sheet,headers:expandedHeaders_(sheet),values:range.getDisplayValues(),formulas:range.getFormulas()};}
function autoTarget_(s,route,student){const rows=[];s.values.forEach((r,i)=>{if(i>=3&&norm_(r[2])===norm_(student))rows.push(i+1);});require_(rows.length===1,'STUDENT_AMBIGUOUS');const column=autoColumns_(s.headers,route),row=rows[0];require_(!s.formulas[row-1][column-1],'DESTINATION_FORMULA');return {row,column,value:s.values[row-1][column-1]};}
function autoReceiptId_(cls,route,receipt){return hash_({version:3,class:cls.className,file:cls.spreadsheetId,tab:route.sourceTab,receipt});}
function scanFleetSlice_(deadline,preferred){
 const classes=cluster_().classes,tabCount=KIDS21_AUTO.tabs.length,total=classes.length*tabCount;let cursor=Number(prop_().getProperty('FLEET_SCAN_CURSOR')||0)%total;
 const tasks=preferred?[{cls:assignedClass_(preferred.className),tab:preferred.sourceTab,row:preferred.row}]:Array.from({length:total},(_,i)=>{const pos=(cursor+i)%total;return {cls:classes[pos%classes.length],tab:KIDS21_AUTO.tabs[Math.floor(pos/classes.length)],pos};});
 const catalog=guideCatalog_(),existing=loadJobs_(),seen=new Set(existing.map(x=>x.job.id)),knownReceipts=new Set(existing.map(x=>x.job.cls.spreadsheetId+'|'+x.job.route.sourceTab+'|'+hash_(x.job.receipt))),queued=[],report={queued:0,preserved:0,old:0,review:0,checked:0,knownSkipped:0};
 const sourceCache={},targetCache={};for(const task of tasks){if(Date.now()>deadline)break;require_(task.cls,'UNASSIGNED_CLASS');const {cls,tab}=task,snapshot=targetCache[cls.className]||(targetCache[cls.className]=targetSnapshot_(cls)),rows=(sourceCache[tab]||(sourceCache[tab]=sourceRows_(tab))).filter(r=>inAutoScope_(r)&&norm_(r.className)===norm_(cls.className));
  const latest=new Map();rows.forEach(r=>{const k=norm_(r.code)+'|'+r.student,p=latest.get(k);if(!p||Date.parse(r.time)>Date.parse(p.time)||Date.parse(r.time)===Date.parse(p.time)&&r.row>p.row)latest.set(k,r);});
  const planned=[...latest.values()].filter(r=>!task.row||r.row===task.row);const offsetKey='FLEET_SCAN_OFFSET_'+(task.pos===undefined?cursor:task.pos),offset=task.row?0:Number(prop_().getProperty(offsetKey)||0);let completed=true,resumeOffset=offset;
  for(let i=offset;i<planned.length;i++){
   if(Date.now()>deadline){resumeOffset=i;completed=false;break;}const receipt=planned[i];report.checked++;
   // Previously queued receipts, including held ambiguous tasks, never redo routing in the scanner.
   if(knownReceipts.has(cls.spreadsheetId+'|'+tab+'|'+hash_(receipt))){report.knownSkipped++;continue;}
   let route,error='';
   try {route=routeForReceipt_(receipt,catalog);if(!currentAssignment_(snapshot.headers,route)){report.old++;continue;}const dest=autoTarget_(snapshot,route,receipt.student);if(hasFeedback_(dest.value)){report.preserved++;continue;}}
   catch(e){error=String(e.message).slice(0,200);}
   route=route||{className:cls.className,code:receipt.code,sourceTab:tab,autoManaged:true};const id=autoReceiptId_(cls,route,receipt);if(seen.has(id))continue;
   // Deduplicate the same receipt even when a prior code version used a different route hash.
   if(existing.some(x=>x.job.cls.spreadsheetId===cls.spreadsheetId && x.job.route.sourceTab===tab && hash_(x.job.receipt)===hash_(receipt)))continue;
   const job={id,status:error?'NEEDS_REVIEW':'WAITING_INPUT',cls,route,receipt,attempts:0,nextAt:0,autoManaged:true,media:[],error};queued.push(job);seen.add(id);if(error)report.review++;else report.queued++;
  }
  if(queued.length){const s=control_().getSheetByName('Jobs');s.getRange(s.getLastRow()+1,1,queued.length,6).setValues(queued.map(j=>[j.id,j.status,new Date(),'',0,JSON.stringify(j)]));SpreadsheetApp.flush();queued.length=0;}
  if(!task.row&&!completed)prop_().setProperty(offsetKey,String(resumeOffset));
  if(!task.row&&completed){prop_().deleteProperty(offsetKey);cursor=(task.pos+1)%total;prop_().setProperty('FLEET_SCAN_CURSOR',String(cursor));prop_().setProperty('FLEET_SCAN_DONE',String(Number(prop_().getProperty('FLEET_SCAN_DONE')||0)+1));}
 }
 if(queued.length){const s=control_().getSheetByName('Jobs');s.getRange(s.getLastRow()+1,1,queued.length,6).setValues(queued.map(j=>[j.id,j.status,new Date(),'',0,JSON.stringify(j)]));SpreadsheetApp.flush();}
 prop_().setProperty('FLEET_LAST_SCAN',JSON.stringify({time:new Date().toISOString(),cursor,total,...report}));audit_('','FLEET_SCAN',JSON.stringify(report));return report;
}
function fleetJobPriority_(j,preferredId){
 if(j.id===preferredId)return -1;
 if(j.gradeId)return 0;
 if(j.status==='GENERATING')return 0; // Surface uncertain calls promptly; do not send them again.
 if(j.status==='RETRY')return 1;
 if(j.media?.some(m=>m.processingState && m.processingState!=='ACTIVE'))return 3;
 const uploaded=j.media?.length && j.media.every(m=>(!j.forceFiles&&m.size<=KG.inlineLimit)||m.upload?.name);
 return j.status==='READY'||uploaded||j.status==='WAITING_INPUT'&&j.studentMediaBytes>0&&j.studentMediaBytes<=KG.inlineLimit?1:j.status==='WAITING_INPUT'&&j.studentMediaBytes===undefined?2:4;
}
function batchQueue_(items,preferredId){
 const ready=items.filter(x=>x.job.autoManaged&&assignedClass_(x.job.cls.className)&&['WAITING_INPUT','QUEUED','PROCESSING','WAITING_MEDIA','READY','RETRY','GRADED','GENERATING'].includes(x.job.status)&&(!(x.job.nextAt>Date.now())||fallbackModelFor_(x.job)||jobHasPoolAlternative_(x.job)));
 const classes=cluster_().classes,result=[],start=Number(prop_().getProperty('FLEET_WORK_CURSOR')||0)%classes.length;
 // Apply readiness across the entire cluster, then share each priority tier between classes.
 for(const priority of [-1,0,1,2,3,4]){
  const buckets=classes.map(c=>ready.filter(x=>norm_(x.job.cls.className)===norm_(c.className)&&fleetJobPriority_(x.job,preferredId)===priority).sort((a,b)=>a.row-b.row));
  while(buckets.some(b=>b.length)){for(let i=0;i<buckets.length;i++){const b=buckets[(start+i)%buckets.length];if(b.length)result.push(b.shift());}}
 }
 prop_().setProperty('FLEET_WORK_CURSOR',String((start+1)%classes.length));return result;
}
function initializeAutoJob_(job,row) {
  require_(inAutoScope_(job.receipt),'STALE_OUT_OF_CURRENT_SCOPE');
  const dst=destination_(job.cls,job.route,job.receipt.student);
  if(!currentAssignment_(expandedHeaders_(dst.sheet),job.route)) {job.status='SKIPPED_OLD_LESSON';persist_(job,row);return;}
  if(hasFeedback_(dst.cell.getDisplayValue())) {job.status='SKIPPED_EXISTING_FEEDBACK';persist_(job,row);return;}
  const ids=driveIds_(job.receipt.links);require_(ids.length>0 && ids.length<=8,'MEDIA_INVENTORY_INVALID');
  kidsCostPreflight_(job);
  const snapshot=guide_(job.route), referenceIds=snapshot.referenceMedia||[];
  job.studentFileCount=ids.length;
  job.media=ids.map(fileMeta_).concat(referenceIds.map(id=>Object.assign(fileMeta_(id,true),{isReference:true})));
  job.forceFiles=job.media.reduce((n,m)=>n+m.size,0)>KG.inlineLimit;
  const selected=initialPoolBinding_();
  job.keyHash=selected.keyHash;job.model=selected.model;checkModel_(selected.key,job.model);
  job.sourceHash=hash_(snapshot);job.snapshotId=saveArtifact_('input-'+job.id,snapshot);job.status='QUEUED';job.error='';
  persist_(job,row);
}
