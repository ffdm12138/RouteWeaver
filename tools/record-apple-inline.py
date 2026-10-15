"""Bind the scoped Apple suffix repair to current source and fresh core evidence."""
import hashlib, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
RELEASE = ROOT / 'releases/v14.2'
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
bound = lambda file: {'file': file, 'sha256': sha(RELEASE / file)}
statuses = {'static': 'STATIC_PASS', 'apple-inline': 'APPLE_INLINE_STATIC_PASS', 'apple-inline-core': 'APPLE_INLINE_LOCAL_CORE_PASS',
    'repair-review': 'REPAIR_REGRESSION_PASS', 'domestic-audit': 'DOMESTIC_AUDIT_PASS', 'domestic-selector': 'DOMESTIC_SELECTOR_PASS',
    'api-browser-compat': 'API_BROWSER_COMPAT_STATIC_PASS', 'api-browser-regression': 'API_REAL_IP_CORE_PASS_BROWSER_TUN_RETEST_PENDING',
    'native-routing': 'CORE_ROUTING_PASS', 'native-dns-egress': 'CORE_DNS_EGRESS_PASS', 'native-selectors': 'CORE_MANUAL_SELECTORS_PASS',
    'native-inbound-guard': 'CORE_INBOUND_GUARD_PASS', 'thunder-repair': 'THUNDER_REPAIR_STATIC_PASS', 'thunder-r2': 'THUNDER_R2_STATIC_PASS',
    'thunder-r3': 'THUNDER_R3_STATIC_PASS', 'thunder-r4': 'THUNDER_R4_ELEVEN_CONTRACTS_STATIC_PASS', 'thunder-r5': 'THUNDER_R5_ELEVEN_CONTRACTS_STATIC_PASS',
    'thunder-closeout': 'THUNDER_CLOSEOUT_EDGE_AUDIT_PASS', 'thunder-domain-coverage': 'THUNDER_DOMAIN_COVERAGE_PASS', 'independent-r5': 'THREE_PLATFORM_INDEPENDENT_REVIEW_PASS'}
receipts = {}
for name, status in statuses.items():
    item = read(RELEASE / f'validation/{name}.json')
    assert item['status'] == status, name
    for source in item['sourceFiles']:
        assert sha(RELEASE / source['file']) == source['sha256'], f'Stale {name}: {source["file"]}'
    receipts[name] = {**bound(f'validation/{name}.json'), 'status': status}
before = RELEASE / 'validation/inputs/apple-inline-before'
for entry in read(before / 'manifest.json')['files']:
    assert sha(before / entry['file']) == entry['sha256']
archive = ROOT / 'archive/v14.2-before-apple-inline-r1-20261011'
manifest = read(archive / 'manifest.json')
assert manifest['priorRevision'] == 'thunder-closeout-r6' and len(manifest['files']) == 515
for entry in manifest['files']:
    assert sha(archive / entry['file']) == entry['sha256']
for name in ['thunder-r4', 'thunder-r5']:
    requirements = read(RELEASE / f'validation/{name}.json')['requirements']
    assert [r['id'] for r in requirements] == list(range(1, 12)) and all(r['static'] == 'PASS' for r in requirements)
apple = read(RELEASE / 'validation/apple-inline.json')
core = read(RELEASE / 'validation/apple-inline-core.json')
assert len(apple['counterexamples']) == 8
assert core['condition'] == 'VALID_EMPTY_APPLE_FILE_PROVIDER' and len(core['runs']) == 2
for run in core['runs']:
    assert run['receipt']['providerCondition']['ruleCount'] == 0
    for entry in run['receipt']['sourceFiles']:
        assert sha(RELEASE / entry['file']) == entry['sha256']
attempt_dir = RELEASE / 'validation/inputs/apple-inline-attempts'
attempt_dir.mkdir(exist_ok=True)
attempts = []
for name, explanation in [('initial-static.json', 'Historical R5 table-delta test switched to immutable pre-Apple baseline; current exact Apple delta independently checked'),
    ('initial-thunder-r5.json', 'Same historical R5 table-delta failure, not a production bug'),
    ('sandbox-core-attempt.json', 'Sandbox denied owned loopback controller (EACCES); isolated permission rerun passed'),
    ('inbound-first-attempt.json', 'Inherited harness probed before file providers were ready; strict readiness gate added; pre-fix bypass and post-fix REJECT both reproduced')]:
    target = attempt_dir / name
    data = (ROOT / '.work/apple-inline-repair-20261011' / name).read_bytes()
    if target.exists():
        assert target.read_bytes() == data, 'Do not rewrite retained attempts'
    else:
        target.write_bytes(data)
    attempts.append({**bound(target.relative_to(RELEASE).as_posix()), 'explanation': explanation})
requirements = [{'id': i, 'sourceContract': 'PASS', 'currentReceipts': [receipts[n] for n in ['static', 'thunder-r4', 'thunder-r5']], 'device': 'NOT_RUN'} for i in range(1, 12)]
review = {'version': '14.2', 'date': '2026-10-11', 'revision': 'apple-inline-r1', 'priorRevision': 'thunder-closeout-r6',
    'status': 'APPLE_INLINE_SOURCE_LOCAL_CORE_PASS_DEVICE_PENDING', 'authorization': 'User: 好的兄弟，修复！; embedded Apple repair and local validation; active client replacement not performed',
    'contract': {'file': 'docs/需求.md', 'sha256': sha(ROOT / 'docs/需求.md')}, 'priorMetadata': bound('metadata/thunder-closeout-review.json'),
    'beforeManifest': bound('validation/inputs/apple-inline-before/manifest.json'),
    'preservedArchive': {'directory': archive.relative_to(ROOT).as_posix(), 'manifestSHA256': sha(archive / 'manifest.json'), 'files': len(manifest['files'])},
    'lockedSources': {**bound('data/rule-sources.lock.json'), 'count': 45}, 'remoteSourceChanges': 0,
    'entries': [bound(file) for file in ['src/windows/v14.2.js', 'src/android/v14.2-android.js', 'src/ios/v14.2-shadowrocket.conf', 'data/rules/business-services.json', 'tools/generate-v14.2-shadowrocket.js', 'metadata/shadowrocket-sources.json']],
    'reviewedOrigin': apple['reviewedOrigin'],
    'runtimeDelta': {'embeddedSuffixes': ['apple.com.cn', 'aaplimg.com'], 'mihomo': 'Two suffix routes with adjacent REJECT and two literal nameserver policies',
        'shadowrocket': 'Two embedded suffix routes; existing apex/wildcard DNS entries promoted ahead of remote projections; native semantics NOT_RUN',
        'otherOutput': 'Complete output equality after removing only the reviewed delta and revision marker',
        'DNSUpstreamsChanged': False, 'IPv6Changed': False, 'fakeIPChanged': False, 'providerDownloadProxyChanged': False},
    'findings': [{'id': 'APPLE-INLINE-01', 'domain': 'apple.com.cn', 'problem': 'With valid empty Apple classifier, Windows/Android TCP reached domestic default DIRECT while DNS used fallback', 'resolutionStatus': 'REPAIRED_VERIFIED'},
        {'id': 'APPLE-INLINE-02', 'domain': 'aaplimg.com', 'problem': 'With valid empty Apple classifier, apex/static child TCP reached domestic default DIRECT while DNS used fallback', 'resolutionStatus': 'REPAIRED_VERIFIED'}],
    'requirements': requirements, 'testEvidence': receipts, 'attempts': attempts,
    'validationHarnessChanges': ['R5/R6 historical exact deltas use immutable pre-Apple bytes; current exact delta independently enforced', 'Inbound test waits for all file providers and records its response body'],
    'metrics': {'staticChecks': len(read(RELEASE / 'validation/static.json')['checks']), 'appleStaticChecks': len(apple['checks']), 'appleBeforeCounterexamples': len(apple['counterexamples']),
        'appleRoutingCases': sum(p['cases'] for p in core['runs'][0]['receipt']['platforms']), 'appleDNSCases': sum(p['cases'] for p in core['runs'][1]['receipt']['platforms']),
        'nativeRoutingCases': sum(p['cases'] for p in read(RELEASE / 'validation/native-routing.json')['platforms']), 'nativeDNSCases': sum(p['cases'] for p in read(RELEASE / 'validation/native-dns-egress.json')['platforms'])},
    'retainedBoundaries': {'emptyProviderIsNotDownloadFailure': True, 'HTTP541RootCause': 'UNRESOLVED', 'browserLogin': 'NOT_RUN', 'deviceAcceptance': 'NOT_RUN', 'shadowrocketNative': 'NOT_RUN', 'publicIPv6': 'NOT_RUN', 'deployedClientChanged': False},
    'recordingTool': {'file': 'tools/record-apple-inline.py', 'sha256': sha(pathlib.Path(__file__))}}
(RELEASE / 'metadata/apple-inline-review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'status': review['status'], 'metrics': review['metrics'], 'preservedFiles': len(manifest['files'])}, ensure_ascii=False))
