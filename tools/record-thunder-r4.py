"""Bind the eleven-contract R4 audit to current source and test bytes."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = ROOT / 'releases/v14.2'
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
prior = ROOT / 'archive/v14.2-before-thunder-repair-r4-20261010'
snapshot = read(prior / 'manifest.json')
for e in snapshot['files']:
    assert sha(prior / e['file']) == e['sha256'], e['file']
assert read(ROOT / 'CURRENT_RELEASE.json')['repairRevision'] == 'thunder-repair-r4'
assert sha(ROOT / 'docs/需求.md') == sha(prior / 'docs/需求.md')
for name in ['thunder-repair-review', 'thunder-r2-review', 'thunder-r3-review']:
    assert sha(R / f'metadata/{name}.json') == sha(prior / f'releases/v14.2/metadata/{name}.json')
base = R / 'validation/inputs/thunder-r4-before'
for e in read(base / 'manifest.json')['files']:
    assert sha(base / e['file']) == e['sha256']
lock = read(R / 'data/rule-sources.lock.json')
assert sha(R / 'data/rule-sources.lock.json') == sha(prior / 'releases/v14.2/data/rule-sources.lock.json')
assert len(lock['sources']) == 45
for e in lock['sources']:
    assert sha(R / e['file']) == e['sha256']
    assert sha(R / e['classifier']['file']) == e['classifier']['sha256']
expected = {'static': 'STATIC_PASS', 'thunder-r2': 'THUNDER_R2_STATIC_PASS', 'thunder-r3': 'THUNDER_R3_STATIC_PASS',
            'thunder-r4': 'THUNDER_R4_ELEVEN_CONTRACTS_STATIC_PASS', 'thunder-domain-coverage': 'THUNDER_DOMAIN_COVERAGE_PASS',
            'native-routing': 'CORE_ROUTING_PASS', 'native-dns-egress': 'CORE_DNS_EGRESS_PASS',
            'native-selectors': 'CORE_MANUAL_SELECTORS_PASS', 'native-inbound-guard': 'CORE_INBOUND_GUARD_PASS'}
evidence = {}
for name, status in expected.items():
    p = R / f'validation/{name}.json'
    d = read(p)
    assert d['status'] == status, name
    for item in d['sourceFiles']:
        assert sha(R / item['file']) == item['sha256'], f'Stale {name}: {item["file"]}'
    evidence[name] = {'file': p.relative_to(R).as_posix(), 'sha256': sha(p), 'status': status}
coverage = read(R / 'validation/thunder-domain-coverage.json')
assert not coverage['differences']
assert all(p['dnsMismatchCount'] == 0 and not p['udpInconsistencies'] for p in coverage['platforms'])
contract = read(R / 'validation/thunder-r4.json')
assert [r['id'] for r in contract['requirements']] == list(range(1, 12))
assert all(r['static'] == 'PASS' and r['checks'] for r in contract['requirements'])
names = ['公司归组与共享边界', 'DNS 随业务选择', 'UDP 不支持拒绝', 'IPv4/IPv6 双栈', '主动 DIRECT 保留',
         '两个手动公共组', '未知流量统一代理兜底', '业务与 STUN 优先级', '审核固定来源', '三端一致性与分层验收', '国内集中切换']
native_gates = {1: ['native-routing', 'native-dns-egress'], 2: ['native-dns-egress'], 3: ['native-routing'],
                4: ['native-routing', 'native-dns-egress'], 5: ['native-routing', 'native-dns-egress'],
                6: ['native-selectors', 'native-routing', 'native-dns-egress'], 7: ['native-routing', 'native-dns-egress'],
                8: ['native-routing'], 9: [], 10: ['native-routing', 'native-dns-egress', 'native-selectors', 'native-inbound-guard'],
                11: ['native-routing', 'native-selectors', 'native-dns-egress']}
requirements = [{'id': r['id'], 'name': names[r['id']-1], 'sourceContract': 'PASS', 'dedicatedChecks': len(r['checks']),
                 'sourceReceipt': evidence['thunder-r4'], 'localMihomoEvidence': [evidence[k] for k in native_gates[r['id']]],
                 'iOSNative': 'NOT_RUN', 'windowsAndroidDevice': 'NOT_RUN',
                 'acceptance': 'SOURCE_REVIEWED_LOCAL_CORE_SUPPORTED_DEVICE_PENDING' if native_gates[r['id']] else 'SOURCE_FIXED_HASH_AND_NEGATIVE_UPDATE_GUARDS_PASS'}
                for r in contract['requirements']]
entries = ['src/windows/v14.2.js', 'src/android/v14.2-android.js', 'src/ios/v14.2-shadowrocket.conf',
           'tools/generate-v14.2-shadowrocket.js', 'tools/sync-reviewed-data.cjs', 'tools/validate-azure-async.cjs',
           'tools/refresh-api-evidence.cjs', 'metadata/shadowrocket-sources.json', 'data/rules/company-core.json',
           'data/rules/business-services.json', 'data/rules/azure-async-review.json', 'tests/static.cjs', 'tests/cases.cjs',
           'tests/thunder-domain-coverage.cjs', 'tests/thunder-repair.cjs', 'tests/repair-review.cjs', 'tests/thunder-r3.cjs',
           'tests/thunder-r4.cjs', 'tests/r4-fixture.cjs', 'tests/native-dns-egress.cjs']
metrics = {'staticChecks': len(read(R / 'validation/static.json')['checks']), 'independentElevenContractChecks': len(contract['checks']),
           'priorCounterexamples': len(contract['beforeCounterexamples']), 'finiteDomainSample': coverage['hostCount'],
           'crossPlatformClassifierDifferences': len(coverage['differences'])}
for key, file in [('localCoreRoutingCases', 'native-routing'), ('localCoreDNSCases', 'native-dns-egress'),
                  ('localCoreSelectorObservations', 'native-selectors'), ('localCoreInboundObservations', 'native-inbound-guard')]:
    metrics[key] = sum(p['cases'] for p in read(R / f'validation/{file}.json')['platforms'])
review = read(R / 'data/rules/azure-async-review.json')
report = {'version': '14.2', 'date': '2026-10-10', 'revision': 'thunder-repair-r4', 'priorRevision': 'thunder-repair-r3',
          'status': 'ELEVEN_CONTRACTS_REVIEWED_LOCAL_CORE_VERIFIED_DEVICE_PENDING',
          'authorization': 'User requested verification and repair of the remaining iOS Azure async discrepancy and a full three-platform audit against all eleven requirements.',
          'contract': {'file': 'docs/需求.md', 'sha256': sha(ROOT / 'docs/需求.md'), 'amended': False},
          'remoteSourceChanges': 0, 'clientDeployment': False,
          'beforeManifest': {'file': 'validation/inputs/thunder-r4-before/manifest.json', 'sha256': sha(base / 'manifest.json')},
          'priorMetadata': {'file': 'metadata/thunder-r3-review.json', 'sha256': sha(R / 'metadata/thunder-r3-review.json')},
          'lockedSources': {'file': 'data/rule-sources.lock.json', 'sha256': sha(R / 'data/rule-sources.lock.json'), 'count': 45},
          'azureAsyncPolicy': {'file': 'data/rules/azure-async-review.json', 'sha256': sha(R / 'data/rules/azure-async-review.json'),
                               'hosts': review['hosts'], 'unreviewedTenants': '公共基础服务', 'legacyRegexPromoted': False,
                               'currentEndpointOwnershipOrLiveness': 'NOT_VERIFIED'},
          'entries': [{'file': n, 'sha256': sha(R / n)} for n in entries], 'testEvidence': evidence, 'metrics': metrics,
          'requirements': requirements,
          'findings': [
              {'id': 'R4-01', 'severity': 'MAJOR', 'description': 'Reviewed Azure async exact target used OpenAI on Mihomo and shared infrastructure on iOS.',
               'resolution': 'All three platforms embed the same reviewed exact tenant exceptions before shared infrastructure; DNS reads the same exact company table.', 'acceptance': 'STATIC_ZERO_FINITE_DIFFERENCES_AND_EXACT_NAME_CORE_DNS_SWITCH_FAILURE_PASS_IOS_NATIVE_PENDING'},
              {'id': 'R4-02', 'severity': 'MAJOR', 'description': 'Old unbounded Mihomo Azure name regex also accepted unreviewed numbers/regions and multi-label prefixes such as eastus.evil-1.',
               'resolution': 'Replace the unbounded tenant heuristic with the finite reviewed exact subset on every platform; other Azure names consistently use shared proxy/DNS. No DIRECT scope added.', 'acceptance': 'REVIEWED_SCOPE_NARROWING_BOUND_TO_R3_AND_BOUNDARY_COUNTEREXAMPLES_PASS'}],
          'knownLimits': ['Source, local core, package and actual device gates are separate; Windows TUN, Android VpnService and Shadowrocket native NOT_RUN',
                          'Azure exact exceptions derive from the frozen reviewed policy and historical observations; present ownership/liveness unverified, no blanket inference for other tenants',
                          'New Azure async names require separate ownership evidence and review before company grouping; broad OpenAI-owned chatgpt.com suffix still covers its own async subdomains',
                          'Finite domain comparisons do not exhaust arbitrary names, IP metadata, CNAME rematching, app encrypted DNS or device traffic',
                          'Public IPv6, arbitrary DoH/ECH, mobile background traffic and connection/DNS cache migration need device packet capture'],
          'initialHarnessAttempt': {'file': 'validation/inputs/r4-attempts/initial-static.json', 'sha256': sha(R / 'validation/inputs/r4-attempts/initial-static.json'), 'result': 'FAIL historical-stage idempotence assertion mixed R3 input and R4 generator; scoped harness corrected and full static rerun'}}
(R / 'metadata/thunder-r4-review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'revision': report['revision'], 'metrics': metrics, 'requirements': len(requirements)}, ensure_ascii=False))
