"""Replay TCP, UDP, DoH and DoT through independently controlled SOCKS nodes."""
from contextlib import ExitStack
from http.server import BaseHTTPRequestHandler
from itertools import count
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit
import argparse
import base64
import hashlib
import json
import os
import runpy
import select
import shutil
import socket
import socketserver
import ssl
import struct
import subprocess
import tempfile
import threading
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
HELPERS = runpy.run_path(str(ROOT / 'tools/native-architecture.py'))
TCP, UDP = HELPERS['TCP'], HELPERS['UDP']
exact, address = HELPERS['exact'], HELPERS['address']
unused_port = HELPERS['unused_port']
http_request, dns_answers = HELPERS['http_request'], HELPERS['dns_answers']
CANARY = 'www.gstatic.com'
AUTO_CANARY = 'auto.failover.test'
RESOLVER = 'dns.failover.test'
ANSWER = '192.0.2.55'
UNKNOWN = 'unknown.example.net'
SECRET = 'rw-failover-loopback-only'
WINDOWLESS = getattr(subprocess, 'CREATE_NO_WINDOW', 0)


def reply_dns(query):
    index = 12
    while query[index]:
        index += 1 + query[index]
    end = index + 5
    a = query[index + 1:index + 3] == b'\0\1'
    answer = b'\xc0\x0c' + struct.pack('!HHIH', 1, 1, 0, 4) + socket.inet_aton(ANSWER) if a else b''
    return query[:2] + struct.pack('!HHHHH', 0x8180, 1, int(a), 0, 0) + query[12:end] + answer


class ResolverUDP(socketserver.BaseRequestHandler):
    def handle(self):
        query, sock = self.request
        sock.sendto(reply_dns(query), self.client_address)


class ResolverTLS(socketserver.BaseRequestHandler):
    def handle(self):
        try:
            self.request.settimeout(3)
            query = exact(self.request, struct.unpack('!H', exact(self.request, 2))[0])
            result = reply_dns(query)
            self.request.sendall(struct.pack('!H', len(result)) + result)
        except (OSError, EOFError):
            pass


class HTTPS(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def respond(self, status, data=b''):
        self.send_response(status)
        self.send_header('Connection', 'close')
        self.send_header('Content-Length', str(len(data)))
        if data:
            self.send_header('Content-Type', 'application/dns-message')
        self.end_headers()
        if data:
            self.wfile.write(data)

    def do_HEAD(self):
        self.respond(204 if self.path == '/generate_204' else 404)

    def do_POST(self):
        self.respond(200, reply_dns(self.rfile.read(int(self.headers['Content-Length']))))

    def do_GET(self):
        query = parse_qs(urlsplit(self.path).query)['dns'][0]
        self.respond(200, reply_dns(base64.urlsafe_b64decode(query + '===')))


class Relay(socketserver.BaseRequestHandler):
    def handle(self):
        try:
            self.request.settimeout(5)
            greeting = exact(self.request, 2)
            exact(self.request, greeting[1])
            self.request.sendall(b'\x05\0')
            command = exact(self.request, 4)
            host, port = address(self.request, command[3])
            events = self.server.events
            state = self.server.state
            if command[1] == 3:
                events.append(('UDP-ASSOCIATE', host, port))
                if state != 'up':
                    self.connect_reply(0, status=5)
                    return
                self.connect_reply(self.server.udp.server_address[1])
                while self.request.recv(32):
                    pass
                return
            if command[1] != 1:
                return
            events.append(('TCP', host, port))
            if state == 'hang' and host == CANARY:
                time.sleep(3.8)
                return
            if state != 'up':
                self.connect_reply(0, status=5)
                return
            if host == CANARY and not self.server.probe_gate.wait(3.8):
                return
            destination = self.server.destinations.get((host, port), self.server.origin)
            with socket.create_connection(('127.0.0.1', destination), timeout=3) as upstream:
                self.connect_reply(destination)
                while True:
                    ready, _, _ = select.select([self.request, upstream], [], [], 3)
                    if not ready:
                        break
                    for sock in ready:
                        data = sock.recv(16384)
                        if not data:
                            return
                        (upstream if sock is self.request else self.request).sendall(data)
        except (OSError, EOFError):
            pass

    def connect_reply(self, port, status=0):
        self.request.sendall(bytes([5, status, 0, 1, 127, 0, 0, 1]) + struct.pack('!H', port))


def wait_until(fn, seconds=16):
    deadline = time.monotonic() + seconds
    error = None
    while time.monotonic() < deadline:
        try:
            if fn():
                return
        except (OSError, EOFError, StopIteration, AssertionError) as err:
            error = err
        time.sleep(0.12)
    raise AssertionError(f'timed out waiting for condition ({error})')


def start(stack, server, tls=None):
    if tls:
        server.socket = tls.wrap_socket(server.socket, server_side=True)
    stack.callback(server.server_close)
    thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.05}, daemon=True)
    thread.start()
    stack.callback(server.shutdown)
    return server


def launch(core, home, config, log_path):
    with log_path.open('wb') as log:
        return subprocess.Popen([str(core), '-d', str(home), '-f', str(config)], cwd=home,
                                stdout=log, stderr=subprocess.STDOUT, creationflags=WINDOWLESS)


def stop(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False) + '\n', encoding='utf-8')


def run_case(core, case, home, cert, key, *, controlled=False):
    home.mkdir()
    cfg = json.loads(Path(case['configPath']).read_text(encoding='utf-8'))
    # Copy only the pinned rule snapshots used by this configuration into its home.
    for provider in cfg['rule-providers'].values():
        if provider['type'] == 'file':
            path = Path(provider['path'])
            if not path.is_absolute():
                path = Path(case['configPath']).parent / path
            destination = home / path.name
            shutil.copyfile(path, destination)
            provider['path'] = './' + destination.name

    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.load_cert_chain(cert, key)
    checks = []
    log_path = home / 'core.log'
    with ExitStack() as stack:
        origin = start(stack, TCP(('127.0.0.1', 0), HELPERS['Origin']))
        origin.hits = []
        https = start(stack, TCP(('127.0.0.1', 0), HTTPS), tls)
        dot = start(stack, TCP(('127.0.0.1', 0), ResolverTLS), tls)
        resolver = start(stack, UDP(('127.0.0.1', 0), ResolverUDP))
        relays = {}
        labels = ('primary', 'backup', 'backup2', 'backup3', 'unselected', 'refreshed') if controlled else ('primary', 'backup')
        for label in labels:
            udp = start(stack, UDP(('127.0.0.1', 0), HELPERS['ProxyUDP']))
            udp.events = []
            relay = start(stack, TCP(('127.0.0.1', 0), Relay))
            relay.udp = udp
            relay.state = 'up'
            relay.events = []
            relay.probe_gate = threading.Event()
            relay.probe_gate.set()
            relay.origin = origin.server_address[1]
            relay.destinations = {(CANARY, 443): https.server_address[1],
                                  (AUTO_CANARY, 443): https.server_address[1],
                                  (RESOLVER, https.server_address[1]): https.server_address[1],
                                  (RESOLVER, dot.server_address[1]): dot.server_address[1]}
            relays[label] = relay
        a, b = relays['primary'], relays['backup']
        mixed, ctl, dns = (unused_port() for _ in range(3))
        company = 'OpenAI 服务'
        auto, auto_host, guard_host = '自动选择', 'auto-route.failover.test', 'udp-guard.failover.test'
        cfg['proxies'] = [p for p in cfg['proxies'] if p['name'] == 'Audit-A']
        cfg['proxies'][0]['port'] = a.server_address[1]
        for group in cfg['proxy-groups']:
            group['proxies'] = [name for name in group['proxies'] if name not in ('Audit-B', 'Audit-Broken')]
            if not controlled and group['type'] == 'url-test':
                # Measure only this feature's probes, not the unrelated auto selector.
                group['type'] = 'select'
        cfg['proxy-providers'] = {'failover-feed': {'type': 'file', 'path': './feed.json',
                                                  'health-check': {'enable': False}}}
        spec = cfg['routeweaver-failover']
        standby = spec['name']
        pool = next(group for group in cfg['proxy-groups'] if group['name'] == spec['source'])
        pool['use'] = ['failover-feed']
        feed = home / 'feed.json'

        def definition(name, relay, udp=True):
            node = {'name': name, 'type': 'socks5', 'server': '127.0.0.1',
                    'port': relay.server_address[1], 'udp': udp}
            if case['mode'] == 'ipv4-only':
                node['ip-version'] = 'ipv4'
            return node

        def feed_node(name='Backup', udp=True):
            write_json(feed, {'proxies': [definition(name, b, udp)]})

        if controlled:
            unselected_name = 'Audit-Unselected'
            cfg['proxies'] = [definition(unselected_name, relays['unselected'])]
            for group in cfg['proxy-groups']:
                group['proxies'] = [name for name in group['proxies'] if name != 'Audit-A']
                if group['name'] == company:
                    group['proxies'].insert(0, unselected_name)
                    group['use'] = ['failover-feed']
                if group['name'] == auto:
                    group['proxies'] = [unselected_name]
                    group['url'] = f'https://{AUTO_CANARY}/generate_204'
            pool['proxies'].append(unselected_name)
            selected_nodes = {name: definition(name, relays[label]) for name, label in (
                ('Audit-A', 'primary'), ('Backup', 'backup'), ('Backup2', 'backup2'), ('Backup3', 'backup3'))}
            write_json(feed, {'proxies': list(selected_nodes.values())})
        else:
            feed_node()
        # The compatibility configuration marks provider nodes IPv4 explicitly.
        if case['mode'] == 'ipv4-only':
            cfg['proxy-providers']['failover-feed']['override'] = {'ip-version': 'ipv4'}
        ns = [f'udp://127.0.0.1:{resolver.server_address[1]}']
        dot_url = f'tls://{RESOLVER}:{dot.server_address[1]}'
        doh_url = f'https://{RESOLVER}:{https.server_address[1]}/dns-query'
        cfg['dns'].update({'listen': f'127.0.0.1:{dns}', 'enhanced-mode': 'redir-host',
                           'default-nameserver': ns, 'proxy-server-nameserver': ns,
                           'direct-nameserver': ns, 'nameserver': [dot_url + '#漏网之鱼&disable-reuse=true'],
                           'nameserver-policy': {
                               '+.dot.failover.test': [dot_url + '#' + company + '&disable-reuse=true'],
                               '+.doh.failover.test': [doh_url + '#' + company + '&disable-reuse=true'],
                           }})
        cfg.update({'mixed-port': mixed, 'external-controller': f'127.0.0.1:{ctl}', 'secret': SECRET,
                    'log-level': 'info', 'geo-auto-update': False,
                    'tls': {'custom-certifactes': [cert.read_text(encoding='ascii')]}})
        choice_host, direct_host = 'explicit-choice.failover.test', 'explicit-rule.failover.test'
        flow_domain = 'replay-route.example.net'
        cfg['hosts'] = {choice_host: '127.0.0.1', direct_host: '127.0.0.1',
                        UNKNOWN: ANSWER, 'ordinary.failover.cn': ANSWER}
        cfg['rules'] = [f'DOMAIN,{choice_host},{company}', f'DOMAIN,{choice_host},REJECT',
                        f'DOMAIN,{direct_host},DIRECT'] + cfg['rules']
        if controlled:
            cfg['hosts'][auto_host] = ANSWER
            cfg['hosts'][guard_host] = ANSWER
            # This second UDP-matchable rule makes an unsupported-UDP fallthrough observable.
            cfg['rules'] = [f'DOMAIN,{guard_host},{company}', f'DOMAIN,{guard_host},{unselected_name}',
                            f'DOMAIN,{auto_host},{auto}', f'DOMAIN-SUFFIX,{flow_domain},{company}'] + cfg['rules']
        source = home / 'config.json'
        write_json(source, cfg)
        process = launch(core, home, source, log_path)
        stack.callback(stop, process)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

        def api(path, method='GET', data=None):
            req = urllib.request.Request(f'http://127.0.0.1:{ctl}' + path,
                                         data=json.dumps(data).encode() if data else None,
                                         method=method, headers={'Authorization': 'Bearer ' + SECRET,
                                                                 'Content-Type': 'application/json'})
            with opener.open(req, timeout=2) as response:
                return json.load(response) if response.status == 200 else response.status

        def state(group):
            return api('/proxies/' + quote(group, safe=''))

        def choose(group, node):
            assert api('/proxies/' + quote(group, safe=''), 'PUT', {'name': node}) == 204

        def probes(relay):
            return relay.events.count(('TCP', CANARY, 443))

        def traffic(host):
            targets = {host, cfg['hosts'].get(host, host)}
            return {node: sum(kind == 'TCP' and target in targets and port == origin.server_address[1]
                              for kind, target, port in node.events) for node in relays.values()}

        flow_ids = count()

        def fresh_flow():
            return f'flow-{next(flow_ids)}.{flow_domain}'

        def via(relay, host=None):
            host = host or (fresh_flow() if controlled else 'chatgpt.com')
            before = traffic(host)
            assert http_request(mixed, host, origin.server_address[1]) == b'AUDIT_OK'
            after = traffic(host)
            attempted = [label for label, node in relays.items() if after[node] > before[node]]
            expected = [label for label, node in relays.items() if node is relay]
            assert (attempted == expected if controlled else expected[0] in attempted), (
                'unexpected egress', host, attempted, expected)
            return True

        def blocked(host='chatgpt.com'):
            try:
                http_request(mixed, host, origin.server_address[1])
            except (OSError, EOFError, StopIteration):
                return
            raise AssertionError('request unexpectedly reached the origin: ' + host)

        def direct(host):
            before = traffic(host)
            assert http_request(mixed, host, origin.server_address[1]) == b'AUDIT_OK'
            assert traffic(host) == before

        def udp_via(relay, host='chatgpt.com'):
            before = [len(node.udp.events) for node in relays.values()]
            with socket.create_connection(('127.0.0.1', mixed), timeout=2) as conn, socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                conn.sendall(b'\x05\x01\0')
                assert exact(conn, 2) == b'\x05\0'
                conn.sendall(b'\x05\x03\0\x01' + b'\0' * 6)
                header = exact(conn, 4)
                _, port = address(conn, header[3])
                name = host.encode()
                sock.settimeout(1.4)
                sock.sendto(b'\0\0\0\x03' + bytes([len(name)]) + name + b'\x01\xbbPING', ('127.0.0.1', port))
                try:
                    result = sock.recv(4096)
                except socket.timeout:
                    result = b''
                assert result.endswith(b'ACK:PING') if relay else result == b''
            for node, count in zip(relays.values(), before):
                assert len(node.udp.events) > count if node == relay else len(node.udp.events) == count

        def encrypted_dns(relay, label):
            for domain, port in (('dot.failover.test', dot.server_address[1]),
                                 ('doh.failover.test', https.server_address[1]),
                                 (UNKNOWN, dot.server_address[1])):
                event = ('TCP', RESOLVER, port)
                before = {node: node.events.count(event) for node in relays.values()}
                assert dns_answers(dns, f'{label}.{domain}', 1) == [ANSWER], domain
                attempted = [node for node, prior in before.items() if node.events.count(event) > prior]
                assert attempted == [relay], ('wrong DNS egress', domain)

        def controlled_replay():
            tier1, tier2, tier3 = (standby + str(n) for n in (1, 2, 3))
            tiers = (tier1, tier2, tier3)
            b2, b3, c, refreshed = (relays[label] for label in ('backup2', 'backup3', 'unselected', 'refreshed'))
            actual = (a, b, b2, b3)

            def primary_only(host=None):
                host = host or fresh_flow()
                blocked(host)
                attempted = {node for node, total in traffic(host).items() if total}
                assert attempted == {a}, ('failed connection did not stay on A', host)
                return True

            def recover(node, previous=None):
                first = probes(node)
                node.state = 'up'
                wait_until(lambda: probes(node) > first, seconds=7)
                time.sleep(0.25)
                if previous is None:
                    primary_only()
                else:
                    via(previous)
                wait_until(lambda: via(node))
                assert probes(node) >= first + 2

            def refresh_feed():
                write_json(feed, {'proxies': list(selected_nodes.values())})
                assert api('/providers/proxies/failover-feed', 'PUT') == 204

            wait_until(lambda: process.poll() is None and 'Backup3' in state(tier3)['all'], seconds=15)
            for tier in tiers:
                view = state(tier)
                assert view['now'] == 'REJECT'
                assert set(view['all']) == {'REJECT', unselected_name, *selected_nodes}, view['all']
            assert state(auto)['type'] == 'URLTest' and state(auto)['now'] == unselected_name
            via(c, auto_host)
            canary, auto_canary = ('TCP', CANARY, 443), ('TCP', AUTO_CANARY, 443)

            def unselected_traffic():
                return [event for event in c.events if event != auto_canary]

            c_before = unselected_traffic()
            choose('高纯净度AI用', 'Audit-A')
            choose(company, 'Audit-A')
            choose('国内网站', '高纯净度AI用')
            via(a, 'chatgpt.com')
            via(a, UNKNOWN)
            via(a, 'ordinary.failover.cn')
            udp_via(a)
            encrypted_dns(a, 'primary')
            assert not any(probes(node) for node in relays.values())
            checks.append('three-default-reject-and-primary-tcp-udp-doh-dot')

            for tier, node in zip(tiers, ('Backup', 'Backup2', 'Backup3')):
                choose(tier, node)
            wait_until(lambda: all(probes(node) for node in actual), seconds=7)
            time.sleep(0.25)
            assert [probes(node) for node in actual] == [1, 1, 1, 1], 'probes were not deduplicated'
            first = probes(a)
            started = time.monotonic()
            a.state = 'hang'
            wait_until(lambda: probes(a) > first, seconds=7)
            time.sleep(3.1)
            primary_only()
            wait_until(lambda: via(b))
            takeover_seconds = round(time.monotonic() - started, 2)
            assert probes(a) >= first + 2
            via(b, 'chatgpt.com')
            via(b, UNKNOWN)
            via(b, 'ordinary.failover.cn')
            udp_via(b)
            udp_via(b, UNKNOWN)
            encrypted_dns(b, 'tier1')
            checks.append('two-timeouts-to-tier1-business-catchall-domestic-tcp-udp-doh-dot')

            b.state = 'down'
            wait_until(lambda: via(b2))
            encrypted_dns(b2, 'tier2')
            b2.state = 'down'
            wait_until(lambda: via(b3))
            udp_via(b3)
            b3.state = 'down'
            wait_until(primary_only)
            primary_only(choice_host)
            assert unselected_traffic() == c_before
            assert state(auto)['all'] == [unselected_name] and state(auto)['now'] == unselected_name
            checks.append('tier2-tier3-and-all-down-tries-only-a-even-with-live-auto')

            recover(b2)
            b3.state = 'up'
            recover(b, b2)
            via(b)
            assert state(company)['now'] == 'Audit-A'
            assert state('漏网之鱼')['now'] == '高纯净度AI用'
            started = time.monotonic()
            recover(a, b)
            recovery_seconds = round(time.monotonic() - started, 2)
            encrypted_dns(a, 'restored')
            checks.append('two-recoveries-preempt-by-priority-and-restore-a')

            a.state = 'down'
            wait_until(lambda: via(b))
            choose(tier1, 'REJECT')
            via(b2)
            choose(tier2, 'REJECT')
            via(b3)
            choose(tier3, 'REJECT')
            primary_only()
            choose(tier2, 'Backup2')
            choose(tier1, 'Backup')
            wait_until(lambda: via(b))
            checks.append('reject-skips-each-tier-and-all-reject-immediately-disables')

            choose(company, 'DIRECT')
            direct(choice_host)
            direct(direct_host)
            choose('高纯净度AI用', 'REJECT')
            before = traffic(UNKNOWN)
            blocked(UNKNOWN)
            assert traffic(UNKNOWN) == before
            choose('高纯净度AI用', 'Audit-A')
            choose(company, 'Audit-A')
            before = traffic('one.one.one.one')
            blocked('one.one.one.one')
            assert traffic('one.one.one.one') == before
            checks.append('explicit-direct-reject-and-original-doh-guard')

            refreshed.probe_gate.clear()
            selected_nodes['Backup'] = definition('Backup', refreshed, udp=False)
            refresh_feed()
            wait_until(lambda: probes(refreshed), seconds=8)
            # Refresh replaces other provider objects too. Let B2 finish its own fresh probe.
            wait_until(lambda: via(b2), seconds=8)
            refreshed.probe_gate.set()
            wait_until(lambda: via(refreshed), seconds=10)
            via(refreshed, guard_host)
            udp_via(None, guard_host)
            assert unselected_traffic() == c_before and canary not in c.events
            checks.append('same-name-new-node-reprobed-and-udp-rejected-without-fallthrough')

            del selected_nodes['Audit-A']
            refresh_feed()
            wait_until(lambda: via(refreshed), seconds=10)
            choose(tier2, 'REJECT')
            del selected_nodes['Backup']
            refresh_feed()
            assert state(tier1)['now'] == 'Backup' and 'Backup' not in state(tier1)['all']
            assert state(company)['now'] == unselected_name, 'fixture lacks the native first-member counterexample'
            before = traffic(choice_host)
            blocked(choice_host)
            assert traffic(choice_host) == before and unselected_traffic() == c_before
            choose(tier1, 'REJECT')
            via(c, choice_host)
            checks.append('missing-a-and-spare-fail-closed-until-explicit-all-reject')
            return takeover_seconds, recovery_seconds

        def single_replay():
            wait_until(lambda: process.poll() is None and 'Backup' in state(standby)['all'], seconds=15)
            assert state(standby)['now'] == 'REJECT'
            assert state(standby)['all'] == ['REJECT', 'Audit-A', 'Backup']
            choose('高纯净度AI用', 'Audit-A')
            choose(company, 'Audit-A')
            choose('国内网站', '高纯净度AI用')
            wait_until(lambda: via(a), seconds=5)
            via(a, UNKNOWN)
            encrypted_dns(a, 'primary')
            assert probes(a) == probes(b) == 0
            checks.append('default-reject-and-primary-tcp-doh-dot')

            choose(standby, 'Backup')
            wait_until(lambda: probes(a) and probes(b), seconds=7)
            time.sleep(0.25)
            first = probes(a)
            fault_at = time.monotonic()
            a.state = 'hang'
            wait_until(lambda: probes(a) > first, seconds=7)
            blocked()
            assert not any(event == ('TCP', 'chatgpt.com', origin.server_address[1]) for event in b.events)
            wait_until(lambda: via(b))
            takeover_seconds = round(time.monotonic() - fault_at, 2)
            assert probes(a) >= first + 2
            via(b, UNKNOWN)
            via(b, 'ordinary.failover.cn')
            udp_via(b)
            udp_via(b, UNKNOWN)
            encrypted_dns(b, 'backup')
            assert state(company)['now'] == 'Audit-A'
            assert state('漏网之鱼')['now'] == '高纯净度AI用'
            checks.append('two-failures-timeout-company-catchall-domestic-tcp-udp-doh-dot')

            choose(company, 'DIRECT')
            direct(choice_host)
            direct(direct_host)
            choose(company, 'Audit-A')
            choose('高纯净度AI用', 'REJECT')
            blocked(UNKNOWN)
            choose('高纯净度AI用', 'Audit-A')
            before = len(b.events)
            blocked('one.one.one.one')
            assert ('TCP', 'one.one.one.one', origin.server_address[1]) not in b.events[before:]
            checks.append('direct-explicit-reject-and-doh-guard')

            choose(standby, 'REJECT')
            before = len(b.events)
            blocked()
            assert ('TCP', 'chatgpt.com', origin.server_address[1]) not in b.events[before:]
            choose(standby, 'Backup')
            wait_until(lambda: via(b))
            checks.append('reject-disables-during-takeover')

            b.state = 'down'
            before = probes(b)
            wait_until(lambda: probes(b) > before, seconds=7)
            time.sleep(0.25)
            before = len(a.events)
            blocked()
            assert ('TCP', 'chatgpt.com', origin.server_address[1]) in a.events[before:]
            b.state = 'up'
            wait_until(lambda: via(b), seconds=9)
            checks.append('unavailable-backup-uses-original-failure')

            first = probes(a)
            recovered_at = time.monotonic()
            a.state = 'up'
            wait_until(lambda: probes(a) > first, seconds=7)
            time.sleep(0.25)
            via(b)
            wait_until(lambda: via(a), seconds=16)
            recovery_seconds = round(time.monotonic() - recovered_at, 2)
            assert probes(a) >= first + 2 and state(company)['now'] == 'Audit-A'
            encrypted_dns(a, 'restored')
            checks.append('two-recoveries-switch-back')

            a.state = 'down'
            wait_until(lambda: via(b))
            feed_node(udp=False)
            assert api('/providers/proxies/failover-feed', 'PUT') == 204
            wait_until(lambda: via(b))
            udp_via(None)
            feed_node('Replacement')
            assert api('/providers/proxies/failover-feed', 'PUT') == 204
            assert state(standby)['now'] == 'REJECT'
            assert state(standby)['all'] == ['REJECT', 'Audit-A', 'Replacement']
            blocked()
            checks.append('provider-refresh-udp-capability-and-removed-selection')
            return takeover_seconds, recovery_seconds

        try:
            if controlled:
                takeover_seconds, recovery_seconds = controlled_replay()
            else:
                takeover_seconds, recovery_seconds = single_replay()
        except Exception as error:
            tail = log_path.read_text(encoding='utf-8', errors='replace')[-4200:]
            raise RuntimeError(f"{case['name']} after {checks}: {error}\n{tail}") from error

    return {'name': case['name'], 'mode': case['mode'], 'source': case['source'], 'sourceSHA256': case['sourceSHA256'],
            'fixtureSHA256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'checks': checks, 'takeoverSeconds': takeover_seconds, 'recoverySeconds': recovery_seconds,
            'childExited': process.poll() is not None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('receipt', type=Path)
    parser.add_argument('--controlled', action='store_true', help='Replay all three backup tiers on both network tracks')
    args = parser.parse_args()
    core = args.core.resolve()
    results, loads = [], []
    with tempfile.TemporaryDirectory(prefix='rwf-replay-') as temp:
        home = Path(temp)
        openssl = shutil.which('openssl') or 'C:/Program Files/Git/usr/bin/openssl.exe'
        cert, key = home / 'cert.pem', home / 'key.pem'
        subprocess.run([str(openssl), 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                        '-keyout', str(key), '-out', str(cert), '-days', '1', '-subj', f'/CN={CANARY}',
                        '-addext', f'subjectAltName=DNS:{CANARY},DNS:{RESOLVER},DNS:{AUTO_CANARY}'],
                       check=True, capture_output=True, timeout=15)
        public = ROOT / 'opensource/RouteWeaver'
        roots = [ROOT, public] if public.is_dir() else [ROOT]
        for root in roots:
            release = json.loads((root / 'CURRENT_RELEASE.json').read_text(encoding='utf-8'))
            edition = 'personal' if release.get('vpsDirectRevision') else 'public'
            traffic_modes = {'dual-stack', 'ipv4-only'} if args.controlled else {
                'dual-stack' if edition == 'personal' else 'ipv4-only'}
            subprocess.run(['node', 'tools/test-proxy-failover.cjs'], cwd=root, check=True, timeout=30)
            fixtures = home / edition
            subprocess.run(['node', 'tools/prepare-native-audit.cjs', '--home', str(fixtures)],
                           cwd=root, check=True, timeout=50)
            plan = json.loads((fixtures / 'plan.json').read_text(encoding='utf-8'))
            for case in plan['cases']:
                if case['platform'] != 'windows':
                    continue
                parsed = subprocess.run([str(core), '-d', str(fixtures), '-f', case['configPath'], '-t'],
                                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
                if parsed.returncode != 0:
                    raise RuntimeError(parsed.stdout.decode('utf-8', errors='replace')[-5000:])
                loads.append({'edition': edition, 'mode': case['mode'], 'source': case['source'],
                              'sourceSHA256': case['sourceSHA256']})
                if case['mode'] in traffic_modes:
                    print('Replaying', edition, case['mode'], flush=True)
                    case_home = home / f"{edition}-{case['mode']}-replay"
                    result = run_case(core, case, case_home, cert, key, controlled=args.controlled)
                    results.append({'edition': edition, **result})
                    print('PASS', edition, case['mode'], len(result['checks']), 'scenarios', flush=True)
    write_json(args.receipt, {'status': 'PASS', 'scope': 'isolated Windows core; actual TCP, UDP, DoH and DoT via loopback nodes',
                             'nativeLoadCount': len(loads), 'nativeLoads': loads, 'nativeCases': results,
                             'temporaryDirectoryRemoved': not home.exists(),
                             'shadowrocket': 'NATIVE_FALLBACK_DOCUMENTED_DEVICE_NOT_RUN',
                             'replayHarnessSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                             'replaySHA256': hashlib.sha256(core.read_bytes()).hexdigest()})
    print('PASS', sum(len(row['checks']) for row in results), 'native scenarios', flush=True)


if __name__ == '__main__':
    main()
