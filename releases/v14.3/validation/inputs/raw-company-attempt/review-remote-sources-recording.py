"""Save public rule bytes and their provenance; never change a running client."""
from pathlib import Path
import argparse, concurrent.futures, hashlib, json, urllib.request, subprocess, time

root = Path(__file__).resolve().parents[1]
project = root.parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--download', action='store_true')
args = parser.parse_args()
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
sha = lambda b: hashlib.sha256(b).hexdigest()
baseline = root / 'validation/inputs/v14.2-baseline'
original = read(baseline / 'data/rule-sources.lock.json')
prior_home = project / 'releases/v14.2/validation/inputs/embedded-domain-candidate'
prior = read(prior_home / 'manifest.json')
new_sources = [s for s in original['sources'] if 'desktop' in s['platforms']]
for s in prior['sources']:
    if not s['id'].startswith('core-'):
        continue
    tag = s['id'][5:]
    target = 'data/rules/reviewed/v12r-domain-' + tag
    for source, dest, expected in [(s['file'], target+'.yaml', s['sha256']), (s['classifier']['file'], target+'.list', s['classifier']['sha256'])]:
        raw = (prior_home / source).read_bytes()
        assert sha(raw) == expected
        (root / dest).write_bytes(raw)
    new_sources.append({'id': 'v12r-domain-'+tag, 'url': s['url'], 'file': target+'.yaml', 'sha256': s['sha256'], 'behavior': 'classical', 'format': 'yaml',
                        'classifier': {'file': target+'.list', 'sha256': s['classifier']['sha256']}, 'platforms': ['desktop','android','clashmi']})
for s in new_sources:
    s['platforms'] = ['desktop','android','clashmi']
lock = {'version': '14.3', 'date': '2026-10-12', 'revision': 'balanced-r1', 'commits': original['commits'], 'sources': new_sources,
        'scope': 'Full native domain/IP rules; company tables protected by inline shared namespace and exact tenant rules; fixed reviewed commits only'}
(root / 'data/rule-sources.lock.json').write_text(json.dumps(lock, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
home = root / 'validation/network-review'
home.mkdir(parents=True, exist_ok=True)
# Audit the 45 original sources and all seven company sources, including the
# unchanged Shadowrocket inputs. Deploy only the 31 native sources in this release.
entries = [dict(s) for s in original['sources']]
entries += [dict(s, id='core-'+s['id'][len('v12r-domain-'):]) for s in new_sources if s['id'][len('v12r-domain-'):] in ['openai','anthropic','google-gemini','youtube','google','microsoft','linkedin']]

def fetch(entry):
    known = (root / entry['file']).read_bytes()
    assert sha(known) == entry['sha256'], entry['id']
    assert len(entry['url'].split('/')[5]) == 40 and entry['url'].startswith('https://raw.githubusercontent.com/')
    result = {'id': entry['id'], 'url': entry['url'], 'expectedSHA256': entry['sha256'], 'localSHA256': sha(known), 'bytes': len(known)}
    if args.download:
        dest = home / (entry['id']+'.download')
        if dest.exists() and sha(dest.read_bytes()) == entry['sha256']:
            result.update(downloadSHA256=entry['sha256'],downloadFile=dest.relative_to(root).as_posix(),byteMatch=True,reusedThisReviewDownload=True)
        else:
            for attempt in range(3):
                try:
                    request = urllib.request.Request(entry['url'], headers={'User-Agent': 'Override-V14.3-Rule-Review'})
                    with urllib.request.urlopen(request, timeout=40) as response:
                        raw = response.read(8*1024*1024+1)
                    assert len(raw) <= 8*1024*1024
                    dest.write_bytes(raw)
                    result.update(downloadSHA256=sha(raw), downloadFile=dest.relative_to(root).as_posix(), byteMatch=sha(raw)==entry['sha256'],attempts=attempt+1)
                    break
                except Exception as e:
                    result.update(error=str(e), byteMatch=False,attempts=attempt+1)
                    if attempt < 2:
                        time.sleep(0.5)
            if result.get('byteMatch'):
                result.pop('error',None)
    return result

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    observations = list(pool.map(fetch, entries))
heads = []
if args.download:
    for repo, branch in [('MetaCubeX/meta-rules-dat','meta'), ('blackmatrix7/ios_rule_script','master')]:
        try:
            run = subprocess.run(['git','ls-remote','https://github.com/'+repo+'.git','refs/heads/'+branch], capture_output=True, text=True, timeout=40,
                                 creationflags=subprocess.CREATE_NO_WINDOW)
            commit = run.stdout.split()[0] if run.returncode == 0 and run.stdout.strip() else None
            heads.append({'repo':repo,'branch':branch,'commit':commit,'currentPinnedCommit':original['commits'][repo], 'error':None if commit else run.stderr.strip()[:400]})
        except Exception as e:
            heads.append({'repo':repo,'branch':branch,'error':str(e)})
report = {'version':'14.3','date':'2026-10-12','revision':'balanced-r1','status':'PINNED_REMOTE_BYTES_VERIFIED' if args.download and all(s.get('byteMatch') for s in observations) else 'LOCAL_PINNED_BYTES_VERIFIED_NETWORK_NOT_RUN' if not args.download else 'NETWORK_REVIEW_INCOMPLETE',
          'sourceCount':len(observations),'nativeRuntimeSources':len(new_sources),'branchHeads':heads,'observations':observations,'clientDeployment':False}
(home/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':report['status'],'sources':len(observations),'byteMatches':sum(s.get('byteMatch',False) for s in observations),'errors':[{'id':s['id'],'error':s.get('error','hash mismatch')} for s in observations if args.download and not s.get('byteMatch')], 'heads':heads},ensure_ascii=False))
if args.download and report['status']!='PINNED_REMOTE_BYTES_VERIFIED':
    raise SystemExit(1)
