import assert from 'node:assert/strict';
import {OUTPUT_TOKENS,COMPACT_VERSION,compactGeneration,compactResponse,expandKidsCompact,expandShadowCompact} from './master-compact-output.mjs';
const response=g=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(g)}]}}]}),g={v:COMPACT_VERSION,ok:true,score:83,why:'',sections:[{label:'Phát âm',praise:'Con đọc rõ.',correction:'Con giữ âm cuối /s/.'}]};
assert.equal(OUTPUT_TOKENS,2048);assert.equal(compactGeneration({},'gemini-3.8-flash').thinkingConfig.thinkingLevel,'low');assert.equal(compactGeneration({},'gemini-2.5-flash').thinkingConfig.thinkingBudget,0);
assert.equal(expandKidsCompact(response(g)).band,'85%');assert.equal(expandShadowCompact(response(g)).overallPercent,85);assert.equal(expandKidsCompact(response({legacy:true})),null);assert.equal(compactResponse({candidates:[{content:{parts:[{text:'{'}]}}]}),null);assert.throws(()=>compactResponse(response({...g,score:null})),/INCOMPLETE/);
assert.equal(expandKidsCompact(response({...g,ok:false,score:null,capture:'screen_only',visualBasis:'Chỉ thấy màn hình.'})).band,'');
console.log('PASS compact future output with 2048 token cap, real score only, rounded percentages, legacy raw passthrough and incomplete JSON protection; 0 API.');

const {acceptTeacherApprovals}=await import('./teacher-approval-guards.mjs');
const paid={id:'paid',status:'DONE',rawId:'saved',gradeId:'grade',generateRequests:1,approvedGenerateRequests:1,usage:{totalTokenCount:50},generationReservation:{id:'reservation'}},old=structuredClone(paid),session={approved:new Map([['paid',{sourceLink:'https://docs.google.com/spreadsheets/d/control/edit#range=A2:F2'}]]),finish:()=>{}};
acceptTeacherApprovals([{row:2,job:paid}],session,'control','Jobs',()=>{});for(const key of ['rawId','gradeId','generateRequests','approvedGenerateRequests','usage','generationReservation'])assert.deepEqual(paid[key],old[key]);assert.equal(paid.status,'DONE');
console.log('PASS teacher checkbox preserves paid raw, usage, reservation and counters; no duplicate generation.');

// Teacher06Nov: the private hearing declaration.
{const {compactSchema,expandKidsCompact,COMPACT_VERSION,COMPACT_INSTRUCTION,heardNoVoice}=await import('./master-compact-output.mjs'),{noSpeech}=await import('./zero-cost-gates.mjs'),A=(await import('node:assert/strict')).default;
 const wrap=g=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({v:COMPACT_VERSION,...g})}]}}]});
 const schema=compactSchema(['Phát âm'],{visual:true});A.ok(schema.required.includes('heard'));A.deepEqual(schema.properties.heard.properties.voice.enum,['student','no_student_voice','unclear']);A.ok(schema.required.indexOf('heard')<schema.required.indexOf('score'),'declared before scoring');
 A.match(COMPACT_INSTRUCTION,/KHAI BÁO NGHE/);
 const section=[{label:'Phát âm',praise:'Con đọc rõ.',correction:''}];
 // The model praised a silent file: the declaration wins, nothing is scored.
 const silent=expandKidsCompact(wrap({heard:{voice:'no_student_voice',quotes:[]},ok:true,score:85,why:'',sections:section}));
 A.equal(silent.assessable,false);A.equal(silent.band,'');A.deepEqual(silent.roseSections,[]);A.ok(noSpeech(silent),'the existing no-voice notice fires');
 A.ok(noSpeech(expandKidsCompact(wrap({heard:{voice:'no_student_voice',quotes:[]},ok:false,score:null,why:'',sections:[]}))));
 // A quote contradicts "no voice": graded exactly as before.
 const quoted=expandKidsCompact(wrap({heard:{voice:'no_student_voice',quotes:[{t:'00:05',text:'Daddy Pig'}]},ok:true,score:85,why:'',sections:section}));A.equal(quoted.band,'85%');A.ok(!noSpeech(quoted));
 const heard=expandKidsCompact(wrap({heard:{voice:'student',quotes:[{t:'00:05',text:'Daddy Pig'}]},ok:true,score:85,why:'',sections:section})),old=expandKidsCompact(wrap({ok:true,score:85,why:'',sections:section}));
 A.deepEqual(heard,old,'a heard pupil gets the same grade object as before the declaration');A.ok(!('heard' in heard),'the declaration never reaches the class cell');
 A.ok(!noSpeech(expandKidsCompact(wrap({heard:{voice:'unclear',quotes:[]},ok:true,score:70,why:'',sections:section}))),'unclear never becomes a notice');A.ok(!heardNoVoice({}));
 console.log('PASS hearing declaration: silence cannot be scored; heard work is unchanged.');}
