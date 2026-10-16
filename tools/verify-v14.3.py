"""Verify current source, preserved history and separately scoped receipts."""
from pathlib import Path
import argparse, hashlib, json, subprocess, zipfile

project=Path(__file__).resolve().parents[1]
root=project/'releases/v14.3'
parser=argparse.ArgumentParser()
parser.add_argument('--node',default='node')
parser.add_argument('--with-packages',action='store_true')
parser.add_argument('--skip-history',action='store_true',default=True,help='Verify public source and receipts without the separately retained local archive.')
args=parser.parse_args()
process_flags=getattr(subprocess,'CREATE_NO_WINDOW',0)
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
current=read(project/'CURRENT_RELEASE.json')
review=read(root/'metadata/balanced-review.json')
assert current['version']==review['version']=='14.3'
assert current['repairRevision']==review['revision']=='balanced-r1'
assert current['status']==review['status']=='NETWORK_COMPAT_SOURCE_LOCAL_CORE_PASS_DEVICE_PENDING'
assert current['domesticProtocolRevision']==review['domesticProtocolRevision']=='domestic-protocol-r1'
assert current['clientDeployment'] is False
assert sha(project/review['contract']['file'])==review['contract']['sha256']
if not args.skip_history:
    assert sha(project/review['contract']['previousFile'])==review['contract']['previousSHA256']
assert review['contract']['originalBytesPreserved'] is False
assert review['contract']['sha256']!=review['contract']['previousSHA256']
assert sha(root/review['sourceManifest']['file'])==review['sourceManifest']['sha256']
for e in review['entries']:
    assert sha(root/e['file'])==e['sha256']
    assert (root/e['file']).stat().st_size==e['bytes']<=131072
for e in review['testEvidence'].values():
    assert sha(root/e['file'])==e['sha256']
    receipt=read(root/e['file'])
    assert receipt['status']==e['status']
    for source in receipt['sourceFiles']:
        assert sha(root/source['file'])==source['sha256'],source['file']
for e in [review['sourceComparison'],review['latestCandidates']]:
    assert sha(root/e['file'])==e['sha256']
assert sha(project/review['recordingTool']['file'])==review['recordingTool']['sha256']
history_files=0
if not args.skip_history:
    archive=project/review['preservedArchive']['directory']
    assert sha(archive/'manifest.json')==review['preservedArchive']['manifestSHA256']
    assert sha(archive/'release-byte-manifest.json')==review['preservedArchive']['releaseManifestSHA256']
    for e in read(archive/'manifest.json')['files']:
        assert sha(archive/e['file'])==e['sha256']
    archived_files=read(archive/'release-byte-manifest.json')['files']
    for e in archived_files:
        assert sha(archive/'releases/v14.2'/e['file'])==e['sha256']
    history_files=len(archived_files)
    protocol_archive=project/review['protocolBeforeArchive']['directory']
    assert sha(protocol_archive/'manifest.json')==review['protocolBeforeArchive']['manifestSHA256']
    for e in read(protocol_archive/'manifest.json')['files']:
        assert sha(protocol_archive/e['file'])==e['sha256'],e['file']
for e in read(root/'validation/inputs/v14.2-baseline/manifest.json')['files']:
    assert sha(root/'validation/inputs/v14.2-baseline'/e['file'])==e['sha256']
subprocess.run([args.node,str(root/'tools/build-balanced.cjs'),'--check'],cwd=root,check=True,capture_output=True,creationflags=process_flags)
subprocess.run([args.node,str(root/'tools/build-shadowrocket-lean.cjs'),'--check'],cwd=root,check=True,capture_output=True,creationflags=process_flags)
assert len(review['requirements'])==12 and all(r['sourceContract']=='PASS_JS_AND_DECLARED_SHADOWROCKET_MODEL' for r in review['requirements'][:11])
from network_release import verify
network=verify(project,root,current,review,sha,read)
subprocess.run([args.node,str(root/'tools/build-network-compat.cjs'),'--check'],cwd=root,check=True,capture_output=True,creationflags=process_flags)
for kind,path in current['entries'].items():
    assert (project/path).is_file(),kind
delivery=None
if 'iosDelivery' in review:
    item=review['iosDelivery']
    assert sha(root/item['file'])==item['sha256']
    delivery=read(root/item['file'])
    assert current['deliveryRevision']==item['revision']==delivery['revision']=='ios-delivery-r2'
    sr=delivery['shadowrocket']
    assert current['entries']['shadowrocket']=='releases/v14.3/'+sr['file']
    assert sha(root/sr['file'])==sr['sha256']
    assert sha(root/sr['immutableSource'])==sr['immutableSourceSHA256']!=sr['sha256']
    assert sha(root/sr['provenance']['file'])==sr['provenance']['sha256']
    assert (root/sr['file']).stat().st_size==sr['bytes']
    assert sr['sourceBytesChanged'] is True and sr['nativeAcceptance']=='NOT_RUN'
    for e in [sr['sourceManifest'],sr['staticEvidence']]:
        assert sha(root/e['file'])==e['sha256']
    assert read(root/sr['staticEvidence']['file'])['status']==sr['staticEvidence']['status']
    assert sha(project/delivery['restorationTool']['file'])==delivery['restorationTool']['sha256']
    for e in delivery['jsEntries']:
        assert sha(root/e['file'])==e['sha256']
    source=delivery['officialSourceEvidence']
    assert sha(root/source['file'])==source['sha256']
    assert len(delivery['clashmiSourceInspection']['groups'])==26
    assert delivery['clientDeployment'] is False and delivery['deviceAcceptance']=='NOT_RUN'
    if delivery['localCoreEvidence']:
        proof=delivery['localCoreEvidence']
        assert sha(root/proof['file'])==proof['sha256']
        receipt=read(root/proof['file'])
        assert receipt['status']==proof['status']
        for e in receipt['sourceFiles']:
            assert sha(root/e['file'])==e['sha256']
    history=delivery['historicalFailedInvestigation']
    assert history['currentAcceptance'] is False
    if not args.skip_history:
        assert sha(project/history['file'])==history['sha256']
        assert read(project/history['file'])['status']=='FAIL'
mac=None
if 'macosDelivery' in review:
    item=review['macosDelivery']
    assert sha(root/item['file'])==item['sha256']
    mac=read(root/item['file'])
    assert current['macosRevision']==item['revision']==mac['revision']=='macos-r1'
    assert current['macosDelivery']=='releases/v14.3/'+item['file']
    assert mac['status']==item['status']=='MACOS_SOURCE_LOCAL_CORE_PASS_DEVICE_PENDING'
    assert mac['deviceAcceptance']=='NOT_RUN' and mac['clientDeployment'] is False
    manifest=mac['sourceManifest']
    assert sha(root/manifest['file'])==manifest['sha256']
    for e in read(root/manifest['file'])['inputs']+mac['entries']:
        assert sha(root/e['file'])==e['sha256'],e['file']
    for key,e in zip(['macosFlClash','macosClashMi'],mac['entries']):
        assert current['entries'][key]=='releases/v14.3/'+e['file']
    for e in mac['testEvidence'].values():
        assert sha(root/e['file'])==e['sha256']
        receipt=read(root/e['file'])
        assert receipt['status']==e['status']
        for source in receipt['sourceFiles']:
            assert sha(root/source['file'])==source['sha256'],source['file']
    assert sha(project/mac['recordingTool']['file'])==mac['recordingTool']['sha256']
    subprocess.run([args.node,str(root/'tools/build-macos.cjs'),'--check'],cwd=root,check=True,capture_output=True,creationflags=process_flags)
if args.with_packages:
    package=read(project/'dist/v14.3/package-verification.json')
    assert package['status']=='PACKAGE_CRC_SHA_FRESH_STATIC_PASS'
    for e in package['packages']:
        assert sha(project/e['file'])==e['sha256']
        with zipfile.ZipFile(project/e['file']) as z:
            assert z.testzip() is None
            package_manifest=json.loads(z.read('PACKAGE_MANIFEST.json'))
            members=package_manifest['files']
            assert set(z.namelist())==set(members)|{'PACKAGE_MANIFEST.json'}
            for name,expected in members.items():
                assert hashlib.sha256(z.read(name)).hexdigest()==expected,name
            if delivery and package_manifest['kind']!='macos':
                sr=delivery['shadowrocket']
                assert hashlib.sha256(z.read(sr['file'])).hexdigest()==sr['sha256']
                assert hashlib.sha256(z.read('metadata/ios-delivery.json')).hexdigest()==review['iosDelivery']['sha256']
                for e in delivery['jsEntries']:
                    assert hashlib.sha256(z.read(e['file'])).hexdigest()==e['sha256']
                assert delivery['report'] in members
                assert hashlib.sha256(z.read(sr['sourceManifest']['file'])).hexdigest()==sr['sourceManifest']['sha256']
            expected_network=[s for s in network['entries'] if package_manifest['kind']!='macos' or s['platform'].startswith('macos')]
            for source in expected_network:
                assert hashlib.sha256(z.read(source['file'])).hexdigest()==source['sha256']
            assert network['guide'] in members and network['report'] in members
            if mac:
                for source in mac['entries']:
                    assert hashlib.sha256(z.read(source['file'])).hexdigest()==source['sha256']
                assert hashlib.sha256(z.read('metadata/macos-delivery.json')).hexdigest()==review['macosDelivery']['sha256']
                assert mac['guide'] in members and mac['report'] in members
                if package_manifest['kind']=='audit-evidence':
                    for evidence in mac['testEvidence'].values():
                        assert hashlib.sha256(z.read(evidence['file'])).hexdigest()==evidence['sha256']
print(json.dumps({'status':'V14_3_LAYOUT_SOURCE_CORE_BINDINGS_PASS','history':'SKIPPED_HISTORY' if args.skip_history else 'PASS','historyFiles':history_files,'sourceContract':sha(project/'docs/需求.md'),'packagesChecked':args.with_packages,'deviceAcceptance':'NOT_RUN'}))
