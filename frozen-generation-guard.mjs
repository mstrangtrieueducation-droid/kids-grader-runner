import {authorizedRecoveryChild} from './quarantine-recovery.mjs';
import {cellEvidence,expectedBindings,guardClassRequests} from './sheet-truth-write-guard.mjs';
import fs from 'node:fs';
import {authorizedInvalidRetry} from './authorized-invalid-retry.mjs';
// Recheck the actual class cell before any paid call, even when its class batch
// was loaded several minutes earlier. Reuse the existing native binding guard.
export function installFrozenGenerationGuard(c,g){
 const generate=c.generate_;c.generate_=(job,...args)=>{
  if(!job.rawId&&!job.gradeId){
   if(job.quarantineRecovery&&!authorizedRecoveryChild(job,c.loadJobs_()))throw Error('QUARANTINE_RECOVERY_AUTHORIZATION_CHANGED');
   if(job.invalidResultRetry&&!authorizedInvalidRetry(job,c.loadJobs_()))throw Error('INVALID_RESULT_RETRY_AUTHORIZATION_CHANGED');
   if(process.env.CAMPAIGN_HALT_FILE&&fs.existsSync(process.env.CAMPAIGN_HALT_FILE))throw Error('CAMPAIGN_COORDINATOR_STOPPED');
   if(process.env.CAMPAIGN_PARENT_PID)process.kill(Number(process.env.CAMPAIGN_PARENT_PID),0);
   const cell=c.destination_(job.cls,job.route,job.receipt.student).cell,sheet=cell.sheet,master=sheet.book.cache.get(sheet.getName()+'|master');
   if(!master)throw Error('CAMPAIGN_CLASS_SNAPSHOT_MISSING');
   const row=cell.getRow()-1,col=cell.getColumn()-1,key=[sheet.getSheetId(),row,col].join('|');
   const expected={key,sheetId:sheet.getSheetId(),title:sheet.getName(),row,col,before:cellEvidence(master.cells[row]?.values?.[col]),...expectedBindings(sheet,master,row,col)};
   const plan=guardClassRequests(g,job.cls.spreadsheetId,[],[expected]);
   if(plan.conflicts.length)throw Error('PREFLIGHT_DESTINATION_CHANGED');
  }
  return generate(job,...args);
 };
}
