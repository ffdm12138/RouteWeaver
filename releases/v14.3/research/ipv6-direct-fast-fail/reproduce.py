"""Rebuild the bounded research prototype. Does not install a client or start TUN."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-zip', type=Path, required=True, help='Pinned upstream source archive, see upstream.json')
parser.add_argument('--go', type=Path, help='Go 1.27.2 executable; required unless --prepare-only')
parser.add_argument('--work-dir', type=Path, required=True, help='New directory inside the project .work directory')
parser.add_argument('--prepare-only', action='store_true', help='Verify source and apply patch without Go, dependency downloads or sockets')
args = parser.parse_args()
here = Path(__file__).resolve().parent
release = here.parents[1]
possible_project = release.parents[1]
project = possible_project if (possible_project / 'CURRENT_RELEASE.json').is_file() and release == possible_project / 'releases/v14.3' else release
work = args.work_dir.resolve()
assert work.is_relative_to(project / '.work') and not work.exists(), 'Use a new project .work subdirectory'
source_zip = args.source_zip.resolve()
source = json.loads((here / 'upstream.json').read_text(encoding='utf-8'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(source_zip) == source['sourceArchiveSHA256'], 'Upstream source ZIP hash mismatch'
assert sha(here / 'direct-ipv6-fast-fail.patch') == source['patchSHA256'], 'Patch hash mismatch'
if not args.prepare_only:
    assert args.go is not None, '--go is required for compilation and native replay'
    go = args.go.resolve()
    version = subprocess.check_output([str(go), 'version'], text=True).strip()
    assert 'go1.27.2 ' in version and 'windows/amd64' in version, 'This recorded native replay requires Go 1.27.2 Windows/amd64'
work.mkdir(parents=True)
original, candidate = work / 'source-original', work / 'source-candidate'
original.mkdir()
with zipfile.ZipFile(source_zip) as archive:
    for info in archive.infolist():
        parts = Path(info.filename).parts
        assert parts and not Path(info.filename).is_absolute() and '..' not in parts
        rel = Path(*parts[1:])
        if not parts[1:]:
            continue
        target = (original / rel).resolve()
        assert target.is_relative_to(original)
        if info.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(info))
shutil.copytree(original, candidate)
subprocess.run(['git', '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'apply', '--check', str(here / 'direct-ipv6-fast-fail.patch')], cwd=candidate, check=True)
subprocess.run(['git', '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'apply', str(here / 'direct-ipv6-fast-fail.patch')], cwd=candidate, check=True)
for item in source['changes']:
    assert sha(candidate / item['file']) == item['afterSHA256'], item['file']
if args.prepare_only:
    print(json.dumps({'status':'SOURCE_PATCH_PREPARE_PASS', 'clientChanged':False, 'compiled':False, 'workDirectory':str(work)}))
    sys.exit(0)
env = os.environ.copy()
env.update({'GOTOOLCHAIN':'local', 'GOTELEMETRY':'off', 'CGO_ENABLED':'0', 'GOMAXPROCS':'2',
            'GOFLAGS':'-mod=readonly', 'GODEBUG':'http2client=0'})
for key, name in [('GOPATH','go-path'), ('GOMODCACHE','go-mod-cache'), ('GOCACHE','go-build-cache'), ('GOTMPDIR','go-tmp')]:
    (work / name).mkdir()
    env[key] = str(work / name)
(work / 'bin').mkdir()
(work / 'logs').mkdir()
records = []


def run(argv, cwd, name):
    with (work / 'logs' / (name + '.log')).open('wb') as log:
        result = subprocess.run(argv, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
    records.append({'step':name, 'exitCode':result.returncode})
    (work / 'steps.json').write_text(json.dumps(records, indent=2) + '\n')
    print(json.dumps(records[-1]), flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)


run([str(go),'test','-p','2','-tags','with_gvisor','./adapter/outbound','./tunnel','-run','^TestRouteWeaver','-count=1','-v'], candidate, 'unit')
for directory, label in [(candidate, 'v1.19.31-rw-ipv6-retry-research'), (original, 'v1.19.31-upstream-control')]:
    flags = f'-X github.com/metacubex/mihomo/constant.Version={label} -X github.com/metacubex/mihomo/constant.BuildTime=research-only -w -s -buildid='
    run([str(go),'build','-p','2','-tags','with_gvisor','-trimpath','-ldflags',flags,'-o',str(work/'bin'/('mihomo-'+label+'.exe')),'.'], directory, label)
run([str(go),'mod','verify'], candidate, 'modules')
shutil.copyfile(here / 'native-retry-bench.cjs', work / 'native-retry-bench.cjs')
run(['node',str(work/'native-retry-bench.cjs')], work, 'native-benchmark')
# Full production rules are copied into an isolated replay tree. The current
# project's bound core receipt is never overwritten by this research runner.
replay = work / 'production-replay'
replay.mkdir()
for name in ('data','src','tools','tests','metadata'):
    shutil.copytree(release / name, replay / name)
(replay / 'validation').mkdir()
run(['node',str(replay/'tests/native-network-compat.cjs'),str(work/'bin/mihomo-v1.19.31-rw-ipv6-retry-research.exe')], work, 'production-policy')
print(json.dumps({'status':'PASS', 'clientChanged':False, 'workDirectory':str(work)}))
