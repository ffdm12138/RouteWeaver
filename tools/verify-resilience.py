"""Run legacy writing suites in an automatically cleaned temporary copy, keeping historical receipts intact."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    release = json.loads((ROOT / 'CURRENT_RELEASE.json').read_text(encoding='utf-8'))
    bindings = {file: sha(ROOT / file) for entries in [release['entries'], release['variants']['ipv4-only']['entries']] for file in entries.values()}
    results = []
    with tempfile.TemporaryDirectory(prefix='routeweaver-regression-') as directory:
        target = Path(directory)
        for name in ['tools', 'releases', 'docs']:
            shutil.copytree(ROOT / name, target / name, ignore=shutil.ignore_patterns('__pycache__', '.work', 'target'))
        for name in ['CURRENT_RELEASE.json', 'README.md', 'AGENTS.md']:
            if (ROOT / name).exists(): shutil.copyfile(ROOT / name, target / name)
        suites = runpy.run_path(str(target / 'tools/run-architecture-audit.py'))['SUITES']
        commands = [*suites['build'], ['node', 'tools/test-native-fallback.cjs'], ['node', 'tools/test-company-audit.cjs'], ['node', 'tools/test-dns-policy-order.cjs'],
                    *suites['regression'], *suites['platform'], *suites['static'], *suites['macos'], *suites['python']]
        for command in commands:
            start = time.monotonic()
            try:
                process = subprocess.run(command, cwd=target, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=480)
                row = {'command': ['python' if x == sys.executable else x for x in command], 'status': 'PASS' if process.returncode == 0 else 'FAIL', 'exitCode': process.returncode,
                       'stdout': process.stdout[-15000:].replace(str(target), '<temporary-root>'), 'stderr': process.stderr[-8000:].replace(str(target), '<temporary-root>')}
            except subprocess.TimeoutExpired:
                row = {'command': command, 'status': 'TIMEOUT'}
            row['seconds'] = round(time.monotonic() - start, 3); results.append(row)
            print(json.dumps({k: v for k, v in row.items() if k not in ['stdout', 'stderr']}), flush=True)
    result = {'revision': 'domestic-resilience-r1', 'status': 'PASS' if all(r['status'] == 'PASS' for r in results) else 'FAIL',
              'scope': 'CURRENT_SOURCE_OFFLINE_NOT_DEVICE_ACCEPTANCE', 'sources': bindings, 'results': results,
              'testSHA256': sha(Path(__file__)), 'temporaryCopyCleaned': True}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return int(result['status'] != 'PASS')


if __name__ == '__main__':
    raise SystemExit(main())
