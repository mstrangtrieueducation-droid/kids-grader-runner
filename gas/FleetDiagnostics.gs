function safeGeminiError_(response){
 let body={};try{body=JSON.parse(response.getContentText()).error||{};}catch(_){body={message:response.getContentText()};}
 let message=String(body.message||'').replace(/https?:\/\/\S+/g,'[URL]');
 allStoredKeys_().forEach(key=>{message=message.split(key).join('[REDACTED]');});
 message=message.replace(/(?:AIza|AQ\.)[A-Za-z0-9._-]+/g,'[REDACTED]');
 const violations=(body.details||[]).flatMap(d=>d.violations||[]).map(v=>({metric:v.quotaMetric||'',id:v.quotaId||'',dimensions:v.quotaDimensions||{},value:v.quotaValue||''}));
 const retry=(body.details||[]).find(d=>d.retryDelay);
 return {httpCode:response.getResponseCode(),status:body.status||'',message:message.slice(0,1600),violations,retryDelay:retry?retry.retryDelay:''};
}
