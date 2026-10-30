import assert from 'node:assert/strict';import {providerFailure,assessmentFailure,holdSystemFailure,wrongAssignmentNotice,studentAssessmentNotice,LEGACY_GENERIC_NOTICE} from './grading-failure-policy.mjs';import {installMasterKids} from './master-kids.mjs';
const job={id:'fixture',route:{code:'OP3-L07',kind:'phonics'},receipt:{code:'OP3-L07'},media:[{id:'video',mime:'video/mp4'}]};
assert.equal(providerFailure(job,{httpCode:402}).code,'PROVIDER_PREPAYMENT_REQUIRED');assert.equal(providerFailure({...job,rawId:'paid'}, {httpCode:402}),null);
assert.equal(providerFailure(job,{message:'HTTP_429'}).status,'WAITING_PROVIDER_QUOTA');
assert.equal(assessmentFailure({candidates:[{finishReason:'RECITATION'}]},{assessable:false,reason:LEGACY_GENERIC_NOTICE},job).code,'PROVIDER_RESPONSE_RECITATION');
assert.equal(assessmentFailure({candidates:[{finishReason:'STOP'}]},{assessable:false,reason:'Con chưa gửi tệp video bài làm.'},job).code,'INPUT_PRESENT_BUT_RESPONSE_SAYS_MISSING');
assert.equal(assessmentFailure({}, {assessable:false,reason:'Bài chỉ có âm thanh, không có hình ảnh theo yêu cầu.'},job).code,'VISUAL_INPUT_NOT_DELIVERED');
assert.equal(assessmentFailure({usageMetadata:{promptTokensDetails:[{modality:'VIDEO',tokenCount:1000}]}}, {assessable:false,reason:'Bài nộp chưa thấy màn hình video hỗ trợ.'},job),null); // Historical native-video requests did include visual evidence.
assert.equal(assessmentFailure({usageMetadata:{promptTokensDetails:[{modality:'TEXT',tokenCount:1000}]}}, {assessable:false,reason:'Chưa gửi bài.'},{receipt:{links:'https://drive.google.com/open?id=fixture'},media:[]}).code,'STUDENT_MEDIA_NOT_IN_PROVIDER_INPUT');
assert.equal(assessmentFailure({}, {assessable:false,reason:'Video hoàn toàn không có âm thanh giọng nói của học sinh.'},job),null);
assert.equal(assessmentFailure({}, {assessable:false,reason:'Tệp âm thanh hoàn toàn im lặng, không có nội dung đọc bài.'},job),null);
const wrong={assessable:false,submissionCheck:{status:'wrong_assignment',observedTask:'Bài từ vựng Animals',observedCode:'FF2-Tiết 10-Từ vựng',basis:'Video cho thấy Animals thay vì bài đọc Our Computer Room.'},reason:'Bài khác'};
const notice=wrongAssignmentNotice(wrong,{...job,receipt:{code:'FF2-Tiết 18-Đọc-Dịch'}});assert.ok(notice.includes('Animals'));assert.ok(notice.includes('FF2-Tiết 18'));assert.ok(notice.includes('Cô đã nhận'));assert.ok(!notice.includes('âm thanh không rõ'));assert.equal(wrongAssignmentNotice({...wrong,submissionCheck:{status:'wrong_assignment'}},job),null);
assert.equal(studentAssessmentNotice({reason:LEGACY_GENERIC_NOTICE},job),null);
let writes=0;const persisted=[],c={guide_:()=>({}),step_:()=>{},handleError_:()=>{},recoverContentRouting_:()=>{},persist_:(j)=>persisted.push(structuredClone(j)),destination_:()=>{writes++;throw Error('MUST_NOT_WRITE_STUDENT_CELL')}};
installMasterKids(c,{entries:new Map()});const denied={...job};c.handleError_(denied,2,Object.assign(Error('HTTP_402'),{httpCode:402}));assert.equal(denied.status,'WAITING_MODEL_ACCESS');assert.equal(denied.error,'PROVIDER_PREPAYMENT_REQUIRED');assert.equal(writes,0);assert.equal(process.env.MODEL_GRADING_AVAILABLE,'false');delete process.env.MODEL_GRADING_AVAILABLE;
const uncertain={...job,masterGenerationReserved:true,generateRequests:1};c.handleError_(uncertain,3,Error('NETWORK_OUTCOME_UNKNOWN'));assert.equal(uncertain.status,'SYSTEM_GRADING_ERROR');assert.equal(uncertain.generateRequests,1);assert.equal(writes,0);
const unmapped={...job};holdSystemFailure(c,unmapped,4,Error('BAREM_UNAVAILABLE'));assert.equal(writes,0);assert.equal(unmapped.systemGradingFailure.studentActionRequired,false);
console.log('PASS provider 402/quota/unknown outcome never request student resubmission; blocked output and missing visual evidence held; genuine wrong lesson names expected and observed task; no duplicate generation; no API calls.');

const validCached={assessable:true,band:'85%',roseSections:[{label:'Reading',text:'Con đọc rõ bài.'}]};assert.equal(assessmentFailure({usageMetadata:{promptTokensDetails:[{modality:'TEXT',tokenCount:12}]}},validCached,{...job,rawId:'saved'}),null);
const paused={...job,attempt_count:5};c.handleError_(paused,6,Error('CAMPAIGN_COORDINATOR_STOPPED'));assert.equal(paused.status,'READY');assert.equal(paused.error,'');assert.equal(paused.attempt_count,5);assert.equal(paused.generateRequests,undefined);
