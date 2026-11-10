// Teacher09Nov: a resubmission after CẦN NỘP LẠI is graded again after the free gates, at most one more paid request per task.
import assert from 'node:assert/strict';
import {resubmissionDecision,noticeKind,taskProviderCalls,mayReopenNotice,MAX_TASK_PROVIDER_CALLS,sourceInputReason} from './sheet-truth-state.mjs';
import {SILENT_NOTICE,OLD_FILE_NOTICE,SAME_FILE_NOTICE,repeatedNoticedFile} from './zero-cost-gates.mjs';
import {YOUTUBE_NOTICE,EMPTY_LINK_NOTICE} from './universal-media.mjs';
import {WRONG_TASK_REASON} from './grading-failure-policy.mjs';
import {PRESENTATION_PRACTICE} from './teacher-presentation-policy.mjs';
import {attentionMessage} from './attention-list.mjs';
import {createMasterSweep} from './master-cross-class-sweep.mjs';
import {savedFeedback} from './saved-feedback.mjs';
import {studentAssessmentNotice} from './grading-failure-policy.mjs';
import {resubmissionAcknowledgement,isGatedRetry} from './resubmission-acknowledgement.mjs';
const head='✅ ĐÃ NỘP\n28/10/2026 19:40\n\n— NHẬN XÉT GV —\n';
assert.equal(MAX_TASK_PROVIDER_CALLS,2);
// Notice kinds.
assert.equal(noticeKind(head+YOUTUBE_NOTICE),'link');assert.equal(noticeKind(head+EMPTY_LINK_NOTICE),'link');assert.equal(noticeKind(head+'❌ CẦN NỘP LẠI: Link bài nộp không hợp lệ hoặc tệp không còn tồn tại.'),'link');
assert.equal(noticeKind(head+SILENT_NOTICE),'silent');assert.equal(noticeKind(head+OLD_FILE_NOTICE),'old_file');assert.equal(noticeKind(head+SAME_FILE_NOTICE),'old_file');
assert.equal(noticeKind(head+'❌ CẦN NỘP LẠI: '+WRONG_TASK_REASON),'wrong_task');
assert.equal(noticeKind('❌ CẦN NỘP LẠI 04/11/2026 20:39\n— NHẬN XÉT GV —\n❌ CẦN NỘP LẠI: Chất lượng: Chưa đạt (Yêu cầu quay lại).\n• Hướng dẫn luyện tập: '+PRESENTATION_PRACTICE),'presentation');
// Decision by paid requests on the task.
const src={className:'KIDS 1',student:'P',code:'DE-1',at:'2026-10-28T12:40:01.346Z',time:'2026-10-28T12:40:01.346Z'},again={...src,at:'2026-10-30T03:00:00.000Z',time:'2026-10-30T03:00:00.000Z'},third={...src,at:'2026-11-01T03:00:00.000Z',time:'2026-11-01T03:00:00.000Z'};
const linkNotice=head+YOUTUBE_NOTICE,wrongNotice=head+'❌ CẦN NỘP LẠI: '+WRONG_TASK_REASON;
const unpaid={id:'a',status:'COMPLETED_NEEDS_RESUBMISSION',receipt:src,autoNotice:linkNotice},paid={id:'b',status:'COMPLETED_UNASSESSABLE',receipt:src,autoNotice:wrongNotice,rawId:'raw-b'},paid2={id:'c',status:'COMPLETED_UNASSESSABLE',receipt:again,autoNotice:wrongNotice,rawId:'raw-c'};
assert.deepEqual(resubmissionDecision(src,linkNotice,[unpaid]).resubmission,false,'the noticed submission itself is not a resubmission');
let d=resubmissionDecision(again,linkNotice,[unpaid]);assert.ok(d.retry&&!d.closed&&d.kind==='link'&&d.calls===0,'a bad link cost nothing; the new link is checked and graded');
d=resubmissionDecision(again,wrongNotice,[paid]);assert.ok(d.retry&&d.calls===1&&d.kind==='wrong_task','wrong task: one more request');
d=resubmissionDecision(third,wrongNotice,[paid,paid2]);assert.ok(!d.retry&&d.closed&&d.calls===2,'wrong again: nothing is graded any more');
assert.equal(taskProviderCalls(third,[paid,{job:paid2},{...unpaid,id:'z',receipt:{...src,code:'DE-2'},rawId:'other-task'}]),2,'other tasks of the pupil are not counted');
assert.ok(taskProviderCalls(src,[{...unpaid,generateRequests:1}])===1,'a reserved or started request counts as paid');
assert.ok(mayReopenNotice(again,wrongNotice,[paid]));assert.ok(!mayReopenNotice(third,wrongNotice,[paid,paid2]));
// The same file again never costs a request.
const job=(id,time,link,extra={})=>({id,cls:{className:'KIDS 1'},route:{code:'DE-1'},receipt:{className:'KIDS 1',student:'P',code:'DE-1',time,links:link},...extra});
const noticed=job('n','2026-10-28T12:40:01.346Z','https://youtu.be/abcdefghijk',{autoNotice:head+SILENT_NOTICE,status:'COMPLETED_UNASSESSABLE'});
assert.equal(repeatedNoticedFile(job('r','2026-10-30T03:00:00.000Z','https://www.youtube.com/watch?v=abcdefghijk&t=3'),[noticed])?.id,'n','same YouTube video resubmitted');
assert.equal(repeatedNoticedFile(job('r','2026-10-30T03:00:00.000Z','https://youtu.be/zzzzzzzzzzz'),[noticed]),null,'a new video goes on to the gates and the request');
const driveNoticed=job('d','2026-10-28T12:40:01.346Z','https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view',{autoNotice:head+SILENT_NOTICE});
assert.equal(repeatedNoticedFile(job('r','2026-10-30T03:00:00.000Z','https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345'),[driveNoticed])?.id,'d','same Drive file resubmitted');
assert.equal(repeatedNoticedFile(job('r','2026-10-30T03:00:00.000Z','https://youtu.be/abcdefghijk'),[job('g','2026-10-28T12:40:01.346Z','https://youtu.be/abcdefghijk',{autoNotice:head+'Chất lượng: đạt khoảng 85%.',status:'RETURNED'})]),null,'only a noticed file counts here; graded files have their own gate');
assert.equal(repeatedNoticedFile(job('r','2026-10-30T03:00:00.000Z','https://youtu.be/abcdefghijk'),[{...noticed,route:{code:'DE-2'},receipt:{...noticed.receipt,code:'DE-2'}}]),null,'another task is not the same file for this rule');
assert.match(sourceInputReason({error:'LOCAL_SAME_FILE_RESUBMITTED'}),/vẫn là tệp/);
assert.equal(repeatedNoticedFile(job('r','2026-11-09T15:48:11.947Z','https://drive.google.com/open?id=1ztIfpzcH__NHt9rLRHk6UAz0bylTpMA2 https://drive.google.com/open?id=1G6abIH8wkfarrDCmBVOo2A6LGH3__h0K'),[job('n','2026-11-01T10:08:00.000Z','https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345',{autoNotice:head+SILENT_NOTICE})]),null,'different Drive files are different files (Bush, 9/11)');
{const own=job('r','2026-11-09T15:48:11.947Z','https://drive.google.com/open?id=1ztIfpzcH__NHt9rLRHk6UAz0bylTpMA2',{autoNotice:head+SAME_FILE_NOTICE,status:'COMPLETED_NEEDS_RESUBMISSION'}),prior=job('n','2026-11-01T10:08:00.000Z','https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345',{autoNotice:head+SILENT_NOTICE});
 assert.ok(mayReopenNotice(own.receipt,head+SAME_FILE_NOTICE,[own,prior]),'a same-file notice that does not hold is withdrawn');
 assert.ok(mayReopenNotice(own.receipt,SAME_FILE_NOTICE,[own,prior]),'also when the cell holds the bare notice without the NHẬN XÉT GV header (Bush, DE13)');
 assert.ok(!mayReopenNotice(own.receipt,head+SAME_FILE_NOTICE,[{...own,rawId:'paid'},prior]),'never after a paid request');
 const truly=job('r2','2026-11-09T15:48:11.947Z','https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345',{autoNotice:head+SAME_FILE_NOTICE,status:'COMPLETED_NEEDS_RESUBMISSION'});assert.ok(!mayReopenNotice(truly.receipt,head+SAME_FILE_NOTICE,[truly,prior]),'a true repeat stays noticed');}
assert.match(attentionMessage('RESUBMISSION_CLOSED')[1],/không chấm thêm/);for(const text of attentionMessage('RESUBMISSION_CLOSED'))assert.doesNotMatch(text,/nộp lại/i);
// Sweep: an allowed resubmission is queued and the class cell shows the waiting text; a closed one is held with no request.
const priorSweep=process.env.MASTER_CROSS_CLASS_SWEEP,priorTruth=process.env.SHEET_TRUTH_SYNC;process.env.MASTER_CROSS_CLASS_SWEEP='true';process.env.SHEET_TRUTH_SYNC='true';
const run=(source,jobsNow,cellText)=>{let display=cellText,enqueued=0,writes=0,created=null;const cell={getDisplayValue:()=>display,getFormula:()=>'',getDataValidation:()=>null,setRichTextValue:v=>{writes++;display=v.text;},getValue:()=>display,getNote:()=>''};
 const sweep=createMasterSweep({google:{book:()=>({cache:new Map(),getSheetByName:()=>null}),preloadSource(){}},lane:'kids',controlId:'control',classes:[{className:'KIDS 1',spreadsheetId:'book'}],entries:[{source,cls:{className:'KIDS 1',spreadsheetId:'book'}}],findJob:()=>undefined,resolve:()=>({cell}),hasFeedback:text=>/NHẬN XÉT GV —\n\S/.test(text)&&!/ĐANG CHỜ/.test(text),enqueue:s=>{enqueued++;created={job:{id:'new',status:'QUEUED',receipt:s},row:9};return created;},save:()=>{},allJobs:jobsNow,emit:()=>{}});
 try{sweep.scan();}catch(e){if(!/MUST_NOT/.test(e.message))throw e;}
 return {state:[...sweep.states.values()][0],enqueued,writes,display,created};};
const withLink=(s,link)=>({...s,links:link});
const allowed=run(withLink(again,'https://youtu.be/zzzzzzzzzzz'),[{job:structuredClone(paid),row:2}],wrongNotice);
assert.equal(allowed.enqueued,1,'the resubmission gets a job');assert.ok(allowed.writes>=1&&!/CẦN NỘP LẠI/.test(allowed.display)&&/30\/10\/2026/.test(allowed.display),'the family sees the new receipt, not the old notice');
assert.equal(allowed.created.job.sheetTruth.reopenedBy,'newer_form_timestamp');assert.notEqual(allowed.state.attention,'RESUBMISSION_CLOSED');
const closed=run(withLink(third,'https://youtu.be/yyyyyyyyyyy'),[{job:structuredClone(paid),row:2},{job:structuredClone(paid2),row:3}],wrongNotice);
assert.equal(closed.enqueued,0,'no job after two paid requests');assert.equal(closed.writes,0,'the class cell keeps the last notice');assert.equal(closed.state.attention,'RESUBMISSION_CLOSED');assert.equal(closed.state.outcome,'existing');
process.env.MASTER_CROSS_CLASS_SWEEP=priorSweep;process.env.SHEET_TRUTH_SYNC=priorTruth;
console.log('PASS resubmissions: free gates first, one more request at most, nothing graded after two paid requests; the same file again costs nothing.');

// Feedback on a resubmission says so and names what was put right; a still-wrong resubmission is told so.
{const retry={receipt:{className:'KIDS 11',student:'BUSH',code:'SCIENCE-G1-20',time:'2026-11-09T15:48:11.947Z'},route:{kind:'kids'},sheetTruth:{reopenedBy:'newer_form_timestamp',previousNotice:head+'❌ CẦN NỘP LẠI: Tệp không có tiếng nói theo kiểm tra âm thanh trực tiếp. Vui lòng kiểm tra micro và nộp lại bản có tiếng.'}};
 assert.ok(isGatedRetry(retry));assert.match(resubmissionAcknowledgement(retry),/nộp lại|có tiếng/);
 const g={assessable:true,band:'85%',rubricBand:'85%',roseSections:[{label:'Nội dung',text:'Con kể đủ ý.\nCon thiếu câu kết bài.',spans:[{text:'Con kể đủ ý.',tone:'praise'},{text:'\nCon thiếu câu kết bài.',tone:'correction'}]}]};
 const fb=savedFeedback(structuredClone(g),retry,'');const lines=fb.text.split('\n');const i=lines.findIndex(l=>/Chất lượng/.test(l));
 assert.match(lines[i+1],/có tiếng/,'the acknowledgement follows the score line');assert.ok(fb.text.includes('• Nội dung: Con kể đủ ý.'));
 for(const kind of ['link','wrong_task','presentation','old_file'])assert.ok(resubmissionAcknowledgement({...retry,sheetTruth:{reopenedBy:'newer_form_timestamp',previousNotice:head+{link:YOUTUBE_NOTICE,wrong_task:'❌ CẦN NỘP LẠI: '+WRONG_TASK_REASON,presentation:'❌ CẦN NỘP LẠI: Chất lượng: Chưa đạt (Yêu cầu quay lại). '+PRESENTATION_PRACTICE,old_file:OLD_FILE_NOTICE}[kind]}}).length>20,kind);
 const first={receipt:retry.receipt,route:{kind:'kids'}};assert.equal(resubmissionAcknowledgement(first),'');assert.ok(!/nộp lại/.test(savedFeedback(structuredClone(g),first,'').text),'a first attempt gets no acknowledgement');
 assert.match(studentAssessmentNotice({assessable:false,reason:'wrong_assignment'},retry),/nộp lại, nhưng nội dung lần này vẫn chưa đúng/);
 assert.equal(studentAssessmentNotice({assessable:false,reason:'wrong_assignment'},first),WRONG_TASK_REASON);
 assert.match(studentAssessmentNotice({assessable:false,reason:'NO_SPEECH_DETECTED'},retry),/vẫn chưa có tiếng/);
 assert.match(studentAssessmentNotice({assessable:false,reason:'Con đang nói về chủ đề Wood and Metal, trong khi bài được giao là Video 19.'},retry),/^Cô đã nhận được bài con nộp lại, nhưng lần này cô vẫn chưa chấm được vì:\nCon đang nói/);
 assert.match(studentAssessmentNotice({assessable:false,reason:'Con đang nói về chủ đề Wood and Metal.'},first),/^Cô đã nhận được bài của con\.\n/);
 console.log('PASS resubmission feedback acknowledges the resubmission.');}
{const {presentationNotice,RETRY_PRESENTATION_LINE}=await import('./teacher-presentation-policy.mjs');
 const base={route:{code:'DE-13'},receipt:{time:'2026-11-09T15:23:07.725Z',student:'JAMES',className:'KIDS 22',code:'DE-13'},media:[]};
 const first=presentationNotice(base).text,again=presentationNotice({...base,sheetTruth:{reopenedBy:'newer_form_timestamp',previousNotice:'❌ CẦN NỘP LẠI: Bài nộp chưa đính kèm link'}}).text;
 if(first.includes(RETRY_PRESENTATION_LINE))throw Error('FIRST_ATTEMPT_CALLED_RETRY');if(!again.includes('— NHẬN XÉT GV —\n'+RETRY_PRESENTATION_LINE+'\nChất lượng'))throw Error('RETRY_LINE_MISSING '+again);
 console.log('PASS a resubmitted video that is still not a presentation is told it was a resubmission');}
{const {resubmissionDecision:rd}=await import('./sheet-truth-state.mjs');
 const src={className:'KIDS 11',name:'BUSH',code:'SCIENCE-G1-21',at:'2026-11-12T10:00:00.000Z'},paid=(id,at)=>({id,rawId:'r'+id,receipt:{className:'KIDS 11',student:'BUSH',code:'SCIENCE-G1-21',time:at},route:{code:'SCIENCE-G1-21'},cls:{className:'KIDS 11'}});
 const jobs=[paid('a','2026-11-01T10:00:00.000Z'),paid('b','2026-11-05T10:00:00.000Z')];
 const silent='✅ ĐÃ NỘP 05/11/2026 17:00\n— NHẬN XÉT GV —\n❌ CẦN NỘP LẠI: Tệp không có tiếng nói theo kiểm tra âm thanh trực tiếp.';
 const d=rd(src,silent,jobs);if(d.resubmission&&(d.closed||!d.retry))throw Error('SILENT_CLOSED '+JSON.stringify(d));
 const wrong='✅ ĐÃ NỘP 05/11/2026 17:00\n— NHẬN XÉT GV —\n❌ CẦN NỘP LẠI: Con nộp chưa đúng bài được giao.';const w=rd(src,wrong,jobs);if(w.resubmission&&!w.closed)throw Error('WRONG_TASK_NOT_CLOSED');
 console.log('PASS a no-sound notice never closes the task; wrong-task still closes after two paid calls');}
