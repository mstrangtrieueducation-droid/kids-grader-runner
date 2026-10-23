import {hasTeacherReview,emptyTeacherBody,receiptOnlyCell,teacherFeedbackPrefix} from './teacher-feedback-state.mjs';
export {hasTeacherReview,emptyTeacherBody,receiptOnlyCell,auxiliaryListeningOnly,teacherFeedbackPrefix} from './teacher-feedback-state.mjs';
export function installDashboardFeedback(c){
 const original=c.hasFeedback_;
 c.hasFeedback_=value=>hasTeacherReview(value)?true:emptyTeacherBody(value)&&!/\d+(?:[.,]\d+)?\s*%/.test(String(value))||receiptOnlyCell(value)?false:original(value);
 // The native writer retains all existing wrappers, refresh/occupancy checks,
 // version gates, backups and readback. Only its prefix comes from this policy.
 c.teacherListeningPrefix_=teacherFeedbackPrefix;
}
