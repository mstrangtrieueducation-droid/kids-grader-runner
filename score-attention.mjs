import {chooseTrackerTab} from './runner-policies.mjs';
export const ATTENTION_LABEL='Cần theo dõi — dưới 70%';
export function feedbackPercent(text){
 const marker=String(text||'').indexOf('NHẬN XÉT GV');if(marker<0)return null;
 const m=String(text).slice(marker).match(/Chất lượng:\s*đạt(?:\s+khoảng)?\s+(\d+(?:[.,]\d+)?)%/u);
 const n=m?Number(m[1].replace(',','.')):NaN;return Number.isFinite(n)&&n>=0&&n<=100?n:null;
}
export function annotateScoreAttention(g,targets){
 const books=new Map();let checked=0,low=0;
 for(const t of targets){if(!t.book||!/^\$?[A-Z]+\$?\d+$/.test(t.cell||''))continue;if(!books.has(t.book))books.set(t.book,[]);books.get(t.book).push(t);}
 for(const [id,list]of books){
  const book=g.book(id),titles=book.sheets.map(s=>s.getName()),ranges=new Map();
  for(const t of list){const title=chooseTrackerTab(t.sheet,titles),range="'"+title.replaceAll("'","''")+"'!"+t.cell;if(!ranges.has(range))ranges.set(range,[]);ranges.get(range).push(t);}
  const entries=[...ranges];
  for(let i=0;i<entries.length;i+=80){const chunk=entries.slice(i,i+80),q=new URLSearchParams({valueRenderOption:'FORMATTED_VALUE'});for(const [r]of chunk)q.append('ranges',r);
   const data=g.api(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${q}`);
   if(data.valueRanges?.length!==chunk.length)throw Error('DASHBOARD_SCORE_READ_INCOMPLETE');
   chunk.forEach(([,ts],k)=>{const score=feedbackPercent(data.valueRanges[k].values?.[0]?.[0]);for(const t of ts){if(score===null)continue;checked++;if(score<70){t.row[5]=[ATTENTION_LABEL+' ('+score+'%)',t.row[5]].filter(Boolean).join('\n');t.row.lowScore=true;low++;}}});
  }
 }
 return {checked,low};
}
