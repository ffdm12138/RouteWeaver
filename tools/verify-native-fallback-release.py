"""Verify the native fallback entries and prepare or verify either release track."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile

from current_audit import checked_path, read, sha


ROOT = Path(__file__).resolve().parents[1]
SUMS = 'SHA256SUMS.txt'


def verify_source(root):
    release = read(root / 'CURRENT_RELEASE.json')
    candidate = release['nativeFallback']
    receipt = read(checked_path(root, candidate['verification']))
    edition = 'personal' if release.get('vpsDirectRevision') else 'public'
    if (receipt['revision'] != candidate['revision'] or receipt['edition'] != edition
            or receipt['status'] != 'PASS_ISOLATED_STOCK_CORE'):
        raise ValueError('Missing or incompatible native fallback evidence')

    tracks = {'main': release['entries'], 'ipv4-only': release['variants']['ipv4-only']['entries']}
    tags = candidate['releaseTags']
    if set(tags) != set(tracks) or len(set(tags.values())) != 2:
        raise ValueError('Expected two distinct track tags')
    assets = {}
    for track, entries in tracks.items():
        proofs = receipt['tracks'][track]
        if len(entries) != 7 or set(entries) != set(proofs):
            raise ValueError('Expected seven bound entries per track')
        files = {}
        for client, file in entries.items():
            path = checked_path(root, file)
            proof = proofs[client]
            if proof['file'] != file or sha(path) != proof['sourceSHA256']:
                raise ValueError('Stale entry evidence: ' + file)
            if path.suffix == '.js' and proof['coreChecks'] != len(receipt['checks']):
                raise ValueError('Incomplete core replay: ' + file)
            files[path.name] = (path, proof['sourceSHA256'])
        if len(files) != 7:
            raise ValueError('Duplicate asset basename')
        assets[tags[track]] = files
    if not receipt['checks']:
        raise ValueError('Empty core replay inventory')
    return assets


def verify_static():
    # The existing routing suites write receipts. Replay the index in a
    # temporary directory so the older tracked receipts keep their bytes.
    with tempfile.TemporaryDirectory(prefix='routeweaver-release-') as temp:
        snapshot = Path(temp)
        subprocess.run(['git', 'checkout-index', '--all', '--prefix=' + snapshot.as_posix() + '/'],
                       cwd=ROOT, check=True, timeout=60)
        verify_source(snapshot)
        suites = runpy.run_path(str(snapshot / 'tools/run-architecture-audit.py'))['SUITES']
        commands = [*suites['build'], ['node', 'tools/test-native-fallback.cjs'],
                    *suites['regression'], *suites['platform']]
        for command in commands:
            subprocess.run(command, cwd=snapshot, check=True, timeout=90)
        with ThreadPoolExecutor(max_workers=2) as pool:
            runs = [pool.submit(subprocess.run, command, cwd=snapshot, check=True, timeout=480)
                    for command in suites['static'] + suites['macos']]
            for run in runs:
                run.result()


def sums(files):
    return ''.join(f'{digest}  {name}\n' for name, (_, digest) in sorted(files.items())).encode('ascii')


def verify_assets(directory, files):
    if {path.name for path in directory.iterdir()} != set(files) | {SUMS}:
        raise ValueError('Release assets differ from the track inventory')
    if checked_path(directory, SUMS).read_bytes() != sums(files):
        raise ValueError('SHA256SUMS differs from the track inventory')
    for name, (_, digest) in files.items():
        if sha(checked_path(directory, name)) != digest:
            raise ValueError('Release asset differs: ' + name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--static', action='store_true')
    parser.add_argument('--tag')
    action = parser.add_mutually_exclusive_group()
    action.add_argument('--assets', type=Path)
    action.add_argument('--stage', type=Path)
    args = parser.parse_args()
    inventory = verify_source(ROOT)
    directory = args.assets or args.stage
    if directory and args.tag not in inventory:
        parser.error('Specify the release tag for the requested asset directory')
    if args.static:
        verify_static()
    if directory:
        files = inventory[args.tag]
        directory = directory.resolve()
        if args.stage:
            directory.mkdir(parents=True, exist_ok=True)
            if any(path.is_symlink() or path.name not in set(files) | {SUMS} for path in directory.iterdir()):
                raise ValueError('Staging directory contains unrelated or linked files')
            for name, (source, _) in files.items():
                shutil.copyfile(source, directory / name)
            (directory / SUMS).write_bytes(sums(files))
        verify_assets(directory, files)
    print(json.dumps({'tag': args.tag, 'source': 'PASS', 'static': 'PASS' if args.static else 'NOT_RUN',
                      'assets': len(inventory[args.tag]) + 1 if directory else 'NOT_RUN',
                      'deviceAcceptance': 'NOT_RUN'}))


if __name__ == '__main__':
    main()
