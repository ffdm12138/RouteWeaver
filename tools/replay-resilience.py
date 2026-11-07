"""Current-byte Windows stock-core and QuickJS replay using only synthetic loopback traffic."""
from contextlib import ExitStack
from pathlib import Path
import argparse
import copy
import hashlib
import json
import runpy
import socket
import ssl
import struct
import subprocess
import tempfile
import threading
import time
import traceback

ROOT = Path(__file__).resolve().parents[1]
H = runpy.run_path(str(ROOT / 'tools/stock-core-host.py'))
F = runpy.run_path(str(ROOT / 'tools/test-proxy-failover.py'))
N = F['HELPERS']
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()


def generate(file, mode, nodes, engine=None):
    source = (ROOT / file).read_text(encoding='utf-8')
    data = {'proxies': nodes, 'tun': {'enable': False, 'auto-route': False},
            'x-routeweaver': {'network-mode': mode}}
    code = 'var console={log:function(){}};\n' + source + '\nvar result=main(' + json.dumps(data) + ');JSON.stringify(result);'
    node = subprocess.check_output(['node', '-e', 'process.stdout.write(require("vm").runInNewContext(require("fs").readFileSync(0,"utf8")));'], input=code.encode(), timeout=20)
    output = json.loads(node)
    if engine:
        assert json.loads(engine.evaluate(code)) == output, 'QuickJS/Node mismatch'
        again = code[:code.rfind('JSON.stringify(result);')] + 'JSON.stringify(main(result));'
        assert json.loads(engine.evaluate(again)) == output, 'QuickJS non-idempotent'
    return output


def run_case(core, file, mode, engine, directory):
    checks = []
    with ExitStack() as stack:
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(directory.parent / 'cert.pem', directory.parent / 'key.pem')
        start = lambda server, ctx=None: F['start'](stack, server, ctx)
        origin = start(N['TCP'](('127.0.0.1', 0), N['Origin'])); origin.hits = []
        https = start(N['TCP'](('127.0.0.1', 0), F['HTTPS']), tls)
        dot = start(N['TCP'](('127.0.0.1', 0), F['ResolverTLS']), tls)
        bootstrap = start(N['UDP'](('127.0.0.1', 0), N['DNSHandler']))
        relays = {}
        for label in ['A', 'B', 'C', 'D', 'X', 'NoUDP']:
            udp = start(N['UDP'](('127.0.0.1', 0), N['ProxyUDP'])); udp.events = []
            relay = start(N['TCP'](('127.0.0.1', 0), F['Relay']))
            relay.udp, relay.events, relay.state = udp, [], 'up'
            relay.origin = origin.server_address[1]
            relay.probe_gate = threading.Event(); relay.probe_gate.set()
            relay.destinations = {(F['CANARY'], 443): https.server_address[1]}
            for host in [F['RESOLVER'], '127.0.0.1']:
                for server in [https, dot]:
                    relay.destinations[host, server.server_address[1]] = server.server_address[1]
            relays[label] = relay
        nodes = [{'name': k, 'type': 'socks5', 'server': '127.0.0.1', 'port': v.server_address[1], 'udp': k != 'NoUDP'} for k, v in relays.items()]
        cfg = generate(file, mode, nodes, engine)
        checks.extend(['quickjs_node_parity', 'quickjs_idempotence'])
        original = copy.deepcopy(cfg)
        # A TCP-only free-port probe misses Windows UDP exclusions. Validate both
        # protocols on a bounded test port before asking Mihomo to bind it.
        import secrets
        def dual_port():
            for _ in range(100):
                port = 20000 + secrets.randbelow(20000)
                try:
                    with socket.socket() as tcp, socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
                        tcp.bind(('127.0.0.1',port)); udp.bind(('127.0.0.1',port)); return port
                except OSError: continue
            raise RuntimeError('No free loopback TCP/UDP test port')
        mixed, dns = dual_port(), dual_port()
        cfg.update({'tun': {'enable': False, 'auto-route': False}, 'mixed-port': mixed,
                    'allow-lan': False, 'bind-address': '127.0.0.1', 'listeners': [], 'tunnels': [],
                    'external-controller': '', 'external-controller-pipe': '', 'external-controller-unix': '',
                    'geo-auto-update': False, 'log-level': 'warning',
                    'profile': {'store-selected': False, 'store-fake-ip': False},
                    'tls': {'custom-certifactes': [(directory.parent / 'cert.pem').read_text()]}})
        for key in ['port', 'socks-port', 'redir-port', 'tproxy-port']:
            cfg[key] = 0
        # No source selection or rule ordering is changed. Empty every HTTP
        # provider, and translate only its transport to an empty inline provider.
        for name, provider in cfg['rule-providers'].items():
            if provider['type'] != 'inline':
                cfg['rule-providers'][name] = {'type': 'inline', 'behavior': provider['behavior'], 'payload': []}
        cfg['hosts'] = {F['RESOLVER']: '127.0.0.1', F['CANARY']: '127.0.0.1'}
        bootstrap_url = f'udp://127.0.0.1:{bootstrap.server_address[1]}'
        cfg['dns'].update({'listen': f'127.0.0.1:{dns}', 'use-system-hosts': False,
                           'default-nameserver': [bootstrap_url], 'proxy-server-nameserver': [bootstrap_url],
                           'fallback-filter': {'geoip': False, 'geosite': [], 'ipcidr': [], 'domain': []}})
        for key in ['nameserver', 'fallback', 'direct-nameserver']:
            if key in cfg['dns']:
                cfg['dns'][key] = [bootstrap_url]
        for key, servers in cfg['dns']['nameserver-policy'].items():
            translated = []
            for server in servers:
                fragment = server.split('#', 1)[1] if '#' in server else 'DIRECT'
                transport = f'https://{F["RESOLVER"]}:{https.server_address[1]}/dns-query' if server.startswith('https') else f'tls://{F["RESOLVER"]}:{dot.server_address[1]}'
                translated.append(transport + '#' + fragment)
            cfg['dns']['nameserver-policy'][key] = translated
        directory.mkdir()
        def save():
            (directory / 'config.yaml').write_text(json.dumps(cfg, ensure_ascii=False), encoding='utf-8')
        save()
        child = H['StockCore'](core, directory); stack.callback(child.close)
        child.call('config.setup'); child.call('listener.start')
        assert 'start download' not in (directory / 'core.log').read_text(encoding='utf-8', errors='replace'), 'unexpected geodata download'
        checks.append('native_accepts_original_dns_mode_and_empty_providers')
        # Encrypted DNS egress must observe upstream queries, so this phase uses
        # real responses. Fake-IP configuration acceptance is a separate check.
        cfg['dns']['enhanced-mode'] = 'redir-host'; save(); child.call('config.setup')
        checks.append('native_accepts_real_response_phase')
        def choose(group, name):
            result = child.call('proxy.select', {'group-name': group, 'proxy-name': name})
            assert not result.get('message'), (group, name, result)
        for slot, name in enumerate(['B', 'C', 'D'], 1):
            choose('故障转移' + str(slot), name)
        choose('漏网之鱼', 'X ↻'); choose('国内网站', 'A ↻'); choose('OpenAI 服务', 'A ↻')
        def via(expected, host='api.amemv.com'):
            prior = {k: len(v.events) for k, v in relays.items()}
            assert N['http_request'](mixed, host, origin.server_address[1]) == b'AUDIT_OK'
            actual = [k for k, v in relays.items() if any(e[0] == 'TCP' and e[2] == origin.server_address[1] for e in v.events[prior[k]:])]
            assert actual == ([expected] if expected else []), (host, actual, expected)
            return True
        def probe(name):
            # Use the same per-URL health cache key as the generated chain.
            url = next(g['url'] for g in cfg['proxy-groups'] if g['type'] == 'fallback')
            child.call('proxy.testDelay', {'proxy-name': name, 'test-url': url, 'timeout': 3000})
        def udp(expected, host='v5.douyinvod.com'):
            prior = {k: len(v.udp.events) for k, v in relays.items()}
            with socket.create_connection(('127.0.0.1', mixed), timeout=3) as conn, socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                conn.sendall(b'\x05\x01\0'); assert N['exact'](conn, 2) == b'\x05\0'
                conn.sendall(b'\x05\x03\0\x01' + b'\0' * 6)
                head = N['exact'](conn, 4); _, port = N['address'](conn, head[3])
                encoded = host.encode(); sock.settimeout(1)
                sock.sendto(b'\0\0\0\x03' + bytes([len(encoded)]) + encoded + b'\x01\xbbPING', ('127.0.0.1', port))
                try: answer = sock.recv(4096)
                except socket.timeout: answer = b''
                assert answer.endswith(b'ACK:PING') if expected else not answer
            assert [k for k, v in relays.items() if len(v.udp.events) > prior[k]] == ([expected] if expected else [])
        for host in ['api.amemv.com', 'v5.douyinvod.com', 'p3.douyinpic.com', 'szextshort.weixin.qq.com', 'apd-pcdnwxlogin.teg.tencent-cloud.net', 'openaifoundation.org']:
            via('A', host); checks.append('empty_provider_tcp:' + host)
        udp('A'); checks.append('domestic_udp_A')
        udp('X','stun.amemv.com'); checks.append('generic_stun_stays_on_distinct_catchall')
        for name in ['B', 'C', 'D', 'A']:
            probe(name)
        for dead, expected in [('A', 'B'), ('B', 'C'), ('C', 'D')]:
            relays[dead].state = 'down'; probe(dead)
            F['wait_until'](lambda: via(expected), seconds=10)
            checks.append('fallback_to_' + expected)
        udp('D'); checks.append('domestic_udp_D')
        for name in ['C', 'B', 'A']:
            relays[name].state = 'up'; probe(name)
            F['wait_until'](lambda: via(name), seconds=10)
            checks.append('recover_' + name)
        # Fresh DNS labels and explicit cache clear make selector changes visible.
        for label, selection, expected in [('single', 'B ↻', 'B'), ('public', '高纯净度AI用', 'C'), ('direct', 'DIRECT', None)]:
            choose('高纯净度AI用', 'C ↻'); choose('国内网站', selection)
            child.call('dns.clearCache')
            prior = {k: len(v.events) for k, v in relays.items()}
            answer = N['dns_answers'](dns, label + '.amemv.com', 1)
            assert answer == [F['ANSWER']], (label, answer, {k:v.events[prior[k]:] for k,v in relays.items()})
            actual = [k for k, v in relays.items() if any(e[0] == 'TCP' and e[2] in [dot.server_address[1], https.server_address[1]] for e in v.events[prior[k]:])]
            assert actual == ([expected] if expected else []), ('DNS egress', label, actual)
            checks.append('domestic_dns_' + label)
        choose('OpenAI 服务', 'B ↻'); child.call('dns.clearCache')
        prior = {k:len(v.events) for k,v in relays.items()}
        assert N['dns_answers'](dns, 'api.openai.com', 1) == [F['ANSWER']]
        api_port = https.server_address[1] if 'api.openai.com' in original['dns']['nameserver-policy'] else dot.server_address[1]
        actual = [k for k,v in relays.items() if any(e[0]=='TCP' and e[2]==api_port for e in v.events[prior[k]:])]
        assert actual == ['B'], ('DOH', actual, {k:v.events[prior[k]:] for k,v in relays.items()})
        checks.append('openai_mode_correct_encrypted_dns_selected_group')
        choose('国内网站', 'DIRECT'); cfg['hosts']['direct.amemv.com'] = '127.0.0.1'; save(); child.call('config.setup', {'selected-map': {'国内网站': 'DIRECT'}})
        via(None, 'direct.amemv.com'); checks.append('domestic_explicit_DIRECT_tcp')
        choose('国内网站', 'NoUDP ↻'); udp(None); checks.append('unsupported_udp_rejected')
        # No unselected X and no DIRECT may rescue a failed selected chain.
        choose('国内网站', 'A ↻')
        for slot in range(1, 4): choose('故障转移' + str(slot), 'REJECT')
        relays['A'].state = 'down'; probe('A')
        try: via('A')
        except (OSError, EOFError, StopIteration): pass
        else: raise AssertionError('failed primary reached origin')
        checks.append('all_backups_REJECT_no_direct_rescue')
        return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--core', type=Path, default=Path('C:/Program Files/FlClash/FlClashCore.exe'))
    parser.add_argument('--quickjs', type=Path, default=Path('C:/Program Files/FlClash/quickjs_c_bridge.dll'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--limit', type=int)
    args = parser.parse_args()
    current = json.loads((ROOT / 'CURRENT_RELEASE.json').read_text(encoding='utf-8'))
    result = {'revision': 'domestic-resilience-r1', 'edition': 'personal' if current.get('vpsDirectRevision') else 'public',
              'status': 'FAIL', 'core': {'sha256': sha(args.core)}, 'quickJS': {'sha256': sha(args.quickjs)},
              'runnerSHA256': sha(__file__), 'hostSHA256': sha(ROOT / 'tools/stock-core-host.py'),
              'scope': 'Windows isolated stock core; loopback transport substitution; no mobile frontend, VPN or live client',
              'deviceAcceptance': 'NOT_RUN', 'tracks': {}, 'checks': [], 'results': []}
    try:
        engine = H['QuickJS'](args.quickjs)
        with tempfile.TemporaryDirectory(prefix='routeweaver-resilience-') as temp:
            home = Path(temp)
            openssl = Path('C:/Program Files/Git/usr/bin/openssl.exe')
            subprocess.run([str(openssl), 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(home / 'key.pem'),
                            '-out', str(home / 'cert.pem'), '-days', '1', '-subj', '/CN=routeweaver-test',
                            '-addext', 'subjectAltName=DNS:www.gstatic.com,DNS:dns.failover.test,IP:127.0.0.1'],
                           check=True, capture_output=True, timeout=20)
            count = 0
            for track, entries in [('main', current['entries']), ('ipv4-only', current['variants']['ipv4-only']['entries'])]:
                result['tracks'][track] = {}
                for client, file in entries.items():
                    proof = {'file': file, 'sourceSHA256': sha(ROOT / file)}
                    result['tracks'][track][client] = proof
                    if file.endswith('.conf'):
                        proof['feature'] = 'SOURCE_MODEL_ONLY_DEVICE_NOT_RUN'; continue
                    if args.limit and count >= args.limit: continue
                    start = time.monotonic()
                    try:
                        checks = run_case(args.core, file, 'auto' if track == 'main' else 'ipv4-local', engine, home / f'case-{count}')
                    except Exception:
                        import shutil
                        evidence = args.output.parent / (args.output.stem + '-failure')
                        evidence.mkdir(parents=True, exist_ok=True)
                        for source in (home / f'case-{count}').glob('*'):
                            if source.name in ['core.log','config.yaml','child.json']:
                                shutil.copyfile(source, evidence / source.name)
                        raise
                    if result['checks']: assert result['checks'] == checks
                    result['checks'] = checks
                    proof['coreChecks'], proof['quickJSChecks'] = len(checks), 2
                    result['results'].append({'track': track, 'client': client, 'checks': len(checks), 'seconds': round(time.monotonic() - start, 3)})
                    count += 1
                    print(json.dumps(result['results'][-1]), flush=True)
            result['status'] = 'PASS_LIMITED_PROBE' if args.limit else 'PASS_ISOLATED_STOCK_CORE'
    except Exception:
        result['error'] = traceback.format_exc()
        print(result['error'], flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': result['status'], 'cases': len(result['results'])}), flush=True)
    return int(not result['status'].startswith('PASS'))


if __name__ == '__main__':
    raise SystemExit(main())
