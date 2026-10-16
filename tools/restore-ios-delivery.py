"""Build the self-contained lean Shadowrocket entry and bind current iOS evidence."""
from pathlib import Path
import hashlib, json, subprocess
project=Path(__file__).resolve().parents[1]
root=project/'releases/v14.3'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
baseline=root/'validation/inputs/v14.2-baseline'
original='metadata/shadowrocket-sources.json'
expected=next(e for e in read(baseline/'manifest.json')['files'] if e['file']==original)
assert sha(baseline/original)==expected['sha256']
(root/'metadata/shadowrocket-v14.2-provenance.json').write_bytes((baseline/original).read_bytes())
subprocess.run(['node',str(root/'tools/build-shadowrocket-lean.cjs'),'--check'],cwd=root,check=True,capture_output=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
manifest=read(root/'metadata/balanced-sources.json')
lean=read(root/'metadata/shadowrocket-lean.json')
receipt=read(root/'validation/shadowrocket-lean.json')
assert receipt['status']=='SHADOWROCKET_LEAN_STATIC_PASS_NATIVE_PENDING'
for entry in [*manifest['entries'],*receipt['sourceFiles']]:
    assert sha(root/entry['file'])==entry['sha256'],entry['file']
code="const f=require('./tests/fixture.cjs');const c=f.generate('clashmi');console.log(JSON.stringify({groups:c['proxy-groups'].map(g=>g.name),mode:c.mode,ipv6:c.ipv6,dnsIPv6:c.dns.ipv6,nameserver:c.dns.nameserver,fallback:c.dns.fallback,tun:c.tun}));"
run=subprocess.run(['node','-e',code],cwd=root,check=True,capture_output=True,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
inspection=json.loads(run.stdout)
assert len(inspection['groups'])==26 and inspection['mode']=='rule'
assert inspection['ipv6'] is True and inspection['fallback']==[]
compatibility=read(root/'metadata/clashmi-compatibility.json')
core_file='validation/native-core.json'
core=read(root/core_file)
assert core['status'] in ('BALANCED_LOCAL_CORE_PASS','FAIL')
if core['status']=='FAIL':
    known=read(root/'validation/known-release-regressions.json')
    assert any(e['validationFile']==core_file and e['validationSHA256']==sha(root/core_file) for e in known['knownUnresolved'])
for e in core['sourceFiles']:
    assert sha(root/e['file'])==e['sha256'],e['file']
historical='archive/v14.3-before-domestic-protocol-r1-20261013/releases/v14.3/validation/clashmi-ios-investigation.json'
prior=read(root/'metadata/ios-delivery.json')
history=read(project/historical) if (project/historical).exists() else {'status':prior['historicalFailedInvestigation']['status']}
assert history['status']=='FAIL'
history_sha=sha(project/historical) if (project/historical).exists() else prior['historicalFailedInvestigation']['sha256']
delivery={
 'version':'14.3','date':'2026-10-16','revision':'ios-delivery-r2','domesticProtocolRevision':'domestic-protocol-r1',
 'status':'IOS_SOURCE_STATIC_WITH_KNOWN_CORE_REPLAY_FAILURE_DEVICE_PENDING' if core['status']=='FAIL' else 'IOS_SOURCE_STATIC_LOCAL_CORE_PASS_NATIVE_DEVICE_PENDING',
 'authorization':'User selected self-contained business DNS plus remote complete rules, and reviewed domestic TCP/UDP/DNS following 国内网站.',
 'shadowrocket':{
  'file':lean['file'],'sha256':lean['sha256'],'bytes':lean['bytes'],'revision':lean['revision'],'sourceBytesChanged':True,
  'immutableSource':lean['before']['file'],'immutableSourceSHA256':lean['before']['sha256'],'beforeBytes':lean['before']['bytes'],
  'provenance':{'file':'metadata/shadowrocket-v14.2-provenance.json','sha256':sha(root/'metadata/shadowrocket-v14.2-provenance.json')},
  'sourceManifest':{'file':'metadata/shadowrocket-lean.json','sha256':sha(root/'metadata/shadowrocket-lean.json')},
  'staticEvidence':{'file':'validation/shadowrocket-lean.json','sha256':sha(root/'validation/shadowrocket-lean.json'),'status':receipt['status']},
  'fullBusinessDNS':'SELF_CONTAINED','remoteSources':len(lean['sources']),'fullDomesticDNS':lean['dns']['fullDomesticDNS'],'nativeAcceptance':'NOT_RUN'},
 'jsEntries':[{k:e[k] for k in ['file','sha256','bytes']} for e in manifest['entries']],
 'clashmiSourceInspection':inspection,
 'clashmiSettings':{'bindScriptToActiveSubscription':True,'appendBuiltin':'noOverwrite','coreMode':'rule','coreIPv6':True,
  'profileOverwriteRules':False,'profileOverwriteProxyGroups':False,'appendApplePushRules':False,'tunOverwrite':False,**compatibility['networkExtensionSettings']},
 'officialSourceEvidence':{'file':'metadata/clashmi-compatibility.json','sha256':sha(root/'metadata/clashmi-compatibility.json')},
 'localCoreEvidence':{'file':core_file,'sha256':sha(root/core_file),'status':core['status']},
 'historicalFailedInvestigation':{'file':historical,'sha256':history_sha,'status':history['status'],'currentAcceptance':False},
 'wechatUploadRootCause':'Windows logs show local DIRECT IPv6 unreachable; iOS and macOS root cause and new compatibility mode device retry NOT_RETESTED',
 'report':'docs/reports/v14.3/IPv6回退与兼容入口.md',
 'restorationTool':{'file':'tools/restore-ios-delivery.py','sha256':sha(Path(__file__))},
 'clientDeployment':False,'deviceAcceptance':'NOT_RUN'}
(root/'metadata/ios-delivery.json').write_text(json.dumps(delivery,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':delivery['status'],'groups':26,'shadowrocketBytes':lean['bytes'],'beforeBytes':lean['before']['bytes'],'nativeAcceptance':'NOT_RUN'},ensure_ascii=False))
