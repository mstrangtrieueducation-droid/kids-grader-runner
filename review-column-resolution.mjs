// Refine only candidates already recognized by the original assignment matcher.
// A resource-link header without a review role is not a teacher assessment cell.
export function reviewColumn(native,headers,route){
 try{return native(headers,route);}catch(error){
  if(!/^DESTINATION_AMBIGUOUS/.test(error.message||'')||!['phonicsVideo','peppa'].includes(route.kind))throw error;
  const candidates=[];for(let col=0;col<Math.max(...headers.map(x=>x.length));col++)try{if(native(headers.map(row=>[row[col]||'']),route)===1)candidates.push(col);}catch{}
  const reviews=candidates.filter(col=>/Tiêu chí|NHẬN XÉT GV/iu.test(String(headers[3]?.[col]||'')));
  if(reviews.length===1&&candidates.every(col=>col===reviews[0]||!String(headers[3]?.[col]||'').trim()))return reviews[0]+1;
  throw error;
 }
}
