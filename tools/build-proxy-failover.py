"""Rebuild and verify the matched Windows FlClash candidate in system temp."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile


HERE = Path(__file__).resolve().parent
PACKAGED_SOURCE = (HERE / 'go-toolchain.json').is_file()
ROOT = HERE if PACKAGED_SOURCE else HERE.parent
RESEARCH = ROOT / 'releases/v14.3/research'
NATIVE = HERE if PACKAGED_SOURCE else RESEARCH / 'proxy-failover'
BASE_SHA256 = '5bfcc200f69e8c0cc9ac62cc3f8a1db5f582363ec7be997152c6d4c8131d756b'
VERSION = 'v1.19.32-rw-failover-r1'
TARGET = 'x86_64-pc-windows-gnu'
WINDOWLESS = getattr(subprocess, 'CREATE_NO_WINDOW', 0)


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read_json(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def write_json(file, value):
    file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def verify(file, expected):
    if sha(file) != expected:
        raise ValueError(f'SHA-256 mismatch for {file.name}')


def unzip(file, dest):
    with zipfile.ZipFile(file) as bundle:
        for entry in bundle.infolist():
            path = Path(entry.filename)
            if path.is_absolute() or '..' in path.parts or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError(f'Unsafe archive member {entry.filename}')
        bundle.extractall(dest)


def prepare_tools(archives, work):
    if (NATIVE / 'go-toolchain.json').is_file():
        locked = read_json(NATIVE / 'go-toolchain.json')['toolchainSource']
        rust_manifest = NATIVE / 'rust-toolchain.json'
    else:
        locked = read_json(RESEARCH / 'ipv6-direct-fast-fail/proof.json')['toolchainSource']
        rust_manifest = RESEARCH / 'flclash-core-integration/rust-toolchain.json'
    go_zip = archives / locked['toolchainSource'].rsplit('/', 1)[1]
    verify(go_zip, locked['toolchainSHA256'])
    unzip(go_zip, work)
    rust = work / 'rust'
    for package in read_json(rust_manifest)['packages']:
        archive = archives / package['url'].rsplit('/', 1)[1]
        verify(archive, package['sha256'])
        component = package['package']
        if component == 'rust-std':
            component += '-' + TARGET
        with tarfile.open(archive, 'r:xz') as bundle:
            for entry in bundle:
                parts = entry.name.split('/')
                if len(parts) < 4 or parts[1] != component or parts[2] not in ('bin', 'lib') or not entry.isfile():
                    continue
                destination = rust.joinpath(*parts[2:])
                if not destination.resolve().is_relative_to(rust.resolve()):
                    raise ValueError('Rust component path escapes temporary root')
                destination.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(entry) as source, destination.open('wb') as target:
                    shutil.copyfileobj(source, target)
    return work / 'go/bin/go.exe', rust


def run(command, cwd, env=None, timeout=900):
    print('Running', ' '.join(str(arg) for arg in command[:5]), flush=True)
    result = subprocess.run([str(arg) for arg in command], cwd=cwd, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=timeout, creationflags=WINDOWLESS)
    if result.stdout:
        print(result.stdout.decode('utf-8', errors='replace'), end='', flush=True)
    result.check_returncode()


def prepare_source(base, work, go):
    verify(base, BASE_SHA256)
    source = work / 'source'
    unzip(base, source)
    patch = NATIVE / 'core-failover.patch'
    mihomo = source / 'core/Clash.Meta'
    run(['git', 'apply', '--check', patch], mihomo, timeout=30)
    run(['git', 'apply', patch], mihomo, timeout=30)
    changed = [Path(line[6:]) for line in patch.read_text(encoding='utf-8').splitlines()
               if line.startswith('+++ b/')]
    for part in ('config', 'tunnel'):
        for original in (NATIVE / 'native' / part).glob('*.go'):
            file = Path(part) / original.name
            shutil.copyfile(original, mihomo / file)
            changed.append(file)
    run([go.with_name('gofmt.exe'), '-w', *(mihomo / file for file in changed)], mihomo, timeout=30)
    vendor = source / 'core/vendor/github.com/metacubex/mihomo'
    for file in changed:
        shutil.copyfile(mihomo / file, vendor / file)
    shutil.copyfile(patch, source / patch.name)
    return source, changed


def build(source, go, rust, work, replay_source, *, version=VERSION, replay_output=None, app_tests=False):
    if not re.fullmatch(r'[A-Za-z0-9._-]+', version):
        raise ValueError('Invalid core version')
    env = os.environ | {
        'GOTOOLCHAIN': 'local', 'GOWORK': 'off', 'GOTELEMETRY': 'off', 'GOENV': 'off',
        'CGO_ENABLED': '0', 'GOMAXPROCS': '2', 'GOFLAGS': '-mod=vendor', 'GOPROXY': 'off',
        'GOSUMDB': 'off', 'GOCACHE': str(work / 'gocache'), 'GOPATH': str(work / 'gopath'),
        'GOOS': 'windows', 'GOARCH': 'amd64',
    }
    core = source / 'core'
    bin_dir = work / 'bin'
    bin_dir.mkdir(exist_ok=True)
    binary = bin_dir / 'FlClashCore.exe'
    flags = ['-p', '2', '-tags', 'with_gvisor', '-trimpath', '-ldflags',
             f'-X github.com/metacubex/mihomo/constant.Version={version} -w -s -buildid=']
    run([go, 'version'], core, env, timeout=30)
    run([go, 'build', *flags, '-o', binary, './cmd/core'], core, env)
    if replay_source:
        test_packages = ['github.com/metacubex/mihomo/config', 'github.com/metacubex/mihomo/tunnel']
        if app_tests:
            test_packages.append('.')
        run([go, 'test', '-p', '2', '-tags', 'with_gvisor', '-trimpath', '-count=1', '-timeout=120s',
             '-run', '^TestRouteWeaverFailover', *test_packages], core, env)
        run([go, 'build', *flags, '-o', replay_output or work / 'replay.exe', replay_source], core, env)

    core_hash = sha(binary)
    rust_bin = rust / 'bin'
    target_dir = work / 'target'
    env = os.environ | {
        'CORE_SHA256': core_hash, 'CORE_NAME': binary.name, 'CARGO_BUILD_JOBS': '2',
        'CARGO_HOME': str(work / 'cargo'), 'CARGO_TARGET_DIR': str(target_dir),
        'RUSTC': str(rust_bin / 'rustc.exe'), 'RUSTDOC': str(rust_bin / 'rustdoc.exe'),
        'PATH': str(rust_bin) + os.pathsep + os.environ['PATH'],
    }
    cargo = rust_bin / 'cargo.exe'
    run([cargo, '--version'], source / 'helper', env, timeout=30)
    run([cargo, 'build', '--locked', '--offline', '--release', '--features', 'windows-service',
         '--target', TARGET, '--config', 'source.crates-io.replace-with="vendored-sources"',
         '--config', 'source.vendored-sources.directory="vendor"'], source / 'helper', env)
    helper = bin_dir / 'FlClashHelperService.exe'
    shutil.copyfile(target_dir / TARGET / 'release/helper.exe', helper)
    if core_hash.encode() not in helper.read_bytes():
        raise ValueError('Helper did not embed the candidate core SHA-256')
    write_json(bin_dir / 'manifest.json', {'coreSha256': core_hash})
    return bin_dir


def archive(destination, members):
    hashes = {}
    with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=5) as bundle:
        for name, file in sorted(members.items()):
            info = zipfile.ZipInfo(name, (2026, 11, 6, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            with file.open('rb') as stream, bundle.open(info, 'w') as target:
                shutil.copyfileobj(stream, target)
            hashes[name] = sha(file)
        bundle.writestr(zipfile.ZipInfo('PACKAGE_MANIFEST.json', (2026, 11, 6, 0, 0, 0)),
                        json.dumps(hashes, indent=2) + '\n')
    with zipfile.ZipFile(destination) as bundle:
        if bundle.testzip() is not None or any(
            hashlib.sha256(bundle.read(name)).hexdigest() != digest for name, digest in hashes.items()
        ):
            raise ValueError('Archive verification failed')
    digest = sha(destination)
    destination.with_suffix('.zip.sha256').write_text(f'{digest}  {destination.name}\n', encoding='ascii')
    return {'name': destination.name, 'sha256': digest, 'members': len(hashes)}


def package(source, binaries, changed, output, proof, *, version=VERSION, suffix='', guide=None):
    prior = read_json(source / 'source-identity.json')
    for name in ('install-flclash-core.ps1', 'rebuild.py', 'candidate-binaries.json'):
        (source / name).unlink(missing_ok=True)
    shutil.copyfile(guide or NATIVE / 'README.md', source / 'FAILOVER.md')
    shutil.copyfile(Path(__file__), source / 'rebuild-failover.py')
    shutil.copyfile(RESEARCH / 'ipv6-direct-fast-fail/proof.json', source / 'go-toolchain.json')
    write_json(source / 'source-identity.json', {
        **prior,
        'revision': version, 'baseSourceSHA256': BASE_SHA256,
        'flclashCommit': prior['flclashCommit'], 'mihomoForkCommit': prior['mihomoForkCommit'],
        'coreSHA256': sha(binaries / 'FlClashCore.exe'),
        'helperSHA256': sha(binaries / 'FlClashHelperService.exe'),
        'patchSHA256': sha(NATIVE / 'core-failover.patch'),
    })
    manifest = source / 'source-files.json'
    members = {p.relative_to(source).as_posix(): p for p in source.rglob('*')
               if p.is_file() and p.name not in ('source-files.json', 'PACKAGE_MANIFEST.json')}
    write_json(manifest, {'files': [{'file': name, 'sha256': sha(file)}
                                    for name, file in sorted(members.items())]})
    members['source-files.json'] = manifest
    prefix = 'v14.3-proxy-failover' + suffix
    reports = [
        archive(output / f'{prefix}-corresponding-source.zip', members),
        archive(output / f'{prefix}-windows-core.zip', {
            **{'bin/' + file.name: file for file in binaries.iterdir()},
            'FAILOVER.md': source / 'FAILOVER.md',
            'LICENSE': source / 'LICENSE',
            'source-identity.json': source / 'source-identity.json',
            **{'dependency-notices/' + name: file for name, file in members.items()
               if '/vendor/' in name and file.name.upper().startswith(('LICENSE', 'COPYING', 'NOTICE', 'COPYRIGHT', 'AUTHORS'))},
        }),
    ]
    public = ROOT / 'opensource/RouteWeaver'
    roots = [ROOT, public] if public.is_dir() else [ROOT]
    for root in roots:
        release = read_json(root / 'CURRENT_RELEASE.json')
        flavor = 'personal' if release.get('vpsDirectRevision') else 'public'
        main = release['entries']['windows']
        ipv4 = release['variants']['ipv4-only']['entries']['windows']
        reports.append(archive(output / f'{prefix}-{flavor}-overwrites.zip', {
            Path(main).name: root / main, Path(ipv4).name: root / ipv4,
            'FAILOVER.md': source / 'FAILOVER.md', 'LICENSE': root / 'LICENSE',
        }))
    proof.update({
        'revision': version, 'sourceBaseSHA256': BASE_SHA256,
        'nativeFiles': {file.as_posix(): sha(source / 'core/Clash.Meta' / file) for file in changed},
        'integrationPatchSHA256': sha(NATIVE / 'core-failover.patch'),
        'binaries': {file.name: sha(file) for file in binaries.iterdir()}, 'packages': reports,
        'deviceAcceptance': 'NOT_RUN', 'clientDeployment': False,
    })
    write_json(output / f'proxy-failover{suffix}-verification.json', proof)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, default=ROOT / 'dist/v14.3/v14.3-flclash-corresponding-source.zip')
    parser.add_argument('--toolchains', type=Path, required=True, help='Directory containing the locked Go and Rust archives')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--source', type=Path, default=NATIVE if (NATIVE / 'source-files.json').is_file() else None,
                        help='Extracted complete failover source package for a binary rebuild')
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='rwf-') as temporary:
        work = Path(temporary)
        go, rust = prepare_tools(args.toolchains.resolve(), work)
        if args.source:
            source = args.source.resolve()
            for member in read_json(source / 'source-files.json')['files']:
                verify(source / member['file'], member['sha256'])
            version = read_json(source / 'source-identity.json').get('revision', VERSION)
            binaries = build(source, go, rust, work, None, version=version)
            for file in binaries.iterdir():
                shutil.copyfile(file, output / file.name)
            return
        source, changed = prepare_source(args.base.resolve(), work, go)
        binaries = build(source, go, rust, work, NATIVE / 'native/replay/main.go')
        receipt = work / 'replay.json'
        run([sys.executable, '-B', ROOT / 'tools/test-proxy-failover.py', work / 'replay.exe', receipt],
            ROOT, timeout=360)
        package(source, binaries, changed, output, read_json(receipt))
    print('MATCHED_CORE_AND_REPLAY_PASS', flush=True)


if __name__ == '__main__':
    main()
