import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {stampedColumn,prepareStampedRoute,reviewedAtMinute,installStampedDestination,ALREADY_REVIEWED,STAMP_DESTINATION} from './lesson-stamp-destination.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),source=fs.readFileSync(path.join(root,'gas/Fleet.gs'),'utf8');
const pick=name=>{const at=source.indexOf('function '+name+'(');assert(at>=0,name);return source.slice(at,source.indexOf('\nfunction ',at+1));};
const norm=fs.readFileSync(path.join(root,'gas/Config.gs'),'utf8').split('\n').find(line=>line.startsWith('function norm_'));
const c=vm.createContext({});vm.runInContext([norm,'function require_(ok,m){if(!ok)throw Error(m);}',...['assignmentIdentity_','sectionKind_','bookMatches_','practiceMatches_','fleetHeaders_','autoColumns_'].map(pick)].join('\n'),c);
installStampedDestination(c);
const name='Synthetic Pupil',at='2026-10-25T15:51:20.000Z',stamp='✅ ĐÃ NỘP\n25/10/2026 22:51\n\n— NHẬN XÉT GV —';
const lessonHeaders=[['','','','','Buổi học 20/08/2026','Buổi học 20/08/2026'],['','','','','Lớp đã hoàn thành: Sách Discover 2\nTiết học số 21','Lớp đã hoàn thành: Sách Discover 2\nTiết học số 21'],['','','','','Nhận xét Bài tập về nhà dạng video','Nhận xét Bài tập về nhà dạng video'],['','','HỌ TÊN HỌC VIÊN','','Nhìn ảnh, nhớ từ','Ghép chữ thành câu']];
const sheet=(cells,headers=lessonHeaders)=>({headers,values:[...headers,['1','',name,'',...cells]],formulas:[]});
const grammar={code:'D2-Tiết 21-Ngữ pháp',kind:'grammar'};
c.autoTarget_=(s,route,student)=>({row:5,column:c.autoColumns_(s.headers,route),value:''});
// The matcher sees two untyped columns; the exact-minute stamp names one of them.
const twin=sheet(['✅ ĐÃ NỘP\n24/10/2026 09:00\n\n— NHẬN XÉT GV —',stamp]);
assert.throws(()=>c.autoColumns_(twin.headers,grammar),/DESTINATION_AMBIGUOUS/);
const bound=stampedColumn(c,twin,grammar,{student:name,time:at});assert.equal(bound.version,STAMP_DESTINATION);
assert.equal(c.autoColumns_(twin.headers,{...grammar,stampedDestination:bound}),6);
// New lesson columns push everything right; the binding follows the header, not the address.
const shifted=twin.headers.map(row=>['','',...row]);assert.equal(c.autoColumns_(shifted,{...grammar,stampedDestination:bound}),8);
// A teacher renaming the header cancels the binding instead of writing somewhere new.
const renamed=twin.headers.map(row=>[...row]);renamed[2][5]='Nhận xét video đã đổi tên';assert.throws(()=>c.autoColumns_(renamed,{...grammar,stampedDestination:bound}),/DESTINATION_AMBIGUOUS/);
// No stamp for this exact minute, or a stamp in both candidates: nothing binds.
assert.equal(stampedColumn(c,sheet([stamp.replace('22:51','22:50'),'']),grammar,{student:name,time:at}),null);
assert.equal(stampedColumn(c,sheet([stamp,stamp]),grammar,{student:name,time:at}),null);
// Feedback already present is never the destination of a stamp.
assert.equal(stampedColumn(c,sheet(['',stamp+'\nChất lượng: đạt 85%.']),grammar,{student:name,time:at}),ALREADY_REVIEWED);
assert(reviewedAtMinute(sheet(['',stamp+'\nChất lượng: đạt 85%.']),{student:name,time:at}));assert(!reviewedAtMinute(twin,{student:name,time:at}));
// A column that names a different task is refused; reading and read-translate are the same task.
const typedHeaders=lessonHeaders.map(row=>[...row]);typedHeaders[3][4]='Từ mới Unit 1';typedHeaders[3][5]='Đọc Unit 1';
assert.equal(stampedColumn(c,sheet([stamp,'',],typedHeaders),{code:'D2-Tiết 21',kind:'grammar'},{student:name,time:at}),null);
assert(stampedColumn(c,sheet(['',stamp],typedHeaders),{code:'D2-Tiết 21',kind:'translation'},{student:name,time:at})?.fingerprint);
// One review per video: a stamp beside an existing review must never buy a second assessment.
const videoHeaders=[['','','','','CHUỖI VIDEO TỰ LUYỆN','CHUỖI VIDEO TỰ LUYỆN'],['','','','','PHONICS TỰ LUYỆN','PHONICS TỰ LUYỆN'],['','','','','Video 8','Video 8'],['','','HỌ TÊN HỌC VIÊN','','Tiêu chí','Tiêu chí']];
const video={code:'Phonics-Video-08',kind:'phonicsVideo'};
assert.equal(stampedColumn(c,sheet([stamp,'✅ ĐÃ NỘP\n25/10/2026 22:51\n\n— NHẬN XÉT GV —\nChất lượng: đạt 85%.'],videoHeaders),video,{student:name,time:at}),ALREADY_REVIEWED);
assert.throws(()=>prepareStampedRoute(c,sheet([stamp,'— NHẬN XÉT GV —\nChất lượng: đạt 85%.'],videoHeaders),{...video},{student:name,time:at}),new RegExp(ALREADY_REVIEWED));
assert(stampedColumn(c,sheet([stamp,''],videoHeaders),video,{student:name,time:at})?.fingerprint);
// Divided lesson: the sibling task's review does not block this task.
assert(stampedColumn(c,sheet(['— NHẬN XÉT GV —\nChất lượng: đạt 85%.',stamp]),grammar,{student:name,time:at})?.fingerprint);
// Unknown pupil, duplicate pupil, unknown code: nothing binds.
assert.equal(stampedColumn(c,twin,grammar,{student:'Someone Else',time:at}),null);
assert.equal(stampedColumn(c,twin,{code:'NOT-A-CODE',kind:'grammar'},{student:name,time:at}),null);
// An unbound existing job keeps its identity and is saved once, with no other change.
let saves=0;const job={id:'j',status:'NEEDS_ASSIGNMENT',route:{...grammar}},route={...grammar};
prepareStampedRoute(c,twin,route,{student:name,time:at},job,()=>saves++);
assert.equal(saves,1);assert.equal(job.route.stampedDestination.fingerprint,bound.fingerprint);assert.equal(job.id,'j');assert.equal(job.status,'NEEDS_ASSIGNMENT');
prepareStampedRoute(c,twin,{...grammar},{student:name,time:at},job,()=>saves++);assert.equal(saves,1,'a stable binding is not saved again');
// A column the matcher already names never consults the stamp, even with a stamp elsewhere.
const named={code:'D2-Tiết 21-Ngữ pháp',kind:'grammar'},typedNamed=lessonHeaders.map(row=>[...row]);typedNamed[3][4]='Từ vựng';typedNamed[3][5]='Ngữ pháp';
prepareStampedRoute(c,sheet([stamp,''],typedNamed),named,{student:name,time:at});assert.equal(named.stampedDestination,undefined);
// End to end through the real sweep: a new receipt gets a job that carries the binding, an old stuck job
// gets the binding without a paid call, and a receipt beside a review creates nothing.
const {prepareKidsMasterSweep}=await import('./master-kids-sweep.mjs'),{hasTeacherReview}=await import('./teacher-feedback-state.mjs');
const sweepWith=(cells,jobs,code='D2-Tiết 21-Ngữ pháp',kind='grammar',routeError=null)=>{
 const snapshot=sheet(cells);snapshot.sheet={getName:()=>'T',getSheetId:()=>1,getRange:(r,col)=>({getDisplayValue:()=>snapshot.values[r-1][col-1]||'',getFormula:()=>'',getDataValidation:()=>null})};
 const receipt={className:'KIDS 1',sourceTab:'Tab',row:9,student:name,code,time:at,links:'https://example.test/a'},saved=[];
 const ctx=Object.assign(c,{masterSweepTabs_:['Tab'],guideCatalog_:()=>({}),loadJobs_:()=>jobs,targetSnapshot_:()=>snapshot,routeForReceipt_:()=>{if(routeError)throw Error(routeError);return {code,kind,className:'KIDS 1',sourceTab:'Tab'};},autoReceiptId_:()=>'new-job',persist_:(job,row)=>{saved.push(job);return row||50;},retiredTextbookHomework_:()=>false,hasFeedback_:text=>hasTeacherReview(text),currentRoster_:()=>true});
 const google={book:()=>({cache:new Map()}),fileMeta:()=>({})},cluster={controlId:'control',classes:[{className:'KIDS 1',spreadsheetId:'book',sheetName:'T'}]};
 const issues=[],sweep=prepareKidsMasterSweep(ctx,cluster,google,{receipts:[receipt],emit:x=>issues.push(x)});
 return {sweep,saved,state:[...sweep.states.values()][0],receipt};
};
const fresh=sweepWith(['✅ ĐÃ NỘP\n24/10/2026 09:00\n\n— NHẬN XÉT GV —',stamp],[]);
assert.equal(fresh.state.outcome,'pending');assert.equal(fresh.state.error,undefined);assert.equal(fresh.state.issue,undefined);assert.equal(fresh.saved.at(-1).route.stampedDestination.fingerprint,bound.fingerprint);assert.equal(fresh.saved.at(-1).generateRequests,undefined);
const stuck={id:'old',status:'NEEDS_ASSIGNMENT',error:'x',cls:{className:'KIDS 1'},route:{code:'D2-Tiết 21-Ngữ pháp',kind:'grammar'},media:[],receipt:{className:'KIDS 1',sourceTab:'Tab',row:9,student:name,code:'D2-Tiết 21-Ngữ pháp',time:at,links:'https://example.test/a'}};
const revived=sweepWith(['✅ ĐÃ NỘP\n24/10/2026 09:00\n\n— NHẬN XÉT GV —',stamp],[{job:stuck,row:7}]);
assert.equal(stuck.status,'READY');assert.equal(stuck.route.stampedDestination.fingerprint,bound.fingerprint);assert.equal(revived.state.outcome,'pending');
const paid={...structuredClone(stuck),id:'paid',status:'SYSTEM_GRADING_ERROR',generateRequests:1};
const held=sweepWith(['✅ ĐÃ NỘP\n24/10/2026 09:00\n\n— NHẬN XÉT GV —',stamp],[{job:paid,row:8}]);
assert.equal(paid.status,'SYSTEM_GRADING_ERROR','paid work is never reopened');assert.equal(held.state.attention,'PAID_NO_RESULT');
const answered=sweepWith(['',stamp+'\nChất lượng: đạt 85%.'],[]);
assert.equal(answered.state.issue,ALREADY_REVIEWED);assert.equal(answered.saved.length,0,'no job beside an existing review');assert.deepEqual(answered.sweep.flushIssues().written,[]);
const noBarem=sweepWith(['',stamp],[],'Peppa-17','peppa','BAREM_REQUIRES_REVIEW');
assert.equal(noBarem.state.error,'BAREM_REQUIRES_REVIEW');assert.equal(noBarem.saved.length,0);
const noBaremAnswered=sweepWith(['',stamp+'\nChất lượng: đạt 85%.'],[],'Peppa-17','peppa','BAREM_REQUIRES_REVIEW');
assert.equal(noBaremAnswered.state.issue,ALREADY_REVIEWED);
// One named retry after a 503: only that uncalled child runs; an equal child of another pupil stays blocked,
// a saved result still wins, and once the child has its own request it is not selected again.
const {selectExisting,TEACHER_APPROVED_RETRIES}=await import('./frozen-backlog-policy.mjs');
const retryTarget={spreadsheetId:'book',className:'KIDS 1',student:name,code:'SCIENCE-G1-21',submissionAt:at},retryJob=(id,extra={})=>({id,status:'WAITING_INPUT',cls:{spreadsheetId:'book',className:'KIDS 1'},route:{code:'SCIENCE-G1-21'},media:[],receipt:{student:name,code:'SCIENCE-G1-21',time:at,className:'KIDS 1'},...extra});
const parent={job:retryJob('parent',{status:'SUPERSEDED_BY_APPROVED_DASHBOARD_REPROCESS',generateRequests:1,physicalGenerateRequests:1,masterGenerationReserved:true}),row:1},namedId=[...TEACHER_APPROVED_RETRIES][0],licensedChild={job:retryJob(namedId,{providerRetryOrigin:{depth:1}}),row:3},other={job:retryJob('other-child',{providerRetryOrigin:{depth:1}}),row:3};
assert.equal(TEACHER_APPROVED_RETRIES.size,1);
assert.equal(selectExisting(retryTarget,[parent,licensedChild])?.job.id,namedId);
assert.equal(selectExisting(retryTarget,[parent,other]),null,'no other child is licensed by this approval');
assert.equal(selectExisting(retryTarget,[{...parent,job:{...parent.job,rawId:'saved'}},licensedChild])?.job.id,'parent','a saved result precedes any new call');
assert.equal(selectExisting(retryTarget,[parent,{...licensedChild,job:{...licensedChild.job,generateRequests:1}}]),null,'the approval pays for one attempt only');
console.log('PASS exact-minute stamps name an unresolved column; shifts follow headers; renamed headers, other tasks and existing reviews never bind.');
