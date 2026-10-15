import assert from 'node:assert/strict';
import {actionableCount,dispatchDecision,watchLane} from './continuous-dispatcher.mjs';
const now=Date.parse('2026-10-15T01:30:00Z'),base={enabled:true,workflow:{state:'active'},runs:[{status:'completed',conclusion:'success',created_at:new Date(now-60000).toISOString()}],due:3,now};
assert.equal(dispatchDecision(base).action,'dispatch');
for(const status of ['in_progress','queued','pending','waiting','requested'])assert.equal(dispatchDecision({...base,runs:[{status}]}).action,'wait');
assert.equal(dispatchDecision({...base,enabled:false}).action,'stop');assert.equal(dispatchDecision({...base,workflow:{state:'disabled_manually'}}).action,'stop');
assert.equal(dispatchDecision({...base,runs:[{status:'completed',display_title:'KIDS grading enabled=false'}]}).action,'stop');
assert.equal(dispatchDecision({...base,lastDispatchAt:now-30000}).action,'wait');
assert.equal(dispatchDecision({...base,due:0}).action,'wait');assert.equal(dispatchDecision({...base,due:0,runs:[]}).reason,'scan_for_new_submissions');
const j={id:'one',status:'READY',nextAt:0,cls:{className:'KIDS 8',spreadsheetId:'class'},receipt:{time:'2026-10-14',student:'child'},route:{code:'lesson'}};
process.env.MASTER_CROSS_CLASS_SWEEP='true';assert.equal(actionableCount('kids',[j],now),1);
for(const x of [{...j,generateRequests:1},{...j,masterGenerationReserved:true},{...j,rawId:'paid-no-recall'},{...j,status:'COMPLETED_PRESENTATION_RESUBMISSION'},{...j,receipt:{time:'2026-08-31'}},{...j,nextAt:'2026-10-16T00:00:00Z'}])assert.equal(actionableCount('kids',[x],now),0);
assert.equal(actionableCount('kids',[{...j,status:'WAITING_TEACHER_APPROVAL',rawId:'saved',generateRequests:1}],now),1);
const shadow={...j,source:{time:'2026-10-14',className:'IELTS 45'},receipt:undefined};assert.equal(actionableCount('shadowing',[shadow],now),1);
for(const x of [{...shadow,generateRequests:1},{...shadow,recoveryHistory:[{previousRequests:1}]},{...shadow,status:'COMPLETED_UNASSESSABLE'},{...shadow,source:{time:'2026-10-14',className:'IELTS 40'}}])assert.equal(actionableCount('shadowing',[x],now),0);
const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'mstrangtrieueducation-droid/kids-grader-runner',GITHUB_REF_NAME:'main',GITHUB_RUN_ID:'controller',GITHUB_TOKEN:'fixture',GRADING_LANE:'kids',GRADING_ENABLED:'true',WATCH_DURATION_MS:'60001'};
let time=now,posts=[],checks=0;const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
const fetcher=async(url,options)=>{
 const pathname=new URL(url).pathname;
 assert(!url.includes('googleapis.com'));assert(!['PUT','PATCH','DELETE'].includes(options.method));
 if(options.method==='POST'){posts.push({pathname,body:JSON.parse(options.body)});return response(null,204);}
 if(pathname.endsWith('/kids-grader-runner'))return response({private:false,owner:{login:'mstrangtrieueducation-droid'},default_branch:'main'});
 if(pathname.endsWith('/grade_kids.yml'))return response({state:'active'});
 if(pathname.endsWith('/continuous_dispatch.yml/runs'))return response({workflow_runs:[{id:'controller',status:'in_progress'},{id:'queued-controller',status:'pending'}]});
 if(pathname.endsWith('/grade_kids.yml/runs')){checks++;return response({workflow_runs:checks<=2?base.runs:[{id:'grade',status:'in_progress'}]});}
 throw Error('UNEXPECTED_ENDPOINT');
};
await watchLane(env,{fetcher,now:()=>time,sleep:async ms=>{time+=ms;},readDue:async()=>3,emit:()=>{}});
assert.equal(posts.length,1);assert.equal(posts[0].body.inputs.mode,'grade');assert.equal(posts[0].body.ref,'main');assert(checks>=3);
time=now;posts=[];await watchLane({...env,GRADING_ENABLED:'false'},{fetcher,now:()=>time,sleep:async ms=>{time+=ms;},readDue:async()=>3,emit:()=>{}});assert.equal(posts.length,0);
await assert.rejects(()=>watchLane({...env,GITHUB_REPOSITORY:'other/repo'},{fetcher,readDue:async()=>3}),/UNTRUSTED/);
time=now;posts=[];
await watchLane({...env,WATCH_DURATION_MS:'1'},{fetcher:async(url,options)=>new URL(url).pathname.endsWith('/continuous_dispatch.yml/runs')?response({workflow_runs:[]}):fetcher(url,options),now:()=>time,sleep:async ms=>{time+=ms;},readDue:async()=>3,emit:()=>{}});
assert.equal(posts.length,1);assert(posts[0].pathname.endsWith('/continuous_dispatch.yml/dispatches'));assert.equal(posts[0].body.ref,'main');
console.log('No concurrent/duplicate dispatch, fresh-work wakeup, grace period, disabled switch, same-main binding, paid/reserved/archive/retired/date guards and controller handover passed; 0 generation calls.');
