"""Read floating branch HEADs only to save candidates; never activate them."""
from pathlib import Path
import argparse, concurrent.futures, hashlib, json, urllib.request, subprocess, time

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--core',required=True)
args=parser.parse_args()
read=lambda n:json.loads((root/n).read_text(encoding='utf-8'))
sha=lambda b:hashlib.sha256(b).hexdigest()
lock=read('data/rule-sources.lock.json')
heads={h['repo']:h['commit'] for h in read('validation/network-review/manifest.json')['branchHeads'] if h.get('commit')}
home=root/'validation/inputs/latest-candidate'
home.mkdir(parents=True,exist_ok=True)

def normalize(text,behavior):
    rows=[]
    for raw in text.splitlines():
        row=raw.strip()
        if not row or row.startswith('#') or row=='payload:':
            continue
        if row.startswith('- '):
            row=row[2:].strip()
        if row.startswith("'") and row.endswith("'"):
            row=row[1:-1].replace("''", "'")
        elif row.startswith('"'):
            row=json.loads(row)
        if ',' not in row:
            if behavior=='domain':
                row='DOMAIN-SUFFIX,'+row[2:] if row.startswith('+.') else 'DOMAIN,'+row
            elif behavior=='ipcidr':
                row=('IP-CIDR6,' if ':' in row else 'IP-CIDR,')+row
            else:
                raise ValueError('Unsupported classical rule: '+row)
        # Earlier reviewed IP projections used IP-CIDR for both families.
        # Canonicalise the kind before comparing prefix sets.
        if row.startswith('IP-CIDR,') and ':' in row.split(',')[1]:
            row='IP-CIDR6,'+row.split(',',1)[1]
        rows.append(row)
    return set(rows)

def fetch(s):
    commit=lock['commits']['MetaCubeX/meta-rules-dat']
    candidate=heads['MetaCubeX/meta-rules-dat']
    url=s['url'].replace('/'+commit+'/', '/'+candidate+'/')
    result={'id':s['id'],'url':url,'commit':candidate,'baselineSHA256':s['sha256']}
    dest=home/(s['id']+'.'+s['format'])
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'Override-V14.3-Candidate-Review'})
            with urllib.request.urlopen(req,timeout=30) as response:
                raw=response.read(8*1024*1024+1)
            assert len(raw)<=8*1024*1024
            dest.write_bytes(raw)
            if s['format']=='mrs':
                decoded=home/(s['id']+'.decoded.list')
                subprocess.run([args.core,'convert-ruleset',s['behavior'],'mrs',str(dest),str(decoded)],check=True,capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW)
                text=decoded.read_text(encoding='utf-8')
            else:
                text=raw.decode('utf-8-sig')
            now=normalize(text,s['behavior'])
            before=normalize((root/s['classifier']['file']).read_text(encoding='utf-8'),s['behavior'])
            added,removed=sorted(now-before),sorted(before-now)
            result.update(file=dest.relative_to(root).as_posix(),sha256=sha(raw),records=len(now),baselineRecords=len(before),added=added,removed=removed,byteChanged=sha(raw)!=s['sha256'],attempts=attempt+1)
            result.pop('error',None)
            return result
        except Exception as e:
            result['error']=str(e)
            if attempt<2:
                time.sleep(0.5)
    return result

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    observations=list(pool.map(fetch,lock['sources']))
errors=[s for s in observations if 'error' in s]
changed=[s for s in observations if s.get('added') or s.get('removed')]
status='NETWORK_REVIEW_INCOMPLETE' if errors else 'LATEST_CANDIDATES_REQUIRE_REVIEW' if changed else 'LATEST_CANDIDATES_SEMANTICALLY_EQUIVALENT_KEEP_PIN'
report={'version':'14.3','date':'2026-10-12','revision':'balanced-r1','status':status,'scope':'Current 30 native sources compared to captured latest MetaCubeX branch HEAD; candidate only, no runtime source changed','baselineLockSHA256':sha((root/'data/rule-sources.lock.json').read_bytes()),'sources':observations,'runtimeSourceChanged':False}
(home/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':status,'sources':len(observations),'changed':[{'id':s['id'],'added':s['added'][:12],'removed':s['removed'][:12]} for s in changed],'errors':errors},ensure_ascii=False))
if errors:
    raise SystemExit(1)
