"""Build the failover candidate for the pinned FlClash 0.9.3 Windows release."""
import argparse
import os
from pathlib import Path
import runpy
import shutil
import sys
import tempfile
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
COMMON = runpy.run_path(str(ROOT / 'tools/build-proxy-failover.py'))
NATIVE = COMMON['NATIVE']
APP = 'be84736605527034689c95bf27828ff27d912c5e'
FORK = '024245dc72bc92f48237f865119afe0cd53ac9e6'
APP_SHA = '669bc1838f0fb062ebeebe969c663e766c25c78873b7df5bf460f8ad02a2bfd1'
FORK_SHA = 'e262db462ac33346118354c168be252c5cb31390208ec1858881439babe33dc4'
VERSION = 'v1.19.33-rw-failover-flclash093-r1'
SUFFIX = '-flclash-0.9.3'
CONTROLLED_PATCH = NATIVE / 'core-failover-flclash093.patch'
GUIDE = NATIVE / 'FlClash-0.9.3.md'


def extract(bundle, prefix, dest, *, exclude=()):
    for entry in bundle.infolist():
        if entry.is_dir() or not entry.filename.startswith(prefix):
            continue
        name = entry.filename[len(prefix):]
        if not name or any(name.startswith(part) for part in exclude):
            continue
        path = (dest / name).resolve()
        if not path.is_relative_to(dest.resolve()) or (entry.external_attr >> 16) & 0o170000 == 0o120000:
            raise ValueError(f'Unsafe source member {entry.filename}')
        path.parent.mkdir(parents=True, exist_ok=True)
        with bundle.open(entry) as stream, path.open('wb') as output:
            shutil.copyfileobj(stream, output)


def prepare(inputs, work, go):
    verify, run, sha = (COMMON[key] for key in ('verify', 'run', 'sha'))
    app_zip, fork_zip = inputs / 'flclash.zip', inputs / 'clash-meta.zip'
    verify(app_zip, APP_SHA)
    verify(fork_zip, FORK_SHA)
    source = work / 'source'
    core, helper = source / 'core', source / 'helper'
    mihomo = core / 'Clash.Meta'
    prefix = 'FlClash-' + APP + '/'
    with ZipFile(app_zip) as app:
        extract(app, prefix + 'core/', core, exclude=('Clash.Meta/',))
        extract(app, prefix + 'services/helper/', helper)
        (source / 'LICENSE').write_bytes(app.read(prefix + 'LICENSE'))
    with ZipFile(fork_zip) as fork:
        extract(fork, 'Clash.Meta-' + FORK + '/', mihomo)

    # The 0.9.3 Helper keeps the previous lock. Reuse only its verified vendor tree.
    base = ROOT / 'dist/v14.3/v14.3-flclash-corresponding-source.zip'
    verify(base, COMMON['BASE_SHA256'])
    with ZipFile(base) as prior:
        if prior.read('helper/Cargo.lock') != (helper / 'Cargo.lock').read_bytes():
            raise ValueError('Helper lock differs from the pinned vendor baseline')
        extract(prior, 'helper/vendor/', helper / 'vendor')
        (source / 'rust-toolchain.json').write_bytes(prior.read('rust-toolchain.json'))

    patch = NATIVE / 'core-failover.patch'
    # This upstream fork adds a zero-delay clamp beside one hunk.
    run(['git', 'apply', '--check', '-C1', patch], mihomo, timeout=30)
    run(['git', 'apply', '-C1', patch], mihomo, timeout=30)
    changed = [Path(line[6:]) for line in patch.read_text(encoding='utf-8').splitlines()
               if line.startswith('+++ b/')]
    for part in ('config', 'tunnel'):
        for original in sorted((NATIVE / 'native' / part).glob('*.go')):
            rel = Path(part) / original.name
            shutil.copyfile(original, mihomo / rel)
            changed.append(rel)
    run([go.with_name('gofmt.exe'), '-w', *(mihomo / rel for rel in changed)], mihomo, timeout=30)
    lock_paths = [base / name for base in (core, mihomo) for name in ('go.mod', 'go.sum')]
    locks = {path: sha(path) for path in lock_paths}
    env = os.environ | {
        'GOTOOLCHAIN': 'local', 'GOWORK': 'off', 'GOTELEMETRY': 'off', 'GOENV': 'off',
        'GOMAXPROCS': '2', 'GOPROXY': 'https://proxy.golang.org', 'GOSUMDB': 'off',
        'GOPATH': str(work / 'gopath'), 'GOCACHE': str(work / 'gocache'), 'GOFLAGS': '',
    }
    run([go, 'mod', 'vendor'], core, env, timeout=300)
    if any(sha(path) != digest for path, digest in locks.items()):
        raise ValueError('Go vendoring changed a pinned module file')
    vendor = core / 'vendor/github.com/metacubex/mihomo'
    for rel in changed:
        if rel.name.endswith('_test.go'):
            shutil.copyfile(mihomo / rel, vendor / rel)
        elif sha(mihomo / rel) != sha(vendor / rel):
            raise ValueError('Vendored patch differs: ' + str(rel))
    shutil.copyfile(patch, source / patch.name)
    COMMON['write_json'](source / 'source-identity.json', {
        'flclashVersion': '0.9.3+2026110401', 'flclashCommit': APP, 'mihomoForkCommit': FORK,
        'flclashSourceZipSha256': APP_SHA, 'mihomoForkSourceZipSha256': FORK_SHA,
        'priorSourceArchiveUse': 'identical Cargo.lock and Helper vendor only',
        'goModuleSHA256': {path.relative_to(source).as_posix(): digest for path, digest in locks.items()},
    })
    return source, changed


def apply_controlled(source, go):
    run, sha = COMMON['run'], COMMON['sha']
    run(['git', 'apply', '--check', CONTROLLED_PATCH], source, timeout=30)
    run(['git', 'apply', CONTROLLED_PATCH], source, timeout=30)
    paths = [Path(line[6:]) for line in CONTROLLED_PATCH.read_text(encoding='utf-8').splitlines()
             if line.startswith('+++ b/')]
    run([go.with_name('gofmt.exe'), '-w', *(source / path for path in paths)], source, timeout=30)
    mihomo = Path('core/Clash.Meta')
    vendor = source / 'core/vendor/github.com/metacubex/mihomo'
    changed = [path.relative_to(mihomo) for path in paths if path.is_relative_to(mihomo)]
    for rel in changed:
        # Upstream dependency tests are omitted from Go's vendor tree.
        if not rel.name.endswith('_test.go') or (vendor / rel).is_file():
            shutil.copyfile(source / mihomo / rel, vendor / rel)
    shutil.copyfile(CONTROLLED_PATCH, source / CONTROLLED_PATCH.name)
    identity = source / 'source-identity.json'
    COMMON['write_json'](identity, COMMON['read_json'](identity) | {
        'controlledPatchSHA256': sha(CONTROLLED_PATCH),
        'flclashCoreConfigSHA256': sha(source / 'core/config.go'),
    })
    return changed


def package_candidate(source, binaries, changed, output, receipt):
    proof = COMMON['read_json'](receipt)
    identity = COMMON['read_json'](source / 'source-identity.json')
    for key in ('flclashVersion', 'flclashCommit', 'mihomoForkCommit', 'controlledPatchSHA256',
                'flclashCoreConfigSHA256'):
        proof[key] = identity[key]
    COMMON['package'](source, binaries, sorted(set(changed)), output, proof, version=VERSION, suffix=SUFFIX,
                      guide=GUIDE)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, required=True, help='Pinned source and toolchain archives')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='rwf093-build-') as temporary:
        work = Path(temporary)
        go, rust = COMMON['prepare_tools'](args.inputs.resolve(), work)
        source, changed = prepare(args.inputs.resolve(), work, go)
        changed += apply_controlled(source, go)
        binaries = COMMON['build'](source, go, rust, work, NATIVE / 'native/replay/main.go',
                                  version=VERSION, app_tests=True)
        receipt = work / 'replay.json'
        COMMON['run']([sys.executable, '-B', ROOT / 'tools/test-proxy-failover.py',
                       work / 'replay.exe', receipt, '--controlled'], ROOT, timeout=720)
        package_candidate(source, binaries, changed, output, receipt)
    print('MATCHED_FLCLASH_0.9.3_AND_REPLAY_PASS', flush=True)


if __name__ == '__main__':
    main()
