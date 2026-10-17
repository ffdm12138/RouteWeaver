"""Package the additive IPv4-only delivery and its bounded source replay kit."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VARIANT = Path('releases/v14.3-ipv4-only')
DIST = ROOT / 'dist/v14.3-ipv4-only'
read = lambda name: json.loads((ROOT / name).read_text(encoding='utf-8-sig'))
sha = lambda data: hashlib.sha256(data).hexdigest()


def run(*args, cwd=ROOT):
    result = subprocess.run(list(args), cwd=cwd, check=True, capture_output=True, text=True, encoding='utf-8')
    return result.stdout.strip()


def archive(name, files):
    target = DIST / name
    payload = {key: value if isinstance(value, bytes) else (ROOT / value).read_bytes() for key, value in files.items()}
    payload['PACKAGE_FILES.json'] = (json.dumps({
        'files': [{'file': key, 'sha256': sha(value), 'bytes': len(value)} for key, value in sorted(payload.items())]
    }, indent=2) + '\n').encode()
    # Fixed timestamps and ordering make repeated builds byte-identical.
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for key, value in sorted(payload.items()):
            info = zipfile.ZipInfo(key, date_time=(2026, 10, 17, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, value)
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        for member in json.loads(z.read('PACKAGE_FILES.json'))['files']:
            assert sha(z.read(member['file'])) == member['sha256']
    digest = sha(target.read_bytes())
    target.with_suffix(target.suffix + '.sha256').write_text(digest + '  ' + name + '\n', encoding='utf-8')
    return {'file': target.relative_to(ROOT).as_posix(), 'sha256': digest, 'bytes': target.stat().st_size, 'members': len(payload)}


def main():
    run('node', 'tools/build-ipv4-only.cjs', '--check')
    manifest = read(VARIANT / 'MANIFEST.json')
    for name, status in [('static', 'IPV4_ONLY_STATIC_BUSINESS_PARITY_PASS'), ('native', 'IPV4_ONLY_LOCAL_CORE_TCP_UDP_DNS_PROVIDER_PASS')]:
        proof = read(VARIANT / f'validation/{name}.json')
        assert proof['status'] == status
        assert proof['manifestSHA256'] == sha((ROOT / VARIANT / 'MANIFEST.json').read_bytes()), name + ' is stale'
        assert proof['harnessSHA256'] == sha((ROOT / f'tools/{"test" if name == "static" else "native"}-ipv4-only.cjs').read_bytes())
    DIST.mkdir(parents=True, exist_ok=True)
    shared = {name: Path(name) for name in ['LICENSE', 'THIRD_PARTY_NOTICES.md']}
    for item in (ROOT / 'third_party').rglob('*'):
        if item.is_file():
            relative = item.relative_to(ROOT)
            shared[relative.as_posix()] = relative
    inventory = read('third_party/SOURCES.json')
    for record in inventory['licenses'] + inventory['sourceManifests']:
        file = Path(record['file'])
        assert sha((ROOT / file).read_bytes()) == record['sha256'], str(file)
        shared[file.as_posix()] = file
    deploy = {**shared, 'README.md': VARIANT / 'README.md', 'CONTRACT.md': VARIANT / 'CONTRACT.md', 'MANIFEST.json': VARIANT / 'MANIFEST.json'}
    for entry in manifest['entries'].values():
        relative = Path(entry['file']).relative_to(VARIANT)
        deploy[relative.as_posix()] = Path(entry['file'])
    for name in ['static', 'native']:
        deploy[f'validation/{name}.json'] = VARIANT / f'validation/{name}.json'
    flavor = manifest['flavor']
    packages = [archive(f'RouteWeaver-v14.3-ipv4-only-{flavor}.zip', deploy)]
    tools = ['build-ipv4-only.cjs', 'ipv4-only-runtime.js', 'test-ipv4-only.cjs', 'native-ipv4-only.cjs', 'package-ipv4-only.py']
    source = {**shared, 'CURRENT_RELEASE.json': Path('CURRENT_RELEASE.json')}
    report_file = Path('docs/reports/v14.3/纯IPv4独立版本.md')
    source[report_file.as_posix()] = report_file
    for name in tools:
        source['tools/' + name] = Path('tools') / name
    for item in (ROOT / VARIANT).rglob('*'):
        if item.is_file() and ('validation' not in item.parts or item.name in ['static.json', 'native.json']):
            relative = item.relative_to(ROOT)
            source[relative.as_posix()] = relative
    for entry in manifest['entries'].values():
        source[entry['source']] = Path(entry['source'])
    source['README.md'] = (ROOT / VARIANT / 'README.md').read_text(encoding='utf-8').replace('(src/', '(' + VARIANT.as_posix() + '/src/').encode('utf-8')
    packages.append(archive(f'RouteWeaver-v14.3-ipv4-only-{flavor}-source.zip', source))
    work = ROOT / '.work/ipv4-only'
    work.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='package-replay-', dir=work) as directory:
        with zipfile.ZipFile(ROOT / packages[1]['file']) as z:
            z.extractall(directory)
        run('node', 'tools/build-ipv4-only.cjs', '--check', cwd=directory)
        run('node', 'tools/test-ipv4-only.cjs', cwd=directory)
    proof = {'status': 'IPV4_ONLY_PACKAGE_CRC_SHA_FRESH_SOURCE_REPLAY_PASS', 'flavor': flavor,
             'manifestSHA256': sha((ROOT / VARIANT / 'MANIFEST.json').read_bytes()),
             'packageToolSHA256': sha(Path(__file__).read_bytes()), 'packages': packages,
             'freshNativeReplay': 'NOT_RUN_FROM_ZIP', 'sourceBoundNativeReplay': 'PASS',
             'deviceAcceptance': 'NOT_RUN', 'clientDeployment': False}
    (DIST / 'package-verification.json').write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(proof))


if __name__ == '__main__':
    main()
