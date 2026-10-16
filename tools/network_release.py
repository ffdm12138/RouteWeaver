"""Bind and verify the separately scoped IPv6 fallback revision."""
import json

REVISION = 'ipv6-fallback-r1'
STATUS = 'NETWORK_COMPAT_SOURCE_LOCAL_CORE_PASS_DEVICE_PENDING'
GUIDE = 'docs/guides/IPv4兼容模式.md'
REPORT = 'docs/reports/v14.3/IPv6回退与兼容入口.md'


def evidence(release, sha, read):
    manifest = read(release / 'metadata/network-compat.json')
    assert manifest['revision'] == REVISION
    assert manifest['automaticPhysicalNetworkDetection'] is False
    assert len(manifest['entries']) == 6
    for item in manifest['inputs'] + manifest['entries']:
        assert sha(release / item['file']) == item['sha256'], item['file']
    for item in manifest['entries']:
        assert (release / item['file']).stat().st_size == item['bytes']
        if item['file'].endswith('.js'):
            assert item['bytes'] <= 131072
    receipts = {}
    for name, status in [('network-compat-static', 'NETWORK_COMPAT_STATIC_PASS'),
                         ('network-compat-core', 'NETWORK_COMPAT_LOCAL_CORE_PASS_DEVICE_PENDING')]:
        file = 'validation/' + name + '.json'
        proof = read(release / file)
        assert proof['revision'] == REVISION and proof['status'] == status
        assert proof['deviceAcceptance'] == 'NOT_RUN'
        for item in proof['sourceFiles']:
            assert sha(release / item['file']) == item['sha256'], item['file']
        receipts[name] = {'file': file, 'sha256': sha(release / file), 'status': status}
    return manifest, receipts


def record(project, release, current, review, sha, read):
    manifest, receipts = evidence(release, sha, read)
    delivery = {
        'revision': REVISION, 'date': '2026-10-16', 'status': STATUS,
        'defaultMode': 'dual-stack', 'compatibilityMode': 'ipv4-local',
        'automaticPhysicalNetworkDetection': False,
        'guide': GUIDE, 'report': REPORT,
        'sourceManifest': {'file': 'metadata/network-compat.json',
                           'sha256': sha(release / 'metadata/network-compat.json')},
        'entries': manifest['entries'], 'testEvidence': receipts,
        'nodeDefault': 'Mihomo domain nodes without an explicit family: ipv4-prefer; literal and explicit values preserved',
        'localFallback': 'Empty client AAAA; no Fake-IP IPv6 pool; keep core IPv6 and both TUN routes; public literal TUN IPv6 rejected',
        'shadowrocket': manifest['shadowrocketLimit'],
        'scope': 'Source contracts and isolated Windows Mihomo; guard uses synthetic SOCKS substitution; native TUN, app retry, public IPv6 and Shadowrocket NOT_RUN',
        'clientDeployment': False, 'deviceAcceptance': 'NOT_RUN',
        'recordingModule': {'file': 'tools/network_release.py',
                            'sha256': sha(project / 'tools/network_release.py')}}
    file = 'metadata/network-compat-delivery.json'
    (release / file).write_text(json.dumps(delivery, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    review.update(date='2026-10-16', status=STATUS,
                  networkCompatibility={'file': file, 'sha256': sha(release / file), 'revision': REVISION})
    review['requirements'] = [r for r in review['requirements'] if r['number'] != 12] + [{
        'number': 12, 'sourceContract': 'PASS_JS_AND_LIMITED_SHADOWROCKET_MODEL',
        'localCore': 'PASS_ISOLATED_WINDOWS_MIHOMO_WITH_SYNTHETIC_GUARD_INGRESS',
        'shadowrocketNative': 'NOT_RUN', 'deviceAcceptance': 'NOT_RUN'}]
    review['contract']['change'] += ' User-authorized requirement 12: separate local/node/target address families; dual-stack plus explicit IPv4-local mode, no automatic physical-network probe.'
    current.update(featureRevision=REVISION, networkCompatibilityRevision=REVISION,
                   status=STATUS, releaseTag='v14.3.0-rc.2', report=REPORT,
                   networkCompatibility='releases/v14.3/' + file,
                   networkCompatibilityGuide=GUIDE, defaultNetworkMode='dual-stack',
                   automaticPhysicalNetworkDetection=False,
                   compatibilityEntries={e['platform']: 'releases/v14.3/' + e['file'] for e in manifest['entries']})


def verify(project, release, current, review, sha, read):
    manifest, receipts = evidence(release, sha, read)
    item = review['networkCompatibility']
    assert item['revision'] == current['networkCompatibilityRevision'] == REVISION
    assert sha(release / item['file']) == item['sha256']
    delivery = read(release / item['file'])
    assert delivery['status'] == current['status'] == review['status'] == STATUS
    assert delivery['entries'] == manifest['entries'] and delivery['testEvidence'] == receipts
    assert delivery['deviceAcceptance'] == 'NOT_RUN' and delivery['clientDeployment'] is False
    assert delivery['automaticPhysicalNetworkDetection'] is False
    assert current['compatibilityEntries'] == {e['platform']: 'releases/v14.3/' + e['file'] for e in manifest['entries']}
    module = delivery['recordingModule']
    assert sha(project / module['file']) == module['sha256']
    assert (project / GUIDE).is_file() and (project / REPORT).is_file()
    assert len(review['requirements']) == 12 and review['requirements'][-1]['number'] == 12
    return delivery
