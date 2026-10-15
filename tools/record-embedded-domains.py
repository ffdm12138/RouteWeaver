"""Bind the reviewed domain embedding and latest-source audit to current bytes."""
import hashlib, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
RELEASE = ROOT / 'releases/v14.2'
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
bound = lambda file: {'file': file, 'sha256': sha(RELEASE / file)}
statuses = {'static':'STATIC_PASS','embedded-domains':'EMBEDDED_DOMAIN_STATIC_PASS','embedded-domains-core':'EMBEDDED_DOMAIN_LOCAL_CORE_PASS','embedded-domains-download-failure':'EMBEDDED_DOMAIN_COLD_DOWNLOAD_CORE_PASS',
    'apple-inline':'APPLE_INLINE_STATIC_PASS','apple-inline-core':'APPLE_INLINE_LOCAL_CORE_PASS','repair-review':'REPAIR_REGRESSION_PASS','domestic-audit':'DOMESTIC_AUDIT_PASS','domestic-selector':'DOMESTIC_SELECTOR_PASS',
    'api-browser-compat':'API_BROWSER_COMPAT_STATIC_PASS','api-browser-regression':'API_REAL_IP_CORE_PASS_BROWSER_TUN_RETEST_PENDING','native-routing':'CORE_ROUTING_PASS','native-dns-egress':'CORE_DNS_EGRESS_PASS',
    'native-selectors':'CORE_MANUAL_SELECTORS_PASS','native-inbound-guard':'CORE_INBOUND_GUARD_PASS','thunder-repair':'THUNDER_REPAIR_STATIC_PASS','thunder-r2':'THUNDER_R2_STATIC_PASS','thunder-r3':'THUNDER_R3_STATIC_PASS',
    'thunder-r4':'THUNDER_R4_ELEVEN_CONTRACTS_STATIC_PASS','thunder-r5':'THUNDER_R5_ELEVEN_CONTRACTS_STATIC_PASS','thunder-closeout':'THUNDER_CLOSEOUT_EDGE_AUDIT_PASS','thunder-domain-coverage':'THUNDER_DOMAIN_COVERAGE_PASS','independent-r5':'THREE_PLATFORM_INDEPENDENT_REVIEW_PASS'}
receipts = {}
for name, status in statuses.items():
    data = read(RELEASE / f'validation/{name}.json')
    assert data['status'] == status, name
    for source in data['sourceFiles']:
        assert sha(RELEASE / source['file']) == source['sha256'], f'Stale {name}: {source["file"]}'
    if name in {'embedded-domains-core','embedded-domains-download-failure','apple-inline-core'}:
        for run in data['runs']:
            for source in run['receipt']['sourceFiles']:
                assert sha(RELEASE / source['file']) == source['sha256'], f'Stale nested {name}: {source["file"]}'
    receipts[name] = {**bound(f'validation/{name}.json'), 'status':status}
archive = ROOT / 'archive/v14.2-before-embedded-domain-r1-20261011'
manifest = read(archive / 'manifest.json')
assert manifest['revision'] == 'apple-inline-r1' and len(manifest['files']) == 549
for entry in manifest['files']:
    assert sha(archive / entry['file']) == entry['sha256'], entry['file']
before = 'validation/inputs/embedded-domain-before/manifest.json'
for entry in read(RELEASE / before)['files']:
    assert sha(RELEASE / pathlib.Path(before).parent / entry['file']) == entry['sha256']
latest = read(RELEASE / 'data/rules/embedded-source-review.json')
assert latest['status'] == 'REVIEWED_SEMANTICALLY_EQUIVALENT' and latest['classificationChanges'] == 0
assert sha(RELEASE / latest['candidateManifest']['file']) == latest['candidateManifest']['sha256']
static = read(RELEASE / 'validation/embedded-domains.json')
assert not static['failures'] and len(static['counterexamples']) > 0
snapshot = read(RELEASE / 'data/rules/embedded-domains.json')
metrics = {'staticChecks':len(read(RELEASE / 'validation/static.json')['checks']),
    'embeddedStaticChecks':len(static['checks']), 'businessDomainSamples':static['platforms'][0]['businessHosts'],
    'businessObservations':sum(p['businessObservations'] for p in static['platforms']), 'domesticDomainRows':len(snapshot['groups']['cn']['payload']),
    'domesticObservations':sum(p['domesticObservations'] for p in static['platforms']), 'beforeCounterexamples':len(static['counterexamples']),
    'inlineClassifierRows':sum(len(p['payload']) for p in snapshot['groups'].values()), 'reviewedLatestSources':latest['sourceCount']}
for name, prefix in [('embedded-domains-core','empty'),('embedded-domains-download-failure','coldDownload')]:
    runs = read(RELEASE / f'validation/{name}.json')['runs']
    metrics[prefix+'RoutingCases'] = sum(p['cases'] for p in runs[0]['receipt']['platforms'])
    metrics[prefix+'DNSCases'] = sum(p['cases'] for p in runs[1]['receipt']['platforms'])
for name, key in [('native-routing','nativeRoutingCases'),('native-dns-egress','nativeDNSCases')]:
    metrics[key] = sum(p['cases'] for p in read(RELEASE / f'validation/{name}.json')['platforms'])
attempt_dir = RELEASE / 'validation/inputs/embedded-domain-attempts'
attempt_dir.mkdir(exist_ok=True)
attempts = []
for p in sorted((ROOT / '.work/embedded-domain-r1-20261011').glob('*.log')):
    dest = attempt_dir / p.name
    if dest.exists():
        assert dest.read_bytes() == p.read_bytes(), 'Do not rewrite retained attempt'
    else:
        dest.write_bytes(p.read_bytes())
    attempts.append(bound(dest.relative_to(RELEASE).as_posix()))
requirements = []
for name in ['thunder-r4','thunder-r5']:
    data = read(RELEASE / f'validation/{name}.json')['requirements']
    assert [r['id'] for r in data] == list(range(1,12)) and all(r['static'] == 'PASS' for r in data)
requirements = [{'id':i,'sourceContract':'PASS','currentReceipts':[receipts[n] for n in ['static','embedded-domains','thunder-r4','thunder-r5']],'device':'NOT_RUN'} for i in range(1,12)]
review = {'version':'14.2','date':'2026-10-12','revision':'embedded-domain-r1','priorRevision':'apple-inline-r1','status':'EMBEDDED_DOMAIN_SOURCE_LOCAL_CORE_PASS_DEVICE_PENDING',
    'authorization':'User requested embedding business/domestic domain tables with remote supplements, plus latest upstream review',
    'contract':{'file':'docs/需求.md','sha256':sha(ROOT / 'docs/需求.md')}, 'priorMetadata':bound('metadata/apple-inline-review.json'), 'beforeManifest':bound(before),
    'preservedArchive':{'directory':archive.relative_to(ROOT).as_posix(),'manifestSHA256':sha(archive / 'manifest.json'),'files':len(manifest['files'])},
    'lockedSources':{**bound('data/rule-sources.lock.json'),'count':45}, 'latestSourceReview':bound('data/rules/embedded-source-review.json'), 'embeddedSnapshot':bound('data/rules/embedded-domains.json'),
    'runtimeClassificationChanges':0, 'entries':[bound(f) for f in ['src/windows/v14.2.js','src/android/v14.2-android.js','src/ios/v14.2-shadowrocket.conf','tools/generate-v14.2-shadowrocket.js','metadata/shadowrocket-sources.json','tools/sync-reviewed-data.cjs','tools/build-embedded-domains.cjs']],
    'runtimeDelta':'Reviewed domain inline provider immediately precedes its former HTTP table at the same priority; business DNS uses both in the same order; domestic DNS/UDP retains fallback; same cached classification, remote supplements retained',
    'findings':[{'id':'EMBEDDED-01','problem':'Remote-only business domain baselines could demote to fallback/domestic when empty','resolutionStatus':'REPAIRED_VERIFIED'},
                {'id':'EMBEDDED-02','problem':'Domestic reviewed table was not fully available without provider content','resolutionStatus':'REPAIRED_VERIFIED'}],
    'requirements':requirements,'testEvidence':receipts,'metrics':metrics,'attempts':attempts,
    'retainedBoundaries':{'scope':'Finite reviewed classifiers, not every website','remoteSources':'Pinned reviewed commits; upstream content updates require candidate delta review','remoteIPProviders':'Retained as remote, not embedded','singleLabelLAN':'52 historical names remain different between Mihomo and native iOS source model',
        'shadowrocketRemoteDNS':'New remote business domains require regenerated reviewed Host DNS; native parser/size limits NOT_RUN','nativeIOS':'NOT_RUN','TUNVPN':'NOT_RUN','publicIPv6':'NOT_RUN','deployedClientChanged':False},
    'appleUserSmoke':{'result':'USER_REPORTED_WINDOWS_LOGIN_SUCCESS_AFTER_APPLE_INLINE_R1','independentBrowserReproduction':'NOT_RUN','HTTP541RootCause':'UNRESOLVED'},
    'recordingTool':{'file':'tools/record-embedded-domains.py','sha256':sha(pathlib.Path(__file__))}}
(RELEASE / 'metadata/embedded-domain-review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':review['status'],'metrics':metrics,'preservedFiles':len(manifest['files'])},ensure_ascii=False))
