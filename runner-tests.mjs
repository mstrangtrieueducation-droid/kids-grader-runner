

import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import {fileURLToPath} from 'node:url';

import {newestOnly,pronunciationEvidence,isNewer,cameraEvidence,chooseTrackerTab,mediaQueuePriority,backlogCounts,googleQueueFailure,bulkRunMode,shouldContinueBulk,throughputQueue,readyForMediaCheck,reusableReference,jobShard,mediaPolicy,mediaDecision} from './runner-policies.mjs';import {RichBuilder,Style,Rich,utilities,Sheet} from './google-adapter.mjs';

import {reserveRateSlot,tryFileLock} from './shared-gate.mjs';

import {Book,gridMaster} from './google-adapter.mjs';

import {dispatchContinuation} from './backlog-continuation.mjs';

import {MediaCache} from './media-cache.mjs';

import {phonicsFrameParts} from './phonics-frame.mjs';

import {canRepairTaskReference} from './runner-policies.mjs';

import {recoveryDecision} from './backlog-recovery.mjs';

import {reviewTable,scanProgress,shouldRefreshScan,workerLanes} from './runner-policies.mjs';

import os from 'node:os';

import {restoreFeedbackColors,reconcileFeedbackColors} from './feedback-colors.mjs';

import {Range} from './google-adapter.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};

test('one grid read preserves numbers booleans formulas formatted dates and hyperlinks',()=>{const cells=[{values:[{effectiveValue:{numberValue:0},formattedValue:'0'},{effectiveValue:{boolValue:false},formattedValue:'FALSE'},{effectiveValue:{numberValue:46305.5},formattedValue:'10/10/2026 12:00',userEnteredValue:{numberValue:46305.5}},{effectiveValue:{stringValue:'Video'},formattedValue:'Video',userEnteredValue:{formulaValue:'=HYPERLINK("https://drive.google.com/file/d/test/view","Video")'},hyperlink:'https://drive.google.com/file/d/test/view'}]},{values:[{userEnteredFormat:{backgroundColor:{red:1}}}]}];const m=gridMaster(cells,4);assert.deepEqual(m.UNFORMATTED_VALUE,[[0,false,46305.5,'Video']]);assert.equal(m.FORMATTED_VALUE[0][2],'10/10/2026 12:00');assert.ok(m.FORMULA[0][3].startsWith('=HYPERLINK'));assert.equal(m.cells[0].values[3].hyperlink,cells[0].values[3].hyperlink);});

test('formula with an empty result still counts as an occupied row',()=>assert.equal(gridMaster([{values:[{effectiveValue:{stringValue:''},userEnteredValue:{formulaValue:'=""'}}]}],1).FORMATTED_VALUE.length,1));

test('scanning 20 primed Form tabs performs no extra column-header requests',()=>{let reads=0;for(let i=0;i<20;i++){const name='Form '+i,b={cache:new Map([[name+'|master',gridMaster([{values:Array.from({length:7},(_,i)=>({effectiveValue:{stringValue:'Header '+i}}))}],7)]]),g:{api:()=>{reads++;throw Error('UNEXPECTED_REMOTE_READ');}}},s=new Sheet(b,{properties:{title:name,gridProperties:{rowCount:1000,columnCount:26}}});assert.equal(Math.min(7,s.getLastColumn()),7);}assert.equal(reads,0);});

test('writing Jobs preserves artifact cache and invalidates the changed sheet',()=>{const b=Object.create(Book.prototype);b.cache=new Map([['Jobs|A2:F3|UNFORMATTED_VALUE',[]],['RunnerArtifacts|A2:B3|UNFORMATTED_VALUE',[["id",0]]]]);b.invalidateSheet('Jobs');assert.equal(b.cache.size,1);assert.ok(b.cache.has('RunnerArtifacts|A2:B3|UNFORMATTED_VALUE'));});

test('artifact extent scans omit large JSON payload column',()=>{const queried=[],b={cache:new Map(),g:{api:url=>{queried.push(decodeURIComponent(url));return {values:[['artifactId','part'],['test',0]]};}},id:'test'};const s=new Sheet(b,{properties:{title:'RunnerArtifacts',sheetId:1,gridProperties:{rowCount:100,columnCount:3}}});assert.equal(s.getLastRow(),2);assert.ok(queried.every(q=>q.includes('A1:B100')&&!q.includes('C100')));});

test('concurrent append indexes use server returned row rather than stale extent',()=>{const b={cache:new Map(),invalidateSheet:()=>{},g:{api:()=>({updates:{updatedRange:"'RunnerArtifacts'!A17:C18"}})},id:'test'};const s=new Sheet(b,{properties:{title:'RunnerArtifacts',sheetId:1,gridProperties:{rowCount:10,columnCount:3}}});s.appendRows([['id',0,'chunk0'],['id',1,'chunk1']]);assert.equal(s.lastAppendRow,17);assert.equal(s.meta.properties.gridProperties.rowCount,18);});

const c=vm.createContext({Utilities:utilities(),Date});for(const file of ['Config','Sources','Gemini','RichText','CostPolicy','KidsReview','AssessmentPolicy','QuantScore','TaskContract','KidsEvidence','ModelRouting'])vm.runInContext(fs.readFileSync(path.join(root,'gas',file+'.gs'),'utf8'),c);

test('Kids default and allowed route use 3.8 Flash without Lite fallback',()=>{assert.equal(vm.runInContext('MODEL_NAME',c),'gemini-3.8-flash');assert.deepEqual([...vm.runInContext('FALLBACK_MODEL_NAMES',c)],['gemini-3.8-flash']);});

test('3.6 Kids generation uses supported minimal thinking',()=>assert.equal(c.kidsGenerationConfig_('gemini-3.6-flash').thinkingConfig.thinkingLevel,'minimal'));

test('3.8 Kids generation uses supported low rather than rejected minimal thinking',()=>assert.equal(c.kidsGenerationConfig_('gemini-3.8-flash').thinkingConfig.thinkingLevel,'low'));

test('3.8 and 3.6 cost the same for identical recorded usage',()=>{const usageMetadata={promptTokenCount:5100,candidatesTokenCount:1000,thoughtsTokenCount:1200,totalTokenCount:7300};assert.equal(c.kidsUsageReceipt_({modelVersion:'gemini-3.8-flash',usageMetadata},'2026-10-11').paidRateEquivalentUsd,c.kidsUsageReceipt_({modelVersion:'gemini-3.6-flash',usageMetadata},'2026-10-11').paidRateEquivalentUsd);});

test('3.6 receipt includes thinking and cache at introductory rates',()=>{const r=c.kidsUsageReceipt_({modelVersion:'gemini-3.6-flash',usageMetadata:{promptTokenCount:5000,candidatesTokenCount:800,thoughtsTokenCount:200,cachedContentTokenCount:1000,totalTokenCount:6000}},'2026-10-11');assert.equal(r.paidRateEquivalentUsd,0.006825);assert.equal(r.thinkingTokens,200);});

test('3.6 receipt uses announced 2027 rates while historical 2026 stays unchanged',()=>{const raw={modelVersion:'gemini-3.6-flash',usageMetadata:{promptTokenCount:5000,candidatesTokenCount:800,thoughtsTokenCount:200,totalTokenCount:6000}};assert.equal(c.kidsUsageReceipt_(raw,'2027-01-01').paidRateEquivalentUsd,0.015);assert.equal(c.kidsUsageReceipt_(raw,'2026-12-31').paidRateEquivalentUsd,0.0075);});

test('latest timestamp wins regardless of sheet row order',()=>{const rows=[{student:'BEAN',class:'KIDS 21',lesson:'grammar',time:'2026-10-01T00:00:00Z',row:90,sourceTab:'D1'},{student:'BEAN',class:'KIDS 21',lesson:'grammar',time:'2026-10-02T00:00:00Z',row:3,sourceTab:'D1'}];assert.equal(newestOnly(rows,r=>[r.student,r.class,r.lesson].join('|')).values().next().value.row,3);});

test('different classes and lessons are separate submissions',()=>{const rows=['grammar','vocabulary','Peppa'].flatMap(lesson=>['KIDS 21','KIDS 22'].map(cl=>({student:'BEAN',class:cl,lesson,time:'2026-10-01',row:2,sourceTab:'D1'})));assert.equal(newestOnly(rows,r=>[r.student,r.class,r.lesson].join('|')).size,6);});

test('equal timestamps use a deterministic tie',()=>assert.ok(isNewer({time:'2026-10-01',sourceTab:'D1',row:3},{time:'2026-10-01',sourceTab:'D1',row:2})));

for(const text of ['85%','0','Cô đã nhận xét','✅ ĐÃ NỘP\n— NHẬN XÉT GV —\nCon nói tốt.'])test('preserve existing feedback '+text.slice(0,10),()=>assert.equal(c.hasFeedback_(text),true));

for(const text of ['','CHƯA NỘP','✅ ĐÃ NỘP\n10/10/2026 08:00\n— NHẬN XÉT GV —\n'])test('receipt alone is still eligible '+text.slice(0,10),()=>assert.equal(c.hasFeedback_(text),false));

test('no API work after occupied destination preflight',()=>{let fileReads=0;c.destination_=()=>({cell:{getDisplayValue:()=> '90%',getFormula:()=>''}});c.fileMeta_=()=>{fileReads++;};assert.throws(()=>c.kidsCostPreflight_({receipt:{student:"BEAN"}}),/PREFLIGHT_EXISTING_FEEDBACK/);assert.equal(fileReads,0);});

test('ambiguous student stops before file reads',()=>{let fileReads=0;c.destination_=()=>{throw Error('STUDENT_AMBIGUOUS');};c.fileMeta_=()=>{fileReads++;};assert.throws(()=>c.kidsCostPreflight_({receipt:{student:"BEAN"}}),/STUDENT_AMBIGUOUS/);assert.equal(fileReads,0);});

test('long or heavy video is accepted at preflight',()=>{c.destination_=()=>({cell:{getDisplayValue:()=>'',getFormula:()=>''}});c.fileMeta_=id=>({id,mime:'video/mp4',size:200*1024*1024,modified:'2026-10-01'});c.ScriptApp={getOAuthToken:()=> 'test'};c.UrlFetchApp={fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({size:200*1024*1024,videoMediaMetadata:{durationMillis:600000}})})};const files=c.kidsCostPreflight_({receipt:{links:'https://drive.google.com/file/d/12345678901234567890/view'}});assert.equal(files[0].durationSeconds,600);});

test('IPA missing from visible feedback blocks grade',()=>assert.throws(()=>pronunciationEvidence({assessable:true,sections:[{text:'Sửa âm cuối của cats.'}],evidence:[{type:'pronunciation',word:'cats',ipa:'/kæts/'}]}),/GRADE_PRONUNCIATION_IPA_REQUIRED/));

test('IPA and word visible in feedback pass',()=>pronunciationEvidence({assessable:true,sections:[{text:'cats /kæts/: nhớ âm /s/.'}],evidence:[{type:'pronunciation',word:'cats',ipa:'/kæts/'}]}));

test('no invented pronunciation errors required',()=>pronunciationEvidence({assessable:true,sections:[{text:'Không nghe thấy lỗi rõ ràng.'}],evidence:[]}));

const reviewSnapshot={kind:'science',form:['Nội dung (mindmap & câu hỏi)','Phát âm'],reference:'Mindmap là khung ý. Câu hỏi của bài 16 Desert habitats 1 What makes a desert a desert? 2 How do camels survive with very little water? Video mẫu Xem cách trả lời. What is this?'};

const reviewCheck=(n,status='correct')=>({task:'question',itemNumber:n,item:c.kidsReviewPlan_(reviewSnapshot).questions[n-1],status,fileIndex:1,time:'00:12',heard:'Con nói deserts have very little rain.',feedback:'Con nêu đúng ý ít mưa.'});

test('content plan uses the actual assigned question block without counting duplicates elsewhere or forcing five questions',()=>{const plan=c.kidsReviewPlan_(reviewSnapshot);assert.equal(plan.mindmap,true);assert.equal(plan.questions.length,2);assert.equal(plan.questions[0],'What makes a desert a desert?');assert.deepEqual([...c.kidsReviewPlan_({kind:'grammar',reference:'What is this?'}).questions],[]);});

test('content observations require real pupil file/time and cannot mark a heard answer missing',()=>{const base={contentChecks:[reviewCheck(1)],contentSourceLimitation:'',uncertainty:[]};assert.doesNotThrow(()=>c.validateKidsReview_(base,2));for(const bad of [{...reviewCheck(1),heard:''},{...reviewCheck(1),fileIndex:2},{...reviewCheck(1),status:'missing'}])assert.throws(()=>c.validateKidsReview_({...base,contentChecks:[bad]},2),/GRADE_CONTENT/);assert.doesNotThrow(()=>c.validateKidsReview_({...base,contentChecks:[{...reviewCheck(1),status:'missing',heard:'',fileIndex:-1,time:'',feedback:'Chưa có câu trả lời sau khi nghe toàn phần.'}]},2));});

test('every known question is covered exactly once and must match the actual source',()=>{const a=reviewCheck(1),b=reviewCheck(2),g={contentChecks:[a,b,{task:'mindmap',itemNumber:1,item:'Ít mưa',status:'correct',fileIndex:0,time:'00:09',heard:'very little rain',feedback:'Đúng ý ít mưa.'}],contentSourceLimitation:'',uncertainty:[]};assert.doesNotThrow(()=>c.validateKidsReview_(g,2,reviewSnapshot));assert.throws(()=>c.validateKidsReview_({...g,contentChecks:[a]},2,reviewSnapshot),/COVERAGE/);assert.throws(()=>c.validateKidsReview_({...g,contentChecks:[a,{...b,item:'What is your name?'}]},2,reviewSnapshot),/SOURCE_MISMATCH/);assert.throws(()=>c.validateKidsReview_({...g,contentChecks:[a,a]},2,reviewSnapshot),/CHECK_INVALID/);});

test('unknown mindmap branches require an explicit source limitation rather than invented completeness',()=>{const g={contentChecks:[reviewCheck(1),reviewCheck(2)],contentSourceLimitation:'',uncertainty:[]};assert.throws(()=>c.validateKidsReview_(g,2,reviewSnapshot),/MINDMAP/);g.contentSourceLimitation='Nguồn chưa thể hiện rõ các nhánh mindmap.';assert.doesNotThrow(()=>c.validateKidsReview_(g,2,reviewSnapshot));});

test('content checks and listening limitations preserve green/pink/neutral through repeat normalization without changing score',()=>{const g={assessable:true,band:'85%',scene:{type:'audio_only'},presentation:{assessable:false,text:'',spans:[]},evidence:[],sections:[{label:'Nội dung',text:'Con nói rõ.',spans:[{text:'Con nói rõ.',tone:'praise'}]},{label:'Phát âm',text:'Con nói đủ nghe.',spans:[{text:'Con nói đủ nghe.',tone:'praise'}]}],contentChecks:[reviewCheck(1),{...reviewCheck(2,'partial'),feedback:'Cần bổ sung ý trữ mỡ, không phải trữ nước trong bướu.'},{task:'mindmap',itemNumber:1,item:'Sa mạc lạnh',status:'unclear',fileIndex:-1,time:'',heard:'',feedback:'Chưa đủ âm thanh xác định ý này.'}],contentSourceLimitation:'Chưa xác minh nhánh còn lại.',uncertainty:[{fileIndex:0,time:'00:35',phrase:'habitats',reason:'Tiếng nhỏ, chưa chắc âm cuối.'}]};c.validateKidsReview_(g,2);c.normalizeKidsGrade_(g);const texts=g.sections.map(s=>s.text);assert.ok(g.sections[0].spans.some(s=>s.tone==='praise'&&s.text.includes('Câu 1')));assert.ok(g.sections[0].spans.some(s=>s.tone==='correction'&&s.text.includes('Câu 2')));assert.ok(!g.sections[0].spans.some(s=>s.tone==='neutral'&&s.text.includes('Ý 1')));assert.equal(g.contentChecks[2].status,'unclear');assert.ok(!g.sections[1].spans.some(s=>s.text.includes('habitats')));assert.equal(g.uncertainty[0].phrase,'habitats');c.normalizeKidsGrade_(g);assert.deepEqual(g.sections.map(s=>s.text),texts);assert.equal(g.sections[1].spans.at(-1).tone,'praise');assert.equal(g.band,'85%');assert.equal(g.evidence.length,0);assert.ok(g.sections.every(s=>c.validToneSpans_(s)));});

test('successful legacy grades remain recoverable without new review fields or another generation',()=>assert.doesNotThrow(()=>c.validateKidsReview_({assessable:true,evidence:[]},2,reviewSnapshot)));

const revisedGrade=()=>({assessable:true,band:'85%',scene:{type:'audio_only'},presentation:{assessable:false,text:'',spans:[],observations:[]},evidence:[{type:'grammar',fileIndex:0,time:'00:12',observed:'He go to school.',correction:'He goes to school: thêm -es với he.',word:'',ipa:''}],sections:[{label:'Ngữ pháp & phát âm',text:'Con nói rõ.',spans:[{text:'Con nói rõ.',tone:'praise'}]}],contentChecks:[],contentSourceLimitation:'',uncertainty:[],grammarReview:[{fileIndex:0,status:'errors_found',summary:'Sai chia động từ với he.'}]});

test('D.E grammar evidence is rendered inside the combined criterion in pink once',()=>{const g=revisedGrade();c.normalizeKidsGrade_(g);c.validateKidsReview_(g,1);const text=g.sections[0].text;assert.ok(text.includes('He go to school.')&&text.includes('He goes to school'));assert.equal(g.sections[0].spans.at(-1).tone,'correction');c.normalizeKidsGrade_(g);assert.equal(g.sections[0].text,text);});

test('Science modal omission keeps actual words and a separate correction visible in pink',()=>{const g=revisedGrade();g.sections[0].label='Từ vựng, ngữ pháp & phát âm';g.evidence[0].observed='some trees can tall can small';g.evidence[0].correction='Some trees can be tall, and some can be small. Sau can cần be trước tính từ.';g.grammarReview[0].summary='Thiếu be sau can trước tính từ.';c.normalizeKidsGrade_(g);c.validateKidsReview_(g,1);assert.ok(g.sections[0].text.includes('Con nói: some trees can tall can small → Sửa: Some trees can be tall'));assert.equal(g.sections[0].spans.at(-1).tone,'correction');});

const groupedGrammar=()=>{const g=revisedGrade();g.evidence=['Trees can tall.','Wood can hard.','Metal can strong.'].map((observed,i)=>({type:'grammar',fileIndex:0,time:'00:'+String(10+i).padStart(2,'0'),observed,correction:observed.replace('can ','can be '),word:'',ipa:''}));g.errorGroups=[{type:'grammar',label:'Thiếu be sau can trước tính từ',guidance:'Dùng can + be + tính từ.',evidenceIndexes:[0,1,2]}];return g;};

test('repeated grammar renders one rule with two examples while retaining every occurrence',()=>{const g=groupedGrammar();c.normalizeKidsGrade_(g);c.validateKidsReview_(g,1);const text=g.sections[0].text;assert.equal((text.match(/Lỗi lặp —/g)||[]).length,1);assert.ok(text.includes('Trees can tall.')&&text.includes('Wood can hard.'));assert.ok(!text.includes('Metal can strong.'));assert.equal(g.evidence.length,3);assert.equal(g.sections[0].spans.at(-1).tone,'correction');c.normalizeKidsGrade_(g);assert.equal(g.sections[0].text,text);});

test('phoneme group keeps unique words and IPA but does not repeat the practice advice',()=>{const g=revisedGrade();g.grammarReview[0]={fileIndex:0,status:'no_clear_error',summary:'Chưa nghe lỗi cấu trúc rõ.'};g.evidence=['think','three','think'].map((word,i)=>({type:'pronunciation',fileIndex:0,time:'00:'+String(10+i),observed:word+' dùng /t/ thay /θ/',correction:word==='think'?'think /θɪŋk/':'three /θriː/',word,ipa:word==='think'?'/θɪŋk/':'/θriː/'}));g.errorGroups=[{type:'pronunciation',label:'Âm /θ/ bị thay bằng /t/',guidance:'Đặt đầu lưỡi nhẹ giữa hai hàm răng, thổi hơi.',evidenceIndexes:[0,1,2]}];c.normalizeKidsGrade_(g);c.validateKidsReview_(g,1);pronunciationEvidence(g);const text=g.sections[0].text;assert.equal((text.match(/Đặt đầu lưỡi/g)||[]).length,1);assert.ok(text.includes('Từ cần luyện: think /θɪŋk/, three /θriː/.'));assert.equal(g.evidenceRendered,undefined);});

test('grouping cannot hide mixed error types, duplicate members or a single occurrence',()=>{for(const indexes of [[0],[0,0],[0,5]]){const g=groupedGrammar();g.errorGroups[0].evidenceIndexes=indexes;assert.throws(()=>c.normalizeKidsGrade_(g),/GRADE_ERROR_GROUP/);}const g=groupedGrammar();g.evidence[1].type='pronunciation';assert.throws(()=>c.normalizeKidsGrade_(g),/GRADE_ERROR_GROUP_MEMBERS/);});

test('removing a rendered group fails coverage rather than publishing silent omissions',()=>{const g=groupedGrammar();c.normalizeKidsGrade_(g);g.sections[0].text='Con nói rõ.';assert.throws(()=>c.validateKidsReview_(g,1),/GRADE_ERROR_GROUP_NOT_RENDERED/);});

test('compact projection preserves every distinct grouped grammar correction, beyond two examples',()=>{const g=groupedGrammar();c.normalizeKidsGrade_(g);const before=JSON.stringify(g),text=c.feedbackText_(g);for(const e of g.evidence)assert.ok(text.includes(e.observed)&&text.includes(e.correction));assert.equal((text.match(/Dùng can \+ be \+ tính từ/g)||[]).length,1);assert.equal(JSON.stringify(g),before);assert.ok(!text.includes('[Tệp'));});

test('compact projection keeps unknown language reminders and all distinct pronunciation errors',()=>{const g=revisedGrade();g.evidence=[{type:'pronunciation',fileIndex:0,time:'00:10',observed:'think dùng /t/',correction:'Đặt lưỡi giữa hai hàm răng.',word:'think',ipa:'/θɪŋk/'},{type:'pronunciation',fileIndex:0,time:'00:11',observed:'think dùng /t/',correction:'Đặt lưỡi giữa hai hàm răng.',word:'think',ipa:'/θɪŋk/'},{type:'pronunciation',fileIndex:0,time:'00:12',observed:'three dùng /t/',correction:'Giữ âm /θ/.',word:'three',ipa:'/θriː/'},{type:'pronunciation',fileIndex:0,time:'00:13',observed:'think mất âm cuối /k/',correction:'Giữ âm cuối /k/.',word:'think',ipa:'/θɪŋk/'}];g.sections[0]={label:'Ngữ pháp & phát âm',text:'Cần bổ sung nghĩa từ. Con nói rõ.',spans:[{text:'Cần bổ sung nghĩa từ. ',tone:'correction'},{text:'Con nói rõ.',tone:'praise'}]};const before=JSON.stringify(g),text=c.feedbackText_(g);assert.ok(text.includes('Cần bổ sung nghĩa từ.'));assert.equal((text.match(/think dùng \/t\//g)||[]).length,1);assert.ok(text.includes('three /θriː/')&&text.includes('think mất âm cuối /k/'));assert.equal(JSON.stringify(g),before);});



test('many grouped errors are not capped or truncated, and a separate grammar mistake survives',()=>{const g=groupedGrammar();g.evidence=Array.from({length:17},(_,i)=>({type:'grammar',fileIndex:0,time:'00:'+String(10+i),observed:'Subject '+i+' can tall',correction:'Subject '+i+' can be tall',word:'',ipa:''}));g.errorGroups[0].evidenceIndexes=g.evidence.map((_,i)=>i);g.evidence.push({type:'grammar',fileIndex:0,time:'00:40',observed:'He go home',correction:'He goes home',word:'',ipa:''});c.normalizeKidsGrade_(g);const text=c.feedbackText_(g);for(const e of g.evidence)assert.ok(text.includes(e.observed)&&text.includes(e.correction));assert.equal((text.match(/Dùng can \+ be \+ tính từ/g)||[]).length,1);});

test('visual review cannot repeat the same eye-contact advice in multiple observation entries',()=>{const g=revisedGrade();g.scene.type='student_visible';const obs={aspect:'gaze',status:'observed',fileIndex:0,time:'00:20',observation:'Con nhìn màn hình ở đoạn này.',assessment:'Tập nhìn camera khi kết thúc ý.',tone:'correction'};g.presentation.observations=[obs,{...obs,time:'00:30'}];c.normalizeKidsGrade_(g);assert.throws(()=>c.validateKidsReview_(g,1),/GRADE_VISUAL_DUPLICATE_ASPECT/);});

test('grouped language errors stay inside the assigned rubric for all eleven Kids forms',()=>{for(const [kind,form]of Object.entries(vm.runInContext('FORMS',c))){const g=groupedGrammar();g.sections=form.map(label=>({label,text:'Con hoàn thành phần nghe được.',spans:[{text:'Con hoàn thành phần nghe được.',tone:'praise'}]}));c.normalizeKidsGrade_(g);c.validateGrade_(g,form,1,{kind,reference:'',guide:''});assert.deepEqual([...g.sections.map(s=>s.label)],[...form]);assert.ok(g.sections.some(s=>s.text.includes('Thiếu be sau can')));const visible=c.feedbackText_(g);for(const e of g.evidence)assert.ok(visible.includes(e.observed)&&visible.includes(e.correction));}});

test('every student file requires grammar review and an error outcome agrees with actual evidence',()=>{const g=revisedGrade();c.normalizeKidsGrade_(g);assert.throws(()=>c.validateKidsReview_(g,2),/GRAMMAR_COVERAGE/);g.grammarReview[0].status='no_clear_error';assert.throws(()=>c.validateKidsReview_(g,1),/GRAMMAR_EVIDENCE_MISMATCH/);});

test('a visible student does not justify generic confidence or body-language praise without observations',()=>{const g=revisedGrade();g.scene.type='student_visible';g.presentation={assessable:true,text:'Con tự tin, ngôn ngữ hình thể tốt.',spans:[],reason:'Chưa đủ quan sát.',observations:[]};c.normalizeKidsGrade_(g);c.validateKidsReview_(g,1);const s=g.sections.at(-1);assert.ok(!s.text.includes('tự tin'));assert.equal(s.spans[0].tone,'neutral');});

test('visual evidence must be located in a student file and ambiguous observations cannot be praised',()=>{const g=revisedGrade();g.scene.type='student_visible';const obs={aspect:'gaze',status:'observed',fileIndex:0,time:'00:20',observation:'Con nhìn mindmap trong đoạn trả lời.',assessment:'Tập nhìn máy quay lúc kết thúc ý.',tone:'correction'};g.presentation.observations=[obs];c.normalizeKidsGrade_(g);assert.doesNotThrow(()=>c.validateKidsReview_(g,1));assert.equal(g.sections.at(-1).spans[0].tone,'correction');obs.fileIndex=1;assert.throws(()=>c.validateKidsReview_(g,1),/VISUAL_LOCATION/);obs.fileIndex=0;obs.status='unclear';obs.tone='praise';c.normalizeKidsGrade_(g);assert.throws(()=>c.validateKidsReview_(g,1),/UNCERTAIN_PRAISE/);});

const scopedVisual=()=>{const g=revisedGrade();g.scene.type='student_visible';g.performanceWindows=[{fileIndex:0,startTime:'00:10',endTime:'01:00'}];g.presentation.observations=[{aspect:'gestures',status:'observed',fileIndex:0,time:'00:05',observation:'Con gãi mũi một lần trước khi nói.',assessment:'Cần giữ tay.',tone:'correction',phase:'before_task',repetition:'single',supportTimes:['00:05'],posture:'not_applicable',postureBasis:''}];return g;};

test('pre-task gesture stays in audit and cannot become student feedback through repeated normalization',()=>{const g=scopedVisual();c.normalizeKidsGrade_(g);c.validateKidsReview_(g,1);assert.equal(g.presentation.observations.length,0);assert.equal(g.presentation.excludedObservations.length,1);assert.ok(!c.feedbackText_(g).includes('gãi mũi'));c.normalizeKidsGrade_(g);assert.equal(g.presentation.excludedObservations.length,1);});

test('one in-task moment cannot justify occasional gestures or a claimed repeated pattern',()=>{const g=scopedVisual(),x=g.presentation.observations[0];Object.assign(x,{phase:'during_task',time:'00:20',supportTimes:['00:20'],observation:'Con đôi lúc gãi mũi.'});assert.throws(()=>c.normalizeKidsGrade_(g),/REPETITION_UNSUPPORTED/);x.observation='Con gãi mũi một lần.';x.repetition='repeated';assert.throws(()=>c.normalizeKidsGrade_(g),/REPETITION_UNSUPPORTED/);x.supportTimes.push('00:30');assert.doesNotThrow(()=>c.normalizeKidsGrade_(g));});

test('visual support outside speaking range and posture without visible basis are rejected',()=>{const g=scopedVisual(),x=g.presentation.observations[0];x.phase='during_task';assert.throws(()=>c.normalizeKidsGrade_(g),/OUTSIDE_TASK/);Object.assign(x,{aspect:'posture',time:'00:20',supportTimes:['00:20'],observation:'Con đứng trình bày.',assessment:'',tone:'neutral',posture:'standing'});assert.throws(()=>c.normalizeKidsGrade_(g),/POSTURE_BASIS/);x.postureBasis='Nhìn rõ hai chân chịu trọng lượng trong khung hình.';assert.doesNotThrow(()=>c.normalizeKidsGrade_(g));c.validateKidsReview_(g,1);});

test('compact presentation prints one strength and every supported reminder without aspect headings',()=>{const g=revisedGrade();g.scene.type='student_visible';g.presentation={assessable:true,reason:'',observations:[{aspect:'gaze',status:'observed',fileIndex:0,time:'00:10',observation:'Con nhìn người nghe khi kết thúc ý.',assessment:'Điểm tốt đã có trong quan sát.',tone:'praise'},{aspect:'gestures',status:'observed',fileIndex:0,time:'00:20',observation:'Con kéo áo trong phần nói.',assessment:'Con còn kéo áo; hãy thả lỏng tay.',tone:'correction'},{aspect:'posture',status:'observed',fileIndex:0,time:'00:30',observation:'Con quay lưng khi nói.',assessment:'Con quay lưng; hãy hướng về người nghe.',tone:'correction'}]};c.normalizeKidsGrade_(g);const s=c.kidsSheetDisplaySections_(g).at(-1);assert.ok(!s.text.includes('Ánh mắt/hướng nhìn:')&&!s.text.includes('Cử chỉ:'));assert.ok(s.text.includes('Con còn kéo áo; hãy thả lỏng tay.')&&s.text.includes('Con quay lưng; hãy hướng về người nghe.'));assert.equal(s.spans.filter(x=>x.tone==='correction').length,2);assert.equal(g.presentation.observations.length,3);});

test('all eleven Kids forms receive the shared language and evidence contract',()=>{const forms=vm.runInContext('FORMS',c);assert.equal(Object.keys(forms).length,11);for(const [kind,form]of Object.entries(forms)){const p=c.kidsSystemInstruction_()+c.prompt_({kind,form,guide:'',reference:''});assert.ok(p.includes('grammarReview')&&p.includes('presentation.observations')&&p.includes('QUY TẮC ĐÁNH GIÁ CHUNG'));assert.equal(c.kidsGradeSchema_(form).properties.sections.required.length,form.length);}});

const colorFixture=prefix=>{const grade={assessable:true,band:'85%',sections:[{label:'Ngữ pháp',text:'Con dùng từ tốt. Con cần sửa câu.',spans:[{text:'Con dùng từ tốt. ',tone:'praise'},{text:'Con cần sửa câu.',tone:'correction'}]}]},text=prefix+'\n\n— NHẬN XÉT GV —\n'+c.feedbackText_(grade);let rich=new RichBuilder().setText(text).setTextStyle(0,text.length,new Style({format:{fontFamily:'Arial',italic:true},color:'#000000'}).build()).build(),writes=0;const cell={sheet:{book:{id:'unit',invalidateSheet(){}},getName:()=> 'THEO DÕI'},getRichTextValue:()=>rich,getFormula:()=>'',getDataValidation:()=>null,isPartOfMerge:()=>false,getA1Notation:()=> 'AC14',setRichTextFormats:v=>{writes++;rich=v;}};return {cell,grade,getWrites:()=>writes,changeText:()=>{rich=new RichBuilder().setText('Teacher changed feedback.').build();}};};

test('sheet hides locations split across semantic spans but retains every correction and audit timestamp',()=>{

 const spans=[{text:'Con nói rõ. Ánh mắt [Tệp ',tone:'praise'},{text:'1 00:10]',tone:'neutral'},{text:': cần nhìn camera.\n[01:39] can tall → can be tall /tɔːl/.',tone:'correction'}];

 const grade={assessable:true,band:'80%',sections:[{label:'Ngôn ngữ',text:spans.map(s=>s.text).join(''),spans}],evidence:[{time:'01:39',observed:'can tall',correction:'can be tall'}]},before=JSON.stringify(grade);

 const text='⚠️ ĐÃ NỘP MUỘN\n03/10/2026 21:05\n\n— NHẬN XÉT GV —\n'+c.feedbackText_(grade);

 assert.ok(!text.includes('Tệp')&&!text.includes('01:39')&&!text.includes('00:10'));

 assert.ok(text.includes('03/10/2026 21:05')&&text.includes('can tall → can be tall /tɔːl/.'));

 assert.equal(JSON.stringify(grade),before);

 const ranges=c.feedbackColorRanges_(text,grade);assert.ok(ranges.some(r=>r.color==='#C2185B'&&text.slice(r.start,r.end).includes('can be tall')));

 assert.ok(ranges.some(r=>r.color==='#1B5E20'&&text.slice(r.start,r.end).includes('Con nói rõ.')));

 const s={label:'Ngữ pháp',text:'Ví dụ: [Tệp 1 00:10] can tall; [Tệp 1 00:20] can small.',spans:[{text:'Ví dụ: [Tệp 1 00:10] can tall; [Tệp 1 00:20] can small.',tone:'correction'}]};

 assert.equal(c.kidsSheetDisplaySections_({sections:[s]})[0].text,'Ví dụ: can tall; can small.');

});

for(const prefix of ['⚠️ ĐÃ NỘP MUỘN\n10/10/2026 08:00','🔁 ĐÃ NỘP 2 LẦN\nLần đầu: 09/10/2026 08:00\nLần mới: 10/10/2026 08:00'])test('common color recovery is independent of late/repeat status and preserves text/fonts',()=>{const f=colorFixture(prefix),ctx={...c,saveArtifact_:()=> 'backup'},before=f.cell.getRichTextValue().getText();assert.equal(restoreFeedbackColors(ctx,f.cell,f.grade).status,'COLORS_RESTORED');assert.equal(f.cell.getRichTextValue().getText(),before);assert.equal(f.cell.getRichTextValue().getRuns()[0].getTextStyle().getForegroundColor(),'#000000');assert.ok(f.cell.getRichTextValue().runs.every(r=>r.style.format.italic));assert.equal(restoreFeedbackColors(ctx,f.cell,f.grade).status,'ALREADY_COLORED');assert.equal(f.getWrites(),1);});

test('color recovery never rewrites edited staff feedback or a concurrent edit',()=>{let f=colorFixture('⚠️ ĐÃ NỘP MUỘN');assert.equal(restoreFeedbackColors({...c,saveArtifact_:()=> 'unused'},f.cell,{...f.grade,band:'90%'}).status,'GRADE_OR_FORMAT_MISMATCH');assert.equal(f.getWrites(),0);f=colorFixture('🔁 ĐÃ NỘP 2 LẦN');assert.equal(restoreFeedbackColors({...c,saveArtifact_:()=>{f.changeText();return 'backup';}},f.cell,f.grade).status,'DESTINATION_CHANGED');assert.equal(f.getWrites(),0);});

test('formatting-only Sheets mask cannot overwrite yellow background, score, text or note',()=>{let req;const sheet={book:{batch:r=>{req=r[0];}},getSheetId:()=>1,meta:{properties:{sheetId:1}}};new Range(sheet,14,29,1,1).setRichTextFormats(new RichBuilder().setText('same text').build());assert.equal(req.updateCells.fields,'textFormatRuns');assert.deepEqual(Object.keys(req.updateCells.rows[0].values[0]),['textFormatRuns']);});

test('format audit rotates across protected history without reopening jobs or calling a model',()=>{const props=new Map(),seen=[],jobs=Array.from({length:5},(_,i)=>({job:{status:'RETURNED',cls:{},route:{},receipt:{student:String(i)}}})),ctx={loadJobs_:()=>jobs,runnerProperties:props,destination_:(_a,_b,n)=>{seen.push(n);throw Error('STUDENT_AMBIGUOUS');}};reconcileFeedbackColors(ctx,{limit:2});reconcileFeedbackColors(ctx,{limit:2});assert.deepEqual(seen,['0','1','2','3']);assert.ok(jobs.every(x=>x.job.status==='RETURNED'));assert.equal(props.get('FLEET_WORK_COLOR_REPAIR_CURSOR'),'4');});

test('late or repeated status and padded feedback do not change green/pink UTF-16 offsets',()=>{const g={assessable:true,band:'85%',sections:[{label:'Ngữ pháp',text:'Con nói rõ. Cần sửa goes.',spans:[{text:'Con nói rõ.',tone:'praise'},{text:' Cần sửa goes.',tone:'correction'}]}]};for(const prefix of ['⚠️ ĐÃ NỘP MUỘN\n08/10/2026 06:20','🔁 ĐÃ NỘP 2 LẦN\nLần mới: 08/10/2026 06:20']){const text=prefix+'\n\n— NHẬN XÉT GV —\n   '+c.feedbackText_(g)+'  ';const ranges=c.feedbackColorRanges_(text,g);assert.equal(text.slice(ranges[0].start,ranges[0].end),'Con nói rõ.');assert.equal(text.slice(ranges[1].start,ranges[1].end),' Cần sửa goes.');}});

test('late and repeated receipt-only cells are eligible, while any actual score or staff comment remains protected',()=>{for(const prefix of ['⚠️ ĐÃ NỘP MUỘN\n08/10/2026 06:20','🔁 ĐÃ NỘP 2 LẦN · MUỘN\nLần đầu: 07/10/2026 05:20\nLần mới: 08/10/2026 06:20']){assert.equal(c.hasFeedback_(prefix+'\n\n— NHẬN XÉT GV —'),false);assert.equal(c.hasFeedback_(prefix+'\n\n— NHẬN XÉT GV —\nCô đã chữa.'),true);assert.equal(c.hasFeedback_(prefix+'\n8 điểm'),true);}for(const text of ['Tốt!','8.5','Con đọc sai từ recent.'])assert.equal(c.hasFeedback_(text),true);});

test('legacy rubric formatting separates a semicolon reminder and leaves late receipt text untouched',()=>{const text='⚠️ ĐÃ NỘP MUỘN\n08/10/2026 06:20\n\n— NHẬN XÉT GV —\n  Chất lượng: đạt khoảng 85%.\n• Trôi chảy: Tốc độ khá lưu loát; con nên có ngữ điệu lên xuống tự nhiên hơn.\n';const ranges=c.legacyFeedbackColorRanges_(text);assert.equal(text.slice(ranges[0].start,ranges[0].end),'Tốc độ khá lưu loát');assert.equal(ranges[0].color,'#1B5E20');assert.equal(ranges[1].color,'#C2185B');assert.ok(ranges.every(x=>x.start>text.indexOf('— NHẬN XÉT GV —')));assert.throws(()=>c.legacyFeedbackColorRanges_('— NHẬN XÉT GV —\nCô đã nhận xét.'),/NOT_RUBRIC/);});

test('Sheets color-style runs retain color, font, emphasis and links through the adapter writer',()=>{let written;const text='Khen. Sửa.',cell={userEnteredFormat:{textFormat:{fontFamily:'Arial',fontSize:9}},textFormatRuns:[{startIndex:0,format:{foregroundColorStyle:{rgbColor:{red:27/255,green:94/255,blue:32/255}},italic:true,link:{uri:'https://example.com/feedback'}}},{startIndex:6,format:{foregroundColorStyle:{rgbColor:{red:194/255,green:24/255,blue:91/255}},bold:true}}]};const rich=Rich.fromCell(cell,text);assert.equal(rich.getRuns()[0].getTextStyle().getForegroundColor(),'#1b5e20');const s=new Sheet({batch:x=>{written=x;}},{properties:{title:'Tracker',sheetId:42}});s.getRange(14,30).setRichTextValue(rich);const result=written[0].updateCells.rows[0].values[0];assert.equal(result.textFormatRuns[0].format.fontSize,9);assert.equal(result.textFormatRuns[0].format.italic,true);assert.equal(result.textFormatRuns[0].format.link.uri,'https://example.com/feedback');assert.equal(Rich.fromCell(result,text).getRuns()[1].getTextStyle().getForegroundColor(),'#c2185b');});

test('UTF-16 offsets survive green/pink rich text serialization',()=>{const text='✅ ĐÃ NỘP\nCon nói tốt. Sửa cats /kæts/.';const start=text.indexOf('Sửa');const rich=new RichBuilder().setText(text).setTextStyle(0,'✅ ĐÃ NỘP'.length,new Style().setForegroundColor('#1B5E20').build()).setTextStyle(start,text.length,new Style().setForegroundColor('#C2185B').build()).build();const raw={textFormatRuns:rich.runs.map(r=>({startIndex:r.start,format:{foregroundColor:{red:parseInt(r.style.color.slice(1,3),16)/255,green:parseInt(r.style.color.slice(3,5),16)/255,blue:parseInt(r.style.color.slice(5,7),16)/255}}}))};const restored=Rich.fromCell(raw,text);assert.equal(restored.getRuns().find(r=>r.getText().startsWith('Sửa')).getTextStyle().getForegroundColor(),'#c2185b');assert.equal(restored.getText(),text);});

test('resumable upload aligns nonfinal chunks',()=>{const u={};assert.equal(c.uploadChunkBytes_(u,{'x-goog-upload-chunk-granularity':'8388608'}),8388608);assert.equal(c.uploadTransferEnd_(0,200*1024*1024,8388608),8388607);});

test('timezone date formatting used by IELTS works',()=>assert.equal(utilities().formatDate(new Date('2026-10-09T18:00:00Z'),'Asia/Ho_Chi_Minh','yyyy-MM-dd'),'2026-10-10'));

for(const type of ['screen','book','audio_only','unclear'])test(type+' forbids visual presentation',()=>assert.throws(()=>c.normalizeKidsGrade_({scene:{type},sections:{s0:{label:'Ngữ pháp',text:'Con nhìn thẳng vào camera.'}},presentation:{assessable:true,text:'Ánh mắt tốt.',spans:[]}}),/GRADE_VISUAL_CONTEXT_INVALID/));

test('screen feedback cannot hide eye contact in a language section',()=>assert.throws(()=>c.normalizeKidsGrade_({scene:{type:'screen'},sections:{s0:{label:'Ngữ pháp',text:'Ánh mắt con tốt.'}},presentation:{assessable:false,text:'',spans:[]}}),/GRADE_VISUAL_CONTEXT_INVALID/));

test('visible student requires a presentation section and preserves tone',()=>{const grade=c.normalizeKidsGrade_({scene:{type:'student_visible'},sections:{s0:{label:'Ngữ pháp',text:'Con dùng đúng mẫu câu.',spans:[{text:'Con dùng đúng mẫu câu.',tone:'praise'}]}},presentation:{assessable:true,text:'Con nhìn vào camera.',spans:[{text:'Con nhìn vào camera.',tone:'praise'}]}});assert.equal(grade.sections.at(-1).label,'Phong thái & trình bày');assert.equal(grade.sections.at(-1).spans[0].tone,'praise');assert.equal(c.normalizeKidsGrade_(grade).sections.length,2);});

test('partly visible student gives an observation limitation',()=>{const grade=c.normalizeKidsGrade_({scene:{type:'student_visible'},sections:[],presentation:{assessable:false,text:'',spans:[],reason:'Khung hình chỉ thấy tay, chưa đủ căn cứ nhận xét ánh mắt.'}});assert.equal(grade.sections[0].spans[0].tone,'neutral');});

test('missing presentation for visible student is held',()=>assert.throws(()=>c.normalizeKidsGrade_({scene:{type:'student_visible'},sections:[]}),/GRADE_PRESENTATION_MISSING/));

test('reference teacher video cannot supply visual evidence for student audio',()=>assert.throws(()=>cameraEvidence({assessable:true,scene:{type:'student_visible'}},[{mime:'audio/mp4'},{mime:'video/mp4',isReference:true}]),/GRADE_VISUAL_CONTEXT_INVALID/));

test('student audio with a reference video retains audio-only context',()=>cameraEvidence({assessable:true,scene:{type:'audio_only'}},[{mime:'audio/mp4'},{mime:'video/mp4',isReference:true}]));

test('queue extent follows server expansion beyond 1000 rows',()=>{const book={id:'unit',g:{api:()=>({updates:{updatedRange:"'Jobs'!A1001:F1003"}})},cache:new Map(),invalidateSheet:Book.prototype.invalidateSheet},sheet=new Sheet(book,{properties:{title:'Jobs',gridProperties:{rowCount:1000,columnCount:26}}});sheet.appendRows([[1],[2],[3]]);assert.equal(sheet.meta.properties.gridProperties.rowCount,1003);});

test('tracker tab resolves normalized title without choosing old monthly tabs',()=>assert.equal(chooseTrackerTab('THEO DÕI TOÀN DIỆN',['THÁNG 9 & 10 NĂM 2025',' THEO DÕI TOÀN DIỆN ']),' THEO DÕI TOÀN DIỆN '));

test('unique tracker alias is accepted',()=>assert.equal(chooseTrackerTab(undefined,['LINK HỌC SINH','THEO DÕI']),'THEO DÕI'));

test('ambiguous tracker fallback is held',()=>assert.throws(()=>chooseTrackerTab(undefined,['THEO DÕI','THEO DÕI TOÀN DIỆN']),/DESTINATION_TAB_AMBIGUOUS/));

test('uploaded PROCESSING recording gets checked ahead of unknown inputs',()=>assert.equal(mediaQueuePriority({media:[{processingState:'PROCESSING',runnerUpload:{name:'files/test'}}]}),1));

test('partial multi-file job progresses without waiting behind unknown inputs',()=>assert.equal(mediaQueuePriority({media:[{processingState:'PROCESSING',upload:{name:'files/test'}},{mime:'video/mp4'}]}),1));

test('deleted uploaded media does not monopolize readiness checks',()=>assert.equal(mediaQueuePriority({media:[{runnerUpload:{name:'files/test',deleted:true}}]}),null));

test('interrupted upload retains a preparation slot',()=>assert.equal(mediaQueuePriority({media:[{upload:{offset:8388608}}]}),2));

test('bulk continuation counts waiting files but excludes review and old submissions',()=>assert.deepEqual(backlogCounts(['WAITING_MEDIA','WAITING_INPUT','NEEDS_REVIEW','BLOCKED','STALE','SKIPPED_OLD_SUBMISSION','SKIPPED_EXISTING_FEEDBACK','RETURNED','DONE'].map(status=>({status}))),{pending:2,held:3,returned:2}));

test('uncertain generation and saved grades require queue resolution before bulk completion',()=>assert.equal(backlogCounts(['GENERATING','GRADED','GENERATED','PROCESSING'].map(status=>({status}))).pending,4));

test('paraphrased color metadata cannot alter assessment text or IPA',()=>{const text='Con phát âm khá tốt, tuy nhiên cần sửa lives /lɪvz/.';const grade=c.normalizeKidsGrade_({assessable:true,scene:{type:'screen'},sections:[{label:'Phát âm',text,spans:[{text:'lives đọc thành /lɪf/ sửa thành /lɪvz>.',tone:'correction'}]}],presentation:{assessable:false,text:'',spans:[]}});assert.equal(grade.sections[0].text,text);assert.equal(grade.sections[0].spans.map(s=>s.text).join(''),text);assert.equal(grade.sections[0].spans[0].tone,'praise');assert.equal(grade.sections[0].spans.at(-1).tone,'correction');});

test('IPA already supplied in Gemini evidence is rendered in pink without another call',()=>{const original='Con phát âm khá tốt, tuy nhiên cần sửa field.';const g=c.normalizeKidsGrade_({assessable:true,scene:{type:'screen'},sections:[{label:'Phát âm',text:original,spans:[{text:original,tone:'neutral'}]}],presentation:{assessable:false,text:'',spans:[]},evidence:[{type:'pronunciation',word:'field',ipa:'/fiːld/',time:'00:03',correction:'Con đọc rõ âm cuối trong field /fiːld/.'}]});pronunciationEvidence(g);assert.ok(g.sections[0].text.startsWith(original));assert.equal(g.sections[0].spans[0].tone,'praise');assert.equal(g.sections[0].spans.at(-1).tone,'correction');const once=g.sections[0].text;assert.equal(c.normalizeKidsGrade_(g).sections[0].text,once);});

test('missing IPA field uses only an unambiguous IPA explicitly in model correction',()=>{const g=c.normalizeKidsGrade_({assessable:true,scene:{type:'screen'},sections:[{label:'Phát âm',text:'Con cần sửa lives.',spans:[]}],presentation:{assessable:false,text:'',spans:[]},evidence:[{type:'pronunciation',word:'lives',time:'00:35',correction:'lives /lɪvz/'}]});assert.equal(g.evidence[0].ipa,'/lɪvz/');pronunciationEvidence(g);});

test('no invented IPA when model correction has none or two alternatives',()=>{for(const correction of ['Đọc rõ âm cuối của lives.','lives /lɪf/ hoặc /lɪvz/']){const g=c.normalizeKidsGrade_({assessable:true,scene:{type:'screen'},sections:[{label:'Phát âm',text:'Con cần sửa lives.',spans:[]}],presentation:{assessable:false,text:'',spans:[]},evidence:[{type:'pronunciation',word:'lives',time:'00:35',correction}]});assert.throws(()=>pronunciationEvidence(g),/GRADE_PRONUNCIATION_IPA_REQUIRED/);}});

test('old saved grade without camera detection stays held',()=>assert.throws(()=>cameraEvidence({assessable:true},[{mime:'video/mp4'}]),/GRADE_VISUAL_CONTEXT_INVALID/));

test('Sheets throttling before grading does not cool down the Gemini model',()=>assert.deepEqual(googleQueueFailure({},'GOOGLE_HTTP_429'),{status:'RETRY',error:'GOOGLE_TEMPORARY_LIMIT',retry:true}));

test('lost successful generation persistence is held rather than billed again',()=>assert.equal(googleQueueFailure({runnerGenerationStarted:true},'GOOGLE_HTTP_429').status,'NEEDS_REVIEW'));

test('saved generation can safely resume after Sheets throttling',()=>assert.equal(googleQueueFailure({runnerGenerationStarted:true,rawId:'runner:saved'},'GOOGLE_HTTP_429').retry,true));

test('uploaded PROCESSING files get a readiness check without admitting heavy preparation',()=>{const uploaded={id:'ready',media:[{mime:'video/mp4',runnerUpload:{name:'files/ready'},processingState:'PROCESSING'}]},heavy={id:'heavy',media:[{mime:'video/mp4',size:700e6,upload:{offset:8e6}}]};assert.deepEqual(throughputQueue([{job:heavy},{job:uploaded}],'ready').map(x=>x.job.id),['ready']);});

test('incomplete teacher reference goes to preparation before grading',()=>assert.equal(readyForMediaCheck({media:[{mime:'video/mp4',upload:{name:'files/student'}},{mime:'video/mp4',size:100e6}]}),false));

test('smallest unfinished known transfer completes before opening unknown jobs',()=>{const rows=[{job:{id:'new',media:[]}},{job:{id:'large',media:[{mime:'video/mp4',size:500e6,upload:{offset:8e6}}]}},{job:{id:'almost',media:[{mime:'video/mp4',size:70e6,upload:{offset:65e6}}]}}];assert.deepEqual(throughputQueue(rows,'prepare').map(x=>x.job.id),['almost','large','new']);});

test('saved grade is returned before preparing any new media',()=>assert.equal(readyForMediaCheck({gradeId:'runner:saved',media:[]}),true));

test('reference cache rejects expired deleted and invalidated uploads',()=>{const now=48*3600000,valid={savedAt:now-1000,upload:{name:'files/reference',uri:'https://example.test/reference',mime:'video/mp4'}};assert.equal(reusableReference(valid,now),true);assert.equal(reusableReference({...valid,savedAt:0},now),false);assert.equal(reusableReference({...valid,upload:{...valid.upload,deleted:true}},now),false);assert.equal(reusableReference({upload:null,savedAt:0},now),false);});

test('each logical submission belongs to exactly one of five workers',()=>{for(let i=0;i<1000;i++){const key='student|class|lesson'+i,slot=jobShard(key,5);assert.equal([0,1,2,3,4].filter(x=>x===slot).length,1);assert.equal(jobShard(key,5),slot);}});

test('dedicated Shadowing leaves four exhaustive non-overlapping Kids shards',()=>{const lanes=workerLanes(5,true);assert.equal(lanes.shadowingSlot,0);assert.equal(lanes.ieltsSlot,1);assert.deepEqual(lanes.kidsSlots,[1,2,3,4]);for(let i=0;i<1000;i++){const owners=lanes.kidsSlots.filter(slot=>jobShard('submission'+i,lanes.kidsSlots.length)===lanes.kidsSlots.indexOf(slot));assert.equal(owners.length,1);assert.notEqual(owners[0],lanes.shadowingSlot);}});

test('disabled Shadowing and single-worker mode preserve all Kids coverage',()=>{assert.deepEqual(workerLanes(5,false).kidsSlots,[0,1,2,3,4]);assert.deepEqual(workerLanes(1,true),{shadowingSlot:0,ieltsSlot:0,kidsSlots:[0]});});

test('Peppa, both Phonics tasks, reading, translation and shadowing use audio with their own references',()=>{for(const kind of ['peppa','reading','translation','grammar','phonicsVideo','shadowing'])assert.equal(mediaPolicy(kind),'audio');});

test('unknown task retains visual evidence and routing records the reason',()=>{assert.equal(mediaPolicy('unknown'),'video');assert.equal(mediaDecision('translation').reason,'spoken_reading_and_translation');assert.equal(mediaDecision('vocabulary').reason,'picture_or_written_answer_context');});

test('presentation and picture vocabulary retain video evidence',()=>{for(const kind of ['de','science','scienceK','critical','vocabulary'])assert.equal(mediaPolicy(kind),'video');});

test('five workers reserve distinct shared Sheets quota slots',()=>{let state={};const times=[];for(let i=0;i<5;i++){const r=reserveRateSlot(state,'read',1000);state=r.next;times.push(r.at);}assert.deepEqual(times,[1000,2100,3200,4300,5400]);assert.equal(reserveRateSlot(state,'write',1000).at,1000);});

test('a media transfer lock has one owner until released',()=>{const file=path.join(root,'private','unit-transfer.lock');const release=tryFileLock(file);assert.ok(release);assert.equal(tryFileLock(file),null);release();const second=tryFileLock(file);assert.ok(second);second();});

test('resume cannot restart a completed bulk backlog',()=>assert.equal(bulkRunMode('resume',false),'grade'));

test('explicit catchup start activates bulk for an immediate successor',()=>assert.equal(bulkRunMode('catchup-start',false),'catchup'));

test('active bulk resumes and scheduled runs use bulk budget',()=>{assert.equal(bulkRunMode('resume',true),'catchup');assert.equal(bulkRunMode('auto',true),'catchup');});

test('each hourly schedule starts draining even after the previous backlog completed',()=>assert.equal(bulkRunMode('auto',false),'catchup'));

test('hourly scans discover new Kids even while a long Shadowing backlog remains active',()=>{assert.equal(shouldRefreshScan('auto',{active:true,lastScheduledScanHour:1},2),true);assert.equal(shouldRefreshScan('auto',{active:true,lastScheduledScanHour:2},2),false);assert.equal(shouldRefreshScan('resume',{active:true,lastScheduledScanHour:1},2),false);assert.equal(shouldRefreshScan('auto',{active:false},2),true);});

test('empty queues cannot finish before every configured class/tab has been scanned',()=>{assert.equal(scanProgress({a:120,b:96},{a:119,b:100}),1);assert.equal(shouldContinueBulk('catchup',{active:true,pending:0,scanRemaining:1}),true);assert.equal(shouldContinueBulk('catchup',{active:true,pending:0,scanRemaining:0}),false);});

test('real fleet scanner persists completed discovery even for empty class/tab slices',()=>{const p=new Map([['FLEET_SCAN_DONE','8']]),c=vm.createContext({FLEET_CLUSTER:{classes:[{className:'KIDS 21',spreadsheetId:'test'}]},prop_:()=>({getProperty:k=>p.get(k),setProperty:(k,v)=>p.set(k,v),deleteProperty:k=>p.delete(k)}),require_:(ok)=>assert.ok(ok),loadJobs_:()=>[],SpreadsheetApp:{flush(){} }});vm.runInContext(fs.readFileSync(path.join(root,'gas/Fleet.gs'),'utf8'),c);vm.runInContext('targetSnapshot_=()=>({});guideCatalog_=()=>[];audit_=()=>{};sourceRows_=()=>[];',c);c.scanFleetSlice_(Date.now()+60000);assert.equal(p.get('FLEET_SCAN_DONE'),'20');assert.equal(p.get('FLEET_SCAN_CURSOR'),'0');});

test('failed scan-only runs remain recoverable until discovery finishes',()=>assert.equal(recoveryDecision({active:true,scanRemaining:5},1,{pending:0,held:8,returned:10}).retry,true));

test('ordinary hourly and audit modes do not chain',()=>{assert.equal(shouldContinueBulk('grade',{active:true,pending:5}),false);assert.equal(shouldContinueBulk('audit',{active:true,pending:5}),false);});

test('only active pending bulk work dispatches a successor',()=>{assert.equal(shouldContinueBulk('catchup',{active:true,pending:5}),true);assert.equal(shouldContinueBulk('catchup',{active:false,pending:5}),false);assert.equal(shouldContinueBulk('catchup',{active:true,pending:0}),false);});

const asyncTest=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};

test('review dashboard omits recovered jobs and clears obsolete review rows',()=>{const rows=reviewTable([{id:'old',status:'RETURNED',error:'KIDS_VIDEO_OVER_180_SECONDS'},{id:'held',status:'NEEDS_REVIEW',cls:{className:'KIDS 21'},receipt:{student:'BEAN'},route:{code:'DE-14'},error:'STUDENT_AMBIGUOUS'}],5);assert.equal(rows.length,5);assert.equal(rows[1][0],'held');assert.equal(rows[1][5],'STUDENT_AMBIGUOUS');assert.deepEqual(rows[2],['','','','','','']);assert.equal(rows.some(r=>r.includes('old')),false);});

test('a crashed bulk runner retries only twice without any returned progress',()=>{let state={active:true};for(let i=1;i<=3;i++){const decision=recoveryDecision(state,i,{pending:10,held:2,returned:5});assert.equal(decision.retry,i<=2);state=decision.state;}});

test('actual returned progress resets failure recovery allowance',()=>assert.equal(recoveryDecision({active:true,recoveryAttempts:2,recoveryReturned:5},4,{pending:5,held:2,returned:6}).retry,true));

test('failure recovery cannot reactivate a drained or stopped queue',()=>{assert.equal(recoveryDecision({active:false},1,{pending:5,returned:1,held:0}).retry,false);assert.equal(recoveryDecision({active:true},1,{pending:0,returned:1,held:5}).state.active,false);});

test('duplicate completion events cannot dispatch the same recovery twice',()=>assert.equal(recoveryDecision({active:true,lastFailedRun:'4'},4,{pending:5,returned:6,held:0}).retry,false));

test('cache eviction never deletes a file being processed by another worker',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grader-cache-'));try{const c=new MediaCache(dir,{limitBytes:0,reserveBytes:0,freeBytes:()=>1000}),lock=path.join(dir,'locks','active.lock'),release=tryFileLock(lock);c.register('active',lock);fs.writeFileSync(path.join(dir,'active.original'),Buffer.alloc(20));c.sweep();assert.ok(fs.existsSync(path.join(dir,'active.original')));release();c.sweep();assert.equal(fs.existsSync(path.join(dir,'active.original')),false);}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('successful audio extraction drops source bytes but retains reusable audio',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grader-cache-'));try{const c=new MediaCache(dir);c.register('source',path.join(dir,'locks','source.lock'));fs.writeFileSync(path.join(dir,'source.original'),Buffer.alloc(100));fs.writeFileSync(path.join(dir,'source.m4a'),Buffer.alloc(5));assert.equal(c.dropOriginal('source'),100);assert.equal(fs.statSync(path.join(dir,'source.m4a')).size,5);const expected=5+fs.statSync(path.join(dir,'source.cache.json')).size;assert.equal(c.dropUnlocked('source'),expected);}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('disk pressure preserves active partial download and refuses another chunk',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grader-cache-'));let release;try{const c=new MediaCache(dir,{reserveBytes:100,freeBytes:()=>10}),lock=path.join(dir,'locks','partial.lock');release=tryFileLock(lock);c.register('partial',lock);fs.writeFileSync(path.join(dir,'partial.original.part'),Buffer.alloc(20));assert.throws(()=>c.sweep(8),/RUNNER_DISK_PRESSURE/);assert.equal(fs.statSync(path.join(dir,'partial.original.part')).size,20);}finally{release?.();fs.rmSync(dir,{recursive:true,force:true});}});

test('cache cleanup cannot delete unregistered files or paths outside cache',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grader-cache-'));try{const c=new MediaCache(dir,{limitBytes:0,reserveBytes:0,freeBytes:()=>1000});fs.writeFileSync(path.join(dir,'credentials.json'),'preserve');c.sweep();assert.equal(fs.readFileSync(path.join(dir,'credentials.json'),'utf8'),'preserve');assert.throws(()=>c.register('../escape',path.join(dir,'locks','x.lock')),/MEDIA_CACHE_PATH_INVALID/);}finally{fs.rmSync(dir,{recursive:true,force:true});}});

await asyncTest('inactive continuation makes no GitHub request',async()=>{let calls=0;assert.equal((await dispatchContinuation({CONTINUE_BULK:'false'},async()=>{calls++;})).dispatched,false);assert.equal(calls,0);});

await asyncTest('successor dispatch uses resume rather than forcibly activating bulk',async()=>{let calls=0;const result=await dispatchContinuation({CONTINUE_BULK:'true',GITHUB_REPOSITORY:'teacher/grader',GITHUB_TOKEN:'unit-token',GITHUB_REF_NAME:'main'},async(url,options)=>{calls++;assert.equal(url,'https://api.github.com/repos/teacher/grader/actions/workflows/grading_cron.yml/dispatches');assert.deepEqual(JSON.parse(options.body),{ref:'main',inputs:{mode:'resume'}});return {status:204};});assert.equal(result.dispatched,true);assert.equal(calls,1);});

await asyncTest('dispatch failure is explicit and not blindly retried',async()=>{let calls=0;await assert.rejects(()=>dispatchContinuation({CONTINUE_BULK:'true',GITHUB_REPOSITORY:'teacher/grader',GITHUB_TOKEN:'unit-token',GITHUB_REF_NAME:'main'},async()=>{calls++;return {status:403};}),/CONTINUATION_GITHUB_HTTP_403/);assert.equal(calls,1);});

const recordingCheck=()=>({fileIndex:0,recordingMode:'handheld_self',speakerInFrame:'partial',cameraGazeVerifiable:false,basis:'Chỉ thấy một phần mặt trong khung hình điện thoại.',textUseStatus:'not_determinable',textUseBasis:'Không thấy tài liệu ngoài khung.',requirement:'unspecified',requirementBasis:'',compliance:'not_applicable',feedback:''});

const recordingGrade=()=>{const g=revisedGrade();g.scene.type='student_visible';g.recordingChecks=[recordingCheck()];g.presentation.observations=[{aspect:'gaze',status:'observed',fileIndex:0,time:'00:20',observation:'Con nhìn thẳng camera.',assessment:'',tone:'praise',gazeTarget:'camera',gazeBasis:'Mặt hướng về điện thoại.'}];return g;};

test('raw camera claim contradicting unavailable eye evidence cannot pass validation',()=>{const g=recordingGrade();assert.throws(()=>c.validateKidsRecording_(g,1),/GAZE_NOT_VERIFIABLE/);});

test('fluent description cannot certify memorized delivery',()=>{const g=recordingGrade();g.sections=[{label:'Thuộc lời, tự nói theo hình',text:'Con ghi nhớ rất tốt tiến trình bài.',spans:[{text:'Con ghi nhớ rất tốt tiến trình bài.',tone:'praise'}]}];assert.throws(()=>c.validateKidsRecording_(g,1,false),/DELIVERY_MEMORY_UNPROVEN/);});

test('upper body alone is insufficient for a posture conclusion',()=>{const g=scopedVisual(),x=g.presentation.observations[0];Object.assign(x,{aspect:'posture',time:'00:20',supportTimes:['00:20'],phase:'during_task',posture:'seated',postureBasis:'Đầu và vai ở cạnh bàn.',observation:'Con ngồi trình bày.'});assert.throws(()=>c.validateKidsTemporalVisual_(g,1),/POSTURE_LOWER_BODY_NOT_OBSERVED/);});

test('self-held partial face cannot become eye-contact praise; raw observation kept in audit',()=>{const g=recordingGrade();const language=JSON.stringify(g.evidence);c.normalizeKidsGrade_(g);c.validateKidsReview_(g,1);assert.equal(g.presentation.assessable,false);assert.equal(g.presentation.observations[0].tone,'neutral');assert.equal(g.presentation.recordingExcludedObservations[0].observation,'Con nhìn thẳng camera.');assert.ok(!c.feedbackText_(g).includes('Con nhìn thẳng camera.'));assert.equal(JSON.stringify(g.evidence),language);c.normalizeKidsGrade_(g);assert.equal(g.presentation.recordingExcludedObservations.length,1);});

test('unknown text use stays explicit and neutral without declaring independent speech',()=>{const g=recordingGrade();g.sections[0]={label:'Thuộc lời, tự nói theo hình',text:'Con trình bày được ý chính.',spans:[{text:'Con trình bày được ý chính.',tone:'praise'}]};c.normalizeKidsGrade_(g);const displayed=c.kidsSheetDisplaySections_(g);assert.ok(!displayed[0].text.includes('Chưa đủ căn cứ'));assert.equal(g.band,'85%');g.sections[0].text='Con tự thuyết trình rất tốt.';assert.throws(()=>c.validateKidsRecording_(g,1),/INDEPENDENT_DELIVERY_UNPROVEN/);});

test('no evidence of a recording requirement cannot create a recording fault',()=>{const g=recordingGrade();g.recordingChecks[0].compliance='not_met';g.recordingChecks[0].feedback='Hãy đặt máy quay.';assert.throws(()=>c.normalizeKidsGrade_(g),/REQUIREMENT_UNGROUNDED/);g.recordingChecks[0].requirement='face_presentation';g.recordingChecks[0].requirementBasis='Đề yêu cầu thấy người thuyết trình.';c.normalizeKidsGrade_(g);const shown=c.kidsSheetDisplaySections_(g);assert.ok(shown.at(-1).spans.some(s=>s.tone==='correction'&&s.text.includes('Hãy đặt máy quay.')));});

test('a supported view of a reference is distinct from camera gaze',()=>{const g=recordingGrade(),r=g.recordingChecks[0],o=g.presentation.observations[0];r.speakerInFrame='clear';o.gazeTarget='reference';o.gazeBasis='Thấy mắt hướng xuống trang sách đang chỉ.';o.observation='Con nhìn trang sách.';o.tone='neutral';c.normalizeKidsGrade_(g);c.validateKidsReview_(g,1);assert.equal(g.presentation.observations[0].status,'observed');o.observation='Con nhìn thẳng camera.';assert.throws(()=>c.validateKidsRecording_(g,1),/GAZE_TARGET_CONTRADICTION/);});

test('face direction alone cannot certify delivery and visual praise cannot leak into fluency',()=>{const g=recordingGrade();g.sections[0].text='Con tự tin và biểu cảm gương mặt rất tốt.';assert.throws(()=>c.normalizeKidsGrade_(g),/VISUAL_OUTSIDE_PRESENTATION/);});

test('every Kids rubric has recording and text-use gates; audio-only does not require presentation',()=>{for(const [kind,form]of Object.entries(vm.runInContext('FORMS',c))){const p=c.kidsSystemInstruction_()+c.prompt_({kind,form,guide:'',reference:''}),s=c.kidsGradeSchema_(form);assert.ok(p.includes('TỰ NÓI KHÁC ĐỌC CHỮ')&&p.includes('YÊU CẦU QUAY PHỤ THUỘC ĐỀ'));assert.ok(s.required.includes('recordingChecks'));}const g=revisedGrade();g.recordingChecks=[{...recordingCheck(),recordingMode:'audio_only',speakerInFrame:'not_visible',requirement:'audio',requirementBasis:'Đề chỉ yêu cầu thu âm.',compliance:'met'}];c.normalizeKidsGrade_(g);c.validateKidsReview_(g,1);assert.ok(!c.feedbackText_(g).includes('máy quay'));});

const rubricDraft=(label,text,tone='praise',evidence=[])=>({assessable:true,sections:[{label,text,spans:[{text,tone}]}],evidence,uncertainty:[]});

test('vocabulary recall and meaning cannot be replaced by pronunciation praise',()=>{const g=rubricDraft('Thuộc từ & nhớ nghĩa','Con phát âm chính xác tất cả từ.');assert.throws(()=>c.validateKidsRubricDraft_(g,{kind:'vocabulary'}),/PRONUNCIATION_MISPLACED/);});

test('vague final-sound criticism without a word is blocked even when another error exists',()=>{const g=rubricDraft('Phát âm','Cần chú ý âm cuối ở một số từ.','correction',[{type:'pronunciation',word:'cats',ipa:'/kæts/',observed:'Thiếu /s/.',correction:'Giữ /s/ sau /t/.'}]);assert.throws(()=>c.validateKidsRubricDraft_(g,{kind:'de'}),/CLAIM_UNSUPPORTED/);g.sections[0].text='cats: thiếu âm cuối /s/, giữ /s/ sau /t/.';g.sections[0].spans=[{text:g.sections[0].text,tone:'correction'}];assert.doesNotThrow(()=>c.validateKidsRubricDraft_(g,{kind:'de'}));});

test('uncertain audio and explicitly general coaching remain neutral rather than invented errors',()=>{for(const text of ['Chưa nghe rõ âm cuối ở đoạn này.','Gợi ý luyện tập chung (không phải lỗi đã xác nhận): luyện âm cuối.'])assert.doesNotThrow(()=>c.validateKidsRubricDraft_(rubricDraft('Phát âm',text,'neutral'),{kind:'reading'}));});

test('reading supplied words cannot certify meaning and its limitation remains neutral',()=>{const g=rubricDraft('Thuộc từ & nhớ nghĩa','Con đọc được danh sách từ.');g.vocabularyAssessment={mode:'read_text',meaningStatus:'demonstrated',observed:'Đọc các chữ có sẵn.'};assert.throws(()=>c.validateKidsRubricDraft_(g,{kind:'vocabulary'}),/MEANING_UNPROVEN/);g.vocabularyAssessment.meaningStatus='not_tested';c.validateKidsRubricDraft_(g,{kind:'vocabulary'});const shown=c.kidsSheetDisplaySections_(g);assert.ok(!shown[0].text.includes('Chưa đủ căn cứ'));assert.equal(g.vocabularyAssessment.meaningStatus,'not_tested');});

test('pronunciation praise cannot say every word is correct while recording errors',()=>{const g=rubricDraft('Phát âm','Con phát âm chuẩn mọi từ.','praise',[{type:'pronunciation',word:'cats'}]);assert.throws(()=>c.validateKidsRubricDraft_(g,{kind:'phonics'}),/PRAISE_CONTRADICTION/);});

test('all eleven rubric prompts require concrete pronunciation evidence; only vocabulary requires meaning assessment',()=>{for(const [kind,form]of Object.entries(vm.runInContext('FORMS',c))){const p=c.kidsSystemInstruction_()+c.prompt_({kind,form,guide:'',reference:''});assert.ok(p.includes('RANH GIỚI TIÊU CHÍ CHO CẢ 11 MẪU')&&p.includes('MỌI LỜI CHÊ PHÁT ÂM PHẢI CÓ DẪN CHỨNG'));assert.equal(c.kidsGradeSchema_(form).required.includes('vocabularyAssessment'),kind==='vocabulary');}});

test('general practice suggestion stays neutral through normalizer and display',()=>{const g=revisedGrade();g.sections[0].spans.push({text:' Gợi ý luyện tập chung (không phải lỗi đã xác nhận): luyện âm cuối.',tone:'neutral'});g.sections[0].text=g.sections[0].spans.map(s=>s.text).join('');c.normalizeKidsGrade_(g);const shown=c.kidsSheetDisplaySections_(g);assert.ok(shown[0].spans.some(s=>s.text.includes('Gợi ý luyện tập chung')&&s.tone==='neutral'));});

test('audio-only word list cannot establish picture naming or memorized meanings',()=>{const g=rubricDraft('Thuộc từ & nhớ nghĩa','Con đọc được các từ.');g.scene={type:'audio_only'};g.vocabularyAssessment={mode:'name_picture',meaningStatus:'demonstrated',englishAnswerVisible:false,observed:'Đọc đủ 9 từ.'};assert.throws(()=>c.validateKidsRubricDraft_(g,{kind:'vocabulary'}),/PICTURE_NOT_OBSERVED/);});

test('screen recording is valid vocabulary media but supplied answers do not prove recall',()=>{const g=rubricDraft('Thuộc từ & nhớ nghĩa','Con đọc được các từ.');g.scene={type:'screen'};g.vocabularyAssessment={mode:'name_picture',meaningStatus:'demonstrated',englishAnswerVisible:true,observed:'Nhìn hình và nhãn chữ tiếng Anh.'};assert.throws(()=>c.validateKidsRubricDraft_(g,{kind:'vocabulary'}),/VISIBLE_ANSWER_NOT_RECALL/);g.vocabularyAssessment.mode='read_text';g.vocabularyAssessment.meaningStatus='not_tested';assert.doesNotThrow(()=>c.validateKidsRubricDraft_(g,{kind:'vocabulary'}));});

test('isolated vocabulary words do not get irrelevant grammar review text',()=>{const g=revisedGrade();g.evidence=[];g.grammarReview=[{fileIndex:0,status:'not_applicable',summary:'Chỉ đọc từ rời.'}];c.normalizeKidsGrade_(g);assert.ok(!c.feedbackText_(g).includes('Rà ngữ pháp'));assert.equal(g.grammarReview[0].summary,'Chỉ đọc từ rời.');});

test('lack of audible stop release alone is not proof of a missing consonant',()=>{const g=rubricDraft('Phát âm','Con đọc đủ nghe.','praise',[{type:'pronunciation',word:'fold',ipa:'/foʊld/',observed:'chưa bật rõ âm /d/ ở cuối từ',correction:'bật nhẹ /d/'}]);assert.throws(()=>c.validateKidsRubricDraft_(g,{kind:'vocabulary'}),/UNRELEASED_STOP_NOT_ERROR/);});



const scoreUnit=(target,status='correct',evidenceIndexes=[])=>({target,status,evidenceIndexes});

const scoreLedger=(mode,units)=>({mode,sourceBasis:'Verified lesson targets',complete:true,units,prosody:[],fluency:[]});

test('quantitative word score counts a multi-error word only once and retains both errors',()=>{const errors=[{type:'pronunciation',word:'waves',observed:'wrong vowel',correction:'use /eɪ/'},{type:'pronunciation',word:'waves',observed:'wrong ending',correction:'use /vz/'}];const l=scoreLedger('words',[...Array.from({length:8},(_,i)=>scoreUnit('word'+i)),scoreUnit('waves','incorrect',[0,1])]);const r=c.quantScore_(l,errors,'words');assert.equal(r.percent,89);assert.equal(r.details.units.correct,8);assert.equal(errors.length,2);});

test('a complete error-free ledger is exactly 100 and uncertain evidence cannot be guessed',()=>{const l=scoreLedger('sentences',[scoreUnit('She likes cats.')]);assert.equal(c.quantScore_(l,[],'sentences').percent,100);l.units[0].status='unclear';assert.throws(()=>c.quantScore_(l,[],'sentences'),/SCORE_UNCLEAR/);l.units[0].status='incorrect';assert.throws(()=>c.quantScore_(l,[],'sentences'),/DEDUCTION_WITHOUT_EVIDENCE/);});

test('weighted score uses 50 25 25 and all deductions require correct evidence categories',()=>{const e=[{type:'intonation',observed:'flat question',correction:'rise at the question'}];const l=scoreLedger('weighted',[scoreUnit('hello')]);l.prosody=[scoreUnit('question contour','incorrect',[0])];l.fluency=[scoreUnit('first phrase rhythm')];assert.equal(c.quantScore_(l,e,'weighted').percent,75);l.prosody[0].evidenceIndexes=[];assert.throws(()=>c.quantScore_(l,e,'weighted'),/DEDUCTION_WITHOUT_EVIDENCE/);});

test('score cannot ignore a pronunciation error or count an unknown denominator',()=>{const l=scoreLedger('words',[scoreUnit('waves')]),e=[{type:'pronunciation',word:'waves',observed:'wrong vowel',correction:'use /eɪ/'}];assert.throws(()=>c.quantScore_(l,e,'words'),/UNACCOUNTED_ERROR/);l.complete=false;assert.throws(()=>c.quantScore_(l,[],'words'),/SOURCE_INCOMPLETE/);});

test('new schema has no free-form section praise or criticism and keeps every rubric',()=>{for(const form of Object.values(vm.runInContext('FORMS',c))){const s=c.kidsEvidenceSchema_(form);assert.equal(s.properties.sections,undefined);assert.equal(s.properties.rubricFindings.required.length,form.length);assert.ok(s.required.includes('scoreLedger'));for(const r of Object.values(s.properties.rubricFindings.properties)){assert.ok(!r.properties.text);assert.ok(r.properties.strengths.items.properties.skill.enum.every(x=>!(/memor|confiden|effort/.test(x))));}}});



const typedVocabulary=(errors=[])=>({assessable:true,band:'',reason:'',protocol:'typed-evidence-v2',scene:{type:'screen'},presentation:{observations:[]},recordingChecks:[{...recordingCheck(),recordingMode:'screen_book',speakerInFrame:'not_visible'}],performanceWindows:[{fileIndex:0,startTime:'00:00',endTime:'00:20'}],evidence:errors,contentChecks:[],contentSourceLimitation:'',uncertainty:[],grammarReview:[{fileIndex:0,status:'not_applicable',summary:'Word task.'}],vocabularyAssessment:{mode:'name_picture',meaningStatus:'not_tested',englishAnswerVisible:false,observed:'Pictures with initial letters.'},rubricFindings:{s0:{label:'Thuộc từ & nhớ nghĩa',strengths:[{skill:'picture_names',fileIndex:0,time:'00:01',basis:'Names the picture.'}]},s1:{label:'Phát âm, âm đuôi & trọng âm',strengths:[]}},scoreLedger:{mode:'words',sourceBasis:'Assigned two words',complete:true,units:{targets:['cat','dog'],unclearIndexes:[],errors:errors.length?[{unitIndex:0,evidenceIndexes:errors.map((_,i)=>i)}]:[]},prosody:{targets:[],unclearIndexes:[],errors:[]},fluency:{targets:[],unclearIndexes:[],errors:[]}}});

test('typed vocabulary renders a derived score and never injects camera praise or vague correction',()=>{const g=typedVocabulary();c.validateKidsRubricDraft_(g,{kind:'vocabulary',form:['Thuộc từ & nhớ nghĩa','Phát âm, âm đuôi & trọng âm']});c.normalizeKidsGrade_(g);c.validateGrade_(g,['Thuộc từ & nhớ nghĩa','Phát âm, âm đuôi & trọng âm'],1,{kind:'vocabulary'});const body=c.feedbackText_(g);assert.equal(g.band,'100%');assert.ok(!body.includes('2/2'));assert.ok(!/ghi nhớ tốt|camera|cần chú ý phát âm|luyện thêm âm đuôi/iu.test(body));});

test('two phonetic errors on one word remain visible while score deducts one word',()=>{const g=typedVocabulary([{type:'pronunciation',time:'00:03',fileIndex:0,word:'cat',ipa:'/kæt/',observed:'vowel /e/',correction:'Use /æ/.',mechanism:'vowel',expectedFeature:'/æ/',heardFeature:'/e/'},{type:'pronunciation',time:'00:03',fileIndex:0,word:'cat',ipa:'/kæt/',observed:'added /s/',correction:'Do not add /s/.',mechanism:'extra_sound',expectedFeature:'/t/',heardFeature:'/ts/'}]);c.validateKidsRubricDraft_(g,{kind:'vocabulary',form:['Thuộc từ & nhớ nghĩa','Phát âm, âm đuôi & trọng âm']});c.normalizeKidsGrade_(g);assert.equal(g.band,'50%');assert.equal(g.errorGroups.length,0);const text=c.feedbackText_(g);assert.ok(text.includes('vowel /e/')&&text.includes('added /s/'));});



test('model self-certification of camera eye contact cannot override the evidence gate',()=>{const g=typedVocabulary();g.scene.type='student_visible';g.vocabularyAssessment.mode='read_text';g.vocabularyAssessment.englishAnswerVisible=true;g.rubricFindings.s0.strengths=[];g.recordingChecks[0]={...recordingCheck(),recordingMode:'fixed_student',speakerInFrame:'clear',cameraGazeVerifiable:true};g.presentation.observations=[{aspect:'gaze',status:'observed',fileIndex:0,time:'00:05',observation:'Con nhìn thẳng camera.',assessment:'Ánh mắt tốt.',tone:'praise',gazeTarget:'camera',gazeBasis:'Mặt hướng về điện thoại.',phase:'during_task',repetition:'single',supportTimes:['00:05'],posture:'unclear',postureBasis:'Chỉ thấy mặt.'}];c.validateKidsRubricDraft_(g,{kind:'vocabulary',form:['Thuộc từ & nhớ nghĩa','Phát âm, âm đuôi & trọng âm']});c.normalizeKidsGrade_(g);assert.equal(g.recordingChecks[0].cameraGazeVerifiable,false);assert.equal(g.presentation.assessable,false);assert.ok(!c.feedbackText_(g).includes('Ánh mắt tốt.'));assert.equal(g.unverifiedRecordingClaims[0].cameraGazeVerifiable,true);});

test('preposition repair preserves the observed modal and noun phrase; model edit stays auditable',()=>{const g=typedVocabulary();g.evidence=[{type:'grammar',fileIndex:0,time:'00:05',word:'with',ipa:'',observed:'What will you do of a pumpkin?',correction:'What would you do with a pumpkin?',mechanism:'preposition',expectedFeature:'with',heardFeature:'of'}];g.scoreLedger.mode='existing_rubric';g.band='90%';g.grammarReview[0].status='errors_found';c.prepareKidsEvidenceDraft_(g,{kind:'de',form:['Thuộc từ & nhớ nghĩa','Phát âm, âm đuôi & trọng âm']});assert.equal(g.evidence[0].correction,'What will you do with a pumpkin?');assert.equal(g.originalEvidence[0].correction,'What would you do with a pumpkin?');});



test('quantitative score heading retains correct rich-text offsets for late and repeated receipts',()=>{const g=typedVocabulary([{type:'pronunciation',time:'00:03',fileIndex:0,word:'cat',ipa:'/kæt/',observed:'added /s/',correction:'Do not add /s/.',mechanism:'extra_sound',expectedFeature:'/t/',heardFeature:'/ts/'}]);c.validateKidsRubricDraft_(g,{kind:'vocabulary',form:['Thuộc từ & nhớ nghĩa','Phát âm, âm đuôi & trọng âm']});c.normalizeKidsGrade_(g);for(const prefix of ['⚠ ĐÃ NỘP MUỘN','⚠ ĐÃ NỘP 2 LẦN']){const text=prefix+'\n— NHẬN XÉT GV —\n'+c.feedbackText_(g);const ranges=c.feedbackColorRanges_(text,g);assert.ok(ranges.some(r=>r.color==='#C2185B'&&text.slice(r.start,r.end).includes('cat /kæt/')));assert.ok(ranges.some(r=>r.color==='#1B5E20'&&text.slice(r.start,r.end).startsWith('Con gọi tên')));assert.ok(ranges.every(r=>r.end<=text.length));}});

test('wrong presentation recording is blocked before any score; unclear is not accused',()=>{for(const state of ['not_met','unclear']){const g={assessable:false,recordingChecks:[{requirement:'face_presentation',requirementBasis:'Show speaker and supporting images.',compliance:state,basis:'Only a close-up face.'}]};assert.throws(()=>c.prepareKidsEvidenceDraft_(g,{kind:'de',reference:'Quay chính diện. Nói đầy đủ, chính xác những câu đã luyện.'}),state==='not_met'?/GRADE_RECORDING_RESUBMIT/:/GRADE_RECORDING_REVIEW/);}for(const kind of ['reading','screen_voiceover','audio'])assert.doesNotThrow(()=>c.enforceKidsRecordingGate_({recordingChecks:[{requirement:kind,requirementBasis:'Audio task',compliance:'not_met',basis:'No visible face.'}]}));});

test('web-based task gates distinguish reciting exact words from visibly reading prohibited text',()=>{const snapshot={kind:'de',reference:'Con dùng đúng lời đã luyện. Quay chính diện. Không mở phụ đề và không đọc chữ.'};assert.equal(c.kidsTaskContract_(snapshot).exactWording,'expected');assert.throws(()=>c.enforceKidsRecordingGate_({recordingChecks:[{textUseStatus:'visible_reading',textUseBasis:'Visible subtitle and corresponding reading'}]},snapshot),/RESUBMIT/);for(const state of ['visible_prompt','not_determinable'])assert.doesNotThrow(()=>c.enforceKidsRecordingGate_({recordingChecks:[{textUseStatus:state}]},snapshot));});

test('Science K accepts sample language, mindmap keywords are legal and prep-only Critical is not speaking homework',()=>{assert.equal(c.kidsTaskContract_({kind:'scienceK',reference:'Tự thuyết trình theo hình ảnh. Không nhìn phụ đề và không đọc bài đã viết sẵn.'}).exactWording,'accepted');assert.equal(c.kidsTaskContract_({kind:'critical',guide:'Hoàn thiện mindmap; chưa thực hiện bài thuyết trình.'}).mode,'not_assigned');const s={kind:'science',reference:'Tự thuyết trình theo mindmap. Không đọc nguyên bài đã viết sẵn.'};assert.doesNotThrow(()=>c.enforceKidsRecordingGate_({recordingChecks:[{textUseStatus:'visible_prompt',textUseBasis:'Keywords only'}]},s));});

test('read text, translation and dubbing never acquire an independent wording requirement',()=>{for(const kind of ['reading','translation','phonics']){const s={kind,reference:'Con đọc theo mẫu và bật quay màn hình.'};assert.equal(c.kidsTaskContract_(s).fullTextReading,'allowed');assert.doesNotThrow(()=>c.enforceKidsRecordingGate_({recordingChecks:[{textUseStatus:'visible_reading',textUseBasis:'Reads book'}]},s));}for(const kind of ['peppa','phonicsVideo'])assert.equal(c.kidsTaskContract_({kind,reference:'Con lồng tiếng, nói thay nhân vật.'}).mode,'dubbing');});



const web=vm.createContext({Utilities:utilities(),Date,FLEET_CLUSTER:{classes:[{className:'KIDS 21'}]}});

for(const f of ['Config','Sources','Fleet','FleetReference','TaskContract'])vm.runInContext(fs.readFileSync(path.join(root,'gas',f+'.gs'),'utf8'),web);

test('retired D3 D4 textbooks never enter homework scope while D1 D2 and DE remain eligible',()=>{

 for(const code of ['D3-Tiết 46-Ngữ pháp','D4-Tiết 12-Từ vựng'])assert.equal(web.inAutoScope_({code,className:'KIDS 21',time:'2026-10-11'}),false);

 for(const code of ['D1-Tiết 46-Ngữ pháp','D2-Tiết 12-Từ vựng','DE-28','OP4-L01'])assert.equal(web.inAutoScope_({code,className:'KIDS 21',time:'2026-10-11'}),true);

});

test('retirement clears only unreturned textbook jobs and never changes completed feedback or uncertain generation',()=>{

 const rows=['WAITING_INPUT','NEEDS_REVIEW','RETURNED','SKIPPED_EXISTING_FEEDBACK','SKIPPED_OLD_SUBMISSION','GENERATING'].map((status,i)=>({row:i+2,job:{receipt:{code:'D3-Tiết 04-Ngữ pháp'},status,nextAt:999}}));rows.push({row:8,job:{receipt:{code:'DE-28'},status:'READY'}});

 const writes=[];web.loadJobs_=()=>rows;web.persist_=(j,r)=>writes.push(r);assert.equal(web.retireTextbookHomeworkJobs_(),2);assert.deepEqual(writes,[2,3]);assert.equal(rows[0].job.nextAt,0);assert.equal(rows[5].job.status,'GENERATING');assert.equal(rows[6].job.status,'READY');assert.equal(web.retireTextbookHomeworkJobs_(),0);

});

test('nested static template guidance retains the written-paragraph restriction without executing scripts',()=>{

 const js='globalThis.executed = true; const html = `<section>${x ? `<p>Chuẩn bị mindmap</p>` : ""}<p>Không đọc nguyên bài đã viết sẵn.</p><p>Tự thuyết trình theo mindmap.</p><p>Video 2 Trả lời câu hỏi</p><p>Quay chính diện.</p></section>`;';

 const t=web.staticGuidanceText_(js),contract=web.kidsTaskContract_({kind:'science',reference:t});assert.ok(t.includes('Không đọc nguyên bài đã viết sẵn.'));assert.equal(contract.mode,'mindmap_qa');assert.equal(contract.fullTextReading,'prohibited');assert.equal(web.executed,undefined);

});

test('inline word data preserves teaching content while stripping embedded media',()=>{

 const items=[{word:'bread [x] "quoted"',initial:'b',image:'data:image/png;base64,abc',extra:{audio:'data:audio/mp3;base64,abc',meaning:'bánh mì'}}];

 const parsed=web.referenceItems_('const items = '+JSON.stringify(items)+'; unsafe();');const safe=web.referenceDataOnly_(parsed);assert.equal(safe[0].word,items[0].word);assert.equal(safe[0].extra.meaning,'bánh mì');assert.ok(!JSON.stringify(safe).includes('data:'));assert.throws(()=>web.referenceItems_('const items = [{word: execute()}];'),/REFERENCE_WORD_LIST_INVALID/);

});

test('Family submission UI requires a visible picture, initial-letter element and data binding',()=>{

 const good='<title>Trả bài: school things</title><img id="art"><p id="initial"></p><script>initial.innerHTML = `${item.initial}`;</script>';

 assert.ok(web.pictureReviewDescription_(good).includes('không hiện đáp án đầy đủ'));assert.equal(web.pictureReviewDescription_(good.replace('initial.innerHTML','answer.innerHTML')),'');assert.equal(web.pictureReviewDescription_(good.replace('Trả bài:','Học từ:')),'');

});

test('reading and translation parent guidance cannot inherit presentation or mindmap instructions',()=>{

 for(const kind of ['reading','translation','phonics']){const t=web.kidsTaskContract_({kind,reference:'Đọc toàn bộ bài trên màn hình.'});assert.ok(!/mindmap|chính diện|học thuộc/iu.test(t.parentGuidance));}

 const unknown=web.kidsTaskContract_({kind:'critical',reference:'Ôn tập trên giấy.'});assert.equal(unknown.mode,'unknown');assert.ok(!unknown.parentGuidance.includes('mindmap'));

});

test('per-task focus keeps reading, translation, dubbing, word naming and grammar criteria distinct',()=>{

 const samples=[['vocabulary','Nhìn ảnh và tự nói từ','gọi đúng tên khác với phát âm đúng'],['grammar','Nhìn gợi ý và tự nói','chia động từ'],['translation','Đọc toàn bộ bài','dịch tiếng Việt'],['peppa','Lồng tiếng theo mẫu','giọng mẫu không chứng minh'],['phonics','Đọc theo mẫu','âm đang học'],['de','Dùng đúng lời đã luyện','Nói giống lời mẫu là đúng yêu cầu']];

 for(const [kind,reference,expected] of samples)assert.ok(web.kidsTaskContractInstruction_({kind,reference}).includes(expected));

});

test('Phonics book reading and Phonics Video dubbing keep distinct task and reference routes',()=>{

 const book=web.assignmentIdentity_('OP4-L01'),video=web.assignmentIdentity_('PHONICS-VIDEO-01');assert.equal(book.guideTab,'Phonics');assert.equal(video.guideTab,'Phonics Video');assert.equal(book.practice,false);assert.equal(video.practice,true);

 const reading=web.kidsTaskContract_({kind:'phonics',guide:'Luyện đọc theo file PDF; video quay màn hình.'}),dubbing=web.kidsTaskContract_({kind:'phonicsVideo',guide:'Luyện âm, lồng tiếng với bản tách giọng.'});assert.equal(reading.mode,'read_text');assert.equal(dubbing.mode,'dubbing');assert.equal(reading.fullTextReading,'allowed');assert.ok(!/mindmap|quay chính diện/.test(reading.parentGuidance+dubbing.parentGuidance));

 assert.notEqual(mediaDecision('phonics').reason,mediaDecision('phonicsVideo').reason);

});

test('lesson Phonics recognizes assigned PDF reading even with extracted audio',()=>{

 const snapshot={kind:'phonics',phonicsFrameCount:1,form:['Thuộc mặt chữ'],guide:'Luyện đọc theo file PDF.'};

 for(const scene of ['audio_only','screen']){

  const g=typedVocabulary();g.phonicsPdfAssessment={status:'matched',observedText:'cat dog',basis:'Assigned PDF words visible.'};g.scene.type=scene;g.recordingChecks[0].recordingMode=scene==='audio_only'?'audio_only':'screen_book';g.rubricFindings={s0:{label:'Thuộc mặt chữ',strengths:[]}};

  c.prepareKidsEvidenceDraft_(g,snapshot);assert.ok(g.sections[0].text.includes('đọc được các từ trên PDF'));assert.equal(g.sections[0].spans[0].tone,'praise');assert.equal(g.band,'100%');

 }

 const observed=typedVocabulary();observed.phonicsPdfAssessment={status:'matched',observedText:'cat dog',basis:'Assigned PDF words visible.'};observed.scene.type='audio_only';observed.recordingChecks[0].recordingMode='audio_only';observed.rubricFindings={s0:{label:'Thuộc mặt chữ',strengths:[{skill:'letter_recognition',fileIndex:0,time:'00:01',basis:'Reads the assigned PDF words.'}]}};

 c.prepareKidsEvidenceDraft_(observed,snapshot);assert.ok(observed.sections[0].text.includes('nhận diện'));assert.equal(observed.band,'100%');

 const unconfirmed=typedVocabulary();unconfirmed.rubricFindings={s0:{label:'Thuộc mặt chữ',strengths:[]}};unconfirmed.scoreLedger.units.targets=[];unconfirmed.scoreLedger.complete=false;

 assert.equal(c.kidsPhonicsPdfRecognitionSpan_(unconfirmed,snapshot).tone,'neutral');

 const allErrors=typedVocabulary();allErrors.scoreLedger.units.errors=[{unitIndex:0,evidenceIndexes:[0]},{unitIndex:1,evidenceIndexes:[1]}];assert.equal(c.kidsPhonicsPdfRecognitionSpan_(allErrors,snapshot).tone,'neutral');

 const unrelated=typedVocabulary();unrelated.scene.type='audio_only';unrelated.recordingChecks[0].recordingMode='audio_only';unrelated.rubricFindings={s0:{label:'Thuộc mặt chữ',strengths:[{skill:'letter_recognition',fileIndex:0,time:'00:01',basis:'Audio only.'}]}};

 assert.throws(()=>c.prepareKidsEvidenceDraft_(unrelated,{...snapshot,kind:'phonicsVideo'}),/GRADE_STRENGTH_LETTER_UNPROVEN/);

 assert.ok(c.kidsEvidenceSystemInstruction_().includes('không đòi che chữ'));

 const withoutImage=typedVocabulary();assert.equal(c.kidsPhonicsPdfRecognitionSpan_(withoutImage,snapshot).tone,'neutral');

 assert.throws(()=>c.prepareKidsEvidenceDraft_({...typedVocabulary(),phonicsPdfAssessment:{status:'mismatch'}},snapshot),/GRADE_PHONICS_DOCUMENT_MISMATCH/);

});

test('Phonics reference loader accepts the actual File hinh luyen doc title and excludes parent tutorials',()=>{

 const frames=[['coach','Cô hướng dẫn Phonics Lesson 01'],['aa','Luyện âm Aa'],['bb','Luyện âm Bb'],['pdf','File hình luyện đọc Lesson 01'],['parents','Cô hướng dẫn bố mẹ đồng hành cùng con']].map(([id,title])=>({id,tag:'<iframe title="'+title+'">'}));

 assert.deepEqual([...web.phonicsReferenceFrames_(frames)],['pdf','aa','bb']);assert.throws(()=>web.phonicsReferenceFrames_([...frames,{id:'other',tag:'<iframe title="File luyện đọc khác">'}]),/REFERENCE_READING_PDF_MISSING/);assert.throws(()=>web.phonicsReferenceFrames_(frames.filter(x=>['pdf','coach','parents'].includes(x.id))),/REFERENCE_PHONICS_SOUND_MODEL_MISSING/);

 assert.deepEqual([...web.phonicsReferenceFrames_(frames.map(x=>({...x,tag:x.tag.replace('Luyện âm','Video luyện âm')})))],['pdf','aa','bb']);

});

test('dubbing comparison uses the spoken original, never the muted practice track',()=>{

 const lesson={videos:['originalSpokenFile00000001','mutedPracticeFile00000002','recordingDemoFile00000003']};for(const kind of ['peppa','phonicsVideo'])assert.equal(web.dubbingReferenceMedia_(kind,lesson),lesson.videos[0]);assert.throws(()=>web.dubbingReferenceMedia_('phonics',lesson),/REFERENCE_DUBBING_TYPE_UNKNOWN/);assert.throws(()=>web.dubbingReferenceMedia_('phonicsVideo',{videos:['bad']}),/REFERENCE_VIDEO_MISSING/);

});

test('source loader repair is restricted to unpaid known source failures and runs once',()=>{

 const job={autoManaged:true,status:'NEEDS_REVIEW',route:{kind:'phonics'},error:'REFERENCE_READING_PDF_MISSING'};assert.equal(canRepairTaskReference(job),true);

 for(const changes of [{status:'RETURNED'},{status:'GENERATING'},{rawId:'saved'},{gradeId:'grade'},{generateRequests:1},{runnerGenerationStarted:true},{manualReviewRequired:true},{referenceRepair:{version:'web-reference-v14'}},{error:'STUDENT_AMBIGUOUS'},{error:'UNCERTAIN_GENERATION'}])assert.equal(canRepairTaskReference({...job,...changes}),false);

});





test('model routing uses verified task requirements and retains Flash for complex or unknown work',()=>{

 const original=c.configuredModel_;c.configuredModel_=()=> 'gemini-3.8-flash';

 try{

 for(const [kind,guide]of [['vocabulary','Nhìn ảnh và tự nói từ'],['phonics','Đọc toàn bộ file học'],['reading','Đọc to bài đã giao'],['phonicsVideo','Lồng tiếng theo mẫu']])assert.equal(c.kidsTaskModel_({kind,guide}).model,'gemini-3.8-flash');

 for(const [kind,guide]of [['de','Nhắc lại đầy đủ và chính xác câu mẫu'],['scienceK','Thuyết trình theo hình ảnh'],['science','Thuyết trình theo mindmap'],['critical','Dùng mindmap để thuyết trình'],['peppa','Lồng tiếng theo mẫu'],['grammar','Nhìn gợi ý và tự nói'],['translation','Đọc toàn bộ và dịch nghĩa'],['vocabulary',''],['vocabulary','Nhìn ảnh và tự nói từ; đặt câu'],['phonics','Đọc toàn bộ. Camera phải quay chính diện']])assert.equal(c.kidsTaskModel_({kind,guide}).model,'gemini-3.8-flash');

 assert.equal(c.kidsGenerationConfig_('gemini-3.5-flash-lite').thinkingConfig.thinkingLevel,'minimal');

 }finally{c.configuredModel_=original;}

});

test('integer score rounding happens after weighted arithmetic and weights never reach pupils',()=>{

 const l=scoreLedger('weighted',[scoreUnit('a'),scoreUnit('b'),scoreUnit('c','incorrect',[0])]);l.prosody=[scoreUnit('phrase')];l.fluency=[scoreUnit('phrase')];

 const e=[{type:'pronunciation',word:'c',observed:'wrong sound',correction:'repair sound'}],r=c.quantScore_(l,e,'weighted');

 assert.equal(r.percent,83);assert.ok(r.unroundedPercent>83&&r.unroundedPercent<84);

 const text=c.feedbackHeading_({band:r.percent+'%',scoreCalculation:r});assert.ok(text.includes('83%'));assert.ok(!/50%|25%|Tính điểm|2\/3/.test(text));

 assert.throws(()=>c.quantScore_({...l,units:[scoreUnit('whole phrase')]},[], 'weighted'),/WORD_UNIT_REQUIRED/);

});

test('routing cannot touch a generated or saved result and project switching uses existing media binding',()=>{

 for(const job of [{rawId:'raw'},{gradeId:'grade'},{status:'GENERATING'}])assert.equal(c.applyKidsTaskModel_(job),undefined);

 const names=['readArtifact_','configuredModel_','keys_','hash_','poolModelCooldownUntil_','bindPoolJob_'];const old=Object.fromEntries(names.map(n=>[n,c[n]]));

 try{

 c.readArtifact_=()=>({kind:'phonics',guide:'Đọc toàn bộ file'});c.configuredModel_=()=> 'gemini-3.8-flash';c.keys_=()=>['free','paid'];c.hash_=x=>x;c.poolModelCooldownUntil_=(m,k)=>k==='free'?Date.now()+60000:0;

 let binding;c.bindPoolJob_=(job,b)=>{binding=b;job.keyHash=b.keyHash;job.generationModel=b.model;};

 const job={snapshotId:'snap',keyHash:'free',model:'gemini-3.8-flash'};c.applyKidsTaskModel_(job);assert.equal(binding.keyHash,'paid');assert.equal(binding.model,'gemini-3.8-flash');assert.equal(job.modelRouting.version,'all-flash-3.8-v2');

 }finally{Object.assign(c,old);}

});



console.log(JSON.stringify({checks,apiCalls:0,passed:true}));







test('student comments omit internal diagnostics across every rubric while preserving corrections and raw checks',()=>{

 for(const label of [...new Set(Object.values(vm.runInContext('FORMS',c)).flat())]){

  const g={assessable:true,band:'80%',sections:[{label,text:'Con nói rõ. Rà ngữ pháp tệp 1: Chưa đủ căn cứ. Con nói he go → he goes.',spans:[{text:'Con nói rõ. ',tone:'praise'},{text:'Rà ngữ pháp tệp 1: Chưa đủ căn cứ. ',tone:'neutral'},{text:'Con nói he go → he goes.',tone:'correction'}]}],uncertainty:[{reason:'Private detail'}]};

  const saved=JSON.stringify(g),text=c.feedbackText_(g);assert.ok(!/Rà ngữ pháp|căn cứ/.test(text));assert.ok(text.includes('he go → he goes'));assert.equal(JSON.stringify(g),saved);

 }

});

test('duplicate praise is removed without hiding errors or creating replacement praise',()=>{

 const s={label:'Phát âm',text:'Con nói rõ. Con nói rõ. cat /kæt/: /e/ → /æ/',spans:[{text:'Con nói rõ. ',tone:'praise'},{text:'Con nói rõ. ',tone:'praise'},{text:'cat /kæt/: /e/ → /æ/',tone:'correction'}]};

 const out=c.kidsStudentLanguageSection_(s);assert.equal(out.text.split('Con nói rõ.').length-1,1);assert.ok(out.text.includes('cat /kæt/: /e/ → /æ/'));assert.ok(c.validToneSpans_(out));

 const neutral={label:'Phong thái & trình bày',text:'Chưa đủ căn cứ quan sát.',spans:[{text:'Chưa đủ căn cứ quan sát.',tone:'neutral'}]};assert.equal(c.kidsSheetDisplaySections_({sections:[neutral]}).length,0);

});

console.log('Student-friendly language regression checks passed.');

test('same missing-be advice is grouped once and keeps both he/she corrections and the praise',()=>{

 const evidence=[{type:'grammar',observed:'he a pilot',correction:"He's a pilot.",mechanism:'missing_be'},{type:'grammar',observed:'she a doctor',correction:"She's a doctor.",mechanism:'missing_be'}];

 const g={band:'50%',grammarReview:[],evidence,errorGroups:evidence.map((e,i)=>({type:'grammar',label:'Missing be',guidance:e.correction,evidenceIndexes:[i]})),sections:[{label:'Ngữ pháp',text:'Con đã biết dùng mẫu câu đang học.',spans:[{text:'Con đã biết dùng mẫu câu đang học.',tone:'praise'}]}]};

 const before=JSON.stringify(g),t=c.feedbackText_(g);assert.equal(t.split('nhớ thêm động từ to be').length-1,1);assert.ok(t.includes("he a pilot → He's a pilot")&&t.includes("she a doctor → She's a doctor"));assert.match(t,/Con đã biết dùng mẫu câu đang học\.\s+Ngữ pháp: Con nhớ thêm động từ to be/);assert.equal(JSON.stringify(g),before);

});



test('every feedback heading keeps approximately and hides quantitative counters',()=>{for(const q of [undefined,{percent:80,correct:8,total:10}]){const text=c.feedbackHeading_({band:'80%',scoreCalculation:q});assert.equal(text,'Chất lượng: đạt khoảng 80%.\n');assert.ok(!text.includes('mục tiêu'));}});

test('pronunciation wording connects strengths to real corrections without losing IPA or observed sound',()=>{const g=typedVocabulary([{type:'pronunciation',time:'00:03',fileIndex:0,word:'cat',ipa:'/kæt/',observed:'vowel /e/',correction:'Use /æ/.',mechanism:'vowel',expectedFeature:'/æ/',heardFeature:'/e/'}]);c.validateKidsRubricDraft_(g,{kind:'vocabulary',form:['Thuộc từ & nhớ nghĩa','Phát âm, âm đuôi & trọng âm']});c.normalizeKidsGrade_(g);const before=JSON.stringify(g),text=c.feedbackText_(g);assert.ok(text.includes('cat /kæt/: Con đọc thành vowel /e/. Con sửa lại: Use /æ/.'));assert.equal(JSON.stringify(g),before);});

test('identical heard and correction cannot become a meaningless arrow',()=>{const t=c.kidsPronunciationSentence_({word:'pilot',ipa:'/ˈpaɪlət/',observed:'pælət',correction:'pælət'});assert.ok(t.includes('pælət')&&t.includes('/ˈpaɪlət/'));assert.ok(!t.includes('pælət → pælət'));});

console.log('Connected wording and unchanged grading checks passed.');

test('phonetic correction differing only by stress uses the recorded contrast and standard IPA',()=>{

 const e={word:'pilot',ipa:'/ˈpaɪlət/',observed:'pælət',correction:'ˈpælət',expectedFeature:'/aɪ/',heardFeature:'/æ/'};

 const original=JSON.stringify(e),text=c.kidsPronunciationSentence_(e);

 assert.ok(text.includes('Con đổi âm /æ/ thành /aɪ/'));assert.ok(!text.includes('Con sửa lại: ˈpælət'));assert.equal(JSON.stringify(e),original);

});



test('Phonics sends one context image with the same audio call, never regenerates saved work',()=>{

 assert.equal(mediaDecision('phonics').mode,'audio_frame');assert.equal(mediaDecision('phonicsVideo').mode,'audio');

 const job={route:{kind:'phonics'},media:[{mime:'video/mp4',runnerPdfFrame:{path:'frame.jpg',timeSeconds:3}}]};

 const parts=phonicsFrameParts(job,{read:()=>Buffer.from('test'),exists:()=>true});assert.equal(parts.length,2);assert.equal(parts[1].inlineData.mimeType,'image/jpeg');assert.ok(parts[0].text.includes('cùng tệp âm thanh'));

 assert.deepEqual(phonicsFrameParts({...job,rawId:'saved'}),[]);assert.deepEqual(phonicsFrameParts({...job,gradeId:'saved'}),[]);

 assert.throws(()=>phonicsFrameParts({...job,media:[{mime:'video/mp4'}]}),/FRAME_UNAVAILABLE/);

});


test('exact unique word link recovery preserves all pronunciation findings',()=>{const e=[{type:'pronunciation',word:'cat',observed:'ca',correction:'cat'}],l={mode:'words',complete:true,sourceBasis:'test',units:{targets:['cat','dog'],unclearIndexes:[],errors:[{unitIndex:1,evidenceIndexes:[0]}]}};const before=JSON.stringify(e);c.normalizeKidsUniqueWordLinks_(l,e);assert.equal(l.units.errors[0].unitIndex,0);assert.equal(c.quantScore_(l,e,'words').percent,50);assert.equal(JSON.stringify(e),before);});
test('repeated target words remain ambiguous and are never reassigned',()=>{const e=[{type:'pronunciation',word:'cat',observed:'ca',correction:'cat'}],l={mode:'words',complete:true,sourceBasis:'test',units:{targets:['cat','cat','dog'],unclearIndexes:[],errors:[{unitIndex:2,evidenceIndexes:[0]}]}};c.normalizeKidsUniqueWordLinks_(l,e);assert.equal(l.units.errors[0].unitIndex,2);assert.throws(()=>c.quantScore_(l,e,'words'),/WORD_MISMATCH/);});
test('content evidence is not reassigned by a pronunciation link repair',()=>{const l={mode:'words',units:{targets:['cat','dog'],errors:[{unitIndex:1,evidenceIndexes:[0]}]}};c.normalizeKidsUniqueWordLinks_(l,[{type:'content',word:'cat',observed:'missing',correction:'cat'}]);assert.equal(l.units.errors[0].unitIndex,1);});
test('weighted occurrence ledgers do not use unique word link recovery',()=>{const l={mode:'weighted',units:{targets:['cat','dog'],errors:[{unitIndex:1,evidenceIndexes:[0]}]}};c.normalizeKidsUniqueWordLinks_(l,[{type:'pronunciation',word:'cat',observed:'ca',correction:'cat'}]);assert.equal(l.units.errors[0].unitIndex,1);});

const invalidSubmissionFixture=()=>({assessable:false,band:'',rubricBand:'',uncertainty:[],contentSourceLimitation:'',recordingChecks:[{}],submissionCheck:{status:'invalid',category:'wrong_assignment',assignedCode:'PEPPA-12',assignedTask:'Picnic',observedTask:'Flying a Kite',fileIndex:0,time:'00:02',basis:'The submitted speech concerns flying a kite; the assigned source concerns a picnic.',reason:'Con nộp Flying a Kite thay vì Picnic. Con nộp lại đúng bài Picnic nhé.'}});
const submissionSource={kind:'peppa',reference:'Picnic transcript',barem:{code:'PEPPA-12'}};
test('confirmed wrong assignment yields a reasoned resubmission issue before grading',()=>{assert.throws(()=>c.validateKidsRubricDraft_(invalidSubmissionFixture(),submissionSource),e=>e.message==='GRADE_SUBMISSION_RESUBMIT'&&e.recordingIssue.status==='NEEDS_RESUBMISSION'&&e.recordingIssue.noticeReason.includes('Picnic'));});
test('unclear or missing task evidence is never published as an accusation',()=>{const g=invalidSubmissionFixture();g.uncertainty=['Not clear'];assert.throws(()=>c.enforceKidsSubmissionGate_(g,submissionSource),/SUBMISSION_UNCERTAIN/);g.uncertainty=[];g.submissionCheck.basis='';assert.throws(()=>c.enforceKidsSubmissionGate_(g,submissionSource),/SUBMISSION_EVIDENCE_MISSING/);g.submissionCheck.status='unclear';assert.doesNotThrow(()=>c.enforceKidsSubmissionGate_(g,submissionSource));});
test('wrong task notice requires the actual assigned code and reference',()=>{const g=invalidSubmissionFixture();g.submissionCheck.assignedCode='PEPPA-11';assert.throws(()=>c.enforceKidsSubmissionGate_(g,submissionSource),/SOURCE_MISMATCH/);g.submissionCheck.assignedCode='PEPPA-12';assert.throws(()=>c.enforceKidsSubmissionGate_(g,{...submissionSource,reference:''}),/SUBMISSION_UNCERTAIN/);});
const manualVm=vm.createContext({Date,Utilities:utilities()});for(const f of ['Config','Sources','Engine'])vm.runInContext(fs.readFileSync(path.join(root,'gas/'+f+'.gs'),'utf8'),manualVm);
test('wrong assignment notice explains the task instead of giving unrelated camera advice',()=>{const message=manualVm.kidsResubmissionMessage_({noticeReason:'Con nộp Flying a Kite thay vì Picnic.'},false,'');assert.ok(message.startsWith('⚠ CẦN NỘP LẠI\n'));assert.ok(message.includes('Flying a Kite'));assert.ok(!message.includes('camera'));assert.ok(!/\d+%/.test(message));assert.equal(manualVm.hasFeedback_('— NHẬN XÉT GV —\n'+message),false);});
test('a newer resubmission for the same assignment stays with the teacher',()=>{const receipt={student:'TEST',className:'KIDS 1',code:'PEPPA-12',time:'2026-10-13T00:00:00Z'},held={job:{id:'old',manualReviewRequired:true,receipt}};assert.equal(manualVm.kidsManualAssignmentHold_({receipt:{...receipt,time:'2026-10-14T00:00:00Z'}},[held]),held);assert.equal(manualVm.kidsManualAssignmentHold_({receipt:{...receipt,code:'PEPPA-13'}},[held]),undefined);assert.equal(manualVm.kidsManualAssignmentHold_({receipt:{...receipt,student:'OTHER'}},[held]),undefined);});
test('resubmission outcome is terminal and contains no retry schedule',()=>{let saved=0,notices=0;manualVm.persist_=()=>saved++;manualVm.audit_=()=>{};manualVm.writeRecordingNotice_=()=>notices++;const j={id:'test',nextAt:999};manualVm.handleKidsRecordingIssue_(j,2,{message:'GRADE_SUBMISSION_RESUBMIT',recordingIssue:{status:'NEEDS_RESUBMISSION',reason:'Wrong task'}});assert.equal(j.status,'NEEDS_RESUBMISSION');assert.equal(j.manualReviewRequired,false);assert.equal(j.manualAssignmentGrading,false);assert.equal(j.nextAt,0);assert.equal(notices,1);assert.equal(saved,2);});
test('manual assignment routing never reads media or calls Gemini',()=>{const receipt={student:'TEST',className:'KIDS 1',code:'PEPPA-12'},j={id:'new',receipt,nextAt:999};manualVm.loadJobs_=()=>[{job:{id:'old',receipt,manualReviewRequired:true}}];manualVm.persist_=()=>{};manualVm.generate_=()=>{throw Error('UNEXPECTED_PROVIDER_CALL');};manualVm.destination_=()=>{throw Error('UNEXPECTED_TRACKER_WRITE');};manualVm.step_(j,2,Date.now()+60000);assert.equal(j.status,'NEEDS_REVIEW');assert.equal(j.error,'GRADE_MANUAL_RESUBMISSION');assert.equal(j.manualReviewFrom,'old');assert.equal(j.nextAt,0);});
test('new model schema and prompt provide explicit assignment identity',()=>{assert.ok(c.kidsEvidenceSchema_(['Phát âm']).required.includes('submissionCheck'));assert.ok(c.kidsEvidencePrompt_({...submissionSource,form:['Phát âm'],guide:'Assigned task'}).includes('submissionCheck.assignedCode: PEPPA-12'));});

test('picture naming remains valid when student and picture appear together',()=>{
 const g=typedVocabulary();g.scene.type='student_visible';g.scene.description='Child beside the picture exercise';c.prepareKidsEvidenceDraft_(g,{kind:'vocabulary',form:['Thuộc từ & nhớ nghĩa','Phát âm, âm đuôi & trọng âm'],guide:'',reference:''});assert(g.sections[0].text.includes('gọi tên'));
 const audio=typedVocabulary();audio.scene.type='audio_only';assert.throws(()=>c.prepareKidsEvidenceDraft_(audio,{kind:'vocabulary',form:['Thuộc từ & nhớ nghĩa','Phát âm, âm đuôi & trọng âm'],guide:'',reference:''}),/GRADE_STRENGTH_PICTURE_UNPROVEN/);
});

test('a negated camera comparison does not contradict reference gaze',()=>{const g=recordingGrade(),o=g.presentation.observations[0];g.recordingChecks[0].speakerInFrame='clear';o.gazeTarget='reference';o.gazeBasis='Eyes follow the adjacent display.';o.observation='Con nhìn màn hình thay vì nhìn thẳng vào ống kính máy quay.';o.tone='neutral';c.normalizeKidsGrade_(g);assert.doesNotThrow(()=>c.validateKidsRecording_(g,1));o.observation='Con nhìn thẳng vào ống kính máy quay.';assert.throws(()=>c.validateKidsRecording_(g,1),/GAZE_TARGET_CONTRADICTION/);});
test('missing item with no quoted speech drops only its placeholder location',()=>{const x={...reviewCheck(1),status:'missing',heard:'',fileIndex:0,time:'00:00'},g={contentChecks:[x],contentSourceLimitation:'',uncertainty:[]};c.validateKidsReview_(g,2);assert.equal(x.status,'missing');assert.equal(x.fileIndex,-1);assert.equal(x.time,'');assert.equal(g.missingLocationAudit[0].time,'00:00');const contradictory={...reviewCheck(1),status:'missing'};assert.throws(()=>c.validateKidsReview_({...g,contentChecks:[contradictory]},2),/GRADE_CONTENT_MISSING_WITH_OBSERVATION/);});
test('bare IPA delimiters are restored only from the exact supplied correction',()=>{const make=correction=>typedVocabulary([{type:'pronunciation',time:'00:03',fileIndex:0,word:'cat',ipa:'kæt',observed:'vowel /e/',correction,mechanism:'vowel',expectedFeature:'/æ/',heardFeature:'/e/'}]),snapshot={kind:'vocabulary',form:['Thuộc từ & nhớ nghĩa','Phát âm, âm đuôi & trọng âm']},g=make('Read cat /kæt/.');c.validateKidsRubricDraft_(g,snapshot);c.normalizeKidsGrade_(g);pronunciationEvidence(g);assert.equal(g.evidence[0].ipa,'/kæt/');assert.equal(g.originalEvidence[0].ipa,'kæt');const bad=make('Use the target vowel.');c.validateKidsRubricDraft_(bad,snapshot);c.normalizeKidsGrade_(bad);assert.throws(()=>pronunciationEvidence(bad),/IPA_REQUIRED/);});
test('an unlocked partial video survives cache pressure between download slices',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grader-cache-'));try{const cache=new MediaCache(dir,{limitBytes:10,reserveBytes:0,freeBytes:()=>1000}),lock=path.join(dir,'locks','partial.lock');cache.register('partial',lock);fs.writeFileSync(path.join(dir,'partial.original.part'),Buffer.alloc(20));cache.sweep(8);assert.equal(fs.statSync(path.join(dir,'partial.original.part')).size,20);}finally{if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('TEST_CLEANUP_PATH');fs.rmSync(dir,{recursive:true,force:true});}});
const {nextDrainWait}=await import('./runner-policies.mjs');
test('drain retains its download cache across a short media retry delay',()=>{assert.equal(nextDrainWait([{status:'WAITING_MEDIA',nextAt:16000}],1000,300000),15050);assert.equal(nextDrainWait([{status:'RETURNED',nextAt:16000}],1000,300000),0);assert.equal(nextDrainWait([{status:'WAITING_MEDIA',nextAt:100000}],1000,300000),0);assert.equal(nextDrainWait([{status:'WAITING_MEDIA',nextAt:16000}],1000,100000),0);});
