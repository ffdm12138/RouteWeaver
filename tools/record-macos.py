"""Bind additive Mac adapters to actual source and separately scoped evidence."""
from pathlib import Path
import hashlib, json

project = Path(__file__).resolve().parents[1]
root = project / 'releases/v14.3'
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = read(root / 'metadata/macos-sources.json')
assert manifest['revision'] == 'macos-r1'
for entry in manifest['inputs'] + manifest['entries']:
    assert sha(root / entry['file']) == entry['sha256'], entry['file']
evidence = {}
for name, expected in [('macos-static', 'MACOS_STATIC_PASS'), ('macos-core', 'MACOS_LOCAL_CORE_PASS_DEVICE_PENDING')]:
    file = 'validation/' + name + '.json'
    receipt = read(root / file)
    assert receipt['status'] == expected, (name, receipt['status'])
    for source in receipt['sourceFiles']:
        assert sha(root / source['file']) == source['sha256'], source['file']
    evidence[name] = {'file': file, 'sha256': sha(root / file), 'status': expected}
core = read(root / 'validation/macos-core.json')
static = read(root / 'validation/macos-static.json')
delivery = {
    'version': '14.3', 'date': '2026-10-16', 'revision': 'macos-r1',
    'domesticProtocolRevision': 'domestic-protocol-r1',
    'status': 'MACOS_SOURCE_LOCAL_CORE_PASS_DEVICE_PENDING',
    'report': 'docs/reports/v14.3/MacBook适配.md', 'guide': 'docs/guides/MacBook使用说明.md',
    'sourceManifest': {'file': 'metadata/macos-sources.json', 'sha256': sha(root / 'metadata/macos-sources.json')},
    'entries': manifest['entries'], 'testEvidence': evidence,
    'metrics': {'staticChecks': len(static['checks']), 'platforms': static['platforms'],
                'nativeObservations': {r['kind']: sum(p['cases'] for p in r['receipt']['platforms']) for r in core['runs']}},
    'scope': 'Inherited business routing; IPv4-preferred default only for domain nodes without explicit family. Separate IPv4-local entries and evidence are in network-compat-delivery.json. Actual standard Mac entries executed on owned Windows Mihomo with TUN disabled; Mac apps/native capture NOT_RUN.',
    'baseEntries': manifest['inputs'][4:],
    'settings': {
        'FlClash': {'mode': 'rule', 'ipv6': True, 'tunEnableAndAutoRoute': 'APP_OWNED; enable in app for full-system capture', 'tunDevice': 'Valid utunN retained; missing/foreign name lets core pick a free utun index'},
        'Clash Mi': {'appendBuiltin': 'noOverwrite', 'mode': 'rule', 'ipv6': True, 'tunOverwrite': False,
                     'includeAllNetworks': True, 'enforceRoutes': True, 'excludeLocalNetworks': False,
                     'excludeApns': False, 'excludeCellularServices': False, 'excludeDeviceCommunication': False,
                     'tunOwner': 'Apple NetworkExtension actual file descriptor supplied by app'}},
    'iosWeChatFollowup': 'Earlier iOS investigation retained. Windows logs now show local DIRECT IPv6 unreachable; macOS/iOS and application IPv4 retry remain device NOT_RETESTED.',
    'clientDeployment': False, 'flclashMacApp': 'NOT_RUN', 'clashmiMacApp': 'NOT_RUN',
    'tunCapture': 'NOT_RUN', 'publicIPv6': 'NOT_RUN', 'deviceAcceptance': 'NOT_RUN',
    'recordingTool': {'file': 'tools/record-macos.py', 'sha256': sha(Path(__file__))}}
(root / 'metadata/macos-delivery.json').write_text(json.dumps(delivery, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'status': delivery['status'], 'metrics': delivery['metrics']}, ensure_ascii=False))
