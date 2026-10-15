"""Bind the authorized domestic-protocol revision to current source and evidence."""
from pathlib import Path
import hashlib, json
project=Path(__file__).resolve().parents[1]
root=project/'releases/v14.3'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=read(root/'metadata/balanced-sources.json')
assert manifest['domesticProtocolRevision']=='domestic-protocol-r1'
evidence={}
for name,expected in [('static','BALANCED_STATIC_PASS'),('native-core','BALANCED_LOCAL_CORE_PASS'),('balanced-empty-core','BALANCED_LOCAL_CORE_PASS'),('balanced-download-failure','BALANCED_COLD_DOWNLOAD_CORE_PASS'),('shadowrocket-lean','SHADOWROCKET_LEAN_STATIC_PASS_NATIVE_PENDING')]:
    file='validation/'+name+'.json'
    receipt=read(root/file)
    assert receipt['status']==expected,(name,receipt['status'])
    for e in receipt['sourceFiles']:
        assert sha(root/e['file'])==e['sha256'],(name,e['file'])
    evidence[name]={'file':file,'sha256':sha(root/file),'status':expected}
for e in manifest['entries']:
    assert sha(root/e['file'])==e['sha256']
archive='archive/v14.2-before-balanced-r1-20261012'
protocol_archive='archive/v14.3-before-domestic-protocol-r1-20261013'
old=read(project/protocol_archive/'CURRENT_RELEASE.json')
assert sha(project/'docs/需求.md')!=sha(project/protocol_archive/'docs/需求.md')
static=read(root/'validation/static.json')
core=read(root/'validation/native-core.json')
policy=read(root/'data/rules/embedded-policy.json')
latest=read(root/'validation/inputs/latest-candidate/manifest.json')
delivery=read(root/'metadata/ios-delivery.json')
assert latest['status']=='LATEST_CANDIDATES_SEMANTICALLY_EQUIVALENT_KEEP_PIN'
def item(file):return {'file':file,'sha256':sha(root/file)}
review={'version':'14.3','date':'2026-10-14','revision':'balanced-r1','domesticProtocolRevision':'domestic-protocol-r1',
 'status':'DOMESTIC_PROTOCOL_SOURCE_LOCAL_CORE_PASS_DEVICE_PENDING',
 'authorization':'User selected reviewed domestic TCP/UDP/DNS following 国内网站 and self-contained Shadowrocket business DNS; unknown IP-only UDP and generic STUN remain protected.',
 'contract':{'file':'docs/需求.md','sha256':sha(project/'docs/需求.md'),'originalBytesPreserved':False,
  'previousFile':protocol_archive+'/docs/需求.md','previousSHA256':sha(project/protocol_archive/'docs/需求.md'),
  'change':'User-authorized requirement 11 domestic domain protocol and DNS affinity; earlier contract preserved in archive. Additive Mac adapters retain this business contract and have separate delivery evidence.'},
 'sourceManifest':item('metadata/balanced-sources.json'),'entries':manifest['entries'],'testEvidence':evidence,
 'sourceComparison':item('metadata/source-comparison.json'),'latestCandidates':item('validation/inputs/latest-candidate/manifest.json'),
 'preservedArchive':{'directory':archive,'manifestSHA256':sha(project/archive/'manifest.json'),'releaseManifestSHA256':sha(project/archive/'release-byte-manifest.json')},
 'protocolBeforeArchive':{'directory':protocol_archive,'manifestSHA256':sha(project/protocol_archive/'manifest.json')},
 'iosDelivery':{**item('metadata/ios-delivery.json'),'revision':delivery['revision'],'status':delivery['status']},
 'metrics':{'fullInventoryHostsPerPlatform':static['platforms'][0]['fullInventoryHosts'],'criticalEmptyHostsPerPlatform':static['platforms'][0]['criticalColdDNS'],
  'staticChecks':len(static['checks']),'nativeObservations':{r['kind']:sum(p['cases'] for p in r['receipt']['platforms']) for r in core['runs']},
  'businessParents':sum(len(s['seeds']) for s in policy['services']),'businessExact':sum(len(s.get('exact',[])) for s in policy['services']),
  'criticalDomesticParents':len(policy['embedded']['cn']['payloadText'].splitlines()),'nativeSourceLock':30,'shadowrocketRuntimeSources':delivery['shadowrocket']['remoteSources'],'latestSemanticDeltas':0},
 'requirements':[{'number':i,'sourceContract':'PASS_JS_AND_DECLARED_SHADOWROCKET_MODEL','localCore':'PASS_JS_WITH_DECLARED_SCOPE','shadowrocketNative':'NOT_RUN','deviceAcceptance':'NOT_RUN'} for i in range(1,12)],
 'scope':'Three standalone JS entries, finite domain models and owned Mihomo loopback. Shadowrocket finite source model only; full domestic DNS relies on native direct/selected-node resolution and is not native verified.',
 'historicalCounterexample':core['historicalPreFixCounterexample'],
 'appJavaScriptCore':'NOT_RUN','vpnCapture':'NOT_RUN','publicIPv6':'NOT_RUN','longRunMemory':'NOT_RUN','clientDeployment':False,
 'recordingTool':{'file':'tools/record-v14.3.py','sha256':sha(Path(__file__))}}
current=dict(old)
current.update(version='14.3',repairRevision='balanced-r1',domesticProtocolRevision='domestic-protocol-r1',
 featureRevision='domestic-protocol-r1',directory='releases/v14.3',report=delivery['report'],status=review['status'],platformRevision='domestic-protocol-r1',
 clashmiReport=delivery['report'],managedRemoteSources=45,nativeManagedSources=30,shadowrocketRuntimeSources=15,legacyShadowrocketManagedSources=21,runtimeFloatingManagedSources=0,
 inlineProviderRows={k:manifest['entries'][i]['inlineRows'] for i,k in enumerate(['windows','android','clashmi'])},
 layoutRevision=6,packages='dist/v14.3',shadowrocket='LEAN_SOURCE_MODEL_PASS_NATIVE_NOT_RUN',
 ipv6Transport='NOT_RUN_ENVIRONMENT_IN_CURRENT_DNS_REPLAY',clientDeployment=False,
 entries={'windows':'releases/v14.3/src/windows/v14.3.js','android':'releases/v14.3/src/android/v14.3-android.js',
  'clashmi':'releases/v14.3/src/ios/v14.3-clashmi-domestic-protocol-r1.js','shadowrocket':'releases/v14.3/'+delivery['shadowrocket']['file']},
 deliveryRevision=delivery['revision'],iosDelivery='releases/v14.3/metadata/ios-delivery.json',iosInvestigationReport=delivery['report'])
if (root/'metadata/macos-delivery.json').exists():
    mac=read(root/'metadata/macos-delivery.json')
    assert mac['status']=='MACOS_SOURCE_LOCAL_CORE_PASS_DEVICE_PENDING'
    for e in mac['entries']:
        assert sha(root/e['file'])==e['sha256']
    for e in mac['testEvidence'].values():
        assert sha(root/e['file'])==e['sha256']
        for source in read(root/e['file'])['sourceFiles']:
            assert sha(root/source['file'])==source['sha256'],source['file']
    review['macosDelivery']={**item('metadata/macos-delivery.json'),'revision':mac['revision'],'status':mac['status']}
    current.update(macosRevision=mac['revision'],macosDelivery='releases/v14.3/metadata/macos-delivery.json',
                   macosReport=mac['report'],macos='CONFIG_SOURCE_WINDOWS_LOCAL_CORE_PASS_MAC_DEVICE_NOT_RUN',layoutRevision=7)
    for key,e in zip(['macosFlClash','macosClashMi'],mac['entries']):
        current['entries'][key]='releases/v14.3/'+e['file']
        current['inlineProviderRows'][key]=e['inlineRows']
(root/'metadata/balanced-review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(project/'CURRENT_RELEASE.json').write_text(json.dumps(current,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':review['status'],'metrics':review['metrics'],'shadowrocketNative':'NOT_RUN','clientDeployment':False}))
