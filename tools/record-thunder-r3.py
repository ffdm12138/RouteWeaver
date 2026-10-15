"""Bind the resumed audit to current bytes, preserving R1/R2 evidence."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RELEASE = ROOT / 'releases/v14.2'
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert read(ROOT / 'CURRENT_RELEASE.json')['repairRevision'] == 'thunder-repair-r3'
prior = ROOT / 'archive/v14.2-before-thunder-repair-r3-20261010'
for entry in read(prior / 'manifest.json')['files']:
    assert sha(prior / entry['file']) == entry['sha256'], entry['file']
assert sha(RELEASE / 'metadata/thunder-r2-review.json') == sha(prior / 'releases/v14.2/metadata/thunder-r2-review.json')
baseline = RELEASE / 'validation/inputs/thunder-r3-before'
for entry in read(baseline / 'manifest.json')['files']:
    assert sha(baseline / entry['file']) == entry['sha256']
lock = read(RELEASE / 'data/rule-sources.lock.json')
assert sha(RELEASE / 'data/rule-sources.lock.json') == sha(prior / 'releases/v14.2/data/rule-sources.lock.json')
for entry in lock['sources']:
    assert sha(RELEASE / entry['file']) == entry['sha256']
    assert sha(RELEASE / entry['classifier']['file']) == entry['classifier']['sha256']
expected = {'static': 'STATIC_PASS', 'thunder-r2': 'THUNDER_R2_STATIC_PASS', 'thunder-r3': 'THUNDER_R3_STATIC_PASS',
            'thunder-domain-coverage': 'THUNDER_DOMAIN_COVERAGE_PASS', 'native-routing': 'CORE_ROUTING_PASS',
            'native-dns-egress': 'CORE_DNS_EGRESS_PASS', 'native-selectors': 'CORE_MANUAL_SELECTORS_PASS',
            'native-inbound-guard': 'CORE_INBOUND_GUARD_PASS'}
evidence = {}
for name, status in expected.items():
    file = RELEASE / f'validation/{name}.json'
    d = read(file)
    assert d['status'] == status, name
    for item in d['sourceFiles']:
        assert sha(RELEASE / item['file']) == item['sha256'], f'Stale {name}: {item["file"]}'
    evidence[name] = {'file': file.relative_to(RELEASE).as_posix(), 'sha256': sha(file), 'status': status}
coverage = read(RELEASE / 'validation/thunder-domain-coverage.json')
assert all(p['dnsMismatchCount'] == 0 and not p['udpInconsistencies'] for p in coverage['platforms'])
assert coverage['differences'] == [{'host': 'chatgpt-async-webps-prod-eastus-1.webpubsub.azure.com',
    'groups': {'desktop': 'OpenAI 服务', 'android': 'OpenAI 服务', 'shadowrocket': '公共基础服务'}}]
names = ['src/windows/v14.2.js', 'src/android/v14.2-android.js', 'src/ios/v14.2-shadowrocket.conf',
         'tools/generate-v14.2-shadowrocket.js', 'tools/sync-reviewed-data.cjs', 'metadata/shadowrocket-sources.json',
         'data/rules/safety-classifiers.json', 'tests/static.cjs', 'tests/cases.cjs', 'tests/thunder-r2.cjs',
         'tests/thunder-r3.cjs', 'tests/r3-fixture.cjs', 'tests/native-inbound-guard.cjs', 'tests/domestic-audit.cjs']
findings = [
    {'id': 'R3-01', 'severity': 'MAJOR', 'description': 'doh.18bit.cn remained domestic DIRECT on Android/iOS; approved resolver blocking differed across platforms',
     'resolution': 'Embed the same 127 approved exact/suffix DoH records; protect against missing remote caches; retain core resolver and explicit bootstrap behavior',
     'acceptance': 'STATIC_ALL_APPROVED_DESTINATIONS_AND_MIHOMO_ROUTING_PASS'},
    {'id': 'R3-02', 'severity': 'MAJOR', 'description': 'Native LAN list widened exact router hosts and added public namespace DIRECT exceptions',
     'resolution': 'Embed 130 exact/suffix records from the same approved private classifier, retain existing private CIDRs; omit the unverified single-label regex',
     'acceptance': 'STATIC_LAN_SCOPE_AND_MIHOMO_UNKNOWN_UDP_PASS_IOS_NATIVE_NOT_RUN'},
    {'id': 'R3-03', 'severity': 'MAJOR', 'description': 'Native Azure wildcard accepted nonnumeric or extra-label tenant names excluded by the reviewed OpenAI regex',
     'resolution': 'Omit the unsafe native glob for both routing and Host DNS; use the shared proxy group; disclose reduced OpenAI-specific native coverage',
     'acceptance': 'STATIC_NO_WRONG_COMPANY_OR_DNS_GROUP_IOS_ASYNC_COVERAGE_GAP'},
    {'id': 'R3-04', 'severity': 'MAJOR', 'description': 'Inherited listener proxy/rule or fixed tunnel outlet bypassed the main company/DNS/UDP guards',
     'resolution': 'Reject incompatible inputs before returning configuration; preserve ordinary listeners and source input bytes',
     'acceptance': 'STATIC_NEGATIVE_INPUTS_AND_REAL_CORE_BEFORE_AFTER_INBOUND_PASS'},
]
report = {'version': '14.2', 'date': '2026-10-10', 'revision': 'thunder-repair-r3', 'priorRevision': 'thunder-repair-r2',
    'status': 'REPAIRED_LOCAL_CORE_VERIFIED_IOS_DEVICE_PENDING',
    'authorization': 'User asked to resume the interrupted thunder audit and repair all three platform profiles.',
    'contract': {'file': 'docs/需求.md', 'sha256': sha(ROOT / 'docs/需求.md'), 'amended': False},
    'remoteSourceChanges': 0,
    'beforeManifest': {'file': 'validation/inputs/thunder-r3-before/manifest.json', 'sha256': sha(baseline / 'manifest.json')},
    'r2Metadata': {'file': 'metadata/thunder-r2-review.json', 'sha256': sha(RELEASE / 'metadata/thunder-r2-review.json')},
    'lockedSources': {'file': 'data/rule-sources.lock.json', 'sha256': sha(RELEASE / 'data/rule-sources.lock.json'), 'count': len(lock['sources'])},
    'entries': [{'file': name, 'sha256': sha(RELEASE / name)} for name in names], 'testEvidence': evidence, 'findings': findings,
    'metrics': {'staticChecks': len(read(RELEASE / 'validation/static.json')['checks']),
                'independentChecks': len(read(RELEASE / 'validation/thunder-r3.json')['checks']),
                'priorCounterexamples': len(read(RELEASE / 'validation/thunder-r3.json')['beforeCounterexamples']),
                'localCoreRoutingCases': sum(p['cases'] for p in read(RELEASE / 'validation/native-routing.json')['platforms']),
                'localCoreDNSCases': sum(p['cases'] for p in read(RELEASE / 'validation/native-dns-egress.json')['platforms']),
                'localCoreSelectorObservations': sum(p['cases'] for p in read(RELEASE / 'validation/native-selectors.json')['platforms']),
                'localCoreInboundObservations': sum(p['cases'] for p in read(RELEASE / 'validation/native-inbound-guard.json')['platforms']),
                'finiteDomainSample': coverage['hostCount'], 'crossPlatformClassifierDifferences': len(coverage['differences'])},
    'knownLimits': ['Windows real TUN, Android VpnService, Shadowrocket native execution and public IPv6 packet capture NOT_RUN',
                    'Native Azure async regex coverage gap uses protected shared infrastructure; exact company hosts need independent evidence',
                    'Single-label private regex is omitted on iOS; unknown local labels may require an explicit reviewed exception',
                    'Known DoH destination guard cannot identify arbitrary encrypted DNS or application traffic outside VPN',
                    'Sandbox EACCES attempt is preserved separately; successful owned loopback tests used scoped execution permission'],
    'clientDeployment': False}
(RELEASE / 'metadata/thunder-r3-review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'revision': report['revision'], 'metrics': report['metrics']}, ensure_ascii=False))
