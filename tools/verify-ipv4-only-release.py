"""Verify only the additive IPv4 release; preserve stored engine/native receipts."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
VARIANT = ROOT / 'releases/v14.3-ipv4-only'
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
read = lambda file: json.loads(file.read_text(encoding='utf-8-sig'))


def run(*command):
    subprocess.run(command, cwd=ROOT, check=True)


def main():
    manifest_file = VARIANT / 'MANIFEST.json'
    manifest = read(manifest_file)
    assert manifest['flavor'] == 'public'
    assert manifest['clientDeployment'] is False
    assert manifest['deviceAcceptance'] == 'NOT_RUN'
    for item in manifest['inputs']:
        assert sha(ROOT / item['file']) == item['sha256'], item['file']
    for item in manifest['entries'].values():
        assert sha(ROOT / item['file']) == item['sha256'], item['file']
        assert sha(ROOT / item['source']) == item['sourceSHA256'], item['source']
    static = read(VARIANT / 'validation/static.json')
    native = read(VARIANT / 'validation/native.json')
    for proof, tool in [(static, 'test-ipv4-only.cjs'), (native, 'native-ipv4-only.cjs')]:
        assert proof['manifestSHA256'] == sha(manifest_file)
        assert proof['harnessSHA256'] == sha(ROOT / 'tools' / tool)
    assert static['status'] == 'IPV4_ONLY_STATIC_BUSINESS_PARITY_PASS'
    assert static['checks'] == 67
    assert {item['engine'] for item in static['engines']} == {'quickjs', 'boa'}
    assert all(item['status'] == 'PASS' and item['cases'] == 66 for item in static['engines'])
    assert native['status'] == 'IPV4_ONLY_LOCAL_CORE_TCP_UDP_DNS_PROVIDER_PASS'
    assert len(native['cases']) == 120
    assert all(item['result'] == 'PASS' for item in native['cases'])
    run('node', 'tools/build-ipv4-only.cjs', '--check')
    proof_file = VARIANT / 'validation/static.json'
    stored = proof_file.read_bytes()
    # The Node harness writes a new receipt without engine observations.
    # Keep its fresh result distinct from the archived, source-bound engine run.
    try:
        run('node', 'tools/test-ipv4-only.cjs')
        fresh = read(proof_file)
        assert fresh['status'] == static['status'] and fresh['checks'] == 67
        assert fresh['engines'] == []
    finally:
        proof_file.write_bytes(stored)
    run(sys.executable, 'tools/package-ipv4-only.py')
    run(sys.executable, 'tools/audit-publication.py', '--strict',
        '--archive', 'dist/v14.3-ipv4-only/RouteWeaver-v14.3-ipv4-only-public.zip',
        '--archive', 'dist/v14.3-ipv4-only/RouteWeaver-v14.3-ipv4-only-public-source.zip')
    run('git', 'diff', '--exit-code')
    print(json.dumps({'status': 'IPV4_RELEASE_SOURCE_RECEIPTS_FRESH_NODE_PACKAGE_PASS',
                     'freshNodeChecks': 67, 'storedRealEngineCases': 132,
                     'storedLocalCoreCases': 120, 'freshNativeReplay': 'NOT_RUN',
                     'deviceAcceptance': 'NOT_RUN'}))


if __name__ == '__main__':
    main()
