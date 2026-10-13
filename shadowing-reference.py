"""Fetch only publisher reference audio; never receives pupil names or files."""
import sys, json, pathlib, subprocess, os, shutil, urllib.request, urllib.parse, re
payload=json.loads(sys.stdin.read());out=pathlib.Path(payload['output']);out.parent.mkdir(parents=True,exist_ok=True)
if os.name=='nt':sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent.parent/'lesson-isolation/shadow-tools'))
try:
 ffmpeg=shutil.which(payload['ffmpeg']) or payload['ffmpeg']
 direct=payload.get('publisherMediaUrl')
 if direct:
  u=urllib.parse.urlparse(direct)
  if u.scheme!='https' or u.hostname not in ['downloads.bbc.co.uk','voa-video-ns.akamaized.net']:raise ValueError('untrusted publisher')
  tmp=out.with_suffix('.source')
  try:
   with urllib.request.urlopen(direct,timeout=5) as response,open(tmp,'wb') as dest:
    size=0
    while True:
     chunk=response.read(1024*1024)
     if not chunk:break
     size+=len(chunk)
     if size>250*1024*1024:raise ValueError('reference response too large')
     dest.write(chunk)
   subprocess.run([ffmpeg,'-nostdin','-v','error','-i',str(tmp),'-map','0:a:0','-vn','-c:a','libmp3lame','-b:a','128k' if out.suffix=='.mp3' else '128k','-y',str(out)],timeout=60,check=True,capture_output=True)
  finally:
   if tmp.exists():tmp.unlink()
  probe=subprocess.run([ffmpeg,'-hide_banner','-i',str(out)],timeout=15,capture_output=True,text=True)
  match=re.search(r'Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)',probe.stderr)
  if not match:raise ValueError('reference duration unavailable')
  h,m,s=map(float,match.groups());info={'id':payload['videoId'],'duration':h*3600+m*60+s,'description':''}
 else:
  import yt_dlp
  opts={'format':'bestaudio/best','outtmpl':str(out.with_suffix(''))+'.%(ext)s','noplaylist':True,'quiet':True,'no_warnings':True,'noprogress':True,'socket_timeout':5,'retries':0,'fragment_retries':0,'js_runtimes':{'node':{'path':payload['node']}},'ffmpeg_location':ffmpeg,'postprocessors':[{'key':'FFmpegExtractAudio','preferredcodec':'m4a'}]}
  with yt_dlp.YoutubeDL(opts) as dl:info=dl.extract_info('https://www.youtube.com/watch?v='+payload['videoId'],download=True)
 if info.get('id')!=payload['videoId'] or not out.is_file() or out.stat().st_size==0:raise ValueError('reference mismatch')
 print(json.dumps({'ok':True,'videoId':info['id'],'duration':info.get('duration'),'description':info.get('description',''),'publisherMediaUrl':direct}))
except Exception:
 print(json.dumps({'ok':False,'error':'SHADOW_REFERENCE_AUDIO_UNAVAILABLE'}));sys.exit(1)
