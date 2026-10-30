import {scoredAssessment,explicitDistantAssignment} from './scored-assessment-policy.mjs';
export const GRADING_FAILURE_VERSION='student-fault-evidence-v1-20261015';
export const LEGACY_GENERIC_NOTICE='Con gửi lại phần bài được giao để cô nhận xét nhé. Cô đợi bài của con.';
const sections=d=>Array.isArray(d?.roseSections)?d.roseSections:Object.values(d?.sections||{});
const nonempty=d=>sections(d).some(s=>s?.text?.trim()||s?.praise?.trim()||s?.correction?.trim());
export function providerFailure(job,error={}){
 if(job.rawId||job.gradeId)return null;
 const code=Number(error.httpCode||String(error.message||'').match(/HTTP_(\d+)/)?.[1]);
 if(code===402)return {status:'WAITING_MODEL_ACCESS',code:'PROVIDER_PREPAYMENT_REQUIRED',httpCode:code};
 if([401,403,404].includes(code))return {status:'WAITING_MODEL_ACCESS',code:'PROVIDER_ACCESS_REJECTED',httpCode:code};
 if(code===429)return {status:'WAITING_PROVIDER_QUOTA',code:'PROVIDER_QUOTA_REJECTED',httpCode:code};
 return null;
}
export function assessmentFailure(raw,draft,job={}){
 const finish=raw?.candidates?.[0]?.finishReason;
 if(raw?.promptFeedback?.blockReason||finish&&finish!=='STOP')return {status:'SYSTEM_GRADING_ERROR',code:'PROVIDER_RESPONSE_'+(finish||'BLOCKED')};
 // Complete saved assessments pass to the existing native writer. Media checks are a pre-call gate.
 if(scoredAssessment(draft))return null;
 const reason=String(draft?.reason||''),media=(job.media||[]).filter(m=>!m.isReference);
 const submitted=media.length||/drive\.google\.com\/(?:open|file)/i.test(job.receipt?.links||'');
 const modalities=raw?.usageMetadata?.promptTokensDetails||[],visualDelivered=job.masterVisualFileIndexes?.length||modalities.some(p=>/^(VIDEO|IMAGE)$/.test(p.modality)&&p.tokenCount>0);
 if(submitted&&modalities.length&&!modalities.some(p=>/^(AUDIO|VIDEO)$/.test(p.modality)&&p.tokenCount>0))return {status:'SYSTEM_GRADING_ERROR',code:'STUDENT_MEDIA_NOT_IN_PROVIDER_INPUT'};
 if(nonempty(draft))return null;
 if(submitted&&/(?:không có|chưa (?:gửi|nhận)|không nhận được).{0,35}(?:tệp|file|video|bản ghi)|(?:tệp|file).{0,35}(?:rỗng|không tồn tại)/iu.test(reason+' '+(draft?.submissionCheck?.basis||'')))return {status:'SYSTEM_GRADING_ERROR',code:'INPUT_PRESENT_BUT_RESPONSE_SAYS_MISSING'};
 if(media.some(m=>m.mime?.startsWith('video/'))&&/(?:không có|chưa (?:có|thấy)|thiếu).{0,30}(?:hình ảnh|hình|màn hình)|audio.only/iu.test(reason)&&!visualDelivered)return {status:'SYSTEM_GRADING_ERROR',code:'VISUAL_INPUT_NOT_DELIVERED'};
 if(media.some(m=>m.mime?.startsWith('video/'))&&/audio.only|chỉ có âm thanh/iu.test(reason)&&/không có hình/iu.test(reason))return {status:'SYSTEM_GRADING_ERROR',code:'RESPONSE_VISUAL_INPUT_CONTRADICTION'};
 const evidence=draft?.submissionCheck?.basis||draft?.speechStatus==='NO_SPEECH_DETECTED'&&!draft?.studentTranscript?.trim()||draft?.presentationReadingCheck?.confirmed&&draft.presentationReadingCheck.basis||draft?.presentationVisualCheck?.confirmed&&draft.presentationVisualCheck.basis;
 if(reason===LEGACY_GENERIC_NOTICE||!reason.trim()&&!evidence)return {status:'SYSTEM_GRADING_ERROR',code:'SAVED_RESPONSE_UNREADABLE'};
 return null;
}
export function holdSystemFailure(c,job,row,error,decision=null){
 const failure=decision||providerFailure(job,error)||{status:'SYSTEM_GRADING_ERROR',code:job.rawId?'SAVED_RESULT_PROCESSING_ERROR':job.masterGenerationReserved||job.generateRequests?'GENERATION_OUTCOME_UNCONFIRMED':'SYSTEM_PROCESSING_ERROR'};
 job.systemGradingFailure={version:GRADING_FAILURE_VERSION,at:new Date().toISOString(),...failure,cause:error?.message||failure.code,rawId:job.rawId||null,studentActionRequired:false};
 job.status=failure.status;job.error=failure.code;job.nextAt=0;c.persist_(job,row);return failure;
}
export function wrongAssignmentNotice(draft,job){
 const check=draft?.submissionCheck,wrong=check?.status==='wrong_assignment'||check?.category==='wrong_assignment';
 if(!wrong||!explicitDistantAssignment(draft,job)||!String(check.observedTask||'').trim()||!String(check.basis||'').trim())return null;
 const observed=String(check.observedTask).trim().replace(/[.。]+$/,'');
 return '⚠️ CẦN NỘP LẠI\nCô đã nhận được video của con. Bài cần nộp ở buổi này là '+String(job.receipt?.code||job.route?.code||'bài được giao')+'.\nTrong video, con đang thực hiện: '+observed+'.\nCon kiểm tra lại đúng nội dung của buổi này rồi gửi lại cho cô nhé.';
}
export function studentAssessmentNotice(draft,job){
 const wrong=wrongAssignmentNotice(draft,job);if(wrong)return wrong;
 const reason=String(draft?.reason||'').trim();
 if(!reason||reason===LEGACY_GENERIC_NOTICE)return null;
 // Use the actual saved reason, rather than relabelling every non-assessable
 // submission as a silent microphone. Technical reasons are held above.
 if(/im lặng|không (?:ghi nhận|có|nghe).{0,30}(?:giọng|tiếng|nội dung (?:đọc|lồng tiếng))|không tách biệt rõ giọng/iu.test(reason))return 'Cô đã nhận được video của con, nhưng chưa nghe rõ phần con đọc hoặc nói bài. Con kiểm tra micro và nghe thử bản quay để chắc chắn có tiếng con, rồi gửi lại giúp cô nhé.';
 return 'Cô đã nhận được bài của con.\n'+reason.replace(/Học sinh/g,'Con').replace(/học sinh/g,'con').replace(/Tệp âm thanh học sinh nộp/g,'Video con gửi');
}
