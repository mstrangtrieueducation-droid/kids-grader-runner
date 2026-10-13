import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {installMasterKids} from './master-kids.mjs';import {installContentRouting} from './kids-content-routing.mjs';
import {MASTER_FORMS,MASTER_MODEL,MASTER_VERSION,MASTER_TERMINAL,UNCLEAR_AUDIO,percentBand,receiptDate,studentRows} from './master-policy.mjs';
import {confirmedScriptReading,READING_RESUBMISSION_STATUS} from './presentation-resubmission.mjs';
import {beginSheetBatch} from './kids-sheet-batch.mjs';import {Rich,Style} from './google-adapter.mjs';
import {savedFeedback} from './saved-feedback.mjs';import {decodeSavedDraft} from './saved-draft.mjs';import {phonicsFrameParts} from './phonics-frame.mjs';
assert.equal(Object.keys(MASTER_FORMS).length,13);assert.notDeepEqual(MASTER_FORMS.phonics,MASTER_FORMS.phonicsVideo);
assert.equal(percentBand('93%'),95);assert.equal(percentBand('0%'),0);assert.equal(percentBand(''),null);
assert.equal(receiptDate('14/10/2026 01:23').toISOString(),'2026-10-13T18:23:00.000Z');assert.equal(receiptDate('bad',new Date(0)).getTime(),0);
assert.deepEqual(studentRows([[],[],[],['','Nguyễn Văn An','HUGO']], 'NGUYEN VAN AN'),[4]);assert.deepEqual(studentRows([[],[],[],['','A','BEN'],['','B','BEN']],'BEN'),[4,5]);
const reading={assessable:false,band:'',reason:'',roseSections:[],presentationReadingCheck:{requiresPresentation:true,readsPreparedScript:true,confirmed:true,basis:'Con nhìn bản viết đầy đủ và đọc từng câu.',sourceFileIndex:0,time:'00:15'}};
const media=[{mime:'video/mp4',runnerPdfFrame:{path:'frame'}}],seedJob=(kind='science')=>({id:'job-'+kind,status:'READY',route:{kind,code:'LESSON',autoManaged:true},cls:{className:'CLASS',spreadsheetId:'class',sheetName:'Tracker'},receipt:{student:'HUGO',time:'14/10/2026 01:23',row:2,sourceTab:'Form',code:'LESSON'},media:structuredClone(media)});
for(const kind of ['de','science','scienceK','critical'])assert.ok(confirmedScriptReading(reading,seedJob(kind),{kind}));
assert.equal(confirmedScriptReading(reading,{...seedJob(),media:[{mime:'audio/mp4'}],runnerAudioOnly:true}),false);
assert.equal(confirmedScriptReading(reading,seedJob('reading')),false);assert.equal(confirmedScriptReading(reading,seedJob(),{barem:{requirements:{contract:{mode:'read_text'}}}}),false);
assert.equal(confirmedScriptReading({...reading,presentationReadingCheck:{...reading.presentationReadingCheck,confirmed:false}},seedJob()),false);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'master-policy-'));
const cell=v=>({userEnteredValue:{stringValue:v},effectiveValue:{stringValue:v},formattedValue:v});
const sheet=(title,id,rows)=>({properties:{sheetId:id,title,gridProperties:{rowCount:100,columnCount:8}},data:[{rowData:rows.map(r=>({values:r.map(cell)}))}]});
function harness(draft,{occupied='',network=false,kind='science'}={}){
 let calls=[],paid=0,request,artifacts=new Map(),jobs=[],loads=0,responseDraft=draft;
 const data={control:{spreadsheetId:'control',properties:{title:'control'},sheets:[sheet('Jobs',1,[['id','status','at','','','json']]),sheet('RunnerArtifacts',2,[['id','part','json']]),sheet('Audit',3,[['header']]),sheet('[CẦN_CÔ_GÁN_CỘT_HOẶC_TÊN]',4,[['header']])]},class:{spreadsheetId:'class',properties:{title:'class'},sheets:[sheet('Tracker',1,[['','','','LESSON'],[],[],['','Nguyễn Văn An','HUGO',occupied]])]}};
 const g={books:new Map(),book(){throw Error('UNEXPECTED_READ');},api(url,method='GET',body){calls.push({url,method,body});return method==='GET'?structuredClone(url.includes('/control?')?data.control:data.class):{};}};
 const batch=beginSheetBatch(g,{controlId:'control',classes:[{spreadsheetId:'class',sheetName:'Tracker'}]},dir);
 const entry={subject:'kids',code:'LESSON',kind,route:{kind,code:'LESSON'},status:'READY',review:{approved:true},sha256:'hash',requirements:{submissionText:'Tự thuyết trình theo mindmap.',contract:{mode:'mindmap_presentation'}},content:{text:'local barem'}};
 const catalog={entries:new Map([['lesson',entry]]),lookup:()=>entry,resolve:()=>entry};
 const c={FLEET_CLUSTER:{controlId:'control'},SpreadsheetApp:{openById:id=>g.book(id),newTextStyle:()=>new Style()},guide_:route=>({kind:route.kind,form:MASTER_FORMS[route.kind],reference:'LOCAL BAREM',barem:{sha256:'hash',requirements:entry.requirements}}),
  autoColumns_:routeHeaders=>4,expandedHeaders_:()=>[],hasFeedback_:text=>!!text,hash_:s=>JSON.stringify(s),audit_:()=>{},loadJobs_:()=>{loads++;return jobs;},sourceRows_:()=>Array.from({length:1000},(_,i)=>({row:i+2,time:'14/10/2026 01:23',sourceTab:'Form',code:'LESSON',student:'HUGO'})),
  persist_(j,row){g.book('control').getSheetByName('Jobs').getRange(row||2,1,1,6).setValues([[j.id,j.status,new Date(),'',0,JSON.stringify(j)]]);},
  saveArtifact_(name,raw){artifacts.set(name,structuredClone(raw));g.book('control').getSheetByName('RunnerArtifacts').appendRow([name,0,JSON.stringify(raw)]);return name;},readArtifact_:id=>artifacts.get(id),
  coloredFeedback_:(_,text)=>new Rich(text,[{start:0,end:text.length,style:{color:'#0D47A1'}}]),keyFor_:()=> 'fake',
  api_(url,optionsKey,opts){request={url,body:JSON.parse(opts.payload)};if(network)throw Error('NETWORK_RETRY');return {getContentText:()=>JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(responseDraft)}]}}]})};},
  step_(j,row){c.generate_(j,[{inlineData:{mimeType:'audio/mp4',data:'one'}},{inlineData:{mimeType:'audio/mp4',data:'two'}}],c.guide_(j.route));},handleError_:()=>{throw Error('OLD_HANDLER');},generate_:()=>{throw Error('OLD_GENERATION_FORBIDDEN');}};
 installContentRouting(c,catalog,{refresh:()=>{},lock:()=>()=>{}});installMasterKids(c,catalog);
 c.recordMasterGeneration_=()=>paid++;c.flushMasterCheckpoint_=row=>batch.checkpointControl('control',row);
 const j=seedJob(kind);jobs.push({job:j,row:2});
 return {c,j,batch,setDraft:g=>responseDraft=g,get loads(){return loads;},get calls(){return calls;},get request(){return request;},get paid(){return paid;},get text(){return g.book('class').getSheetByName('Tracker').getRange(4,4).getDisplayValue();},g,artifacts};
}
try{
 const h=harness(reading);assert.equal(h.c.sourceRows_().length,1000);assert.equal(h.c.sourceRows_().length,1000);assert.equal(h.loads,0);h.c.step_(h.j,2,Date.now()+60000,{});assert.equal(h.paid,1);assert.equal(h.j.status,READING_RESUBMISSION_STATUS);assert.ok(MASTER_TERMINAL.has(h.j.status));assert.ok(h.text.startsWith('❌ CẦN NỘP LẠI 14/10/2026 01:23'));assert.ok(!h.text.includes('%'));assert.ok(!h.text.includes('• Nội dung'));assert.ok(h.text.includes('• Lý do yêu cầu nộp lại:'));assert.ok(h.text.includes('• Hướng dẫn luyện tập:'));
 assert.equal(h.request.url,'/v1beta/models/'+MASTER_MODEL+':generateContent');assert.equal(h.request.body.generationConfig.temperature,0.2);assert.equal(h.request.body.generationConfig.thinkingConfig.thinkingBudget,0);assert.equal(h.request.body.contents[0].parts.filter(p=>p.inlineData).length,2);
 h.c.step_(h.j,2,Date.now()+60000,{});assert.equal(h.paid,1);assert.ok(h.calls.some(x=>x.method==='POST'&&x.body.requests.some(r=>r.updateCells?.rows.some(row=>row.values.some(v=>v.userEnteredValue?.stringValue?.includes('masterGenerationReserved'))))));
 h.batch.close();const write=h.calls.find(x=>x.url.includes('/class:batchUpdate')).body.requests[0].updateCells;assert.equal(write.rows[0].values[0].userEnteredFormat.horizontalAlignment,'LEFT');assert.equal(write.rows[0].values[0].userEnteredFormat.verticalAlignment,'TOP');assert.ok(write.rows[0].values[0].textFormatRuns.some(x=>x.format.foregroundColorStyle.rgbColor.red===194/255));assert.ok(write.rows[0].values[0].textFormatRuns.some(x=>x.format.foregroundColorStyle.rgbColor.green===94/255));assert.equal(h.calls.filter(x=>x.method==='GET').length,2);
 const occupied=harness(reading,{occupied:'Nhận xét cô đã trả'});occupied.c.step_(occupied.j,2,Date.now()+60000,{});assert.equal(occupied.paid,0);assert.equal(occupied.j.status,'SKIPPED_ALREADY_GRADED');occupied.batch.close();
 const network=harness(reading,{network:true});network.c.step_(network.j,2,Date.now()+60000,{});network.c.step_(network.j,2,Date.now()+60000,{});assert.equal(network.paid,1);assert.equal(network.j.status,'COMPLETED_NEEDS_RESUBMISSION');network.batch.close();
 const full={assessable:true,band:'75%',roseSections:MASTER_FORMS.science.map(label=>({label,text:'Con đọc được ý chính. Con sửa "She have" → "She has".',spans:[]})),presentationReadingCheck:{confirmed:false}};
 const good=harness(full);good.c.step_(good.j,2,Date.now()+60000,{});assert.equal(good.j.status,'RETURNED');assert.ok(good.text.includes('⚠️ Cần theo dõi'));assert.ok(good.text.includes('She has'));assert.equal(good.paid,1);good.batch.close();
 const silent=harness({assessable:false,band:'',roseSections:[]});silent.c.step_(silent.j,2,Date.now()+60000,{});assert.equal(silent.j.status,'COMPLETED_UNASSESSABLE');assert.ok(silent.text.includes(UNCLEAR_AUDIO));assert.ok(!silent.text.includes('%'));silent.batch.close();
 const missing=harness(reading);missing.j.receipt.student='UNLISTED';missing.c.step_(missing.j,2,Date.now()+60000,{});assert.equal(missing.j.status,'NEEDS_ASSIGNMENT');assert.equal(missing.paid,0);assert.equal(missing.g.book('control').getSheetByName('[CẦN_CÔ_GÁN_CỘT_HOẶC_TÊN]').getLastRow(),2);const next=seedJob();next.id='next-job';missing.setDraft(full);missing.c.step_(next,3,Date.now()+60000,{});assert.equal(next.status,'RETURNED');assert.equal(missing.paid,1);missing.batch.close();
 const reservation=harness(full);reservation.j.generationReservation='older-reservation';reservation.c.step_(reservation.j,2,Date.now()+60000,{});assert.equal(reservation.paid,0);assert.equal(reservation.j.status,'COMPLETED_NEEDS_RESUBMISSION');reservation.batch.close();
 assert.equal(decodeSavedDraft({candidates:[{content:{parts:[{text:'```json\n{"band":"80%","roseSections":[],}\n```'}]}}]}).band,'80%');
 assert.equal(phonicsFrameParts({...seedJob(),media:[{mime:'video/mp4',visualExtractionFailed:true}]}).length,0);
 assert.ok(savedFeedback(full,seedJob(),'').text.includes('75%'));
 console.log('PASS Master integration: one request for two audio files; terminal script-reading notice, no score; rich colors LEFT/TOP; paid checkpoint/raw durable; no regeneration after network failure; occupied grade zero calls; full corrections survive missing IPA/times; 13 forms and 75% warning.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
