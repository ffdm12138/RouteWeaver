import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('client_diagnostics', Path(__file__).parents[1] / 'diagnose-client.py')
diagnostics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostics)


class FinalConfigDiagnostics(unittest.TestCase):
    def config(self):
        return {'mode':'rule','ipv6':True,'tun':{'enable':True,'strict-route':True,'stack':'mixed'},
                'dns':{'ipv6':False},'sniffer':{'sniff':{k:{'override-destination':True} for k in ('HTTP','TLS','QUIC')}},
                'x-v14-generated':{'version':'14.3','networkMode':'ipv4-local'},
                'rules':['MATCH,漏网之鱼','MATCH,REJECT'],
                'proxy-groups':[{'name':n,'type':'select','proxies':['private-node']} for n in ('高纯净度AI用','高网速视频用')]}

    def test_post_script_dns_and_tun_overrides_are_reported(self):
        config=self.config();config['tun']['strict-route']=False
        config['dns'].update(ipv6=True,**{'fake-ip-range6':'2001:db8::/64'})
        report=diagnostics.inspect(config)
        self.assertIn('STRICT_ROUTE_NOT_EFFECTIVE',report['findings'])
        self.assertIn('COMPAT_DNS_AAAA_FILTER_OVERRIDDEN',report['findings'])
        self.assertIn('COMPAT_IPV6_FAKE_POOL_RESTORED',report['findings'])

    def test_credentials_and_private_destinations_never_leave_allowlist(self):
        config=self.config()
        config.update(secret='secret-never-print',**{'external-controller':'127.0.0.1:12345'})
        config['proxies']=[{'name':'private-node','server':'private-host.example','password':'password-never-print'}]
        config['rules'].insert(0,'DOMAIN,private-destination.example,DIRECT')
        config['dns']['nameserver']=['https://' + 'user' + ':' + 'private-token' + '@' + 'private-dns.example/dns-query']
        raw=json.dumps(diagnostics.inspect(config))
        for value in ['secret-never-print','password-never-print','private-node','private-host.example','private-destination.example','private-token','private-dns.example']:
            self.assertNotIn(value,raw)

    def test_live_state_mismatch_is_distinct_from_export_validation(self):
        config=self.config()
        self.assertEqual(diagnostics.inspect(config)['status'],'ALLOWLISTED_CONFIG_CHECK_PASS')
        live={'version':{'version':'test'},'config':{**config,'ipv6':False}}
        report=diagnostics.inspect(config,live)
        self.assertEqual(report['status'],'CONFIG_CONTRACT_MISMATCH')
        self.assertIn('ipv6',report['live']['mismatchedFields'])


if __name__ == '__main__':
    unittest.main()
