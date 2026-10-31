"""Strict current-candidate inventory and evidence checks; no live-client access.

Legacy releases keep their own receipts. This module does not re-sign them or
assert device acceptance. Only evidence explicitly bound to current entries is
accepted for the architecture-audit-r1 candidate.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path

REVISION = 'architecture-audit-r1'
AUDIT = Path('releases/v14.3/validation/architecture-audit')
MANIFEST = AUDIT / 'CURRENT_ACCEPTANCE.json'
ROOT_FILES = ('AGENTS.md', 'README.md', 'GOALS.md', 'PLANS.md', 'CHANGELOG.md',
              'SECURITY.md', 'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md', 'LICENSE',
              'CURRENT_RELEASE.json', '.gitattributes', '.gitignore')
TREES = ('docs', 'tools', 'third_party', 'releases/v14.3', 'releases/v14.3-ipv4-only')
OMIT_DIRS = {'.git', '.work', 'archive', '__pycache__', 'node_modules', 'target', 'experiments'}
OMIT_NAMES = {'CURRENT_ACCEPTANCE.json', 'bounded-runs.json'}
FORBIDDEN_SUFFIXES = {'.exe', '.dll', '.key', '.pem', '.p12', '.pfx', '.sqlite', '.db', '.zip'}


def read(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_path(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError('Path escapes candidate root')
    if not path.is_file() or path.is_symlink():
        raise ValueError('Missing or linked file: ' + relative)
    return path


def entries(root: Path) -> dict[str, str]:
    current = read(root/'CURRENT_RELEASE.json')
    variant = read(root/'releases/v14.3-ipv4-only/MANIFEST.json')
    if len(current['entries']) != 7 or len(variant['entries']) != 7:
        raise ValueError('Expected seven clients in each track')
    names = list(current['entries'].values()) + [row['file'] for row in variant['entries'].values()]
    if len(set(names)) != 14:
        raise ValueError('Expected fourteen distinct import files')
    return {name: sha(checked_path(root, name)) for name in sorted(names)}


def inventory(root: Path) -> dict[str, str]:
    paths = [root/name for name in ROOT_FILES if (root/name).is_file()]
    for tree in TREES:
        for path in (root/tree).rglob('*'):
            relative = path.relative_to(root)
            if path.is_file() and not (set(relative.parts) & OMIT_DIRS) and path.name not in OMIT_NAMES and path.suffix.lower() != '.log':
                if path.suffix.lower() in FORBIDDEN_SUFFIXES:
                    raise ValueError('Forbidden delivery artifact: '+str(relative))
                paths.append(path)
    result = {}
    for path in paths:
        relative = path.relative_to(root).as_posix()
        checked_path(root, relative)
        result[relative] = sha(path)
    return dict(sorted(result.items()))


def bind(root: Path, sources: dict[str, str]) -> None:
    if not sources:
        raise ValueError('Empty source binding')
    for name, digest in sources.items():
        if sha(checked_path(root, name)) != digest:
            raise ValueError('Stale source binding: '+name)


def evidence(root: Path) -> dict:
    current = entries(root)
    flavor = 'personal' if read(root/'CURRENT_RELEASE.json').get('vpsDirectRevision') else 'public'
    output = {'flavor': flavor, 'scope': 'CURRENT_SOURCE_AND_LIMITED_WINDOWS_NATIVE_CANDIDATE',
              'deviceAcceptance': 'NOT_VERIFIED', 'independentReview': 'NOT_RUN', 'checks': {}}
    receipt_hashes = {}
    def receipt(name):
        path = checked_path(root, str(AUDIT/name))
        receipt_hashes[name] = sha(path)
        return read(path)
    for suite in ('build', 'regression', 'python', 'macos', 'platform'):
        row = receipt('suite-'+suite+'.json')
        if row['status'] != 'PASS' or row.get('entryBytesUnchanged') is not True:
            raise ValueError('Failed suite '+suite)
        if row['sources'] != current:
            raise ValueError('Suite entry set is stale: '+suite)
        if not row.get('results') or any(r.get('status') != 'PASS' or r.get('exitCode') != 0 for r in row['results']):
            raise ValueError('Failed command in '+suite)
        output['checks'][suite] = 'PASS'
    regression = receipt('regressions.json')
    if regression.get('passed') != 160 or regression.get('failed') != 0 or regression['status'] != 'PASS':
        raise ValueError('Architecture regression inventory differs')
    bind(root, regression['sources'])
    output['checks']['architectureRegression'] = regression['passed']
    if flavor == 'personal':
        row = receipt('static-complete.json')
        if row['status'] != 'PASS' or row['passed'] != 30 or row['failed'] != 0:
            raise ValueError('Incomplete personal static shards')
        bind(root, {'releases/v14.3/'+x['file']: x['sha256'] for x in row['sourceFiles']})
        output['checks']['completeStatic'] = row['passed']
    else:
        row = receipt('suite-static.json')
        if row['status'] != 'PASS' or row['sources'] != current or any(r.get('exitCode') != 0 for r in row['results']):
            raise ValueError('Public complete static suite failed')
        report = read(root/'releases/v14.3/validation/static.json')
        if report['status'] != 'BALANCED_STATIC_PASS' or len(report['checks']) != 27 or report['failures']:
            raise ValueError('Public full static assertion inventory differs')
        bind(root, {'releases/v14.3/'+x['file']: x['sha256'] for x in report['sourceFiles']})
        output['checks']['completeStatic'] = len(report['checks'])
    load = receipt('native-load-'+flavor+'.json')
    if load['passed'] != 24 or load['total'] != 24 or len(load['cases']) != 24:
        raise ValueError('Incomplete native config-load evidence')
    for case in load['cases']:
        if case['status'] != 'PASS' or case['exitCode'] != 0:
            raise ValueError('Native config load failed')
        bind(root, {case['source']: case['sourceSHA256']})
    native = receipt('native-replay-'+flavor+'.json')
    if native['status'] != 'PASS' or native['passed'] != 52 or native['failed'] != 0 or len(native['cases']) != 4:
        raise ValueError('Incomplete native replay evidence')
    if native['coreSHA256'] != load['coreSHA256'] or native.get('liveClientTouched') is not False:
        raise ValueError('Native core identity/scope differs')
    for case in native['cases']:
        bind(root, {case['source']: case['sourceSHA256']})
        if len(case['checks']) != 13 or any(x['status'] != 'PASS' for x in case['checks']) or not case['childExited']:
            raise ValueError('Native case incomplete')
    output['checks']['nativeLoad'] = 24
    output['checks']['nativeReplay'] = 52
    output['nativeDNSAffinityTransport'] = native['DNSAffinityTransport']
    output['coreSHA256'] = native['coreSHA256']
    provenance = read(root/'third_party/SOURCES.json')
    binding = {row['file']: row['sha256'] for row in provenance['licenses'] + provenance['sourceManifests']}
    bind(root, binding)
    output['thirdPartyProvenance'] = 'PASS'
    output['receipts'] = receipt_hashes
    return output


def verify(root: Path) -> dict:
    manifest = read(checked_path(root, str(MANIFEST)))
    if manifest.get('revision') != REVISION or manifest.get('status') != 'CURRENT_CANDIDATE_VERIFIED_DEVICE_PENDING':
        raise ValueError('Unexpected current acceptance schema')
    if manifest['entries'] != entries(root):
        raise ValueError('Changed import entries')
    actual = inventory(root)
    if manifest['files'] != actual:
        changed = sorted(set(actual) ^ set(manifest['files']))
        changed += [k for k in actual.keys() & manifest['files'].keys() if actual[k] != manifest['files'][k]]
        raise ValueError('Current candidate files changed: '+', '.join(changed[:8]))
    if manifest['evidence'] != evidence(root):
        raise ValueError('Evidence content/binding differs')
    return {'status': 'CURRENT_CANDIDATE_VERIFIED_DEVICE_PENDING', 'files': len(actual),
            'entries': len(manifest['entries']), 'flavor': manifest['evidence']['flavor'],
            'manifestSHA256': sha(root/MANIFEST), 'deviceAcceptance': 'NOT_VERIFIED'}
