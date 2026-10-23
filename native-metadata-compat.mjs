import {assertNativeEvidence,NATIVE_YOUTUBE_VERSION} from './native-youtube.mjs';
import {hasSavedResult,hasRequest} from './universal-media.mjs';
import {sourceInMasterScope} from './master-submission-scope.mjs';
export const NATIVE_METADATA_COMPAT='teacher-native-metadata-compat-20261024';
// The frozen legacy source checker compares exactly these four identity fields.
// A refreshed proof is validated independently; it is not an identity change.
export function legacyMediaIdentity(m){
 if(!m.nativeYouTube)return m;
 assertNativeEvidence(m.nativeYouTube,{id:m.id});
 return {id:m.id,mime:m.mime,size:m.size,modified:m.modified};
}
export function nativeMetadataRepairEligible(j){
 return sourceInMasterScope(j.receipt)&&j.nativeMetadataRecovery?.version!==NATIVE_METADATA_COMPAT&&!hasRequest(j)&&!hasSavedResult(j)&&!j.presentationResubmissionRequired&&j.status==='SYSTEM_GRADING_ERROR'&&j.systemGradingFailure?.cause==='STALE_MEDIA'&&j.systemGradingFailure?.studentActionRequired===false&&j.media?.some(m=>m.nativeYouTube?.version===NATIVE_YOUTUBE_VERSION&&m.modified===m.nativeYouTube.identity&&m.size===0&&m.mime==='video/mp4');
}
