"""Collect verified public assets and checksums for a manual GitHub release."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', default='v14.3.0-rc.1')
    args = parser.parse_args()
    if not re.fullmatch(r'v14\.3\.\d+(?:-rc\.\d+)?', args.tag):
        parser.error('Expected a v14.3.x or v14.3.x-rc.n tag.')
    subprocess.run([sys.executable, str(ROOT / 'tools/verify-v14.3.py'),
                    '--skip-history', '--with-packages'], cwd=ROOT, check=True)
    read = lambda name: json.loads((ROOT / name).read_text(encoding='utf-8-sig'))
    digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    current = read('CURRENT_RELEASE.json')
    receipt = read('dist/v14.3/package-verification.json')
    assert receipt['packageToolSHA256'] == digest(ROOT / 'tools/package-v14.3.py')
    assets = [ROOT / name for name in current['entries'].values()]
    for package in receipt['packages']:
        path = ROOT / package['file']
        assert digest(path) == package['sha256']
        sidecar = path.with_name(path.name + '.sha256')
        assert sidecar.read_text(encoding='utf-8').split()[0] == package['sha256']
        assets.extend([path, sidecar])
    assets.append(ROOT / 'dist/v14.3/package-verification.json')
    target = ROOT / 'dist/v14.3/github' / args.tag
    target.mkdir(parents=True, exist_ok=True)
    expected = {path.name for path in assets} | {'SHA256SUMS.txt'}
    assert len(expected) == len(assets) + 1, 'Duplicate asset basenames.'
    assert not {path.name for path in target.iterdir()} - expected, 'Unexpected old release assets.'
    for path in assets:
        shutil.copyfile(path, target / path.name)
    sums = ''.join(digest(target / path.name) + '  ' + path.name + '\n'
                   for path in sorted(assets, key=lambda path: path.name))
    (target / 'SHA256SUMS.txt').write_text(sums, encoding='utf-8')
    print(json.dumps({'status': 'RELEASE_ASSETS_PREPARED', 'tag': args.tag,
                      'directory': target.relative_to(ROOT).as_posix(),
                      'assets': len(expected), 'deviceAcceptance': 'NOT_RUN'}))


if __name__ == '__main__':
    main()
