import {submittedCode} from './kids-content-routing.mjs';
import assert from 'node:assert/strict';
import {MasterBaremCatalog,normalizeCode,sealEntry,BAREM_VERSION} from './master-barem.mjs';
import {installContentRouting,rankLessons,routingIndex,RESUBMIT_OLD,RESUBMIT_AUDIO,routeDecision} from './kids-content-routing.mjs';
import {audioStreams,streamSelection} from './student-audio.mjs';

for(const [a,b] of [['Science.K 013','SCIENCE-K-13'],['SCIENCE K 6','SCIENCE-K-6'],['Science G1-Video 13','SCIENCE-G1-13'],['Peppa — 0042','PEPPA-42'],['D1 - Tiet 037 - Từ vựng','D1-TIẾT 37-TỪ VỰNG']])assert.equal(normalizeCode(a),b);
const entry=(code,text)=>sealEntry({subject:'kids',code,kind:'peppa',status:'READY',review:{approved:true},missing:[],content:{text,transcript:text},requirements:{submissionText:'Read the story'},route:{code,kind:'peppa',autoManaged:true}});
const catalog=new MasterBaremCatalog({schema:BAREM_VERSION,entries:[entry('PEPPA-1','The red car is very fast'),entry('PEPPA-2','Daddy pig grows carrots in the garden')]});
const index=routingIndex(catalog);assert.equal(rankLessons(index,'Daddy pig grows carrots in the garden','PEPPA-1')[0].entry.code,'PEPPA-2');
assert.equal(routeDecision({status:'matched',code:'PEPPA-2',confidence:1,studentQuotes:['invented words from nowhere']},'hello child reading here',index).status,'resubmit');
assert.equal(streamSelection(audioStreams('Stream #0:1: Audio: aac\n Metadata:\n title : System Audio\nStream #0:2: Audio: aac\n Metadata:\n title : Microphone')).indices[0],2);
assert.equal(streamSelection([{index:1},{index:2}]).mode,'all_unlabelled_tracks');assert.throws(()=>streamSelection([]),/AUDIO_NO_STREAM/);

function fixture({formValue='',actualValue='',heard=true,match=true,changeDuringSave=false}={}){
 const cells={'PEPPA-1':formValue,'PEPPA-2':actualValue},artifacts=new Map(),calls=[],writes=[],jobs=[];
 const cell=code=>({getDisplayValue:()=>cells[code]||'',getValue:()=>cells[code]||'',getFormula:()=>'',getDataValidation:()=>null,getNote:()=>'',getA1Notation:()=>code==='PEPPA-1'?'D4':'E4',setRichTextValue:v=>{writes.push({code,value:v});cells[code]=v;}});
 const c={step_:j=>{assert.equal(j.route.code,'PEPPA-1');calls.push('grade');j.status='RETURNED';},writeGrade_:(j,g)=>{const dst=c.destination_(j.cls,j.route,j.receipt.student);if(changeDuringSave)cells[j.route.code]='Teacher concurrent feedback';dst.cell.setRichTextValue('new grade');},handleError_:(j,row,e)=>{j.status='NEEDS_REVIEW';j.error=e.message;},persist_:j=>jobs.push(structuredClone(j)),audit_:()=>{},hasFeedback_:v=>!!v,
 destination_:(cls,route)=>({cell:cell(route.code),sheet:{getName:()=> 'Class'}}),routeForReceipt_:r=>({code:r.code,kind:'peppa'}),driveIds_:()=>['file'],fileMeta_:id=>({id,mime:'audio/mp4',size:100,modified:'now'}),initialPoolBinding_:()=>({keyHash:'hash',model:'model'}),mediaPart_:()=>({inlineData:{mimeType:'audio/mp4',data:'test'}}),keyFor_:()=> 'key',
 saveArtifact_:(name,data)=>{const id=String(artifacts.size);artifacts.set(id,data);if(changeDuringSave&&name.startsWith('auto-notice'))cells['PEPPA-1']='Teacher feedback';return id;},readArtifact_:id=>artifacts.get(id),guide_:route=>({kind:route.kind,barem:{code:route.code}}),hash_:()=> 'hash',coloredFeedback_:(cell,text)=>text,generate_:()=>({}),kidsSheetDisplaySections_:()=>[],freshReceipt_:j=>({code:j.route.code}),loadJobs_:()=>[],
 routeKidsCostModel_:()=>{throw Error('MODEL_ROUTE_SNAPSHOT_MISSING');},poolModel_:()=> 'model',
 api_:(url)=>{assert(url.includes('/models/model:'));calls.push('route');const text=calls.length===1?{studentAudible:heard,studentTranscript:heard?'Daddy pig grows carrots in the garden':'',backgroundDescription:'greeting',reason:''}:{status:match?'matched':'outside_curriculum',code:'PEPPA-2',confidence:1,studentQuotes:['Daddy pig grows carrots'],reason:'distinctive'};return {getContentText:()=>JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(text)}]}}]})};}};
 installContentRouting(c,catalog,{refresh:()=>{},lock:()=>()=>{}});
 const job={id:'job',status:'READY',receipt:{code:'PEPPA-1',student:'Child',className:'Kids',sourceTab:'Form'},route:{code:'PEPPA-1',kind:'peppa'},cls:{spreadsheetId:'book'},media:[]};
 return {c,job,calls,writes,cells,run:()=>c.step_(job,2,Date.now()+300000,{})};
}
let f=fixture({formValue:'90% teacher comment'});f.run();assert.equal(f.job.status,'SKIPPED_ALREADY_GRADED');assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);
f=fixture();f.run();assert.equal(f.job.route.code,'PEPPA-1');assert.equal(f.job.receipt.code,'PEPPA-1');assert.equal(f.calls.filter(x=>x==='grade').length,1);assert.equal(f.calls.filter(x=>x==='route').length,0);assert.equal(f.c.freshReceipt_(f.job).code,'PEPPA-1');


f=fixture({changeDuringSave:true});assert.throws(()=>f.c.writeGrade_(f.job,{}),/PREFLIGHT_EXISTING_FEEDBACK/);assert.equal(f.writes.length,0);assert.equal(f.cells['PEPPA-1'],'Teacher concurrent feedback');
console.log('Approved single-pass routing: aliases, private barem lookup, no recognition request, saved-call protection and changed-cell guards passed.');


