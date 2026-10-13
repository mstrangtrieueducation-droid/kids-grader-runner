const fold=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toUpperCase();
// A duplicated old column is resolved only when exactly one copy belongs to a
// contiguous, descending series of at least three distinct Phonics video lessons.
export function phonicsSequenceColumn(headers,code){
 const wanted=String(code).match(/^PHONICS-VIDEO-0*(\d+)$/i);if(!wanted)return null;
 const length=Math.max(...headers.map(r=>r.length));
 const videos=Array.from({length},(_,i)=>{const text=fold(headers.slice(0,3).map(r=>r[i]||'').join(' '));const m=text.match(/\bVIDEO\s*0*(\d+)(?!\d)/);return /PHONICS/.test(text)&&/TU LUYEN/.test(text)&&m?Number(m[1]):null;});
 const candidates=[];for(let i=0;i<length;i++)if(videos[i]===Number(wanted[1])){let lo=i,hi=i;while(lo>0&&videos[lo-1]!==null&&videos[lo-1]===videos[lo]+1)lo--;while(hi+1<length&&videos[hi+1]!==null&&videos[hi+1]===videos[hi]-1)hi++;if(hi-lo+1>=3)candidates.push(i+1);}
 return candidates.length===1?candidates[0]:null;
}
