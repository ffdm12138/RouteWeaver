"""Verify the public three-tier candidate and its optional Release downloads."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import subprocess
import tempfile
from zipfile import ZipFile

from current_audit import bind, entries, read, sha


ROOT = Path(__file__).resolve().parents[1]
TAG = 'v14.3.0-rc.10'
MANIFEST = f'harness/releases/{TAG}.json'
PREFIX = 'v14.3-proxy-failover-flclash-0.9.3'
CORE = PREFIX + '-windows-core.zip'
SOURCE = PREFIX + '-corresponding-source.zip'
OVERWRITES = PREFIX + '-public-overwrites.zip'
RECEIPT = 'proxy-failover-flclash-0.9.3-verification.json'
SUMS = 'SHA256SUMS.txt'
PATCH = 'releases/v14.3/research/proxy-failover/core-failover-flclash093.patch'


def verify_source(root):
    release = read(root / 'CURRENT_RELEASE.json')
    manifest = read(root / MANIFEST)
    candidate = release['proxyFailover']
    proof = read(root / candidate['verification'])
    if release.get('vpsDirectRevision') or manifest['tag'] != TAG or candidate['publicReleaseTag'] != TAG:
        raise ValueError('Expected the public rc.10 candidate')
    bind(root, manifest['sources'])
    imports = entries(root)
    if imports != manifest['imports']:
        raise ValueError('Import inventory has drifted')
    windows = {release['entries']['windows'], release['variants']['ipv4-only']['entries']['windows']}
    loads = proof['nativeLoads']
    cases = proof['nativeCases']
    if (proof['status'] != 'PASS' or proof['deviceAcceptance'] != 'NOT_RUN'
            or proof['revision'] != candidate['coreVersion']
            or proof['binaries']['FlClashCore.exe'] != candidate['coreSHA256']
            or proof['controlledPatchSHA256'] != sha(root / PATCH)
            or proof['replayHarnessSHA256'] != sha(root / 'tools/test-proxy-failover.py')
            or proof['nativeLoadCount'] != len(loads) or len(loads) != 4
            or {row['mode'] for row in loads} != {'auto', 'dual-stack', 'ipv4-local', 'ipv4-only'}
            or len(cases) != 2 or {row['mode'] for row in cases} != {'dual-stack', 'ipv4-only'}
            or any(len(row['checks']) != 8 or not row['childExited'] for row in cases)
            or any(row['edition'] != 'public' or row['source'] not in windows
                   or row['sourceSHA256'] != imports[row['source']] for row in loads + cases)):
        raise ValueError('Isolated Windows evidence is missing, stale or outside the public scope')

    archives = {row['name']: row['sha256'] for row in proof['packages']}
    if set(archives) != {CORE, SOURCE, OVERWRITES}:
        raise ValueError('Unexpected candidate archive set')
    assets = manifest['assets']
    import_assets = {Path(name).name: digest for name, digest in imports.items()}
    if (set(assets) != set(import_assets) | set(archives) | {name + '.sha256' for name in archives} | {RECEIPT, SUMS}
            or any(assets[name]['sha256'] != digest for name, digest in (import_assets | archives).items())
            or assets[RECEIPT]['sha256'] != sha(root / candidate['verification'])):
        raise ValueError('Release assets do not match the import and native evidence inventories')
    return assets, proof, windows


def zip_members(bundle):
    hashes = json.loads(bundle.read('PACKAGE_MANIFEST.json'))
    members = bundle.infolist()
    if (len(members) != len(hashes) + 1
            or set(bundle.namelist()) != set(hashes) | {'PACKAGE_MANIFEST.json'}):
        raise ValueError('Duplicate or unlisted ZIP member')
    for member in members:
        name = member.filename
        mode = (member.external_attr >> 16) & 0o170000
        if (PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts
                or '\\' in name or ':' in name or member.is_dir() or mode not in (0, stat.S_IFREG)):
            raise ValueError(f'Unsafe ZIP member {name}')
        if name in hashes:
            with bundle.open(member) as stream:
                if hashlib.file_digest(stream, 'sha256').hexdigest() != hashes[name]:
                    raise ValueError(f'ZIP member hash differs: {name}')
    return hashes


def verify_assets(directory, assets, proof, windows):
    if {path.name for path in directory.iterdir()} != set(assets):
        raise ValueError('Release download directory does not match the asset inventory')
    for name, expected in assets.items():
        path = directory / name
        if path.is_symlink() or path.stat().st_size != expected['bytes'] or sha(path) != expected['sha256']:
            raise ValueError(f'Asset size or hash differs: {name}')
    sums = ''.join(f"{asset['sha256']}  {name}\n" for name, asset in sorted(assets.items()) if name != SUMS)
    if (directory / SUMS).read_text(encoding='ascii') != sums:
        raise ValueError('SHA256SUMS differs from the bound asset list')
    for name in (CORE, SOURCE, OVERWRITES):
        sidecar = (directory / (name + '.sha256')).read_text(encoding='ascii').strip()
        if sidecar != f"{assets[name]['sha256']}  {name}":
            raise ValueError(f'Sidecar differs: {name}')
    binaries = proof['binaries']
    core_hash = binaries['FlClashCore.exe']
    with ZipFile(directory / CORE) as bundle:
        hashes = zip_members(bundle)
        if ({name[4:]: digest for name, digest in hashes.items() if name.startswith('bin/')} != binaries
                or json.loads(bundle.read('bin/manifest.json')) != {'coreSha256': core_hash}
                or core_hash.encode() not in bundle.read('bin/FlClashHelperService.exe')):
            raise ValueError('Core, Helper and manifest are not a matched set')
        identity = bundle.read('source-identity.json')
    with ZipFile(directory / SOURCE) as bundle:
        hashes = zip_members(bundle)
        if (bundle.read('source-identity.json') != identity
                or hashes[Path(PATCH).name] != proof['controlledPatchSHA256']
                or hashes['core/config.go'] != proof['flclashCoreConfigSHA256']
                or any(hashes['core/Clash.Meta/' + name] != digest for name, digest in proof['nativeFiles'].items())):
            raise ValueError('Corresponding source differs from the built candidate')
    with ZipFile(directory / OVERWRITES) as bundle:
        hashes = zip_members(bundle)
        if {name: digest for name, digest in hashes.items() if name.endswith('.js')} != {
            Path(name).name: sha(ROOT / name) for name in windows
        }:
            raise ValueError('Windows overwrite ZIP differs from the public import entries')


def verify_static():
    # Legacy tests emit receipts beside their inputs. Run them on an exact copy
    # of the indexed source so the historical receipts in Git remain intact.
    with tempfile.TemporaryDirectory(prefix='routeweaver-rc10-') as temp:
        snapshot = Path(temp)
        subprocess.run(['git', 'checkout-index', '--all', '--prefix=' + snapshot.as_posix() + '/'],
                       cwd=ROOT, check=True, timeout=60)
        verify_source(snapshot)
        commands = [
            ['releases/v14.3/tools/build-all.cjs', '--check'],
            ['tools/build-ipv4-only.cjs', '--check'],
            ['tools/test-proxy-failover.cjs'],
            ['tools/test-architecture.cjs'],
            ['tools/test-ipv4-only.cjs'],
        ]
        commands += [[f'releases/v14.3/tests/{name}.cjs'] for name in ('clash-verge', 'network-compat')]
        for command in commands:
            subprocess.run(['node', *command], cwd=snapshot, check=True, timeout=90)
        # These inventory sweeps read the same inputs and write separate receipts.
        with ThreadPoolExecutor(max_workers=2) as pool:
            runs = [pool.submit(subprocess.run, ['node', f'releases/v14.3/tests/{name}.cjs'],
                                cwd=snapshot, check=True, timeout=480)
                    for name in ('static', 'macos-static', 'shadowrocket-lean')]
            for run in runs:
                run.result()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--static', action='store_true', help='Run source and static checks from a fresh index extraction')
    parser.add_argument('--assets', type=Path, help='Verify all exact Release assets in this directory')
    args = parser.parse_args()
    assets, proof, windows = verify_source(ROOT)
    if args.static:
        verify_static()
    if args.assets:
        verify_assets(args.assets.resolve(), assets, proof, windows)
    print(json.dumps({'tag': TAG, 'source': 'PASS', 'static': 'PASS' if args.static else 'NOT_RUN',
                      'assets': len(assets) if args.assets else 'NOT_RUN', 'deviceAcceptance': 'NOT_RUN'}))


if __name__ == '__main__':
    main()
