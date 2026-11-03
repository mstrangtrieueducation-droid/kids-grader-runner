import assert from 'node:assert/strict';
import {Book} from './google-adapter.mjs';
import {locateArtifact} from './artifact-read-freshness.mjs';
// One fake spreadsheet shared by two workers, each with its own in-process metadata.
const server={rows:[['artifactId','part','json'],['runner:old',0,'{}']],grid:2};
const g={api(url,method,body){
 if(url.includes(':append')){server.rows.push(...body.values);server.grid=Math.max(server.grid,server.rows.length);const end=server.rows.length;return {updates:{updatedRange:`'RunnerArtifacts'!A${end-body.values.length+1}:C${end}`}};}
 if(url.includes('/values/')){const m=/!([A-Z]+)(\d+):([A-Z]+)(\d+)/.exec(decodeURIComponent(url));if(!m)throw Error('UNEXPECTED_RANGE '+url);const start=+m[2],end=Math.min(+m[4],server.grid),width=m[3].charCodeAt(0)-m[1].charCodeAt(0)+1;return {values:server.rows.slice(start-1,end).map(r=>r.slice(0,width))};}
 return {spreadsheetId:'c',properties:{title:'c'},sheets:[{properties:{sheetId:1,title:'RunnerArtifacts',gridProperties:{rowCount:server.grid,columnCount:3}}}]};}};
const workerA=new Book(g,'c'),workerB=new Book(g,'c'),sheetOf=b=>b.getSheetByName('RunnerArtifacts');
const known=new Set(),index=b=>()=>{const s=sheetOf(b),last=s.getLastRow();if(last>1)for(const [id] of s.getRange(2,1,last-1,2).getValues())if(id)known.add(id);};
sheetOf(workerB).getLastRow();
sheetOf(workerA).appendRows([['runner:fresh',0,'{"ok":true}']]);
// Reproduces the live fault: the row exists, yet the sibling's stale grid hides it.
assert.equal(server.rows.some(r=>r[0]==='runner:fresh'),true);
index(workerB)();assert.equal(known.has('runner:fresh'),false,'stale metadata hides the sibling row');
workerB.cache.clear();index(workerB)();assert.equal(known.has('runner:fresh'),false,'clearing the value cache alone is not enough');
assert.equal(locateArtifact('runner:fresh',{has:id=>known.has(id),index:index(workerB),book:workerB}),true);
// A truly absent artifact still reports missing, and an open RAM batch is left alone.
assert.equal(locateArtifact('runner:absent',{has:id=>known.has(id),index:index(workerB),book:workerB}),false);
const touched=[];assert.equal(locateArtifact('runner:absent',{has:()=>false,index:()=>{},book:{ramBatch:{},refresh(){touched.push(1);},cache:{clear(){touched.push(1);}}}}),false);assert.equal(touched.length,0);
console.log(JSON.stringify({test:'artifact-read-freshness-tests.mjs',passed:true,providerCalls:0}));
