"""Verify configured public rule bytes without changing any lock or client."""
from pathlib import Path
import argparse, concurrent.futures, hashlib, json, urllib.request, time

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--download',action='store_true')
args=parser.parse_args()
sha=lambda b:hashlib.sha256(b).hexdigest()
lock=json.loads((root/'data/rule-sources.lock.json').read_text(encoding='utf-8'))
home=root/'validation/network-review/current'
home.mkdir(parents=True,exist_ok=True)

def verify(s):
    raw=(root/s['file']).read_bytes()
    assert sha(raw)==s['sha256'],s['id']
    assert sha((root/s['classifier']['file']).read_bytes())==s['classifier']['sha256'],s['id']
    assert s['url'].startswith('https://raw.githubusercontent.com/') and len(s['url'].split('/')[5])==40
    result={'id':s['id'],'url':s['url'],'file':s['file'],'sha256':s['sha256'],'classifier':s['classifier']}
    if args.download:
        for attempt in range(3):
            try:
                req=urllib.request.Request(s['url'],headers={'User-Agent':'Override-V14.3-Rule-Review'})
                with urllib.request.urlopen(req,timeout=40) as response:
                    downloaded=response.read(8*1024*1024+1)
                assert len(downloaded)<=8*1024*1024
                dest=home/(s['id']+'.download')
                dest.write_bytes(downloaded)
                result.update(downloadFile=dest.relative_to(root).as_posix(),downloadSHA256=sha(downloaded),byteMatch=sha(downloaded)==s['sha256'])
                result.pop('error',None)
                break
            except Exception as e:
                result.update(error=str(e),byteMatch=False)
                if attempt<2:
                    time.sleep(0.5)
    return result

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    observations=list(pool.map(verify,lock['sources']))
status='PINNED_REMOTE_BYTES_VERIFIED' if args.download and all(s.get('byteMatch') for s in observations) else 'LOCAL_PINNED_BYTES_VERIFIED' if not args.download else 'NETWORK_REVIEW_INCOMPLETE'
report={'version':'14.3','date':'2026-10-12','revision':'balanced-r1','status':status,'sourceCount':len(observations),'lockSHA256':sha((root/'data/rule-sources.lock.json').read_bytes()),'observations':observations,'recordingToolSHA256':sha(Path(__file__).read_bytes()),'runtimeSourceChanged':False,'clientDeployment':False}
(home/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':status,'sources':len(observations),'errors':[s['id'] for s in observations if s.get('error')]},ensure_ascii=False))
if status=='NETWORK_REVIEW_INCOMPLETE':
    raise SystemExit(1)
