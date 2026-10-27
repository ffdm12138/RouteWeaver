"""Verify shared source, engine parity, client capabilities and bounded integration."""
EXPECTED={'offline-corresponding-source':'OFFLINE_CORRESPONDING_SOURCE_BUILD_PASS','clash-verge-static':'CLASH_VERGE_STATIC_PASS','clash-verge-core':'CLASH_VERGE_LOCAL_CORE_PASS_DEVICE_PENDING','engine-parity':'REAL_ENGINE_PARITY_PASS','auto-local-core':'AUTO_LOCAL_CORE_BUILD_TEST_MATCHED_HELPER_PASS_NOT_DEPLOYED','client-integration':'LIMITED_WINDOWS_FLCLASH_TUN_INTEGRATION_PASS'}

def evidence(release,sha,read):
    result={}
    for name,status in EXPECTED.items():
        file='validation/'+name+'.json';proof=read(release/file)
        assert proof['status']==status,(name,proof['status'])
        for e in proof['sourceFiles']:assert sha(release/e['file'])==e['sha256'],e['file']
        result[name]={'file':file,'sha256':sha(release/file),'status':status}
    engine=read(release/'validation/engine-parity.json')
    assert engine['entryFiles']==6 and engine['networkModes']==3
    assert engine['observations']==2*3*6*engine['inputCases']
    manifest=read(release/'metadata/clash-verge-sources.json')
    for e in manifest['inputs']+manifest['entries']:assert sha(release/e['file'])==e['sha256'],e['file']
    assert len(manifest['entries'])==1
    proof=read(release/'validation/client-integration.json')
    assert proof['weChatMediaAcceptance']=='NOT_RETESTED_USER_NORMAL_USE'
    assert proof['automaticPhysicalNetworkDetection'] is False
    return result,manifest,proof

def record(project,release,current,review,sha,read):
    receipts,verge,proof=evidence(release,sha,read)
    review['enhancements']={'revision':'auto-local-family-r1','priorIntegrationScope':'rc.5 TUN receipt only; auto is not deployed','runtimeRevision':'shared-runtime-r1','entryRevision':'single-entry-r1','testEvidence':receipts,
        'capabilities':{'file':'data/client-capabilities.json','sha256':sha(release/'data/client-capabilities.json')},
        'recordingModule':{'file':'tools/release_enhancements.py','sha256':sha(project/'tools/release_enhancements.py')}}
    review['clientDeployment']=current['clientDeployment']='MAINTAINER_WINDOWS_FLCLASH_ONLY'
    current['entries']['clashVerge']='releases/v14.3/'+verge['entries'][0]['file']
    current['inlineProviderRows']['clashVerge']=verge['entries'][0]['inlineRows']
    current.update(layoutRevision=8,clashVerge='SOURCE_REAL_BOA_LOCAL_CORE_PASS_NATIVE_APP_NOT_RUN',
        clientCapabilities='releases/v14.3/data/client-capabilities.json',entryRevision='single-entry-r1',runtimeRevision='shared-runtime-r1',
        clientIntegration='releases/v14.3/validation/client-integration.json',windows='AUTO_CORE_LOOPBACK_PASS_NOT_DEPLOYED_PREVIOUS_MANUAL_MODE_RETAINED',
        networkModeOptions={'default':'auto','field':'x-routeweaver.network-mode','choices':['auto','dual-stack','ipv4-local'],'javascriptDefaultConstant':'ROUTEWEAVER_DEFAULT_NETWORK_MODE','automaticDetection':'REQUIRES_MATCHING_NATIVE_CORE'})

def verify(project,release,current,review,sha,read):
    receipts,verge,proof=evidence(release,sha,read)
    item=review['enhancements']
    assert item['testEvidence']==receipts
    assert current['entryRevision']==item['entryRevision']=='single-entry-r1'
    assert current['runtimeRevision']==item['runtimeRevision']=='shared-runtime-r1'
    assert current['clientDeployment']==review['clientDeployment']=='MAINTAINER_WINDOWS_FLCLASH_ONLY'
    e=item['capabilities'];assert sha(release/e['file'])==e['sha256']
    assert sha(project/item['recordingModule']['file'])==item['recordingModule']['sha256']
    expected={e['file'] for e in read(release/'metadata/network-compat.json')['entries']}
    actual={f.relative_to(release).as_posix() for f in (release/'src').rglob('*') if f.is_file()}
    assert actual==expected,('src must contain only current entries',actual^expected)
