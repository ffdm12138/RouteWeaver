"""Check layout, frozen inputs, and the explicitly reviewed repair scope."""
import argparse, hashlib, json, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
if json.loads((ROOT / 'CURRENT_RELEASE.json').read_text(encoding='utf-8-sig')).get('version') == '14.3':
    raise SystemExit(subprocess.run([sys.executable, str(ROOT / 'tools/verify-v14.3.py'), *sys.argv[1:]], cwd=ROOT).returncode)
RELEASE = ROOT / 'releases/v14.2'
PREVIOUS = ROOT / 'archive/project-layout-v1-20261010'
parser = argparse.ArgumentParser()
parser.add_argument('--node', default='node')
parser.add_argument('--with-packages', action='store_true')
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
read = lambda path: json.loads(path.read_text(encoding='utf-8-sig'))
report = {'version': '14.2', 'layoutRevision': 3, 'date': '2026-10-12', 'status': 'RUNNING', 'checks': []}

amendment = read(RELEASE / 'metadata/domestic-selector-amendment.json')
feature_baseline = RELEASE / 'validation/inputs/domestic-selector-before'
for entry in read(feature_baseline / 'manifest.json')['files']:
    assert sha(feature_baseline / entry['file']) == entry['sha256'], entry['file']
assert sha(feature_baseline / 'docs/需求.md') == sha(PREVIOUS / 'docs/需求.md') == amendment['baselineContractSHA256']
assert sha(ROOT / 'docs/需求.md') == amendment['currentContractSHA256']
before_contract = (feature_baseline / 'docs/需求.md').read_text(encoding='utf-8-sig').splitlines()
after_contract = (ROOT / 'docs/需求.md').read_text(encoding='utf-8-sig').splitlines()
assert [line for line in before_contract if re.match(r'^(?:[1-9]|10)\. ', line)] == [line for line in after_contract if re.match(r'^(?:[1-9]|10)\. ', line)]
assert len([line for line in after_contract if re.match(r'^11\. ', line)]) == 1
report['checks'].append('original-ten-requirements-preserved-user-domestic-selector-amendment-bound')
archive_receipt_path = RELEASE / 'validation/root-entry-archive.json'
archive_receipt = read(archive_receipt_path)
assert archive_receipt['status'] == 'ROOT_LEGACY_ENTRIES_ARCHIVED_BYTES_VERIFIED'
assert archive_receipt['deployedClientChanged'] is False
assert archive_receipt['layoutRevision'] == report['layoutRevision']
legacy_names = {'v14.1.js', 'v14.1-android.js', 'v14.1-shadowrocket.conf'}
assert len(archive_receipt['files']) == len(legacy_names)
assert {entry['from'] for entry in archive_receipt['files']} == legacy_names
for entry in archive_receipt['files']:
    name = entry['from']
    assert entry['to'] == f'archive/root-v14.1-copies-20261010/{name}'
    assert entry['baseline'] == f'archive/workspace-before-v14.2-20261010/{name}'
    assert not (ROOT / name).exists(), f'Old release entry remains in project root: {name}'
    assert sha(ROOT / entry['to']) == sha(ROOT / entry['baseline']) == entry['sha256']
    assert (ROOT / entry['to']).stat().st_size == entry['bytes']
report['checks'].append('legacy-root-entries-archived-byte-identical-and-root-clear')
report['rootEntryArchive'] = {'file': 'validation/root-entry-archive.json', 'sha256': sha(archive_receipt_path), 'status': archive_receipt['status']}

assert {p.name for p in RELEASE.iterdir()} == {'README.md', 'src', 'data', 'tools', 'metadata', 'tests', 'validation'}
assert not (RELEASE / 'docs').exists(), 'Duplicate canonical docs'
assert {p.name for p in (ROOT / 'dist').iterdir()} <= {'README.md', 'v14.2'}
for path in (RELEASE / 'validation/experiments').rglob('*'):
    if path.is_file():
        assert path.suffix in {'.json', '.log'}, f'Temporary artifact captured: {path}'
report['checks'].append('source-data-docs-evidence-work-and-distribution-separated')

current = read(ROOT / 'CURRENT_RELEASE.json')
assert current['layoutRevision'] == report['layoutRevision']
for path in [current['directory'], current['documentation'], current['report'], *current['entries'].values()]:
    assert (ROOT / path).exists(), path
report['checks'].append('current-release-navigation-resolves')

assert current['platformRevision'] == 'clashmi-object-r2'
assert current['entries']['clashmi'] == 'releases/v14.2/src/ios/v14.2-clashmi.js'
assert (ROOT / current['clashmiReport']).is_file()
clashmi = read(RELEASE / 'metadata/clashmi-review.json')
assert clashmi['revision'] == current['platformRevision']
assert clashmi['status'] == 'CLASHMI_SOURCE_LOCAL_CORE_PASS_DEVICE_PENDING'
assert clashmi['frozenContract']['sha256'] == sha(ROOT / 'docs/需求.md')
for entry in [*clashmi['entries'], *clashmi['evidence'].values(), clashmi['beforeManifest'], clashmi['generatedSources'], clashmi['compatibility'], *clashmi['firstAttempts']]:
    assert sha(RELEASE / entry['file']) == entry['sha256'], 'Stale Clash Mi review: ' + entry['file']
for entry in clashmi['retainedOriginalEntries']:
    assert sha(RELEASE / entry['file']) == entry['sha256'], 'Original client changed: ' + entry['file']
for entry in read(RELEASE / clashmi['beforeManifest']['file'])['files']:
    assert sha(RELEASE / 'validation/inputs/clashmi-before' / entry['file']) == entry['sha256']
for item in clashmi['evidence'].values():
    receipt = read(RELEASE / item['file'])
    assert receipt['status'] == item['status']
    for entry in receipt['sourceFiles']:
        assert sha(RELEASE / entry['file']) == entry['sha256'], 'Stale Clash Mi receipt: ' + entry['file']
for entry in read(RELEASE / clashmi['compatibility']['file'])['snapshots']:
    assert sha(RELEASE / entry['file']) == entry['sha256']
preserved_clashmi = ROOT / clashmi['priorPackages']['directory']
assert sha(preserved_clashmi / 'manifest.json') == clashmi['priorPackages']['manifestSHA256']
for entry in read(preserved_clashmi / 'manifest.json')['files']:
    assert sha(preserved_clashmi / entry['file']) == entry['sha256']
assert sha(ROOT / clashmi['recordingTool']['file']) == clashmi['recordingTool']['sha256']
for entry in [clashmi['beforeObjectManifest'],clashmi['priorObjectReview'],clashmi['userEvidence']]:
    assert sha(RELEASE / entry['file']) == entry['sha256']
for entry in read(RELEASE / clashmi['beforeObjectManifest']['file'])['files']:
    assert sha(RELEASE / 'validation/inputs/clashmi-object-before' / entry['file']) == entry['sha256']
observations=read(RELEASE / clashmi['userEvidence']['file'])
assert observations['confirmedClashMi']['version'] == '1.0.30.1605 ios'
for entry in observations['screenshots']:
    assert sha(RELEASE / entry['file']) == entry['sha256']
assert clashmi['objectBridgeRegression']['beforeRejected'] is True
assert clashmi['objectBridgeRegression']['afterReturnType'] == 'object'
subprocess.run([args.node, str(RELEASE / 'tools/generate-v14.2-clashmi.cjs'), '--check'], cwd=RELEASE, check=True, capture_output=True)
report['checks'].append('Clash-Mi-addition-frozen-rules-original-clients-official-sources-and-own-evidence-bound')

old = read(PREVIOUS / 'releases/v14.2/rule-sources.lock.json')
new = read(RELEASE / 'data/rule-sources.lock.json')
historical_lock_path = RELEASE / 'validation/inputs/embedded-domain-before/data/rule-sources.lock.json'
historical_lock = read(historical_lock_path)
assert len(old['sources']) == len(new['sources']) == 45
required = set()
def semantics(source):
    value = json.loads(json.dumps(source))
    value.pop('file')
    value['classifier'].pop('file')
    return value
for before, after in zip(old['sources'], historical_lock['sources']):
    assert semantics(before) == semantics(after), f'Changed rule semantics: {after["id"]}'
    assert re.search(r'/[a-f0-9]{40}/', after['url'])
for after in new['sources']:
    assert re.search(r'/[a-f0-9]{40}/', after['url'])
    assert sha(RELEASE / after['file']) == after['sha256']
    assert sha(RELEASE / after['classifier']['file']) == after['classifier']['sha256']
    previous_source = next(s for s in historical_lock['sources'] if s['id'] == after['id'])
    assert after['classifier']['sha256'] == previous_source['classifier']['sha256']
    required.update([after['file'], after['classifier']['file']])
actual = {p.relative_to(RELEASE).as_posix() for p in (RELEASE / 'data/rules/reviewed').iterdir() if p.is_file()}
assert required == actual and len(actual) == 90
report['checks'].append('45-reviewed-latest-pins-and-90-hash-bound-files-preserve-classification')
baseline = RELEASE / 'validation/inputs/repair-before'
assert read(baseline / 'data/rules/company-core.json')['groups'] == read(PREVIOUS / 'releases/v14.2/rule-data/company-core.json')['groups']
for entry in read(baseline / 'manifest.json')['files']:
    assert sha(baseline / entry['file']) == entry['sha256'], entry['file']
review = read(RELEASE / 'data/rules/classification-review.json')
assert review['status'] == 'REVIEWED' and review['remoteSourceChanges'] == 0
assert review['baselineCoreSHA256'] == sha(baseline / 'data/rules/company-core.json')
report['checks'].append('repair-baseline-preserved-and-explicit-classification-review-bound')
thunder = read(RELEASE / 'metadata/thunder-repair-review.json')
assert thunder['revision'] == 'thunder-repair-r1'
assert thunder['classificationRevision'] == review['revision']
assert thunder['remoteSourceChanges'] == 0
assert sha(ROOT / 'docs/需求.md') == thunder['contractSHA256']
r1_source_root = ROOT / 'archive/v14.2-before-thunder-repair-r2-20261010/releases/v14.2'
assert r1_source_root.is_dir(), 'Missing immutable R1-to-R2 source archive'
for entry in thunder['entries']:
    assert sha(r1_source_root / entry['file']) == entry['sha256'], 'Historical R1 mismatch: ' + entry['file']
r2 = read(RELEASE / 'metadata/thunder-r2-review.json')
assert r2['revision'] == 'thunder-repair-r2'
r2_source_root = ROOT / 'archive/v14.2-before-thunder-repair-r3-20261010/releases/v14.2'
assert r2['priorRevision'] == thunder['revision'] and r2['remoteSourceChanges'] == 0
assert r2['contract']['sha256'] == sha(ROOT / 'docs/需求.md')
assert r2['r1Metadata']['sha256'] == sha(RELEASE / r2['r1Metadata']['file'])
assert r2['lockedSources']['sha256'] == sha(historical_lock_path) and r2['lockedSources']['count'] == 45
assert sha(RELEASE / r2['beforeManifest']['file']) == r2['beforeManifest']['sha256']
for entry in read(RELEASE / r2['beforeManifest']['file'])['files']:
    assert sha(RELEASE / 'validation/inputs/thunder-r2-before' / entry['file']) == entry['sha256']
for entry in r2['entries']:
    assert sha(r2_source_root / entry['file']) == entry['sha256'], 'Historical R2 mismatch: ' + entry['file']
for name, item in r2['testEvidence'].items():
    assert sha(r2_source_root / item['file']) == item['sha256'], 'Historical R2 evidence mismatch: ' + name
assert r2['status'] == 'REPAIRED_LOCAL_CORE_VERIFIED_IOS_DEVICE_PENDING'
report['checks'].append('historical-r1-r2-source-receipts-preserved')
assert sha(RELEASE / 'metadata/thunder-r2-review.json') == sha(r2_source_root / 'metadata/thunder-r2-review.json')
for entry in read(r2_source_root.parents[1] / 'manifest.json')['files']:
    assert sha(r2_source_root.parents[1] / entry['file']) == entry['sha256']
r3 = read(RELEASE / 'metadata/thunder-r3-review.json')
assert r3['revision'] == 'thunder-repair-r3'
r3_source_root = ROOT / 'archive/v14.2-before-thunder-repair-r4-20261010/releases/v14.2'
assert r3['priorRevision'] == r2['revision'] and r3['remoteSourceChanges'] == 0
assert r3['contract']['sha256'] == sha(ROOT / 'docs/需求.md')
assert r3['r2Metadata']['sha256'] == sha(RELEASE / 'metadata/thunder-r2-review.json')
assert r3['lockedSources']['sha256'] == sha(historical_lock_path) and r3['lockedSources']['count'] == 45
assert sha(RELEASE / r3['beforeManifest']['file']) == r3['beforeManifest']['sha256']
for entry in read(RELEASE / r3['beforeManifest']['file'])['files']:
    assert sha(RELEASE / 'validation/inputs/thunder-r3-before' / entry['file']) == entry['sha256']
for entry in r3['entries']:
    assert sha(r3_source_root / entry['file']) == entry['sha256'], 'Historical R3 mismatch: ' + entry['file']
for name, item in r3['testEvidence'].items():
    assert sha(r3_source_root / item['file']) == item['sha256'], 'Historical R3 evidence mismatch: ' + name
assert r3['status'] == 'REPAIRED_LOCAL_CORE_VERIFIED_IOS_DEVICE_PENDING'
assert sha(RELEASE / 'metadata/thunder-r3-review.json') == sha(r3_source_root / 'metadata/thunder-r3-review.json')
for entry in read(r3_source_root.parents[1] / 'manifest.json')['files']:
    assert sha(r3_source_root.parents[1] / entry['file']) == entry['sha256']
report['checks'].append('historical-r3-source-receipts-and-complete-pre-r4-snapshot-preserved')
r4 = read(RELEASE / 'metadata/thunder-r4-review.json')
r4_source_root = ROOT / 'archive/v14.2-before-thunder-repair-r5-20261010/releases/v14.2'
assert r4['revision'] == 'thunder-repair-r4'
assert r4['priorRevision'] == r3['revision'] and r4['remoteSourceChanges'] == 0
assert r4['contract']['sha256'] == sha(ROOT / 'docs/需求.md')
assert r4['priorMetadata']['sha256'] == sha(RELEASE / 'metadata/thunder-r3-review.json')
assert r4['lockedSources']['sha256'] == sha(historical_lock_path) and r4['lockedSources']['count'] == 45
assert sha(RELEASE / r4['beforeManifest']['file']) == r4['beforeManifest']['sha256']
for entry in read(RELEASE / r4['beforeManifest']['file'])['files']:
    assert sha(RELEASE / 'validation/inputs/thunder-r4-before' / entry['file']) == entry['sha256']
for entry in r4['entries']:
    assert sha(r4_source_root / entry['file']) == entry['sha256'], 'Historical R4 mismatch: ' + entry['file']
for name, item in r4['testEvidence'].items():
    assert sha(r4_source_root / item['file']) == item['sha256'], 'Historical R4 evidence mismatch: ' + name
assert r4['status'] == 'ELEVEN_CONTRACTS_REVIEWED_LOCAL_CORE_VERIFIED_DEVICE_PENDING'
assert len(r4['requirements']) == 11 and all(r['sourceContract'] == 'PASS' for r in r4['requirements'])
assert sha(RELEASE / 'metadata/thunder-r4-review.json') == sha(r4_source_root / 'metadata/thunder-r4-review.json')
for entry in read(r4_source_root.parents[1] / 'manifest.json')['files']:
    assert sha(r4_source_root.parents[1] / entry['file']) == entry['sha256']
report['checks'].append('historical-r4-sources-receipts-and-original-packages-byte-identical')
r5 = read(RELEASE / 'metadata/thunder-r5-review.json')
r5_source_root = ROOT / 'archive/v14.2-before-thunder-closeout-r6-20261011/releases/v14.2'
assert r5['revision'] == 'thunder-repair-r5'
assert r5['priorRevision'] == r4['revision'] and r5['remoteSourceChanges'] == 0
assert r5['contract']['sha256'] == sha(ROOT / 'docs/需求.md')
assert r5['priorMetadata']['sha256'] == sha(RELEASE / 'metadata/thunder-r4-review.json')
assert r5['lockedSources']['sha256'] == sha(historical_lock_path) and r5['lockedSources']['count'] == 45
assert sha(RELEASE / r5['beforeManifest']['file']) == r5['beforeManifest']['sha256']
for entry in read(RELEASE / r5['beforeManifest']['file'])['files']:
    assert sha(RELEASE / 'validation/inputs/thunder-r5-before' / entry['file']) == entry['sha256']
for entry in read(RELEASE / r5['auditManifest']['file'])['files']:
    assert sha(RELEASE / 'validation/inputs/thunder-r5-audit' / entry['file']) == entry['sha256']
assert sha(RELEASE / r5['cdnPolicy']['file']) == r5['cdnPolicy']['sha256']
for entry in r5['entries']:
    assert sha(r5_source_root / entry['file']) == entry['sha256'], 'Historical R5 mismatch: ' + entry['file']
for name, item in r5['testEvidence'].items():
    assert sha(r5_source_root / item['file']) == item['sha256'], 'Historical R5 evidence mismatch: ' + name
assert r5['status'] == 'FOUR_FINDINGS_REPAIRED_ELEVEN_CONTRACTS_LOCAL_CORE_VERIFIED_DEVICE_PENDING'
assert [r['id'] for r in r5['requirements']] == list(range(1, 12))
assert all(r['sourceContract'] == 'PASS' for r in r5['requirements'])
assert len(r5['findings']) == 4 and all(f['resolutionStatus'] == 'REPAIRED_VERIFIED_WITH_DECLARED_SCOPE' for f in r5['findings'])
assert sha(RELEASE / 'metadata/thunder-r5-review.json') == sha(r5_source_root / 'metadata/thunder-r5-review.json')
for entry in read(r5_source_root.parents[1] / 'manifest.json')['files']:
    assert sha(r5_source_root.parents[1] / entry['file']) == entry['sha256']
report['checks'].append('historical-r5-four-repairs-original-sources-receipts-and-packages-preserved')
r6 = read(RELEASE / 'metadata/thunder-closeout-review.json')
assert r6['revision'] == 'thunder-closeout-r6'
r6_source_root = ROOT / 'archive/v14.2-before-apple-inline-r1-20261011/releases/v14.2'
assert r6['priorRevision'] == r5['revision'] and r6['remoteSourceChanges'] == 0
assert r6['contract']['sha256'] == sha(ROOT / 'docs/需求.md')
assert r6['priorMetadata']['sha256'] == sha(RELEASE / 'metadata/thunder-r5-review.json')
assert r6['lockedSources']['sha256'] == sha(historical_lock_path)
assert sha(RELEASE / r6['beforeManifest']['file']) == r6['beforeManifest']['sha256']
for entry in read(RELEASE / r6['beforeManifest']['file'])['files']:
    assert sha(RELEASE / 'validation/inputs/thunder-r6-before' / entry['file']) == entry['sha256']
for entry in r6['entries']:
    assert sha(r6_source_root / entry['file']) == entry['sha256'], 'Historical R6 mismatch: ' + entry['file']
for name, item in r6['testEvidence'].items():
    assert sha(r6_source_root / item['file']) == item['sha256'], 'Historical R6 evidence mismatch: ' + name
for attempt in r6['attempts']:
    assert sha(r6_source_root / attempt['file']) == attempt['sha256']
assert sha(r6_source_root / r6['nativeRun']['file']) == r6['nativeRun']['sha256']
assert r6['status'] == 'FINAL_SOURCE_LOCAL_CORE_REVIEW_PASS_DEVICE_ACCEPTANCE_PENDING'
assert [r['id'] for r in r6['requirements']] == list(range(1, 12))
assert all(r['sourceContract'] == 'PASS' for r in r6['requirements'])
assert len(r6['findings']) == 2 and all(f['resolutionStatus'] == 'REPAIRED_VERIFIED' for f in r6['findings'])
assert r6['retainedBoundaries']['singleLabelLAN']['knownNames'] == 52
assert sha(RELEASE / 'metadata/thunder-closeout-review.json') == sha(r6_source_root / 'metadata/thunder-closeout-review.json')
report['checks'].append('historical-r6-TUN-full-replay-source-receipts-and-packages-preserved')
apple = read(RELEASE / 'metadata/apple-inline-review.json')
apple_source_root = ROOT / 'archive/v14.2-before-embedded-domain-r1-20261011/releases/v14.2'
assert apple['revision'] == 'apple-inline-r1'
assert apple['status'] == 'APPLE_INLINE_SOURCE_LOCAL_CORE_PASS_DEVICE_PENDING'
assert apple['priorRevision'] == r6['revision'] and apple['remoteSourceChanges'] == 0
assert apple['priorMetadata']['sha256'] == sha(RELEASE / 'metadata/thunder-closeout-review.json')
assert apple['contract']['sha256'] == sha(ROOT / 'docs/需求.md')
assert apple['lockedSources']['sha256'] == sha(historical_lock_path)
assert sha(RELEASE / apple['beforeManifest']['file']) == apple['beforeManifest']['sha256']
for entry in read(RELEASE / apple['beforeManifest']['file'])['files']:
    assert sha(RELEASE / 'validation/inputs/apple-inline-before' / entry['file']) == entry['sha256']
preserved = ROOT / apple['preservedArchive']['directory']
assert sha(preserved / 'manifest.json') == apple['preservedArchive']['manifestSHA256']
for entry in read(preserved / 'manifest.json')['files']:
    assert sha(preserved / entry['file']) == entry['sha256']
for entry in apple['entries']:
    assert sha(apple_source_root / entry['file']) == entry['sha256'], 'Historical Apple source mismatch: ' + entry['file']
for name, item in apple['testEvidence'].items():
    assert sha(apple_source_root / item['file']) == item['sha256'], 'Historical Apple evidence: ' + name
    receipt = read(apple_source_root / item['file'])
    assert receipt['status'] == item['status'], name
    for source in receipt['sourceFiles']:
        assert sha(apple_source_root / source['file']) == source['sha256'], 'Historical Apple evidence source: ' + source['file']
for item in apple['attempts']:
    assert sha(RELEASE / item['file']) == item['sha256']
assert sha(ROOT / apple['recordingTool']['file']) == apple['recordingTool']['sha256']
assert len(apple['requirements']) == 11 and all(r['sourceContract'] == 'PASS' for r in apple['requirements'])
assert all(f['resolutionStatus'] == 'REPAIRED_VERIFIED' for f in apple['findings'])
assert sha(RELEASE / 'metadata/apple-inline-review.json') == sha(apple_source_root / 'metadata/apple-inline-review.json')
report['checks'].append('historical-Apple-original-sources-core-evidence-and-package-bytes-preserved')
embedded = read(RELEASE / 'metadata/embedded-domain-review.json')
assert embedded['revision'] == current['repairRevision'] == 'embedded-domain-r1'
assert embedded['status'] == current['status'] == 'EMBEDDED_DOMAIN_SOURCE_LOCAL_CORE_PASS_DEVICE_PENDING'
assert embedded['priorRevision'] == apple['revision'] and embedded['runtimeClassificationChanges'] == 0
assert embedded['contract']['sha256'] == sha(ROOT / 'docs/需求.md')
assert embedded['lockedSources']['sha256'] == sha(RELEASE / 'data/rule-sources.lock.json')
for item in [embedded['priorMetadata'],embedded['beforeManifest'],embedded['latestSourceReview'],embedded['embeddedSnapshot'],*embedded['entries'],*embedded['attempts']]:
    assert sha(RELEASE / item['file']) == item['sha256'], item['file']
for name,item in embedded['testEvidence'].items():
    assert sha(RELEASE / item['file']) == item['sha256'], name
    receipt=read(RELEASE / item['file'])
    assert receipt['status'] == item['status'], name
    for source in receipt['sourceFiles']:
        assert sha(RELEASE / source['file']) == source['sha256'], 'Stale embedded evidence: '+source['file']
preserved=ROOT / embedded['preservedArchive']['directory']
assert sha(preserved / 'manifest.json') == embedded['preservedArchive']['manifestSHA256']
for item in read(preserved / 'manifest.json')['files']:
    assert sha(preserved / item['file']) == item['sha256'], item['file']
assert sha(ROOT / embedded['recordingTool']['file']) == embedded['recordingTool']['sha256']
assert embedded['metrics']['domesticDomainRows'] == 111595
assert len(embedded['requirements']) == 11 and all(r['sourceContract']=='PASS' for r in embedded['requirements'])
report['checks'].append('current-embedded-domain-latest-review-empty-and-cold-download-core-evidence-bound')
for entry in read(RELEASE / 'validation/inputs/thunder-repair-before/manifest.json')['files']:
    assert sha(RELEASE / 'validation/inputs/thunder-repair-before' / entry['file']) == entry['sha256']
historical = ROOT / 'archive/v14.2-before-thunder-repair-20261010'
if historical.exists():
    for entry in read(historical / 'manifest.json')['files']:
        assert sha(historical / entry['file']) == entry['sha256']
report['checks'].append('five-thunder-repairs-reviewed-frozen-contract-and-pre-repair-history-bound')

js = """const fs=require('node:fs');
const after=require('./releases/v14.2/tests/fixture.cjs');
for(const platform of ['desktop','android']){
 fs.writeFileSync(after.local('validation/generated/'+platform+'.json'),JSON.stringify(after.generate(platform),null,2)+'\\n');
}
"""
(RELEASE / 'validation/generated').mkdir(parents=True, exist_ok=True)
result = subprocess.run([args.node, '-e', js], cwd=ROOT, capture_output=True, encoding='utf-8')
assert result.returncode == 0, result.stdout + result.stderr
report['checks'].append('current-generated-examples-refreshed')

expected_packages = {ROOT / 'dist/v14.2' / name for name in ['v14.2-deployable.zip', 'v14.2-audit-evidence.zip', 'package-verification.json', 'SHA256SUMS.txt']}
checked_links = 0
for doc in [ROOT / 'README.md', ROOT / 'AGENTS.md', ROOT / 'dist/README.md', ROOT / 'archive/README.md', RELEASE / 'README.md', *(ROOT / 'docs').rglob('*.md')]:
    for link in re.findall(r'(?<!!)\[[^\]]+\]\(([^)]+)\)', doc.read_text(encoding='utf-8-sig')):
        link = link.strip('<>')
        if re.match(r'^(https?://|mailto:|#)', link):
            continue
        dest = (doc.parent / link.split('#')[0]).resolve()
        assert dest.exists() or (not args.with_packages and dest in expected_packages), f'Broken link: {doc}: {link}'
        checked_links += 1
report['checks'].append('current-and-historical-index-local-links-resolve')
report['localLinks'] = checked_links

for name, status in [('static', 'STATIC_PASS'), ('repair-review', 'REPAIR_REGRESSION_PASS'), ('domestic-audit', 'DOMESTIC_AUDIT_PASS'), ('domestic-selector', 'DOMESTIC_SELECTOR_PASS'), ('api-browser-compat', 'API_BROWSER_COMPAT_STATIC_PASS'), ('api-browser-regression', 'API_REAL_IP_CORE_PASS_BROWSER_TUN_RETEST_PENDING'), ('native-routing', 'CORE_ROUTING_PASS'), ('native-dns-egress', 'CORE_DNS_EGRESS_PASS'), ('thunder-repair', 'THUNDER_REPAIR_STATIC_PASS'), ('thunder-domain-coverage', 'THUNDER_DOMAIN_COVERAGE_PASS'), ('native-selectors', 'CORE_MANUAL_SELECTORS_PASS'), ('thunder-r2', 'THUNDER_R2_STATIC_PASS'), ('thunder-r3', 'THUNDER_R3_STATIC_PASS'), ('thunder-r4', 'THUNDER_R4_ELEVEN_CONTRACTS_STATIC_PASS'), ('thunder-r5', 'THUNDER_R5_ELEVEN_CONTRACTS_STATIC_PASS'), ('native-inbound-guard', 'CORE_INBOUND_GUARD_PASS')]:
    receipt = read(RELEASE / f'validation/{name}.json')
    assert receipt['status'] == status
    for source in receipt['sourceFiles']:
        assert sha(RELEASE / source['file']) == source['sha256'], f'Stale {name}: {source["file"]}'
    if 'home' in receipt:
        assert (RELEASE / receipt['home']).is_dir()
report['checks'].append('current-core-receipts-bind-current-paths-and-source-bytes')

dns_receipt = read(RELEASE / 'validation/native-dns-egress.json')
ipv6 = dns_receipt['ipv6Preflight']
ipv6_status = 'LOCAL_LOOPBACK_PASS_DEVICE_PENDING' if ipv6['status'] == 'PASS' else 'NOT_RUN_ENVIRONMENT_' + ipv6.get('code', 'UNAVAILABLE')
assert current['ipv6Transport'] == ipv6_status
assert current['clientDeployment'] is False
assert current['featureRevision'] == amendment['featureRevision']
compatibility = read(RELEASE / 'metadata/api-browser-compatibility.json')
assert current['compatibilityRevision'] == compatibility['compatibilityRevision']
assert current['openAIConnectivity'] == read(RELEASE / 'validation/api-browser-regression.json')['status']
for entry in compatibility['entries']:
    assert sha(r1_source_root / entry['file']) == entry['sha256'], 'Historical API compatibility receipt mismatch'
for entry in read(RELEASE / 'validation/inputs/api-browser-before/manifest.json')['files']:
    assert sha(RELEASE / 'validation/inputs/api-browser-before' / entry['file']) == entry['sha256']
assert sha(RELEASE / compatibility['beforeManifest']['file']) == compatibility['beforeManifest']['sha256']
for platform in dns_receipt['platforms']:
    proof = platform['apiFakeIPCompatibility']
    assert proof['status'] == 'CORE_FAKE_IP_COMPATIBILITY_PASS_BROWSER_RETEST_PENDING' and proof['cases'] == 10
report['checks'].append('exact-api-real-address-compatibility-bound-core-pass-browser-retest-pending')
coverage = read(RELEASE / 'validation/thunder-domain-coverage.json')
assert all(p['dnsMismatchCount'] == 0 and not p['udpInconsistencies'] for p in coverage['platforms'])
assert coverage['differences'] == []
selectors = read(RELEASE / 'validation/native-selectors.json')
assert len(selectors['platforms']) == 6 and all(p['status'] == 'CORE_MANUAL_SELECTORS_PASS' for p in selectors['platforms'])
report.update(status='LAYOUT_AND_REVIEWED_REPAIR_PASS', repairRevision=embedded['revision'], classificationRevision=review['revision'], featureRevision=current['featureRevision'], compatibilityRevision=current['compatibilityRevision'], managedSources=45, runtimeRuleFiles=90, preservedHistoricalSnapshot='archive/project-layout-v1-20261010')
(RELEASE / 'validation/layout-check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
acceptance = {'version': '14.2', 'date': '2026-10-12', 'status': 'SOURCE_AND_LOCAL_CORE_PASS_DEVICE_PENDING', 'layoutRevision': report['layoutRevision'],
    'repairRevision': embedded['revision'], 'classificationRevision': review['revision'], 'featureRevision': current['featureRevision'], 'compatibilityRevision': current['compatibilityRevision'], 'openAIConnectivity': current['openAIConnectivity'],
    'receipts': {name: {'file': f'validation/{name}.json', 'sha256': sha(RELEASE / f'validation/{name}.json'), 'status': read(RELEASE / f'validation/{name}.json')['status']} for name in ['static', 'repair-review', 'domestic-audit', 'domestic-selector', 'api-browser-compat', 'api-browser-regression', 'native-routing', 'native-dns-egress', 'thunder-repair', 'thunder-domain-coverage', 'native-selectors', 'thunder-r2', 'thunder-r3', 'thunder-r4', 'thunder-r5', 'native-inbound-guard', 'layout-check']},
    'routingCases': sum(p['cases'] for p in read(RELEASE / 'validation/native-routing.json')['platforms']),
    'dnsEgressCases': sum(p['cases'] for p in read(RELEASE / 'validation/native-dns-egress.json')['platforms']),
    'staticChecks': len(read(RELEASE / 'validation/static.json')['checks']),
    'nativeSelectorObservations': sum(p['cases'] for p in selectors['platforms']),
    'domainSamples': coverage['hostCount'], 'crossPlatformClassifierDifferences': coverage['differences'],
    'nativeInboundObservations': sum(p['cases'] for p in read(RELEASE / 'validation/native-inbound-guard.json')['platforms']),
    'businessDNSCoverage': [{'platform':p['platform'],'checks':p['businessDNSChecks'],'mismatches':p['dnsMismatchCount']} for p in coverage['platforms']],
    'historicalFindings': thunder['findings'] + r2['findings'] + r3['findings'] + r4['findings'] + r5['findings'] + r6['findings'],
    'findings': embedded['findings'], 'requirements': embedded['requirements'], 'cdnPolicy': r5['cdnPolicy'], 'independentR5Review': embedded['testEvidence']['independent-r5'],
    'closeoutReview': {'file': 'metadata/thunder-closeout-review.json', 'sha256': sha(RELEASE / 'metadata/thunder-closeout-review.json'), 'scope': 'Historical R6, preserved before Apple repair'},
    'closeoutEdgeAudit': embedded['testEvidence']['thunder-closeout'], 'historicalCloseoutMetrics': r6['metrics'],
    'appleReview': {'file': 'metadata/apple-inline-review.json', 'sha256': sha(RELEASE / 'metadata/apple-inline-review.json')}, 'appleMetrics': apple['metrics'],
    'knownSingleLabelLANBoundary': r6['retainedBoundaries']['singleLabelLAN'],
    'domesticRoutingChecks': sum(p['routingChecks'] for p in read(RELEASE / 'validation/domestic-audit.json')['platforms']),
    'domesticDNSChecks': sum(p['dnsChecks'] for p in read(RELEASE / 'validation/domestic-audit.json')['platforms']),
    'existingPrivateExceptionDifferences': read(RELEASE / 'validation/domestic-audit.json')['existingPrivateExceptionDifferences'],
    'deviceAcceptance': 'NOT_RUN', 'shadowrocketNative': 'CANDIDATE_NOT_RUN', 'ipv6Transport': ipv6_status, 'clientDeployment': False}
acceptance['receipts'].update(embedded['testEvidence'])
acceptance['embeddedReview'] = {'file':'metadata/embedded-domain-review.json','sha256':sha(RELEASE / 'metadata/embedded-domain-review.json')}
acceptance['embeddedMetrics'] = embedded['metrics']
acceptance['appleUserSmoke'] = embedded['appleUserSmoke']
acceptance['appleLogin541'] = 'UNRESOLVED_BROWSER_RETEST_NOT_RUN'
acceptance['platformRevision'] = clashmi['revision']
acceptance['clashmiReview'] = {'file': 'metadata/clashmi-review.json', 'sha256': sha(RELEASE / 'metadata/clashmi-review.json')}
acceptance['clashmiMetrics'] = clashmi['metrics']
acceptance['clashmiDeviceGates'] = clashmi['deviceGates']
acceptance['clashmiBridgeRegression'] = clashmi['objectBridgeRegression']
acceptance['clashmiPriorDeviceError'] = clashmi['priorIOSBridge']
acceptance['receipts'].update(clashmi['evidence'])
(RELEASE / 'validation/final-acceptance.json').write_text(json.dumps(acceptance, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
if args.with_packages:
    assert all(path.is_file() for path in expected_packages)
    package_receipt = read(ROOT / 'dist/v14.2/package-verification.json')
    assert package_receipt['status'] == 'PACKAGE_CRC_HASH_FRESH_REPLAY_PASS'
    for package in package_receipt['packages']:
        assert sha(ROOT / 'dist/v14.2' / package['file']) == package['sha256']
    for source in package_receipt['sourceFiles']:
        assert sha(ROOT / source['file']) == source['sha256'], f'Stale package source: {source["file"]}'
print(json.dumps({'status': report['status'], 'checks': len(report['checks']), 'localLinks': checked_links, 'packageCheck': 'PASS' if args.with_packages else 'SEPARATE'}, ensure_ascii=False))
