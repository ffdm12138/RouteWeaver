"""Record the R6 closeout, without changing historical reviews or device gates."""
import hashlib, json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
R=ROOT/'releases/v14.2'
BASE=ROOT/'archive/v14.2-before-thunder-closeout-r6-20261011'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for e in read(BASE/'manifest.json')['files']:
    assert sha(BASE/e['file'])==e['sha256'], 'Historical R5 modified: '+e['file']
old=read(BASE/'CURRENT_RELEASE.json')
current=read(ROOT/'CURRENT_RELEASE.json')
assert old['repairRevision']=='thunder-repair-r5'
assert current['repairRevision']=='thunder-closeout-r6' and current['clientDeployment'] is False
assert sha(ROOT/'docs/需求.md')==sha(BASE/'docs/需求.md')
assert sha(R/'data/rule-sources.lock.json')==sha(BASE/'releases/v14.2/data/rule-sources.lock.json')
for name in ['thunder-repair-review','thunder-r2-review','thunder-r3-review','thunder-r4-review','thunder-r5-review']:
    assert sha(R/f'metadata/{name}.json')==sha(BASE/f'releases/v14.2/metadata/{name}.json')
before=R/'validation/inputs/thunder-r6-before'
for e in read(before/'manifest.json')['files']:
    assert sha(before/e['file'])==e['sha256']
expected={'static':'STATIC_PASS','thunder-r5':'THUNDER_R5_ELEVEN_CONTRACTS_STATIC_PASS',
          'independent-r5':'THREE_PLATFORM_INDEPENDENT_REVIEW_PASS','thunder-closeout':'THUNDER_CLOSEOUT_EDGE_AUDIT_PASS',
          'thunder-domain-coverage':'THUNDER_DOMAIN_COVERAGE_PASS','native-routing':'CORE_ROUTING_PASS',
          'native-dns-egress':'CORE_DNS_EGRESS_PASS','native-selectors':'CORE_MANUAL_SELECTORS_PASS',
          'native-inbound-guard':'CORE_INBOUND_GUARD_PASS','api-browser-regression':'API_REAL_IP_CORE_PASS_BROWSER_TUN_RETEST_PENDING'}
evidence={}
for name,status in expected.items():
    p=R/f'validation/{name}.json';d=read(p)
    assert d['status']==status, name
    for e in d['sourceFiles']:
        assert sha(R/e['file'])==e['sha256'], 'Stale '+name+': '+e['file']
    evidence[name]={'file':p.relative_to(R).as_posix(),'sha256':sha(p),'status':status}
extra=read(R/'validation/thunder-closeout.json')
assert len(extra['failures'])==0
coverage=extra['domesticCoverage']
assert coverage['pinnedSuffixes']==111595 and coverage['apexAndChildNames']==223190
assert len(coverage['knownSingleLabelDifferences'])==52 and not coverage['unexpectedDifferences']
assert not coverage['dnsMismatch'] and not coverage['udpMismatch']
contract=read(R/'validation/thunder-r5.json')
assert [r['id'] for r in contract['requirements']]==list(range(1,12))
assert all(r['static']=='PASS' and r['checks'] for r in contract['requirements'])
lock=read(R/'data/rule-sources.lock.json')
assert len(lock['sources'])==45
for e in lock['sources']:
    assert sha(R/e['file'])==e['sha256'] and sha(R/e['classifier']['file'])==e['classifier']['sha256']
prior=read(R/'metadata/thunder-r5-review.json')
requirements=[]
for row in prior['requirements']:
    row=dict(row)
    row['sourceReceipt']=evidence['thunder-r5']
    row['retainedElevenContractReceipt']=evidence['thunder-r5']
    row['localMihomoEvidence']=[evidence[x['file'].split('/')[-1].removesuffix('.json')] for x in row['localMihomoEvidence']]
    row['closeoutSupplement']=evidence['thunder-closeout']
    row['iOSNative']='NOT_RUN';row['windowsAndroidDevice']='NOT_RUN'
    if row['id']==10:
        row['singleLabelLANBoundary']='52 known source-model differences retained from R3; omitted iOS regex is not native-certified'
    requirements.append(row)
attempt=R/'validation/inputs/r6-attempts/valid-before-audit.json'
failed=read(attempt)
assert len(failed['failures'])==10
for e in failed['sourceFiles']:
    target=R/e['file']
    if e['file']=='tests/thunder-closeout.cjs':
        target=R/'validation/inputs/r6-attempts/valid-before-audit.cjs'
    elif e['file'].startswith('src/'):
        target=before/e['file']
    assert sha(target)==e['sha256'], 'Unbound initial counterexample: '+e['file']
metrics={'staticChecks':len(read(R/'validation/static.json')['checks']),
         'closeoutEdgeChecks':len(extra['checks']),'elevenContractRegressionChecks':len(contract['checks']),
         'independentDiscoveryChecks':len(read(R/'validation/independent-r5.json')['checks']),
         'finiteBusinessDomainNames':read(R/'validation/thunder-domain-coverage.json')['hostCount'],
         'domesticSuffixes':coverage['pinnedSuffixes'],'domesticApexAndChildNames':coverage['apexAndChildNames'],
         'domesticRouteObservations':coverage['routeObservations'],'domesticBusinessDNSChecks':coverage['businessDNSChecks'],
         'knownSingleLabelDifferences':52,'unexpectedDomesticDifferences':0}
for key,name in [('localCoreRoutingCases','native-routing'),('localCoreDNSCases','native-dns-egress'),('localCoreSelectorObservations','native-selectors'),('localCoreInboundObservations','native-inbound-guard')]:
    metrics[key]=sum(p['cases'] for p in read(R/f'validation/{name}.json')['platforms'])
nativeRun=read(ROOT/'.work/closeout-thunder-20261011/native-run-summary.json')
assert len(nativeRun['runs'])==4 and all(r['exitCode']==0 for r in nativeRun['runs'])
(R/'validation/closeout-native-run.json').write_text(json.dumps(nativeRun,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
names=['src/windows/v14.2.js','src/android/v14.2-android.js','src/ios/v14.2-shadowrocket.conf',
       'tools/generate-v14.2-shadowrocket.js','tools/refresh-api-evidence.cjs','metadata/shadowrocket-sources.json',
       'tests/static.cjs','tests/thunder-closeout.cjs','tests/fixture.cjs','data/rules/safety-classifiers.json']
report={'version':'14.2','date':'2026-10-11','revision':'thunder-closeout-r6','priorRevision':'thunder-repair-r5',
        'status':'FINAL_SOURCE_LOCAL_CORE_REVIEW_PASS_DEVICE_ACCEPTANCE_PENDING',
        'authorization':'User requested another final eleven-requirement thunder audit and no changes to running clients; scoped source repairs and updated packages continue the authorized work.',
        'contract':{'file':'docs/需求.md','sha256':sha(ROOT/'docs/需求.md'),'amended':False},
        'lockedSources':{'file':'data/rule-sources.lock.json','sha256':sha(R/'data/rule-sources.lock.json'),'count':45},
        'remoteSourceChanges':0,'clientDeployment':False,
        'priorMetadata':{'file':'metadata/thunder-r5-review.json','sha256':sha(R/'metadata/thunder-r5-review.json')},
        'beforeManifest':{'file':'validation/inputs/thunder-r6-before/manifest.json','sha256':sha(before/'manifest.json')},
        'entries':[{'file':n,'sha256':sha(R/n)} for n in names],'testEvidence':evidence,'metrics':metrics,
        'requirements':requirements,
        'priorFourFindingsRevalidated':prior['findings'],
        'findings':[{'id':'R6-01','priority':'P3','description':'Windows replay lost TUN bypass-removal reminders; discarded address-set dependencies survived only the first override.',
                     'resolution':'Sanitise the already-disallowed TUN fields before dependency collection; retain only exact seven current-version desktop reminders. Surviving sniffer dependencies are retained. Three full replays pass.',
                     'resolutionStatus':'REPAIRED_VERIFIED'},
                    {'id':'R6-02','priority':'P3','description':'Android console described domestic TCP as unconditional direct although the domestic selector is switchable.',
                     'resolution':'Describe the domestic selector and initial DIRECT default consistently with Windows.',
                     'resolutionStatus':'REPAIRED_VERIFIED'}],
        'retainedBoundaries':{'singleLabelLAN':{'knownNames':52,'sourceReceipt':evidence['thunder-closeout'],'nativeIOS':'NOT_RUN','sourceSemantics':'Mihomo approved private single-label regex permits DIRECT; iOS deliberately omits that unverified regex, retains domestic TCP and proxy-only UDP.'},
                              'previousLimits':prior['knownLimits'],'deviceAcceptance':'NOT_RUN'},
        'attempts':[{'file':attempt.relative_to(R).as_posix(),'sha256':sha(attempt),'result':'FAIL: ten assertions identify two defects; all domestic differences are the retained R3 single-label boundary.'},
                    {'file':'validation/inputs/r6-attempts/initial-audit.json','sha256':sha(R/'validation/inputs/r6-attempts/initial-audit.json'),'result':'Initial harness supplied missing test rule-provider and counted the known R3 omission as unexpected; corrected only the test fixtures and explicit known-boundary check.'},
                    {'file':'validation/inputs/r6-attempts/sandbox-native-routing.json','sha256':sha(R/'validation/inputs/r6-attempts/sandbox-native-routing.json'),'result':'ENVIRONMENT_BLOCKED: EACCES to loopback controller; rerun with permission for isolated core processes.'}],
        'nativeRun':{'file':'validation/closeout-native-run.json','sha256':sha(R/'validation/closeout-native-run.json')},
        'deviceGates':{'windowsTUN':'NOT_RUN','androidVpnService':'NOT_RUN','shadowrocketNative':'NOT_RUN','publicIPv6':'NOT_RUN','browserRetest':'NOT_RUN'},
        'conclusion':'No remaining actionable source defect found in this finite audit. Eleven source contracts and local core checks pass with the declared LAN boundary; full device acceptance and a zero-bug guarantee are not established.'}
(R/'metadata/thunder-closeout-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'revision':report['revision'],'requirements':len(requirements),'newFindingsRepaired':2,'metrics':metrics},ensure_ascii=False))
