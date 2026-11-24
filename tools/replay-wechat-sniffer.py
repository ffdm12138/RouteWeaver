"""Compare released and current media routing with synthetic QUIC on loopback."""

import argparse
from contextlib import ExitStack
import json
from pathlib import Path
import runpy
import secrets
import socket
import socketserver
import struct
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
PROJECT = runpy.run_path(str(ROOT / 'tools/replay-projectclash.py'))
REPLAY = PROJECT['REPLAY']
F, N = REPLAY['F'], REPLAY['N']
PORTS = (80, 443, 8000)
WECHAT = 'c2c.cdn.weixin.qq.com'
QQ = 'gchat.qpic.cn'
STUN = 'stun.qpic.cn'
UNKNOWN = 'unclassified.media-test.invalid'
LOOPBACK = '127.0.0.1'


class DirectUDP(socketserver.BaseRequestHandler):
    def handle(self):
        packet, sock = self.request
        sock.sendto(b'DIRECT:' + packet, self.client_address)


def exchange(port, destination, payload):
    exact, address = N['exact'], N['address']
    with socket.create_connection((LOOPBACK, port), timeout=4) as tcp, \
            socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
        tcp.sendall(b'\x05\x01\x00')
        assert exact(tcp, 2) == b'\x05\x00'
        tcp.sendall(b'\x05\x03\x00\x01\x00\x00\x00\x00\x00\x00')
        header = exact(tcp, 4)
        assert header[:3] == b'\x05\x00\x00', header
        relay_host, relay_port = address(tcp, header[3])
        assert relay_host in ('0.0.0.0', LOOPBACK), relay_host
        packet = b'\x00\x00\x00\x01' + socket.inet_aton(LOOPBACK) + struct.pack('!H', destination) + payload
        udp.settimeout(4)
        udp.sendto(packet, (LOOPBACK, relay_port))
        response, _ = udp.recvfrom(4096)
        for prefix, egress in ((b'DIRECT:', 'DIRECT'), (b'ACK:', 'catch-all proxy')):
            if response.endswith(prefix + payload):
                return egress
        raise AssertionError('Neither loopback endpoint received the complete payload')


def mixed_ready(port):
    with socket.create_connection((LOOPBACK, port), timeout=1):
        return True


def mixed_port():
    for _ in range(100):
        port = 20000 + secrets.randbelow(20000)
        with socket.socket() as tcp, socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
            try:
                tcp.bind((LOOPBACK, port))
                udp.bind((LOOPBACK, port))
            except OSError:
                continue
            return port
    raise RuntimeError('No available TCP and UDP loopback port')


def isolate(config, mixed, resolver):
    config.update({'tun': {'enable': False}, 'mixed-port': mixed, 'allow-lan': False,
                   'bind-address': LOOPBACK, 'log-level': 'debug', 'geo-auto-update': False,
                   'listeners': [], 'tunnels': [], 'hosts': dict.fromkeys((WECHAT, QQ, STUN, UNKNOWN), LOOPBACK),
                   'profile': {'store-selected': False, 'store-fake-ip': False}})
    for key in ('port', 'socks-port', 'redir-port', 'tproxy-port'):
        config[key] = 0
    for name, provider in config['rule-providers'].items():
        if provider['type'] != 'inline':
            config['rule-providers'][name] = {'type': 'inline', 'behavior': provider['behavior'], 'payload': []}
    for group in config['proxy-groups']:
        if 'url' in group:
            group['url'] = 'http://127.0.0.1:1/generate_204'
    config['dns'].update({'use-system-hosts': False, 'listen': '', 'nameserver-policy': {},
                          'nameserver': [resolver], 'direct-nameserver': [resolver], 'fallback': [],
                          'default-nameserver': [resolver], 'proxy-server-nameserver': [resolver]})
    # Treat the loopback origin as a public address for classification only.
    config['rules'] = [rule for rule in config['rules'] if not rule.startswith('IP-CIDR,127.0.0.0/8,')]


def run(core, source, mode, home, probes, baseline):
    home.mkdir()
    with ExitStack() as stack:
        for port in PORTS:
            F['start'](stack, N['UDP']((LOOPBACK, port), DirectUDP))
        resolver = F['start'](stack, N['UDP']((LOOPBACK, 0), N['DNSHandler']))
        upstream = F['start'](stack, N['UDP']((LOOPBACK, 0), N['ProxyUDP']))
        upstream.events = []
        relay = F['start'](stack, N['TCP']((LOOPBACK, 0), N['ProxyTCP']))
        relay.udp, relay.events = upstream, []
        relay.http_port = relay.tls_port = 1
        node = {'name': 'FixtureRelay', 'type': 'socks5', 'server': LOOPBACK,
                'port': relay.server_address[1], 'udp': True}
        profile = REPLAY['generate'](source, mode, [node])
        mixed = mixed_port()
        isolate(profile, mixed, f'udp://{LOOPBACK}:{resolver.server_address[1]}')
        child = PROJECT['ProjectCore'](core, home)
        stack.callback(child.close)
        F['write_json'](child.file, profile)
        try:
            child.call('config.setup')
            F['wait_until'](lambda: mixed_ready(mixed), seconds=6)
            views = child.call('proxy.list')['proxies']
            relay_choice = next(name for name in views['漏网之鱼']['all'] if name.startswith(node['name']))
            child.call('proxy.select', {'group-name': '漏网之鱼', 'proxy-name': relay_choice})
            checks = {}
            for name, port, payload, media in probes:
                egress = exchange(mixed, port, payload)
                expected = 'DIRECT' if media and not baseline else 'catch-all proxy'
                if egress != expected:
                    raise AssertionError(f'{name} UDP/{port}: expected {expected}, got {egress}')
                checks[name] = egress
            return checks
        except Exception:
            if child.log.exists():
                log = child.log.read_text(encoding='utf-8', errors='replace').splitlines()
                print('\n'.join(line for line in log if any(token in line for token in
                    ('[Sniffer]', 'UDP]', 'proxy listening at', 'level=error', 'level=fatal')))[-4500:], flush=True)
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mihomo', type=Path, required=True)
    parser.add_argument('--project-core', type=Path, required=True)
    parser.add_argument('--quic-probe', type=Path, required=True)
    parser.add_argument('--baseline', default='v14.3.0-rc.22')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    sha = REPLAY['sha']
    release = json.loads((ROOT / 'CURRENT_RELEASE.json').read_bytes())
    tracks = {'main': release['entries'], 'ipv4-only': release['variants']['ipv4-only']['entries']}
    packets = {host: subprocess.check_output([str(args.quic_probe.resolve()), host], timeout=6)
               for host in (WECHAT, QQ, STUN, UNKNOWN)}
    probes = [('wechat_quic_80', 80, packets[WECHAT], True),
              ('wechat_quic_443', 443, packets[WECHAT], True),
              ('wechat_quic_8000', 8000, packets[WECHAT], True),
              ('qq_image_quic_443', 443, packets[QQ], True),
              ('stun_hostname_80', 80, packets[STUN], False),
              ('stun_hostname_443', 443, packets[STUN], False),
              ('unclassified_quic_443', 443, packets[UNKNOWN], False),
              ('opaque_udp_80', 80, b'fixture-without-a-hostname', False),
              ('opaque_udp_443', 443, b'fixture-without-a-hostname', False),
              ('opaque_udp_8000', 8000, b'fixture-without-a-hostname', False)]
    baseline = subprocess.check_output(['git', 'rev-parse', args.baseline + '^{commit}'], cwd=ROOT, text=True).strip()
    result = {'revision': 'wechat-quic-port80-r1', 'status': 'PASS', 'deviceAcceptance': 'NOT_RUN',
              'scope': 'Synthetic QUIC Initial and UDP payload delivery over loopback SOCKS, no TUN or Apple runtime.',
              'baselineCommit': baseline, 'mihomoSHA256': sha(args.mihomo),
              'projectClashCore': {'commit': release['projectClash']['reviewedCoreCommit'], 'sha256': sha(args.project_core)},
              'harness': {str(file.relative_to(ROOT)).replace('\\', '/'): sha(file) for file in (
                  Path(__file__), ROOT / 'tools/wechat-quic-probe.go', ROOT / 'tools/replay-projectclash.py',
                  ROOT / 'tools/replay-resilience.py', ROOT / 'tools/test-proxy-failover.py', ROOT / 'tools/native-architecture.py')},
              'tracks': {}}
    with tempfile.TemporaryDirectory(prefix='routeweaver-wechat-sniffer-') as temporary:
        home = Path(temporary)
        for track, entries in tracks.items():
            result['tracks'][track] = {}
            for client, file in {**entries, 'projectClash': release['projectClash']['entries'][track]}.items():
                if not file.endswith('.js'):
                    result['tracks'][track][client] = {'file': file, 'sha256': sha(ROOT / file),
                                                        'scope': 'NATIVE_CONFIGURATION_ONLY'}
                    continue
                case = home / f'{track}-{client}'
                case.mkdir()
                old_source = case / 'released.js'
                old_source.write_bytes(subprocess.check_output(['git', 'show', f'{baseline}:{file}'], cwd=ROOT))
                mode = 'auto' if track == 'main' else 'ipv4-local'
                core = args.project_core if client == 'projectClash' else args.mihomo
                before = run(core.resolve(), old_source, mode, case / 'before', probes, baseline=True)
                after = run(core.resolve(), file, mode, case / 'after', probes, baseline=False)
                result['tracks'][track][client] = {'file': file, 'sha256': sha(ROOT / file),
                                                    'baselineSHA256': sha(old_source), 'before': before, 'after': after}
                print(json.dumps({'track': track, 'client': client, 'checks': len(before) + len(after)}), flush=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
