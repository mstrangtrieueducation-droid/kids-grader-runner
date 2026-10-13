export function fullFeedback(g){
 const sections=g.roseSections||g.sections;
 const ordered=Array.isArray(sections)?sections:Object.values(sections||{});
 if(ordered.length&&ordered.every(s=>typeof s.text==='string'&&s.text.trim()))return ordered.map(s=>`${s.label||''}\n${s.text}`).join('\n\n');
 const content=(g.contentChecks||[]).map(x=>x.feedback||x.heard||'').filter(Boolean);
 const findings=Object.values(g.rubricFindings||{}).flatMap(x=>(x.strengths||[]).map(s=>s.basis).filter(Boolean));
 const corrections=(g.evidence||[]).map(e=>[e.word,e.ipa,e.observed,e.correction].filter(Boolean).join(' — '));
 const practice=(g.presentation?.observations||[]).map(x=>x.correction||x.assessment||x.observation||'').filter(Boolean);
 if(!content.length&&!findings.length&&!corrections.length&&!practice.length&&g.reason)content.push(g.reason);
 const blocks=[['Nội dung', [...content,...findings]],['Phát âm & ngữ pháp',corrections],['Cách luyện',practice]];
 const text=blocks.filter(([,v])=>v.length).map(([k,v])=>k+'\n'+v.join('\n')).join('\n\n');
 if(!text)throw Error('SAVED_FEEDBACK_EMPTY');
 return text;
}
export function networkRetry(j,error,now=Date.now()){
 if(!/NETWORK|TIMEOUT|UNCERTAIN_GENERATION|HTTP_(408|500|502|503|504)/.test(error)||j.rawId||j.gradeId)return false;
 j.networkAttempts=(j.networkAttempts||0)+1;
 j.networkHistory ||= [];j.networkHistory.push({at:new Date(now).toISOString(),error,generateRequests:j.generateRequests||0});
 j.networkHistory=j.networkHistory.slice(-20);
 j.retryGenerationAuthorized=true;j.runnerGenerationStarted=false;
 j.status='RETRY';j.error=error;j.nextAt=now+Math.min(3600000,60000*2**Math.min(j.networkAttempts,6));
 return true;
}
