"""Replay the existing 18-input contract on the installed real QuickJS bridge, plus scaling observations."""
from pathlib import Path
import argparse
import hashlib
import json
import runpy
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    library = Path('C:/Program Files/FlClash/quickjs_c_bridge.dll')
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    engine = runpy.run_path(str(ROOT / 'tools/stock-core-host.py'))['QuickJS'](library)
    # Extract existing contract programs without running its writing runner.
    extraction = r'''
const fs=require('fs'),path=require('path'),Module=require('module');
const file=path.resolve('releases/v14.3/tests/engine-parity.cjs');
process.argv[2]=process.execPath;
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
let source=fs.readFileSync(file,'utf8').split('async function run(engine){')[0];
m._compile(source+'\nprocess.stdout.write(JSON.stringify(programs));',file);
'''
    programs = json.loads(subprocess.check_output(['node', '-e', extraction], cwd=ROOT, timeout=90))
    checks = []
    for test in programs:
        actual = json.loads(engine.evaluate(test['code']))
        assert actual == test['expected'], test['id']
        checks.append({'id': test['id'], 'status': 'PASS' if actual['ok'] else 'EXPECTED_REJECTION_MATCH'})
    current = json.loads((ROOT / 'CURRENT_RELEASE.json').read_text(encoding='utf-8'))
    bindings = {}; performance = []
    for track, entries in [('main', current['entries']), ('ipv4-only', current['variants']['ipv4-only']['entries'])]:
        for client, file in entries.items():
            bindings[file] = sha(ROOT / file)
            if not file.endswith('.js'): continue
            source = (ROOT / file).read_text(encoding='utf-8')
            for count in [1, 50, 500, 2000]:
                nodes = [{'name': f'Synthetic-{i}', 'type': 'socks5', 'server': '192.0.2.1', 'port': 1080, 'udp': True} for i in range(count)]
                code = 'var console={log:function(){}};\n' + source + '\nJSON.stringify(main(' + json.dumps({'proxies': nodes}) + '));'
                start = time.perf_counter(); result = engine.evaluate(code); elapsed = (time.perf_counter() - start) * 1000
                assert isinstance(json.loads(result), dict)
                performance.append({'track': track, 'client': client, 'nodes': count, 'quickJSms': round(elapsed, 2),
                                    'scriptBytes': len(source.encode()), 'configBytes': len(result.encode())})
    report = {'revision': 'domestic-resilience-r1', 'status': 'PASS', 'scope': 'Real Windows QuickJS bridge; desktop timings do not establish iOS timeout resolution',
              'quickJSSHA256': sha(library), 'testSHA256': sha(Path(__file__)), 'contractSHA256': sha(ROOT / 'releases/v14.3/tests/engine-parity.cjs'),
              'sources': bindings, 'checks': checks, 'performance': performance, 'deviceAcceptance': 'NOT_RUN'}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': 'PASS', 'contractCases': len(checks), 'scalingCases': len(performance), 'maxMS': max(x['quickJSms'] for x in performance)}))


if __name__ == '__main__':
    main()
