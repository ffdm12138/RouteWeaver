"""Bounded, network-free verification of the current source (not device acceptance).

Run one suite per invocation to keep remote-tool requests bounded. Every receipt
binds entry bytes and test code; nonzero exits/timeouts never become PASS.
"""
from __future__ import annotations
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'releases/v14.3/validation/architecture-audit'
SUITES = {
    'build': [
        ['node', 'releases/v14.3/tools/build-all.cjs', '--check'],
        ['node', 'tools/build-ipv4-only.cjs', '--check'],
    ],
    'regression': [['node', 'tools/test-architecture.cjs']],
    'static': [['node', 'releases/v14.3/tests/static.cjs']],
    'macos': [['node', 'releases/v14.3/tests/macos-static.cjs']],
    'platform': [
        ['node', 'releases/v14.3/tests/clash-verge.cjs'],
        ['node', 'releases/v14.3/tests/shadowrocket-lean.cjs'],
        ['node', 'releases/v14.3/tests/network-compat.cjs'],
        ['node', 'tools/test-ipv4-only.cjs'],
    ],
    'python': [[sys.executable, '-m', 'unittest', 'discover', '-s', 'tools/tests', '-p', 'test_*.py']],
}

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def entry_bindings() -> dict[str, str]:
    current = json.loads((ROOT/'CURRENT_RELEASE.json').read_text(encoding='utf-8-sig'))
    variant = json.loads((ROOT/'releases/v14.3-ipv4-only/MANIFEST.json').read_text(encoding='utf-8-sig'))
    names = list(current['entries'].values()) + [x['file'] for x in variant['entries'].values()]
    return {name: sha(ROOT/name) for name in sorted(set(names))}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suite', choices=SUITES, required=True)
    parser.add_argument('--timeout', type=int, default=100)
    args = parser.parse_args()
    if not 1 <= args.timeout <= 300:
        parser.error('timeout must be between 1 and 300 seconds per command')
    bindings = entry_bindings()
    results = []
    for command in SUITES[args.suite]:
        begin = time.monotonic()
        try:
            process = subprocess.run(command, cwd=ROOT, capture_output=True,
                text=True, encoding='utf-8', errors='replace', timeout=args.timeout,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            result = {'command': ['python' if x == sys.executable else x for x in command],
                'status': 'PASS' if process.returncode == 0 else 'FAIL',
                'exitCode': process.returncode, 'stdout': process.stdout[-20000:],
                'stderr': process.stderr[-10000:]}
        except subprocess.TimeoutExpired:
            result = {'command': command, 'status': 'TIMEOUT_NOT_PASS', 'timeout': args.timeout}
        except OSError as error:
            result = {'command': command, 'status': 'ENVIRONMENT_NOT_PASS', 'errorType': type(error).__name__}
        result['seconds'] = round(time.monotonic()-begin, 3)
        results.append(result)
    unchanged = entry_bindings() == bindings
    receipt = {'revision': 'architecture-audit-r1',
        'executedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'scope': 'CURRENT_SOURCE_OFFLINE_ONLY_NOT_TUN_OR_DEVICE',
        'suite': args.suite, 'sources': bindings, 'runnerSHA256': sha(Path(__file__)),
        'entryBytesUnchanged': unchanged, 'results': results,
        'status': 'PASS' if unchanged and all(x['status']=='PASS' for x in results) else 'FAIL'}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT/('suite-'+args.suite+'.json')).write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'suite': args.suite, 'status': receipt['status'],
        'results': [{k: v for k, v in row.items() if k not in ('stdout','stderr')} for row in results]}, ensure_ascii=False))
    for row in results:
        if row['status'] != 'PASS':
            print(row.get('stdout','')[-1800:]+row.get('stderr','')[-1800:])
    return int(receipt['status']!='PASS')

if __name__ == '__main__':
    raise SystemExit(main())
