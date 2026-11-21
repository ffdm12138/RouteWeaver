"""Replay current policy on a pinned ProjectClash CLI core over loopback."""

import argparse
import copy
import json
import os
from pathlib import Path
import runpy
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
REPLAY = runpy.run_path(str(ROOT / 'tools/replay-resilience.py'))
FIXTURE = REPLAY['F']
CONTROL_TOKEN = 'projectclash-fixture-only'


class ProjectCore:
    def __init__(self, executable, home):
        self.executable = executable
        self.home = home
        self.file = home / 'config.yaml'
        self.log = home / 'core.log'
        self.controller = f'127.0.0.1:{FIXTURE["unused_port"]()}'
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        self.process = None
        self.original_proxies = None
        self.original_groups = None

    def request(self, route, method='GET', data=None):
        request = urllib.request.Request(
            f'http://{self.controller}{route}', method=method,
            data=json.dumps(data).encode() if data is not None else None,
            headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CONTROL_TOKEN},
        )
        with self.opener.open(request, timeout=5) as response:
            return {} if response.status == 204 else json.load(response)

    def ready(self):
        if self.process.poll() is not None:
            raise RuntimeError(self.log.read_text(encoding='utf-8', errors='replace')[-4000:])
        return self.request('/version')

    def reload(self, config):
        self.request('/configs?force=true', 'PUT', {'payload': json.dumps(config, ensure_ascii=False)})

    def restore_choices(self, config, selections):
        # Create the saved choices while they are still valid on the old
        # profile. The following reload exercises the core's real cache restore,
        # including stale names that the REST selection input would reject.
        previous = {**config, 'proxies': self.original_proxies, 'proxy-groups': copy.deepcopy(self.original_groups)}
        for group in previous['proxy-groups']:
            if selections.get(group['name']) == 'REJECT' and 'REJECT' not in group['proxies']:
                group['proxies'].append('REJECT')
        self.reload(previous)
        for group, node in selections.items():
            self.call('proxy.select', {'group-name': group, 'proxy-name': node})

    def call(self, method, arguments=None):
        arguments = arguments or {}
        if method == 'config.setup':
            config = json.loads(self.file.read_bytes())
            config['profile']['store-selected'] = True
            if self.process is None:
                self.original_proxies = config['proxies']
                self.original_groups = config['proxy-groups']
                FIXTURE['write_json'](self.file, config)
                env = {key: value for key, value in os.environ.items() if not key.upper().startswith('CLASH_')}
                with self.log.open('wb') as log:
                    self.process = subprocess.Popen(
                        [str(self.executable), '-d', str(self.home), '-f', str(self.file),
                         '-ext-ctl', self.controller, '-secret', CONTROL_TOKEN], cwd=self.home, env=env,
                        stdout=log, stderr=subprocess.STDOUT, creationflags=FIXTURE['WINDOWLESS'],
                    )
                FIXTURE['wait_until'](self.ready)
            else:
                selections = arguments.get('selected-map')
                if selections:
                    self.restore_choices(config, selections)
                self.reload(config)
            return {}
        if method == 'listener.start':
            return self.ready()
        if method == 'proxy.select':
            route = '/proxies/' + urllib.parse.quote(arguments['group-name'], safe='')
            return self.request(route, 'PUT', {'name': arguments['proxy-name']})
        if method == 'proxy.testDelay':
            route = '/proxies/' + urllib.parse.quote(arguments['proxy-name'], safe='')
            query = urllib.parse.urlencode({'url': arguments['test-url'], 'timeout': arguments['timeout'], 'expected': 204})
            try:
                return self.request(route + '/delay?' + query)
            except urllib.error.HTTPError as error:
                if error.code not in (503, 504):
                    raise
                return {}
        if method == 'dns.clearCache':
            return self.request('/cache/dns/flush', 'POST')
        raise ValueError('Unexpected replay command: ' + method)

    def close(self):
        if self.process is not None:
            FIXTURE['stop'](self.process)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--core', type=Path, required=True)
    parser.add_argument('--quickjs', type=Path, required=True)
    parser.add_argument('--openssl', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    release = json.loads((ROOT / 'CURRENT_RELEASE.json').read_bytes())
    candidate = release['projectClash']
    replay = REPLAY['run_case']
    hosts = replay.__globals__['H']
    hosts['StockCore'] = ProjectCore
    engine = hosts['QuickJS'](args.quickjs)
    sha = REPLAY['sha']
    proof = {
        'revision': candidate['revision'],
        'edition': 'personal' if release.get('vpsDirectRevision') else 'public',
        'status': 'PASS_ISOLATED_PROJECTCLASH_CORE', 'deviceAcceptance': 'NOT_RUN',
        'core': {'commit': candidate['reviewedCoreCommit'], 'sha256': sha(args.core)},
        'quickJSSHA256': sha(args.quickjs),
        'harness': {file: sha(ROOT / file) for file in ['tools/replay-projectclash.py', 'tools/replay-resilience.py',
                    'tools/stock-core-host.py', 'tools/test-proxy-failover.py', 'tools/native-architecture.py']},
        'scope': 'Pinned ProjectClash Windows CLI with loopback transport substitution. No Apple App or VPN.',
        'tracks': {},
    }
    with tempfile.TemporaryDirectory(prefix='routeweaver-projectclash-replay-') as temp:
        home = Path(temp)
        subprocess.run([str(args.openssl), 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                        '-keyout', str(home / 'key.pem'), '-out', str(home / 'cert.pem'), '-days', '1',
                        '-subj', '/CN=routeweaver-test',
                        '-addext', 'subjectAltName=DNS:www.gstatic.com,DNS:dns.failover.test,IP:127.0.0.1'],
                       check=True, capture_output=True, timeout=20)
        for track, file in candidate['entries'].items():
            directory = home / track
            try:
                checks = replay(args.core.resolve(), file, 'auto' if track == 'main' else 'ipv4-local', engine, directory)
            except Exception:
                if (directory / 'core.log').is_file():
                    print((directory / 'core.log').read_text(encoding='utf-8', errors='replace')[-4000:], flush=True)
                raise
            proof['tracks'][track] = {'file': file, 'sha256': sha(ROOT / file), 'checks': checks}
            print(json.dumps({'track': track, 'checks': len(checks)}), flush=True)
    args.output.write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
