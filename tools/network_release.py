"""Bind the two in-file network modes without duplicating release entries."""
import json

REVISION='ipv6-fallback-r2'
REPAIR='http-recovery-r1'
STATUS='SINGLE_ENTRY_SHARED_RUNTIME_CORE_INTEGRATED_DEVICE_PENDING'
GUIDE='docs/guides/IPv4兼容模式.md'
REPORT='docs/reports/v14.3/单入口优化与核心接入.md'
USER_CASE='USER_REPORTED_ABOUT_5_SECONDS_BASELINE; CONTROLLED_WINDOWS_TUN_FAST_FAILURE_PASS; WECHAT_RETEST_BY_NORMAL_USE'
RESEARCH_REPORT='docs/reports/v14.3/无域名IPv6与转圈等待研究.md'
CORE_PROTOTYPE='releases/v14.3/research/ipv6-direct-fast-fail/proof.json'

def evidence(release,sha,read):
    manifest=read(release/'metadata/network-compat.json')
    assert manifest['revision']==REVISION and manifest['repairRevision']==REPAIR
    assert manifest['entryRevision']=='single-entry-r1'
    assert manifest['automaticPhysicalNetworkDetection'] is False
    assert len(manifest['entries'])==7
    assert len({e['file'] for e in manifest['entries']})==7
    for e in manifest['inputs']+manifest['entries']:assert sha(release/e['file'])==e['sha256'],e['file']
    for e in manifest['entries']:
        assert (release/e['file']).stat().st_size==e['bytes']
        if e['file'].endswith('.js'):assert e['bytes']<=131072 and e['modes']==['dual-stack','ipv4-local']
    receipts={}
    for name,status in [('network-compat-static','NETWORK_COMPAT_STATIC_PASS'),('network-compat-core','NETWORK_COMPAT_LOCAL_CORE_PASS_DEVICE_PENDING')]:
        file='validation/'+name+'.json';proof=read(release/file)
        assert proof['revision']==REVISION and proof['status']==status
        assert proof['deviceAcceptance']=='NOT_RUN'
        for e in proof['sourceFiles']:assert sha(release/e['file'])==e['sha256'],e['file']
        receipts[name]={'file':file,'sha256':sha(release/file),'status':status}
    return manifest,receipts

def record(project,release,current,review,sha,read):
    manifest,receipts=evidence(release,sha,read)
    delivery={'revision':REVISION,'repairRevision':REPAIR,'entryRevision':'single-entry-r1','date':'2026-10-16','status':STATUS,
        'defaultMode':'dual-stack','compatibilityMode':'ipv4-local','automaticPhysicalNetworkDetection':False,
        'guide':GUIDE,'report':REPORT,'sourceManifest':{'file':'metadata/network-compat.json','sha256':sha(release/'metadata/network-compat.json')},
        'entries':manifest['entries'],'testEvidence':receipts,
        'nodeDefault':'Domain nodes without an explicit family use ipv4-prefer; explicit and literal families preserved',
        'localFallback':'Business A-only resolution, AAAA/SVCB/HTTPS filtering and HTTP/TLS/QUIC destination recovery; core IPv6, dual TUN capture and original egress policy preserved',
        'shadowrocket':manifest['shadowrocketLimit'],
        'scope':'Six JS configurations over owned Windows loopback plus a separately bound, limited maintainer FlClash TUN integration. Other client devices, WeChat media and public IPv6 remain unaccepted.',
        'priorUserCase':'rc.2 and rc.3 media failed; rc.4 sent media with subjective delay around five seconds',
        'currentUserCase':USER_CASE,'researchReport':RESEARCH_REPORT,'corePrototype':CORE_PROTOTYPE,
        'clientDeployment':'MAINTAINER_WINDOWS_FLCLASH_ONLY','deviceAcceptance':'LIMITED_WINDOWS_TUN_ONLY',
        'recordingModule':{'file':'tools/network_release.py','sha256':sha(project/'tools/network_release.py')}}
    file='metadata/network-compat-delivery.json'
    (release/file).write_text(json.dumps(delivery,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    review.update(date='2026-10-16',status=STATUS,networkCompatibility={'file':file,'sha256':sha(release/file),'revision':REVISION})
    review['requirements']=[r for r in review['requirements'] if r['number']!=12]+[{'number':12,'sourceContract':'PASS_JS_AND_LIMITED_SHADOWROCKET_MODEL','localCore':'PASS_ISOLATED_WINDOWS_DNS_HTTP_TLS_QUIC_AND_ORIGINAL_RULES','shadowrocketNative':'NOT_RUN','deviceAcceptance':'LIMITED_WINDOWS_TUN_ONLY'}]
    review['contract']['change']+=' Requirement 12 separates local/node/target families; one file per client with two explicit modes, strict routing retained, typed core fast failure and safe TLS prefix rejection. Observations are separate from the stable contract.'
    current.pop('compatibilityEntries',None)
    current.update(featureRevision='client-integration-r1',networkCompatibilityRevision=REVISION,status=STATUS,releaseTag='v14.3.0-rc.5',report=REPORT,
        networkCompatibilityRepair=REPAIR,networkCompatibility='releases/v14.3/'+file,networkCompatibilityGuide=GUIDE,
        defaultNetworkMode='dual-stack',automaticPhysicalNetworkDetection=False,networkCompatibilityUserCase=USER_CASE,
        networkCompatibilityResearchReport=RESEARCH_REPORT,networkCompatibilityCorePrototype=CORE_PROTOTYPE)
    from release_enhancements import record as record_enhancements
    record_enhancements(project,release,current,review,sha,read)

def verify(project,release,current,review,sha,read):
    manifest,receipts=evidence(release,sha,read)
    item=review['networkCompatibility'];delivery=read(release/item['file'])
    assert item['revision']==current['networkCompatibilityRevision']==REVISION
    assert sha(release/item['file'])==item['sha256']
    assert delivery['status']==current['status']==review['status']==STATUS
    assert delivery['repairRevision']==current['networkCompatibilityRepair']==REPAIR
    assert delivery['entries']==manifest['entries'] and delivery['testEvidence']==receipts
    assert delivery['deviceAcceptance']=='LIMITED_WINDOWS_TUN_ONLY'
    assert delivery['automaticPhysicalNetworkDetection'] is False
    assert 'compatibilityEntries' not in current
    assert current['entries']=={e['platform']:'releases/v14.3/'+e['file'] for e in manifest['entries']}
    assert sha(project/delivery['recordingModule']['file'])==delivery['recordingModule']['sha256']
    for file in [GUIDE,REPORT,RESEARCH_REPORT,CORE_PROTOTYPE]:assert (project/file).is_file(),file
    assert len(review['requirements'])==12 and review['requirements'][-1]['number']==12
    assert current['networkCompatibilityUserCase']==delivery['currentUserCase']==USER_CASE
    assert current['networkCompatibilityResearchReport']==delivery['researchReport']==RESEARCH_REPORT
    assert current['networkCompatibilityCorePrototype']==delivery['corePrototype']==CORE_PROTOTYPE
    prototype=read(project/CORE_PROTOTYPE)
    assert prototype['status']=='BOUNDED_WINDOWS_CORE_PROTOTYPE_PASS_DEVICE_NOT_RUN'
    assert prototype['clientChanged'] is False and prototype['releaseEntriesChanged'] is False
    for e in prototype['files']:
        assert '/' not in e['file'] and '\\' not in e['file']
        assert sha((project/CORE_PROTOTYPE).parent/e['file'])==e['sha256'],e['file']
    from release_enhancements import verify as verify_enhancements
    verify_enhancements(project,release,current,review,sha,read)
    return delivery
