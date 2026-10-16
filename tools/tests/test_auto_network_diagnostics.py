import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('diagnostics',Path(__file__).parents[1]/'diagnose-client.py')
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)

class AutomaticModeDiagnostics(unittest.TestCase):
    def config(self):
        return {'mode':'rule','ipv6':True,'routeweaver-local-family':'auto',
            'tun':{'enable':True,'strict-route':True,'stack':'mixed'},
            'dns':{'ipv6':True,'fake-ip-range6':'fdfe:dcba:9876::1/64'},
            'sniffer':{'sniff':{name:{'override-destination':True} for name in ('HTTP','TLS','QUIC')}},
            'x-v14-generated':{'version':'14.3','networkMode':'auto'},
            'rules':['MATCH,漏网之鱼','MATCH,REJECT'],
            'proxy-groups':[{'name':name,'type':'select','proxies':['test-node']} for name in ('高纯净度AI用','高网速视频用')]}
    def test_script_marker_alone_is_not_a_runtime_capability(self):
        report=d.inspect(self.config(),expected_network_mode='auto')
        self.assertIn('AUTO_NATIVE_RUNTIME_NOT_VERIFIED',report['findings'])
        self.assertFalse(report['automaticNetwork']['nativeRuntimeVerified'])
    def test_old_core_cannot_be_certified_by_the_saved_config(self):
        config=self.config();old={k:v for k,v in config.items() if k!='routeweaver-local-family'}
        self.assertIn('AUTO_NATIVE_RUNTIME_NOT_VERIFIED',d.inspect(config,{'config':old})['findings'])
    def test_native_state_and_no_static_disabling(self):
        config=self.config();live={'config':{**config,'routeweaver-local-state':{'state':'no-local-v6','reason':'selected-interface-has-no-routable-ipv6-source'}}}
        report=d.inspect(config,live,expected_network_mode='auto')
        self.assertEqual(report['status'],'ALLOWLISTED_CONFIG_CHECK_PASS')
        self.assertTrue(report['automaticNetwork']['nativeRuntimeVerified'])
        config['dns']['ipv6']=False
        self.assertIn('AUTO_DNS_IPV6_STATICALLY_DISABLED',d.inspect(config,live)['findings'])
    def test_protected_socket_host_is_a_separate_unmet_capability(self):
        config=self.config();live={'config':{**config,'routeweaver-local-state':{'state':'unknown','reason':'socket-hook-owned-egress-needs-host-capability'}}}
        self.assertIn('AUTO_HOST_EGRESS_CAPABILITY_NOT_INTEGRATED',d.inspect(config,live)['findings'])

if __name__=='__main__':unittest.main()
