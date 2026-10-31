"""Regression checks for final-merge and privacy diagnostics; no live access."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('diagnostics_audit', Path(__file__).parents[1] / 'diagnose-client.py')
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)


def config():
    return {'mode': 'rule', 'ipv6': False, 'tun': {'enable': False},
            'dns': {'ipv6': False, 'use-system-hosts': False},
            'sniffer': {'sniff': {p: {'override-destination': True} for p in ('HTTP', 'TLS', 'QUIC')}},
            'x-v14-generated': {'version': '14.3', 'networkMode': 'ipv4-only'},
            'proxies': [{'name': 'test', 'type': 'socks5', 'ip-version': 'ipv4'}],
            'rules': ['IP-CIDR6,::/0,REJECT,no-resolve', 'MATCH,漏网之鱼', 'MATCH,REJECT'],
            'proxy-groups': [{'name': n, 'type': 'select', 'proxies': ['test']} for n in ('高纯净度AI用', '高网速视频用')]}


class ArchitectureDiagnostics(unittest.TestCase):
    def test_valid_ipv4_only_is_supported(self):
        self.assertEqual(d.inspect(config(), expected_network_mode='ipv4-only')['status'], 'ALLOWLISTED_CONFIG_CHECK_PASS')

    def test_client_restores_ipv6_is_not_false_pass(self):
        c = config(); c['ipv6'] = True
        r = d.inspect(c)
        self.assertEqual(r['status'], 'CONFIG_CONTRACT_MISMATCH')
        self.assertIn('PURE_IPV4_CORE_FLAG_OVERRIDDEN', r['findings'])

    def test_guard_and_provider_family_are_checked(self):
        c = config(); c['rules'].pop(0)
        c['proxy-providers'] = {'sample': {'override': {'ip-version': 'dual'}}}
        r = d.inspect(c)
        self.assertIn('PURE_IPV4_LITERAL_REJECT_GUARD_MISSING_OR_SHADOWED', r['findings'])
        self.assertIn('PURE_IPV4_PROVIDER_FAMILY_NOT_FORCED', r['findings'])

    def test_collision_renamed_groups(self):
        c = config(); names = ['高纯净度AI用', '高网速视频用', '漏网之鱼']
        c['proxy-groups'] = [{'name': n + ' [V14]', 'type': 'select', 'proxies': ['test']} for n in names]
        c['x-v14-generated']['groups'] = [g['name'] for g in c['proxy-groups']]
        c['rules'][-2] = 'MATCH,漏网之鱼 [V14]'
        self.assertEqual(d.inspect(c)['status'], 'ALLOWLISTED_CONFIG_CHECK_PASS')

    def test_exposed_controller_without_secret(self):
        c = config(); c['external-controller'] = '0.0.0.0:9090'
        self.assertIn('NON_LOOPBACK_CONTROLLER_WITHOUT_SECRET', d.inspect(c)['findings'])

    def test_security_details_do_not_export_secrets(self):
        c = config(); c.update({'external-controller': '0.0.0.0:9090', 'secret': 'never-export-me'})
        c['proxies'][0].update({'skip-cert-verify': True, 'password': 'never-export-this-either'})
        before = copy.deepcopy(c); r = d.inspect(c)
        self.assertEqual(c, before)
        self.assertIn('NODE_TLS_VERIFICATION_DISABLED_REVIEW_SUBSCRIPTION', r['securityWarnings'])
        self.assertNotIn('never-export', json.dumps(r))

    def test_loopback_controller_redirect_cannot_forward_token(self):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        import threading
        observed = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass
            def do_GET(self):
                observed.append(self.path)
                self.send_response(302)
                self.send_header('Location', 'http://127.0.0.1:' + str(self.server.server_port) + '/unexpected-target')
                self.send_header('Content-Length', '0')
                self.end_headers()
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.02}, daemon=True)
        thread.start()
        try:
            with self.assertRaisesRegex(ValueError, 'redirects are not permitted'):
                d.read_live({'external-controller': '127.0.0.1:' + str(server.server_port),
                             'secret': 'synthetic-test-token'})
            self.assertEqual(observed, ['/version'])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_real_api_dns_regression_is_detected(self):
        c = config(); c['ipv6'] = True
        c['x-v14-generated'].update(networkMode='dual-stack', compatibilityRevision='api-real-ip-r1-20261010')
        self.assertIn('API_REAL_ANSWER_DOH_GROUP_POLICY_MISSING', d.inspect(c)['findings'])
        c['dns']['nameserver-policy'] = {'api.openai.com': ['https://resolver.example/dns-query#OpenAI 服务']}
        self.assertNotIn('API_REAL_ANSWER_DOH_GROUP_POLICY_MISSING', d.inspect(c)['findings'])


if __name__ == '__main__':
    unittest.main()
