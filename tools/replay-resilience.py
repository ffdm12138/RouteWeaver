"""Current-byte Windows stock-core and QuickJS replay using only synthetic loopback traffic."""
from contextlib import ExitStack
from pathlib import Path
import argparse
import copy
import hashlib
import json
import runpy
import socket
import socketserver
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
DIRECT_CHOICE = '直连 direct'
REJECT_CHOICE = '拒绝 reject'
MEDIA_HOST = 'szextshort.weixin.qq.com'
DOMESTIC_DOMAIN = '19212021.xyz'
DOMESTIC_CHILD = 'edge.' + DOMESTIC_DOMAIN
DIRECT_DEFAULT_HOSTS = ('store.steampowered.com', 'www.epicgames.com', 'www.apple.com', 'b23.tv')
VIDEO_DEFAULT_HOSTS = ('t.me', 'www.tiktok.com', 'x.com', 'discord.com')
MEDIA_QNAME = b''.join(bytes([len(label)]) + label.encode('ascii') for label in MEDIA_HOST.split('.')) + b'\0'


class MediaResolver(F['ResolverUDP']):
    def handle(self):
        query, sock = self.request
        assert query[12:].startswith(MEDIA_QNAME), query
        qtype = struct.unpack_from('!H', query, 12 + len(MEDIA_QNAME))[0]
        self.server.queries.append(qtype)
        response = F['reply_dns'](query)
        if qtype == 1:
            response = response[:-4] + socket.inet_aton('127.0.0.1')
        sock.sendto(response, self.client_address)


class DirectUDP(socketserver.BaseRequestHandler):
    def handle(self):
        packet, sock = self.request
        sock.sendto(b'ACK:' + packet, self.client_address)


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
        direct_udp = start(N['UDP'](('127.0.0.1', 0), DirectUDP)).server_address[1]
        https = start(N['TCP'](('127.0.0.1', 0), F['HTTPS']), tls)
        media_resolver = start(N['UDP'](('127.0.0.1', 0), MediaResolver))
        media_resolver.queries = []
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
        cfg['hosts'] = dict.fromkeys((F['RESOLVER'], F['CANARY'], *DIRECT_DEFAULT_HOSTS), '127.0.0.1')
        bootstrap_url = f'udp://127.0.0.1:{bootstrap.server_address[1]}'
        cfg['dns'].update({'listen': f'127.0.0.1:{dns}', 'use-system-hosts': False,
                           'default-nameserver': [bootstrap_url], 'proxy-server-nameserver': [bootstrap_url],
                           'fallback-filter': {'geoip': False, 'geosite': [], 'ipcidr': [], 'domain': []}})
        def translate_resolvers(servers, *, media_policy=False):
            translated = []
            for server in servers:
                fragment = server.split('#', 1)[1] if '#' in server else 'DIRECT'
                if media_policy:
                    transport = f'udp://127.0.0.1:{media_resolver.server_address[1]}'
                elif server.startswith('https'):
                    transport = f'https://{F["RESOLVER"]}:{https.server_address[1]}/dns-query'
                else:
                    transport = f'tls://{F["RESOLVER"]}:{dot.server_address[1]}'
                translated.append(transport + '#' + fragment)
            return translated

        for key in ('nameserver', 'fallback'):
            cfg['dns'][key] = translate_resolvers(cfg['dns'][key])
        cfg['dns']['direct-nameserver'] = [bootstrap_url]
        for key, servers in cfg['dns']['nameserver-policy'].items():
            cfg['dns']['nameserver-policy'][key] = translate_resolvers(servers, media_policy=key == '+.weixin.qq.com')
        directory.mkdir()
        def save():
            (directory / 'config.yaml').write_text(json.dumps(cfg, ensure_ascii=False), encoding='utf-8')
        save()
        child = H['StockCore'](core, directory); stack.callback(child.close)

        def check_selector_state(selections):
            views = child.call('proxy.list')['proxies']
            for group in cfg['proxy-groups']:
                if 'default-selected' not in group:
                    continue
                name, members = group['name'], group['proxies']
                assert views[name]['all'] == members, (name, views[name]['all'], members)
                if name in selections:
                    expected = selections[name]
                    if expected not in members:
                        expected = members[0]
                    assert views[name]['now'] == expected, (name, views[name]['now'], expected)

        child.call('config.setup'); child.call('listener.start')
        check_selector_state({group['name']: group['default-selected'] for group in cfg['proxy-groups']
                              if 'default-selected' in group})
        checks.append('selector_order_and_fresh_defaults')
        assert 'start download' not in (directory / 'core.log').read_text(encoding='utf-8', errors='replace'), 'unexpected geodata download'
        checks.append('native_accepts_original_dns_mode_and_empty_providers')
        # In the generated Fake-IP mode the media host answers with its real
        # IPv4 address, while an unrelated domestic name keeps Fake-IP.
        media = N['dns_answers'](dns, MEDIA_HOST, 1)
        assert media == ['127.0.0.1'], (media, media_resolver.queries)
        assert N['dns_answers'](dns, MEDIA_HOST, 28) == []
        assert N['dns_answers'](dns, MEDIA_HOST, 65) == []
        assert media_resolver.queries and set(media_resolver.queries) == {1}, media_resolver.queries
        ordinary = N['dns_answers'](dns, 'fake-probe.amemv.com', 1)
        assert len(ordinary) == 1 and ordinary[0].startswith('198.18.'), ordinary
        checks.append('wechat_real_ipv4_with_ordinary_fakeip_and_filtered_aaaa_https')
        # Encrypted DNS egress must observe upstream queries, so this phase uses
        # real responses. Fake-IP configuration acceptance is a separate check.
        # Direct dials resolve to the loopback origin only after route selection.
        # Static hosts for the new domestic names would trigger the private-IP rule.
        cfg['dns']['direct-nameserver-follow-policy'] = False
        cfg['dns']['enhanced-mode'] = 'redir-host'; save(); child.call('config.setup')
        checks.append('native_accepts_real_response_phase')
        def choose(group, name):
            result = child.call('proxy.select', {'group-name': group, 'proxy-name': name})
            assert not result.get('message'), (group, name, result)

        choose('Disney+', 'A ↻')
        check_selector_state({'Disney+': 'A ↻'})
        choose('Disney+', '高网速视频用')
        checks.append('selector_order_after_manual_choice')
        slots = ['故障转移' + str(slot) for slot in range(1, 4)]
        backups = dict(zip(slots, ['B', 'C', 'D']))
        defaults = {group['name']: group['default-selected'] for group in cfg['proxy-groups']
                    if group['name'] in slots}
        def tcp_paths(prior, ports):
            return [k for k, v in relays.items()
                    if any(e[0] == 'TCP' and e[2] in ports for e in v.events[prior[k]:])]
        def via(expected, host='api.amemv.com', *, blocked=False):
            prior = {k: len(v.events) for k, v in relays.items()}
            hits = len(origin.hits)
            try:
                response = N['http_request'](mixed, host, origin.server_address[1])
            except (OSError, EOFError, StopIteration):
                if not blocked:
                    raise
                assert len(origin.hits) == hits, ('blocked flow reached origin', host)
            else:
                assert not blocked and response == b'AUDIT_OK', (host, expected, response)
            actual = tcp_paths(prior, {origin.server_address[1]})
            assert actual == ([expected] if expected else []), (host, actual, expected)
            return True
        def probe(name):
            # Use the same per-URL health cache key as the generated chain.
            url = next(g['url'] for g in cfg['proxy-groups'] if g['type'] == 'fallback')
            child.call('proxy.testDelay', {'proxy-name': name, 'test-url': url, 'timeout': 3000})
        def udp(expected, host='v5.douyinvod.com', *, direct_port=None):
            prior = {k: len(v.udp.events) for k, v in relays.items()}
            with socket.create_connection(('127.0.0.1', mixed), timeout=3) as conn, socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                conn.sendall(b'\x05\x01\0'); assert N['exact'](conn, 2) == b'\x05\0'
                conn.sendall(b'\x05\x03\0\x01' + b'\0' * 6)
                head = N['exact'](conn, 4); _, port = N['address'](conn, head[3])
                encoded = host.encode(); sock.settimeout(1)
                target_port = struct.pack('!H', direct_port or 443)
                sock.sendto(b'\0\0\0\x03' + bytes([len(encoded)]) + encoded + target_port + b'PING', ('127.0.0.1', port))
                try: answer = sock.recv(4096)
                except socket.timeout: answer = b''
                assert answer.endswith(b'ACK:PING') if expected or direct_port else not answer
            actual = [k for k, v in relays.items() if len(v.udp.events) > prior[k]]
            assert actual == ([expected] if expected else []), (host, actual, expected)
        def dns_via(host, expected, ports):
            child.call('dns.clearCache')
            prior = {k: len(v.events) for k, v in relays.items()}
            answer = N['dns_answers'](dns, host, 1)
            assert answer == [F['ANSWER']], (host, answer)
            actual = tcp_paths(prior, ports)
            assert actual == ([expected] if expected else []), ('DNS egress', host, actual, expected)
        dot_port = dot.server_address[1]
        https_port = https.server_address[1]
        business_ports = {https_port if url.startswith('https://') else dot_port
                          for url in original['dns']['nameserver']}
        api_ports = {https_port} if 'api.openai.com' in original['dns']['nameserver-policy'] else business_ports
        via(None, 'api.openai.com', blocked=True)
        checks.append('unconfigured_public_selectors_reject')
        choose('高纯净度AI用', 'A ↻')
        choose('高网速视频用', 'B ↻')
        for host in DIRECT_DEFAULT_HOSTS:
            via(None, host)
            checks.append('fresh_business_default_direct:' + host)
        for host in VIDEO_DEFAULT_HOSTS:
            via('B', host)
            checks.append('fresh_business_default_video:' + host)
        for host in ('www.youtube.com', 'rr4---sn-oguelnsr.googlevideo.com', 'youtubei.googleapis.com',
                     'archive.ubuntu.com', 'cn.archive.ubuntu.com', 'security.ubuntu.com', 'ports.ubuntu.com'):
            via('B', host)
            udp('B', host)
            dns_via(host, 'B', {dot_port, https_port})
            checks.append('video_egress_tcp_udp_dns:' + host)
        choose('YouTube', 'NoUDP ↻')
        udp(None, 'r1---sn-audit.googlevideo.com')
        checks.append('youtube_unsupported_udp_rejected')
        for host in ('gemini.google.com', 'geminiweb-pa.clients6.google.com', 'gemini.gstatic.com',
                     'accounts.youtube.com', 'youtube.googleapis.com', 'workspacevideo-pa.clients6.google.com'):
            via('A', host)
            udp('A', host)
            dns_via(host, 'A', {dot_port, https_port})
            checks.append('google_egress_tcp_udp_dns:' + host)
        for host in ('drive.google.com', 'sync.drive.google.com', 'googledrive.com', 'drive.googleapis.com',
                     'drive.usercontent.google.com', 'drive-data-export.usercontent.google.com',
                     'drive-data-export-eu.usercontent.google.com'):
            via('B', host)
            udp('B', host)
            dns_via(host, 'B', business_ports)
        checks.append('drive_default_video_web_api_download_export_tcp_udp_dns')
        for host in ('drivefrontend-pa.clients6.google.com', 'drivefrontend-pa.googleapis.com',
                     'drivesharefrontend-pa.clients6.google.com', 'drivesharefrontend-pa.googleapis.com',
                     'drive-thirdparty.googleusercontent.com', 'driveactivity.googleapis.com',
                     'drivelabels.googleapis.com'):
            via('B', host)
            udp('B', host)
            dns_via(host, 'B', business_ports)
        checks.append('drive_frontend_sharing_and_dedicated_apis_tcp_udp_dns')
        for host in ('accounts.google.com', 'docs.google.com', 'www.googleapis.com',
                     'lh3.googleusercontent.com', 'shared.usercontent.google.com', 'edge.drive.usercontent.google.com'):
            via('A', host)
            udp('A', host)
            dns_via(host, 'A', business_ports)
        checks.append('drive_shared_google_hosts_tcp_udp_dns')
        choose('Google Drive', 'NoUDP ↻')
        udp(None, 'drive.usercontent.google.com')
        checks.append('drive_unsupported_udp_rejected')
        choose('Google Drive', '高纯净度AI用')
        via('A', 'drive.usercontent.google.com')
        choose('Google Drive', '高网速视频用')
        choose('YouTube', '高网速视频用')
        for host in (DOMESTIC_DOMAIN, DOMESTIC_CHILD):
            via(None, host)
        dns_via('dns-probe.' + DOMESTIC_DOMAIN, None, {dot_port, https_port})
        checks.append('domestic_suffix_apex_child_and_dns_default_direct')
        choose('Steam', '高纯净度AI用')
        via('A', DIRECT_DEFAULT_HOSTS[0])
        checks.append('direct_default_can_be_manually_switched_to_proxy')

        dns_ports = {dot_port, https_port}
        for group, relay, host in [('高纯净度AI用', 'A', 'manual-direct.chatgpt.com'),
                                    ('高网速视频用', 'B', 'manual-direct.googlevideo.com')]:
            via(relay, host)
            udp(relay, host)
            dns_via(host, relay, dns_ports)
            choose(group, DIRECT_CHOICE)
            check_selector_state({group: DIRECT_CHOICE})
            via(None, host)
            udp(None, host, direct_port=direct_udp)
            dns_via(host, None, dns_ports)
            choose(group, relay + ' ↻')
        checks.append('public_manual_DIRECT_tcp_udp_dns')

        outside = 'outside.example.net'
        via('A', outside)
        udp('A', 'stun.' + outside)
        dns_via(outside, 'A', dns_ports)
        choose('国内网站', '高纯净度AI用')
        choose('漏网之鱼', DIRECT_CHOICE)
        check_selector_state({'国内网站': '高纯净度AI用', '漏网之鱼': DIRECT_CHOICE})
        via(None, outside)
        udp(None, 'stun.' + outside, direct_port=direct_udp)
        dns_via(outside, None, dns_ports)
        via('A', DOMESTIC_CHILD)
        udp('A', DOMESTIC_CHILD)
        dns_via(DOMESTIC_CHILD, 'A', dns_ports)
        choose('漏网之鱼', '高纯净度AI用')
        choose('国内网站', DIRECT_CHOICE)
        checks.append('catchall_manual_DIRECT_while_domestic_proxies_tcp_udp_dns')

        for slot, name in backups.items():
            choose(slot, name)
        choose('漏网之鱼', 'X ↻'); choose('国内网站', 'A ↻'); choose('OpenAI 服务', 'A ↻')
        via('A', DOMESTIC_CHILD)
        udp('A', DOMESTIC_CHILD)
        dns_via('dns-probe.' + DOMESTIC_DOMAIN, 'A', {dot_port, https_port})
        udp('X', 'stun.' + DOMESTIC_DOMAIN)
        checks.append('domestic_suffix_follows_proxy_for_tcp_udp_dns_and_protects_stun')
        for host in ['api.amemv.com', 'v5.douyinvod.com', 'p3.douyinpic.com', 'apd-pcdnwxlogin.teg.tencent-cloud.net', 'openaifoundation.org']:
            via('A', host); checks.append('empty_provider_tcp:' + host)
        via(None, MEDIA_HOST); checks.append('wechat_tcp_direct_even_with_domestic_proxy')
        udp('A'); checks.append('domestic_udp_A')
        udp('X','stun.amemv.com'); checks.append('generic_stun_stays_on_distinct_catchall')
        udp('X', 'stun.' + MEDIA_HOST); checks.append('generic_stun_precedes_wechat_media')
        for name in ['B', 'C', 'D', 'A']:
            probe(name)
        for dead, expected in [('A', 'B'), ('B', 'C'), ('C', 'D')]:
            relays[dead].state = 'down'; probe(dead)
            F['wait_until'](lambda: via(expected), seconds=10)
            checks.append('fallback_to_' + expected)
        udp('D'); checks.append('domestic_udp_D')
        relays['D'].state = 'down'; probe('D')
        F['wait_until'](lambda: via('A', blocked=True), seconds=10)
        checks.append('all_selected_nodes_down_only_attempts_primary')
        for name in ['D', 'C', 'B', 'A']:
            relays[name].state = 'up'; probe(name)
            F['wait_until'](lambda: via(name), seconds=10)
            checks.append('recover_' + name)
        relays['A'].state = 'down'; probe('A')
        F['wait_until'](lambda: via('B'), seconds=10)
        choose(slots[0], defaults[slots[0]])
        via('C')
        checks.append('skip_tier1_first_connection_uses_tier2')
        choose(slots[1], defaults[slots[1]])
        via('D')
        checks.append('skip_tiers1_and2_first_connection_uses_tier3')
        udp('D'); checks.append('skipped_tiers_udp_D')
        dns_via('skip.amemv.com', 'D', business_ports)
        checks.append('skipped_tiers_domestic_encrypted_dns_D')
        dns_via('api.openai.com', 'D', api_ports)
        checks.append('skipped_tiers_openai_encrypted_dns_D')

        for label, selection, expected in [('single', 'B ↻', 'B'), ('public', '高纯净度AI用', 'C'), ('direct', DIRECT_CHOICE, None)]:
            choose('高纯净度AI用', 'C ↻'); choose('国内网站', selection)
            dns_via(label + '.amemv.com', expected, {dot_port, https_port})
            checks.append('domestic_dns_' + label)
        choose('OpenAI 服务', 'B ↻')
        dns_via('api.openai.com', 'B', api_ports)
        checks.append('openai_mode_correct_encrypted_dns_selected_group')
        choose('国内网站', DIRECT_CHOICE); cfg['hosts']['direct.amemv.com'] = '127.0.0.1'; save(); child.call('config.setup', {'selected-map': {'国内网站': DIRECT_CHOICE}})
        via(None, 'direct.amemv.com'); checks.append('domestic_explicit_DIRECT_tcp')
        choose('国内网站', 'NoUDP ↻'); udp(None); checks.append('unsupported_udp_rejected')
        # No unselected X and no DIRECT may rescue a failed selected chain.
        choose('国内网站', 'A ↻')
        for slot, default in defaults.items():
            choose(slot, default)
        probe('A')
        F['wait_until'](lambda: via('A', blocked=True), seconds=10)
        checks.append('all_backups_disabled_only_attempts_primary')

        selected = {'国内网站': 'A ↻', 'OpenAI 服务': 'A ↻', '漏网之鱼': 'X ↻', **backups}
        def reload_without(removed, saved):
            updated = generate(file, mode, [node for node in nodes if node['name'] not in removed], engine)
            cfg['proxies'], cfg['proxy-groups'] = updated['proxies'], updated['proxy-groups']
            save()
            child.call('config.setup', {'selected-map': saved})
        reload_without({'A'}, {**selected, slots[0]: 'REJECT', slots[1]: 'REJECT'})
        F['wait_until'](lambda: via('D'), seconds=10)
        checks.append('reload_legacy_reject_skips_to_tier3')
        reload_without({'A', 'B'}, selected)
        check_selector_state(selected)
        checks.append('selector_order_and_saved_choices_after_node_removal')
        F['wait_until'](lambda: via('C'), seconds=10)
        checks.append('reload_removed_primary_and_tier1_uses_tier2')
        reload_without({'A', 'B', 'C'}, selected)
        F['wait_until'](lambda: via('D'), seconds=10)
        udp('D')
        dns_via('reload.amemv.com', 'D', business_ports)
        dns_via('api.openai.com', 'D', api_ports)
        checks.append('reload_removed_primary_and_first_two_tiers_uses_tier3')
        choose('国内网站', REJECT_CHOICE)
        via(None, blocked=True)
        checks.append('explicit_REJECT_still_blocks')
        reload_without({'A', 'B', 'C', 'D'}, selected)
        via(None, blocked=True)
        checks.append('reload_removed_primary_and_all_backups_rejects')
        return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--core', type=Path, default=Path('C:/Program Files/FlClash/FlClashCore.exe'))
    parser.add_argument('--quickjs', type=Path, default=Path('C:/Program Files/FlClash/quickjs_c_bridge.dll'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--limit', type=int)
    args = parser.parse_args()
    current = json.loads((ROOT / 'CURRENT_RELEASE.json').read_text(encoding='utf-8'))
    result = {'revision': current['nativeFallback']['revision'], 'edition': 'personal' if current.get('vpsDirectRevision') else 'public',
              'status': 'FAIL', 'core': {'sha256': sha(args.core)}, 'quickJS': {'sha256': sha(args.quickjs)},
              'runnerSHA256': sha(__file__), 'hostSHA256': sha(ROOT / 'tools/stock-core-host.py'),
              'scope': 'Windows isolated stock core; loopback transport substitution; no mobile frontend, VPN or live client',
              'deviceAcceptance': 'NOT_RUN', 'tracks': {}, 'checks': [], 'results': []}
    try:
        engine = H['QuickJS'](args.quickjs)
        with tempfile.TemporaryDirectory(prefix='routeweaver-resilience-') as temp:
            home = Path(temp)
            openssl = Path('C:/Program Files/Git/mingw64/bin/openssl.exe')
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
