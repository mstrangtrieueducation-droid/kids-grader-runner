import assert from 'node:assert/strict';
import {canResumeUncalledModelHold,installKidsModelAccessRecovery} from './kids-model-access-recovery.mjs';
const names=['RUNNER_HOST','MODEL_GRADING_AVAILABLE','AUTOMATIC_GRADING_AUTHORIZED'];
const before=Object.fromEntries(names.map(k=>[k,process.env[k]]));
Object.assign(process.env,{RUNNER_HOST:'github',MODEL_GRADING_AVAILABLE:'true',AUTOMATIC_GRADING_AUTHORIZED:'true'});
try{
 const job={id:'fixture-hold',status:'WAITING_MODEL_ACCESS',error:'MODEL_NOT_AVAILABLE_FOR_THIS_PROJECT',receipt:{student:'Fixture',time:'2026-10-15T20:00:00+07:00'},cls:{},route:{},generateRequests:0,nextAt:0};
 assert.equal(canResumeUncalledModelHold(job),true);
 for(const patch of [{status:'RETURNED'},{error:'PROVIDER_PREPAYMENT_REQUIRED'},{rawId:'saved'},{gradeId:'saved'},{generateRequests:1},{masterGenerationReserved:true},{physicalGenerateRequests:1},{generationAttempt:{calls:1}},{previousGradingAttempts:[{rawId:'saved'}]},{failedAttempts:[{generateRequests:1}]},{teacherApprovedHistory:[{usage:{promptTokenCount:1}}]},{generationReservation:{id:'reserved'}},{presentationResubmissionRequired:{}},{technicalInputFailure:{}},{providerFailure:{http:404}},{receipt:{time:'2026-08-31T23:59:59+07:00'}}])assert.equal(canResumeUncalledModelHold({...job,...patch}),false,JSON.stringify(patch));
 for(const [key,value] of [['RUNNER_HOST','local'],['MODEL_GRADING_AVAILABLE','false'],['AUTOMATIC_GRADING_AUTHORIZED','false']]){const v=process.env[key];process.env[key]=value;assert.equal(canResumeUncalledModelHold(job),false);process.env[key]=v;}
 const run=({text='✅ ĐÃ NỘP\n— NHẬN XÉT GV —',formula='',validation=null}={})=>{
  const saved=[],current=structuredClone(job),paid={...structuredClone(job),id:'paid',rawId:'immutable',generateRequests:1,usage:{totalTokenCount:123}};const original=structuredClone(paid);
  const c={loadJobs_:()=>[{job:current,row:2},{job:paid,row:3}],destination_:()=>({cell:{getDisplayValue:()=>text,getFormula:()=>formula,getDataValidation:()=>validation}}),hasFeedback_:t=>t.includes('đạt 80%'),persist_:(j,row)=>saved.push({j:structuredClone(j),row}),recoverContentRouting_:()=>({priorRecovery:true})};
  installKidsModelAccessRecovery(c);const result=c.recoverContentRouting_();assert.equal(result.priorRecovery,true);assert.deepEqual(paid,original);return {c,current,saved,result};
 };
 const r=run();assert.equal(r.result.uncalledModelHoldsResumed,1);assert.equal(r.current.status,'READY');assert.equal(r.current.generateRequests,0);assert.equal(r.current.modelAccessRecovery.providerCalls,0);assert.equal(r.c.recoverContentRouting_().uncalledModelHoldsResumed,0);
 for(const opt of [{text:'✅ ĐÃ NỘP\n— NHẬN XÉT GV —\nCô đã nhận xét'},{text:'đạt 80%'},{formula:'=A1'},{validation:{checkbox:true}}])assert.equal(run(opt).saved.length,0);
 console.log('PASS hosted uncalled model-hold recovery; archives, reservations, prior calls, teacher feedback and presentation holds protected; zero provider calls.');
}finally{for(const k of names)if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
