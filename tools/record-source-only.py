"""Record a source-only revision: current entries plus frozen native evidence.

This is the sibling of record-v14.3.py for revisions that change the generated
entries without a native replay core. It never invents native results: the
existing receipts stay bound to the frozen snapshot they were recorded against,
and the record states that they do not describe the current entries.
"""
from pathlib import Path
import hashlib, json

project = Path(__file__).resolve().parents[1]
root = project / 'releases/v14.3'
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

STATUS = 'SOURCE_STATIC_PASS_NATIVE_EVIDENCE_FROZEN_PRE_CHANGE'
SNAPSHOT = 'validation/inputs/api-doh-before'
REVISION = 'api-doh-egress-r1'
RECEIPTS = ['validation/native-core.json', 'validation/balanced-empty-core.json',
            'validation/balanced-download-failure.json', 'validation/macos-core.json']

manifest = read(root / 'metadata/balanced-sources.json')
review = read(root / 'metadata/balanced-review.json')
current = read(project / 'CURRENT_RELEASE.json')
snapshot = read(root / SNAPSHOT / 'manifest.json')

# The snapshot must describe bytes that are NOT the current entries; otherwise
# "frozen" would silently mean "current" and the receipt would look valid.
snapshot_sha = {row['file']: row['sha256'] for row in snapshot['files']}
assert snapshot['appliesToCurrentEntries'] is False
for file, digest in snapshot_sha.items():
    path = root / SNAPSHOT / file
    assert path.is_file() and sha(path) == digest, file
    assert sha(root / file) != digest, file + ' is unchanged; nothing to freeze'

for name in RECEIPTS:
    receipt = read(root / name)
    assert receipt.get('boundToSnapshot') == SNAPSHOT, name
    for source in receipt['sourceFiles']:
        assert sha(root / source['file']) == source['sha256'], (name, source['file'])

# Repointing a receipt changes its own bytes, so every index that stores the
# receipt file hash has to be refreshed too. Only the file hash changes; the
# status and the source bindings inside the receipt are untouched.
for entry in review['testEvidence'].values():
    entry['sha256'] = sha(root / entry['file'])
macos = read(root / 'metadata/macos-delivery.json')
for entry in (macos.get('testEvidence') or {}).values():
    entry['sha256'] = sha(root / entry['file'])
(root / 'metadata/macos-delivery.json').write_text(json.dumps(macos, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
import sys
sys.path.insert(0, str(project / 'tools'))
from release_enhancements import EXPECTED as ENHANCEMENT_STATUS
enh = review.get('enhancements') or {}
enh['testEvidence'] = {name: {'file': 'validation/' + name + '.json',
                              'sha256': sha(root / ('validation/' + name + '.json')),
                              'status': status}
                       for name, status in ENHANCEMENT_STATUS.items()}
if enh.get('capabilities'):
    enh['capabilities']['sha256'] = sha(root / enh['capabilities']['file'])
if enh.get('recordingModule'):
    enh['recordingModule']['sha256'] = sha(project / enh['recordingModule']['file'])
review['enhancements'] = enh
review['clientDeployment'] = current['clientDeployment']
regressions = review.get('knownReleaseRegressions')
if isinstance(regressions, dict) and (root / regressions.get('file', '')).is_file():
    regressions['sha256'] = sha(root / regressions['file'])

review.update(
    version='14.3', date='2026-10-27', revision='balanced-r1',
    status=STATUS,
    sourceManifest={'file': 'metadata/balanced-sources.json', 'sha256': sha(root / 'metadata/balanced-sources.json')},
    contract=dict(review['contract'], sha256=sha(project / review['contract']['file']),
                  refreshedBy='tools/record-source-only.py',
                  refreshScope='Byte binding only. The requirement text was not re-reviewed in this revision.'),
    entries=manifest['entries'],
    nativeEvidence={
        'snapshot': SNAPSHOT + '/manifest.json',
        'snapshotSHA256': sha(root / SNAPSHOT / 'manifest.json'),
        'appliesToCurrentEntries': False,
        'receipts': RECEIPTS,
        'actualReplay': 'NOT_RUN_NO_REPLAY_CORE',
        'note': 'Receipts describe the entry bytes frozen in the snapshot. They '
                'prove nothing about the current entries and are not claimed to.',
    },
    recordingTool={'file': 'tools/record-source-only.py', 'sha256': sha(Path(__file__))},
    scope='Six JS entries and the Shadowrocket model verified by generation and static contracts only. '
          'Native core replay and device acceptance for this revision: NOT_RUN.',
)
# Every derived index that stores a fingerprint of a file we may have touched
# is refreshed here. These are file hashes, not review outcomes.
for key in ('sourceComparison', 'latestCandidates', 'iosDelivery', 'macosDelivery', 'networkCompatibility'):
    item = review.get(key)
    if isinstance(item, dict) and item.get('file') and (root / item['file']).is_file():
        item['sha256'] = sha(root / item['file'])

(root / 'metadata/balanced-review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
current.update(status=STATUS, apiDohRevision=REVISION,
               apiDohNativeAcceptance='NOT_RUN_NO_REPLAY_CORE_IN_SESSION',
               apiDohPriorReceipts='BOUND_TO_FROZEN_PRE_CHANGE_SNAPSHOT',
               nativeEvidenceSnapshot=SNAPSHOT + '/manifest.json')
(project / 'CURRENT_RELEASE.json').write_text(json.dumps(current, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'status': STATUS, 'entries': len(manifest['entries']), 'frozen': len(snapshot['files'])}))
