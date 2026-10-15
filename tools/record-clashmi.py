"""Bind the added Clash Mi client to reviewed rules and its own evidence."""
import hashlib, json, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
release = root / 'releases/v14.2'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
bound = lambda f: {'file': f, 'sha256': sha(release / f)}
static = read(release / 'validation/clashmi.json')
core = read(release / 'validation/clashmi-core.json')
assert static['status'] == 'CLASHMI_STATIC_PASS'
assert core['status'] == 'CLASHMI_LOCAL_CORE_PASS'
for receipt in [static, core]:
    for e in receipt['sourceFiles']:
        assert sha(release / e['file']) == e['sha256'], 'Stale Clash Mi evidence: ' + e['file']
embedded = read(release / 'metadata/embedded-domain-review.json')
retained = [e for e in embedded['entries'] if e['file'] in ['src/windows/v14.2.js','src/android/v14.2-android.js','src/ios/v14.2-shadowrocket.conf']]
assert len(retained) == 3
for e in retained:
    assert sha(release / e['file']) == e['sha256'], 'Original client changed: ' + e['file']
before = read(release / 'validation/inputs/clashmi-before/manifest.json')
for e in before['files']:
    assert sha(release / 'validation/inputs/clashmi-before' / e['file']) == e['sha256']
compat = read(release / 'metadata/clashmi-compatibility.json')
for e in compat['snapshots']:
    assert sha(release / e['file']) == e['sha256']
metrics = {'staticChecks': len(static['checks']), 'staticRoutingCases': static['routingCases'], 'staticDNSCases': static['dnsCases']}
for run in core['runs']:
    metrics[{'routing':'coreRoutingCases','dns-egress':'coreDNSCases','selectors':'coreSelectorObservations'}[run['kind']]] = sum(p['cases'] for p in run['receipt']['platforms'])
review = {'version':'14.2','date':'2026-10-12','revision':'clashmi-object-r2',
          'status':'CLASHMI_SOURCE_LOCAL_CORE_PASS_DEVICE_PENDING',
          'authorization':'User requested Clash Mi and reported String-to-Map evaluation failure on iOS 1.0.30.1605; repair the script and delivery.',
          'classificationRevision':'embedded-domain-r1', 'retainedOriginalEntries':retained,
          'frozenContract':{'file':'docs/需求.md','sha256':sha(root / 'docs/需求.md'),
                            'additiveScope':'User added Clash Mi as a fourth client; inherit all eleven requirements; original contract bytes preserved'},
          'beforeManifest':bound('validation/inputs/clashmi-before/manifest.json'),
          'compatibility':bound('metadata/clashmi-compatibility.json'), 'generatedSources':bound('metadata/clashmi-sources.json'),
          'entries':[bound(f) for f in ['src/ios/v14.2-clashmi.js','src/ios/v14.2-clashmi-object-r2.js','tools/clashmi-adapter.js','tools/generate-v14.2-clashmi.cjs','tests/clashmi.cjs','tests/clashmi-fixture.cjs','tests/native-clashmi.cjs','data/rule-sources.lock.json']],
          'evidence':{n:{**bound('validation/'+n+'.json'),'status':read(release / ('validation/'+n+'.json'))['status']} for n in ['clashmi','clashmi-core']},
          'metrics':metrics, 'requirements':[{'id':i,'sourceContract':'PASS','localCore': 'PASS' if i != 9 else 'PINNED_SOURCE_AND_REVIEW_GUARDS_PASS',
                                            'nativeIOS':'NOT_RUN'} for i in range(1,12)],
          'firstAttempts':[bound(f) for f in ['validation/inputs/clashmi-attempts/first-static/receipt.json','validation/inputs/clashmi-attempts/second-static.json','validation/inputs/clashmi-attempts/sandbox-core.json']],
          'deviceGates':{'javaScriptCore':'NOT_RUN','finalAppPatch':'NOT_RUN','networkExtension':'NOT_RUN','publicIPv6':'NOT_RUN','memory50MB':'NOT_RUN'},
          'priorPackages':{'directory':'archive/v14.2-before-clashmi-object-r2-20261012','manifestSHA256':sha(root / 'archive/v14.2-before-clashmi-object-r2-20261012/manifest.json')},
          'clientDeployment':False, 'recordingTool':{'file':'tools/record-clashmi.py','sha256':sha(pathlib.Path(__file__))}}
object_before='validation/inputs/clashmi-object-before'
for e in read(release / object_before / 'manifest.json')['files']:
    assert sha(release / object_before / e['file']) == e['sha256']
review['beforeObjectManifest']=bound(object_before+'/manifest.json')
review['priorObjectReview']=bound(object_before+'/project/releases/v14.2/metadata/clashmi-review.json')
review['userEvidence']=bound('validation/inputs/clashmi-object-error/user-observations.json')
review['objectBridgeRegression']=static['bridgeRegression']
review['observedAppVersion']='1.0.30.1605 ios'
review['priorIOSBridge']='USER_REPORTED_STRING_TO_MAP_FAIL'
review['repairScope']='main return type and bridge test: String -> object; routing/DNS/UDP/TUN settings unchanged except generated metadata'
(release / 'metadata/clashmi-review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':review['status'],'metrics':metrics},ensure_ascii=False))
