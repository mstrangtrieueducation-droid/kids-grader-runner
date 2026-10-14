// Additive override: assessment metadata cannot block an already returned mark.
// Audio payload, routing, presentation compliance and occupied-cell guards stay intact.
export function returnedPercent(value){const m=String(value??'').trim().match(/^(\d+(?:[.,]\d+)?)\s*%?$/);return m?Number(m[1].replace(',','.')):null;}
export function installReturnedScorePolicy(c){
 for(const name of ['validateGrade_','validateKidsRubricDraft_','normalizeKidsReview_','normalizeKidsErrorGroups_'])if(typeof c[name]==='function')c[name]=g=>g;
 const normal=c.normalizeKidsGrade_;
 if(normal)c.normalizeKidsGrade_=g=>{const band=g.band,rubricBand=g.rubricBand;try{normal(g);}catch(e){g.returnedScoreFormattingWarning=String(e.message||'FORMAT_METADATA');}if(band!==undefined)g.band=band;if(rubricBand!==undefined)g.rubricBand=rubricBand;return g;};
}
