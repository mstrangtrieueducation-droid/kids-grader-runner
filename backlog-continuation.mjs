import {fileURLToPath} from 'node:url';
export async function dispatchContinuation(env,fetcher=fetch){
 if(env.CONTINUE_BULK!=='true')return {event:'BULK_CONTINUATION',dispatched:false};
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY||''))throw Error('CONTINUATION_REPOSITORY_INVALID');
 if(!env.GITHUB_TOKEN||!env.GITHUB_REF_NAME)throw Error('CONTINUATION_CONFIG_MISSING');
 const response=await fetcher(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/grading_cron.yml/dispatches`,{
  method:'POST',headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
  body:JSON.stringify({ref:env.GITHUB_REF_NAME,inputs:{mode:'resume'}}),signal:AbortSignal.timeout(30000)
 });
 if(response.status!==204)throw Error(`CONTINUATION_GITHUB_HTTP_${response.status}`);
 return {event:'BULK_CONTINUATION',dispatched:true,mode:'resume'};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await dispatchContinuation(process.env)));
