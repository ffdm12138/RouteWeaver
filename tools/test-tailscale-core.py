"""Replay Tailscale and Windows WeChat process rules with isolated loopback relays."""
from contextlib import ExitStack
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import runpy
import shutil
import socket
import struct
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
RELAY = runpy.run_path(str(ROOT / 'tools/test-proxy-failover.py'))
NET = RELAY['HELPERS']
CORE_HOST = ROOT / 'tools/stock-core-host.py'

GENERATE = """
const fs = require('node:fs'), vm = require('node:vm');
const [file, mode] = process.argv.slice(1);
const source = fs.readFileSync(file, 'utf8');
const input = {proxies: [{name: 'Fixture', type: 'socks5', server: '127.0.0.1', port: 9, udp: true}],
  'x-routeweaver': {'network-mode': mode}};
const config = vm.runInNewContext(source + '\\nmain(input)', {input, console: {log() {}}}, {timeout: 5000});
process.stdout.write(JSON.stringify(config));
"""

DIRECT, PROXY, COMPANY = 'Fixture Direct', 'Fixture Proxy', 'Fixture Company'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def udp_exchange(mixed, target, port, allow_timeout=False):
    exact, address = NET['exact'], NET['address']
    with socket.create_connection(('127.0.0.1', mixed), timeout=3) as control, socket.socket(
        socket.AF_INET, socket.SOCK_DGRAM
    ) as data:
        control.sendall(b'\x05\x01\x00')
        assert exact(control, 2) == b'\x05\x00'
        control.sendall(b'\x05\x03\x00\x01' + bytes(6))
        header = exact(control, 4)
        assert header[:2] == b'\x05\x00'
        _, relay_port = address(control, header[3])
        try:
            ip = ipaddress.ip_address(target)
            destination = bytes([1 if ip.version == 4 else 4]) + ip.packed
        except ValueError:
            name = target.encode('ascii')
            destination = bytes([3, len(name)]) + name
        data.settimeout(0.5 if allow_timeout else 3)
        data.sendto(bytes(3) + destination + struct.pack('!H', port) + b'PING', ('127.0.0.1', relay_port))
        try:
            reply = data.recv(2048)
        except TimeoutError:
            assert allow_timeout, 'Expected UDP response'
        else:
            assert not allow_timeout and reply.endswith(b'ACK:PING'), 'Unexpected UDP result'


def tcp_exchange(mixed, target, port):
    assert NET['http_request'](mixed, target, port) == b'AUDIT_OK'


def local_configuration(file, mode, mixed, relays, resolver):
    raw = subprocess.check_output(['node', '-e', GENERATE, str(file), mode], timeout=15)
    config = json.loads(raw)
    config.update({
        'mixed-port': mixed, 'port': 0, 'socks-port': 0, 'redir-port': 0, 'tproxy-port': 0,
        'allow-lan': False, 'bind-address': '127.0.0.1', 'listeners': [], 'tunnels': [],
        'external-controller': '', 'external-controller-pipe': '', 'external-controller-unix': '',
        'log-level': 'warning', 'tun': {'enable': False, 'auto-route': False},
        'profile': {'store-selected': False, 'store-fake-ip': False},
        'proxies': [{'name': label, 'type': 'socks5', 'server': '127.0.0.1',
                     'port': relay.server_address[1], 'udp': True} for label, relay in relays.items()],
        'proxy-providers': {},
    })
    config['sniffer']['enable'] = False
    for name, provider in config['rule-providers'].items():
        if provider['type'] != 'inline':
            config['rule-providers'][name] = {'type': 'inline', 'behavior': provider['behavior'], 'payload': []}
    config['dns'] = {'enable': True, 'ipv6': config['ipv6'], 'enhanced-mode': 'redir-host',
                     'nameserver': [resolver], 'default-nameserver': [resolver]}
    config['proxy-groups'] = [
        {'name': group['name'], 'type': 'select',
         'proxies': [COMPANY if group['name'] in ('OpenAI 服务', '谷歌服务') else PROXY]}
        for group in config['proxy-groups']
    ]
    # Mark DIRECT's selected route with a local relay so no rule can dial a
    # public destination during the replay.
    config['rules'] = [
        rule.removesuffix(',DIRECT,no-resolve') + ',' + DIRECT + ',no-resolve'
        if rule.endswith(',DIRECT,no-resolve') else
        rule.removesuffix(',DIRECT') + ',' + DIRECT if rule.endswith(',DIRECT') else rule
        for rule in config['rules']
    ]
    return config


def replay(home, core, entries):
    stock_core = runpy.run_path(str(CORE_HOST))['StockCore']
    renamed = home / 'tailscaled.exe'
    shutil.copyfile(sys.executable, renamed)
    wechat_probes = [home / name for name in ('Weixin.exe', 'WeChat.exe')]
    for executable in wechat_probes:
        shutil.copyfile(sys.executable, executable)
    for library in Path(sys.base_prefix).glob('*.dll'):
        if library.name.startswith(('python', 'vcruntime')):
            shutil.copyfile(library, home / library.name)
    python_env = {**os.environ, 'PYTHONHOME': sys.base_prefix,
                  'PATH': sys.base_prefix + os.pathsep + os.environ['PATH']}
    results = {}
    with ExitStack() as stack:
        serve = lambda server: RELAY['start'](stack, server)
        origin = serve(NET['TCP'](('127.0.0.1', 0), NET['Origin']))
        origin.hits = []
        resolver = serve(NET['UDP'](('127.0.0.1', 0), RELAY['ResolverUDP']))
        relays = {}
        for label in [DIRECT, PROXY, COMPANY]:
            udp = serve(NET['UDP'](('127.0.0.1', 0), NET['ProxyUDP']))
            udp.events = []
            relay = serve(NET['TCP'](('127.0.0.1', 0), RELAY['Relay']))
            relay.udp, relay.events, relay.state = udp, [], 'up'
            relay.origin, relay.destinations = origin.server_address[1], {}
            relays[label] = relay

        for mode, clients in entries:
            for platform, name in clients.items():
                file = ROOT / name
                if file.suffix != '.js':
                    continue
                folder = home / (mode + '-' + platform)
                folder.mkdir()
                mixed = NET['unused_port']()
                config = local_configuration(file, mode, mixed, relays, f'127.0.0.1:{resolver.server_address[1]}')
                (folder / 'config.yaml').write_text(json.dumps(config, ensure_ascii=False), encoding='utf-8')
                core_instance = stock_core(core, folder)
                checks = []
                try:
                    core_instance.call('config.setup')
                    core_instance.call('listener.start')
                    cases = [
                        ('TCP', 'controlplane.tailscale.com', 443, DIRECT),
                        ('TCP', 'log.tailscale.com', 443, DIRECT),
                        ('TCP', '192.200.0.112', 443, DIRECT),
                        ('TCP', '172.237.28.183', 443, DIRECT),
                        ('UDP', '205.147.105.78', 3478, DIRECT),
                        ('UDP', '2403:2500:8000:1::e9a', 3478, None if mode == 'ipv4-only' else DIRECT),
                        ('UDP', '100.101.102.103', 41641, DIRECT),
                        ('UDP', 'fd7a:115c:a1e0::21', 41641, None if mode == 'ipv4-only' else DIRECT),
                        ('TCP', 'peer.example-tailnet.ts.net', 443, DIRECT),
                        ('UDP', '198.51.100.77', 3478, PROXY),
                        ('UDP', '198.51.100.77', 41641, PROXY),
                        ('TCP', 'chatgpt.com', 443, COMPANY),
                        ('UDP', 'stun.l.google.com', 3478, COMPANY),
                    ]
                    for protocol, target, port, expected in cases:
                        before = {label: len(relay.udp.events if protocol == 'UDP' else relay.events)
                                  for label, relay in relays.items()}
                        if protocol == 'UDP':
                            udp_exchange(mixed, target, port, allow_timeout=expected is None)
                        else:
                            tcp_exchange(mixed, target, port)
                        got = [label for label, relay in relays.items()
                               if len(relay.udp.events if protocol == 'UDP' else relay.events) > before[label]]
                        assert got == ([expected] if expected else []), (name, protocol, target, port, got, expected)
                        checks.append([protocol, target, port, expected or 'REJECT'])

                    if platform in ('windows', 'clashVerge'):
                        before = len(relays[DIRECT].udp.events), len(relays[PROXY].udp.events)
                        probe = subprocess.run(
                            [str(renamed), '-B', str(Path(__file__).resolve()), '--process-probe', str(mixed)],
                            env=python_env, capture_output=True, timeout=12,
                        )
                        assert probe.returncode == 0, probe.stderr.decode('utf-8', errors='replace')
                        assert (len(relays[DIRECT].udp.events), len(relays[PROXY].udp.events)) == (before[0] + 1, before[1]), name
                        checks.append(['UDP', '198.51.100.77', 41641, 'Fixture Direct via tailscaled.exe'])
                        process_cases = [
                            ('TCP', '198.51.100.77', 443, DIRECT),
                            ('UDP', '198.51.100.77', 443, DIRECT),
                            ('UDP', '198.51.100.77', 3478, PROXY),
                            ('TCP', 'unclassified.example.net', 443, PROXY),
                            ('UDP', '2001:db8::77', 443, None if mode == 'ipv4-only' else PROXY),
                        ]
                        for executable in wechat_probes:
                            for protocol, target, port, expected in process_cases:
                                events = {label: relay.udp.events if protocol == 'UDP' else relay.events
                                          for label, relay in relays.items()}
                                before = {label: len(items) for label, items in events.items()}
                                probe = subprocess.run(
                                    [str(executable), '-B', str(Path(__file__).resolve()),
                                     '--wechat-probe', str(mixed), protocol, target, str(port),
                                     'allow' if expected else 'reject'],
                                    env=python_env, capture_output=True, timeout=12,
                                )
                                assert probe.returncode == 0, probe.stderr.decode('utf-8', errors='replace')
                                actual = [label for label, items in events.items() if len(items) > before[label]]
                                assert actual == ([expected] if expected else []), (name, executable.name, target, port, actual)
                                checks.append([protocol, target, port, (expected or 'REJECT') + ' via ' + executable.name])
                except Exception:
                    print((folder / 'core.log').read_text(encoding='utf-8', errors='replace')[-3000:], file=sys.stderr)
                    raise
                finally:
                    core_instance.close()
                results[name] = {'sha256': sha(file), 'checks': checks}
                print(json.dumps({'file': name, 'checks': len(checks)}), flush=True)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--core', type=Path, default=Path('C:/Program Files/FlClash/FlClashCore.exe'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    release = json.loads((ROOT / 'CURRENT_RELEASE.json').read_text(encoding='utf-8'))
    entries = [('auto', release['entries']), ('ipv4-only', release['variants']['ipv4-only']['entries'])]
    with tempfile.TemporaryDirectory(prefix='routeweaver-tailscale-') as work:
        results = replay(Path(work), args.core, entries)

    report = {
        'status': 'PASS', 'scope': 'Windows isolated FlClash core, loopback transport',
        'deviceAcceptance': 'NOT_RUN', 'coreSHA256': sha(args.core),
        'runnerSHA256': sha(Path(__file__)), 'hostSHA256': sha(CORE_HOST),
        'entries': results,
    }
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'status': 'PASS', 'entries': len(results), 'checks': sum(len(e['checks']) for e in results.values())}))


if __name__ == '__main__':
    if sys.argv[1:2] == ['--process-probe']:
        udp_exchange(int(sys.argv[2]), '198.51.100.77', 41641)
    elif sys.argv[1:2] == ['--wechat-probe']:
        mixed, protocol, target, port, expected = sys.argv[2:]
        if protocol == 'UDP':
            udp_exchange(int(mixed), target, int(port), allow_timeout=expected == 'reject')
        else:
            tcp_exchange(int(mixed), target, int(port))
    else:
        main()
