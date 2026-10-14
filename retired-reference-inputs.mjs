import {generationSpent} from './master-policy.mjs';
export function retireReferenceInputs(c,j,row){
 if(j.rawId||j.gradeId||generationSpent(j))return false;
 const references=(j.media||[]).filter(m=>m.isReference);if(!references.length)return false;
 const snapshot=c.guide_(j.route);if(snapshot.referenceMedia?.length||snapshot.referenceAssets?.length)throw Error('SYSTEM_AUDIO_INPUT_REFERENCE_POLICY_NOT_LOCAL');
 const studentMedia=j.media.filter(m=>!m.isReference);if(!studentMedia.length)throw Error('SYSTEM_AUDIO_INPUT_MISSING_STUDENT_AUDIO');
 j.previousSnapshotId ||= j.snapshotId;j.snapshotId=c.saveArtifact_('local-text-only-input-'+j.id,snapshot);j.sourceHash=c.hash_(snapshot);j.media=studentMedia;j.studentFileCount=studentMedia.length;
 j.retiredReferenceInputs={at:new Date().toISOString(),ids:references.map(m=>m.id),version:'text-only-barem-student-media-v1',providerCalls:0};c.persist_(j,row);return true;
}
