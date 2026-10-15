"""Bind the four R5 repairs and all eleven contracts to actual current evidence."""
import hashlib, json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
R=ROOT/'releases/v14.2'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
prior=ROOT/'archive/v14.2-before-thunder-repair-r5-20261010'
for e in read(prior/'manifest.json')['files']:
    assert sha(prior/e['file'])==e['sha256'],e['file']
current=read(ROOT/'CURRENT_RELEASE.json')
assert current['repairRevision']=='thunder-repair-r5' and current['clientDeployment'] is False
assert sha(ROOT/'docs/需求.md')==sha(prior/'docs/需求.md')
for name in ['thunder-repair-review','thunder-r2-review','thunder-r3-review','thunder-r4-review']:
    assert sha(R/f'metadata/{name}.json')==sha(prior/f'releases/v14.2/metadata/{name}.json')
base=R/'validation/inputs/thunder-r5-before'
for e in read(base/'manifest.json')['files']:
    assert sha(base/e['file'])==e['sha256']
audit=R/'validation/inputs/thunder-r5-audit'
for e in read(audit/'manifest.json')['files']:
    assert sha(audit/e['file'])==e['sha256']
lock=read(R/'data/rule-sources.lock.json')
assert sha(R/'data/rule-sources.lock.json')==sha(prior/'releases/v14.2/data/rule-sources.lock.json')
assert len(lock['sources'])==45
for e in lock['sources']:
    assert sha(R/e['file'])==e['sha256'] and sha(R/e['classifier']['file'])==e['classifier']['sha256']
expected={'static':'STATIC_PASS','thunder-r4':'THUNDER_R4_ELEVEN_CONTRACTS_STATIC_PASS',
          'thunder-r5':'THUNDER_R5_ELEVEN_CONTRACTS_STATIC_PASS','independent-r5':'THREE_PLATFORM_INDEPENDENT_REVIEW_PASS',
          'thunder-domain-coverage':'THUNDER_DOMAIN_COVERAGE_PASS','native-routing':'CORE_ROUTING_PASS',
          'native-dns-egress':'CORE_DNS_EGRESS_PASS','native-selectors':'CORE_MANUAL_SELECTORS_PASS',
          'native-inbound-guard':'CORE_INBOUND_GUARD_PASS'}
evidence={}
for name,status in expected.items():
    p=R/f'validation/{name}.json';d=read(p)
    assert d['status']==status,name
    for item in d['sourceFiles']:
        assert sha(R/item['file'])==item['sha256'],f'Stale {name}: {item["file"]}'
    evidence[name]={'file':p.relative_to(R).as_posix(),'sha256':sha(p),'status':status}
coverage=read(R/'validation/thunder-domain-coverage.json')
assert not coverage['differences'] and all(p['dnsMismatchCount']==0 and not p['udpInconsistencies'] for p in coverage['platforms'])
contract=read(R/'validation/thunder-r5.json')
assert [r['id'] for r in contract['requirements']]==list(range(1,12))
assert all(r['static']=='PASS' and r['checks'] for r in contract['requirements'])
assert {f['issue'] for f in contract['beforeCounterexamples']}=={'R5-01','R5-02','R5-03','R5-04'}
independent=read(R/'validation/independent-r5.json')
assert independent['regexCoverage']['samples']==120 and independent['regexCoverage']['crossPlatformDifferences']==0
assert not independent['findings'] and all(c['status']=='PASS' for c in independent['checks'])
names=['公司归组与共享边界','DNS 随业务选择','UDP 不支持拒绝','IPv4/IPv6 双栈','主动 DIRECT 保留',
       '两个手动公共组','未知流量统一代理兜底','业务与 STUN 优先级','审核固定来源','三端一致性与分层验收','国内集中切换']
gates={1:['native-routing','native-dns-egress'],2:['native-dns-egress'],3:['native-routing'],
       4:['native-routing','native-dns-egress'],5:['native-routing','native-dns-egress'],
       6:['native-selectors','native-routing','native-dns-egress'],7:['native-routing','native-dns-egress'],
       8:['native-routing'],9:[],10:['native-routing','native-dns-egress','native-selectors','native-inbound-guard'],
       11:['native-routing','native-selectors','native-dns-egress']}
requirements=[{'id':r['id'],'name':names[r['id']-1],'sourceContract':'PASS','dedicatedChecks':len(r['checks']),
               'sourceReceipt':evidence['thunder-r5'],'retainedElevenContractReceipt':evidence['thunder-r4'],
               'localMihomoEvidence':[evidence[k] for k in gates[r['id']]],'iOSNative':'NOT_RUN',
               'windowsAndroidDevice':'NOT_RUN','acceptance':'SOURCE_REVIEWED_LOCAL_CORE_SUPPORTED_DEVICE_PENDING' if gates[r['id']] else 'SOURCE_FIXED_HASH_AND_NEGATIVE_UPDATE_GUARDS_PASS'}for r in contract['requirements']]
entries=['src/windows/v14.2.js','src/android/v14.2-android.js','src/ios/v14.2-shadowrocket.conf',
         'tools/generate-v14.2-shadowrocket.js','tools/sync-reviewed-data.cjs','tools/validate-cdn-regex.cjs',
         'metadata/shadowrocket-sources.json','data/rules/cdn-regex-review.json','data/rules/company-core.json',
         'data/rules/business-services.json','tests/static.cjs','tests/cases.cjs','tests/fixture.cjs',
         'tests/thunder-r2.cjs','tests/thunder-r4.cjs','tests/thunder-r5.cjs','tests/r5-fixture.cjs',
         'tests/independent-r5.cjs','tests/thunder-domain-coverage.cjs','tests/dns-relay-labels.cjs',
         'tests/native-routing.cjs','tests/native-dns-egress.cjs']
metrics={'staticChecks':len(read(R/'validation/static.json')['checks']),
         'independentElevenContractChecks':len(contract['checks']),'independentDiscoveryHarnessChecks':len(independent['checks']),
         'finiteDomainSample':coverage['hostCount'],'crossPlatformClassifierDifferences':len(coverage['differences']),
         'closedIOSDirectCounterexamples':100,'closedSTUNTCPDirectCounterexamples':30,'CDNExactPolicyEntries':118}
for key,file in [('localCoreRoutingCases','native-routing'),('localCoreDNSCases','native-dns-egress'),
                 ('localCoreSelectorObservations','native-selectors'),('localCoreInboundObservations','native-inbound-guard')]:
    metrics[key]=sum(p['cases'] for p in read(R/f'validation/{file}.json')['platforms'])
cdn=read(R/'data/rules/cdn-regex-review.json')
finding_data=[('R5-01','P1','iOS omitted Epic/Disney regex; 100 domestic DIRECT and 18 proxy-only company differences.',
               'All 118 independently audited exact endpoints are common routing/DNS entries; finite Akamai regex languages fully expanded; infinite Tencent number language restricted to the explicit subset, all other labelled family names shared on every platform.'),
              ('R5-02','P1','Only generic UDP protected STUN; 30 TCP controls followed domestic default DIRECT.',
               'TCP 3478/5349/19302-19309 and recognisable stun/turn host labels are protected after company/manual/LAN rules and before domestic rules; Mihomo INNER resolver traffic is excluded.'),
              ('R5-03','P3','Android replay dropped the IPv6 device reminder after forcing core flags true.',
               'Retain only the exact current-version device reminder on replay; all four IPv6 input combinations preserve full output, other obsolete warnings are not copied.'),
              ('R5-04','P2','DNS experiment identified egress by source port alone and retained closed mappings; old observed label disagreed with core log.',
               'Observer uses normalised live source/destination address/port tuple; close removes only the matching registration. Deterministic collision/lifecycle tests and actual DoH/DoT A/AAAA switch/DIRECT/failure experiments pass. Original specific reused tuple remains unrecorded.')]
findings=[{'id':id,'priority':priority,'description':desc,'resolution':resolution,'resolutionStatus':'REPAIRED_VERIFIED_WITH_DECLARED_SCOPE'}for id,priority,desc,resolution in finding_data]
report={'version':'14.2','date':'2026-10-11','revision':'thunder-repair-r5','priorRevision':'thunder-repair-r4',
        'status':'FOUR_FINDINGS_REPAIRED_ELEVEN_CONTRACTS_LOCAL_CORE_VERIFIED_DEVICE_PENDING',
        'authorization':'User requested verification and repair of all four audit findings, another eleven-requirement three-platform review, updated delivery packages, and no replacement of running clients.',
        'contract':{'file':'docs/需求.md','sha256':sha(ROOT/'docs/需求.md'),'amended':False},
        'remoteSourceChanges':0,'clientDeployment':False,
        'beforeManifest':{'file':'validation/inputs/thunder-r5-before/manifest.json','sha256':sha(base/'manifest.json')},
        'auditManifest':{'file':'validation/inputs/thunder-r5-audit/manifest.json','sha256':sha(audit/'manifest.json')},
        'priorMetadata':{'file':'metadata/thunder-r4-review.json','sha256':sha(R/'metadata/thunder-r4-review.json')},
        'lockedSources':{'file':'data/rule-sources.lock.json','sha256':sha(R/'data/rule-sources.lock.json'),'count':45},
        'cdnPolicy':{'file':'data/rules/cdn-regex-review.json','sha256':sha(R/'data/rules/cdn-regex-review.json'),
                     'exactHosts':118,'finiteAkamaiLanguageExhaustion':True,'infiniteMyqcloudLanguageExhaustion':False,
                     'otherLabelledFamilyNames':'公共基础服务','companyWildcardAdded':False,
                     'currentEndpointOwnershipOrLiveness':cdn['currentOwnershipOrLiveness'],'reviewBoundary':cdn['reviewBoundary']},
        'entries':[{'file':n,'sha256':sha(R/n)}for n in entries],'testEvidence':evidence,'metrics':metrics,
        'requirements':requirements,'findings':findings,
        'knownLimits':['Windows TUN, Android VpnService, Shadowrocket native execution and public IPv6 device acceptance NOT_RUN.',
                       'Tencent numeric-tail regex was deliberately narrowed to 100 audited exact names, all remaining labelled family names consistently shared; new exact numbers require review.',
                       'Exact CDN attribution derives from frozen reviewed classifiers and finite audit expansion, not current ownership/liveness verification.',
                       'STUN standard ports and recognisable host labels are guarded; arbitrary STUN hidden in ordinary domestic HTTPS without identifiable host/port is not payload-inspected.',
                       'TCP STUN Binding probes verify chosen route. Port 5349 tests routing and failure, not a complete public STUNS TLS exchange.',
                       'DoH/DoT loopback labels are now live-tuple based; the original failing run did not record the tuple, so its exact port reuse event is not retroactively proven.',
                       'Finite source classification is not arbitrary domain/IP/CNAME/app-encrypted-DNS or whole-device leak certification.'],
        'initialAttempts':[{'file':'validation/inputs/r5-attempts/static-attempt1.json','sha256':sha(R/'validation/inputs/r5-attempts/static-attempt1.json'),'result':'FAIL: R2 harness expected no new shared wildcard and only its old guard error; adjusted to exact reviewed R5 pair and either equivalent fail-closed validator.'},
                           {'file':'validation/inputs/r5-attempts/r5-static-attempt1.json','sha256':sha(R/'validation/inputs/r5-attempts/r5-static-attempt1.json'),'result':'FAIL: test-only obsolete warning case supplied zero dialable nodes; corrected the fixture, no candidate policy relaxation.'}]}
(R/'metadata/thunder-r5-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'revision':report['revision'],'metrics':metrics,'requirements':len(requirements),'findingsRepaired':len(findings)},ensure_ascii=False))
