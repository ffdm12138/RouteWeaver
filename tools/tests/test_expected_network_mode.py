"""Regression: a valid default mode is not necessarily the intended device mode."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('client_diagnostics', Path(__file__).parents[1] / 'diagnose-client.py')
diagnostics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostics)


class ExpectedNetworkMode(unittest.TestCase):
    def config(self, mode='dual-stack'):
        return {
            'mode': 'rule', 'ipv6': True,
            'tun': {'enable': True, 'strict-route': True, 'stack': 'mixed'},
            'dns': {'ipv6': mode != 'ipv4-local'},
            'sniffer': {'sniff': {k: {'override-destination': mode == 'ipv4-local'} for k in ('HTTP', 'TLS', 'QUIC')}},
            'x-v14-generated': {'version': '14.3', 'networkMode': mode},
            'rules': ['MATCH,漏网之鱼', 'MATCH,REJECT'],
            'proxy-groups': [{'name': n, 'type': 'select', 'proxies': ['test-node']} for n in ('高纯净度AI用', '高网速视频用')],
        }

    def test_legacy_call_does_not_impose_a_mode(self):
        report = diagnostics.inspect(self.config())
        self.assertEqual(report['status'], 'ALLOWLISTED_CONFIG_CHECK_PASS')
        self.assertIsNone(report['expectedNetworkMode'])

    def test_imported_default_is_rejected_when_compatibility_was_expected(self):
        report = diagnostics.inspect(self.config(), expected_network_mode='ipv4-local')
        self.assertEqual(report['status'], 'CONFIG_CONTRACT_MISMATCH')
        self.assertIn('EXPECTED_NETWORK_MODE_MISMATCH', report['findings'])
        self.assertEqual(report['networkMode'], 'dual-stack')
        self.assertEqual(report['expectedNetworkMode'], 'ipv4-local')

    def test_matching_compatibility_mode_passes(self):
        report = diagnostics.inspect(self.config('ipv4-local'), expected_network_mode='ipv4-local')
        self.assertEqual(report['status'], 'ALLOWLISTED_CONFIG_CHECK_PASS')

    def test_explicit_dual_stack_expectation_is_preserved(self):
        self.assertEqual(diagnostics.inspect(self.config(), expected_network_mode='dual-stack')['status'], 'ALLOWLISTED_CONFIG_CHECK_PASS')
        report = diagnostics.inspect(self.config('ipv4-local'), expected_network_mode='dual-stack')
        self.assertIn('EXPECTED_NETWORK_MODE_MISMATCH', report['findings'])

    def test_invalid_expectation_is_not_silently_ignored(self):
        with self.assertRaises(ValueError):
            diagnostics.inspect(self.config(), expected_network_mode='invalid-mode')


if __name__ == '__main__':
    unittest.main()
