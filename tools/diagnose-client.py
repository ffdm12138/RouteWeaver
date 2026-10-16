"""Read-only, allowlisted inspection of a final Mihomo configuration.

JSON uses only the Python standard library. YAML optionally uses PyYAML >= 6.
No subscription, node endpoint, credential, raw rule or raw log is emitted.
"""
from pathlib import Path
import argparse
import hashlib
import ipaddress
import json
import re
import urllib.request


def load(path):
    raw = Path(path).read_bytes()
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeError):
        try:
            import yaml
        except ImportError as error:
            raise ValueError('YAML requires PyYAML; JSON needs no extra package') from error
        value = yaml.safe_load(raw)
    if not isinstance(value, dict):
        raise ValueError('Configuration must be an object')
    return value, hashlib.sha256(raw).hexdigest()


def inspect(config, live=None):
    marker = config.get('x-v14-generated') or {}
    tun = config.get('tun') or {}
    dns = config.get('dns') or {}
    sniff = config.get('sniffer') or {}
    findings = []
    mode = marker.get('networkMode', 'UNKNOWN')
    if not marker or marker.get('version') != '14.3':
        findings.append('CURRENT_ENTRY_NOT_IDENTIFIED')
    if config.get('mode') != 'rule':
        findings.append('RULE_MODE_NOT_EFFECTIVE')
    if config.get('ipv6') is not True:
        findings.append('CORE_IPV6_NOT_ENABLED')
    if tun.get('enable') is True and tun.get('strict-route') is not True:
        findings.append('STRICT_ROUTE_NOT_EFFECTIVE')
    if mode == 'ipv4-local':
        if dns.get('ipv6') is not False:
            findings.append('COMPAT_DNS_AAAA_FILTER_OVERRIDDEN')
        if dns.get('fake-ip-range6'):
            findings.append('COMPAT_IPV6_FAKE_POOL_RESTORED')
        for name in ('HTTP', 'TLS', 'QUIC'):
            if (sniff.get('sniff', {}).get(name) or {}).get('override-destination') is not True:
                findings.append('COMPAT_' + name + '_TARGET_RECOVERY_NOT_EFFECTIVE')
    rules = config.get('rules') or []
    expected_tail = ['MATCH,漏网之鱼', 'MATCH,REJECT']
    if rules[-2:] != expected_tail:
        findings.append('UNKNOWN_TRAFFIC_FAIL_CLOSED_TAIL_DIFFERS')
    groups = {g.get('name'): g for g in config.get('proxy-groups', []) if isinstance(g, dict)}
    public_groups = []
    for name in ('高纯净度AI用', '高网速视频用'):
        group = groups.get(name) or {}
        manual = group.get('type') == 'select' and 'DIRECT' not in group.get('proxies', [])
        if not manual:
            findings.append('PUBLIC_GROUP_MANUAL_PROXY_BOUNDARY_DIFFERS')
        public_groups.append({'logicalGroup': name, 'manualProxyOnly': manual})
    policies = dns.get('nameserver-policy') or {}
    upstreams = []
    for value in [dns.get(k) for k in ('nameserver', 'fallback', 'direct-nameserver')]:
        if isinstance(value, list):
            upstreams.extend(value)
    for value in policies.values():
        upstreams.extend(value if isinstance(value, list) else [value])
    filtered = [s for s in upstreams if isinstance(s, str) and s != 'system' and not s.startswith('dhcp://')]
    summary = {
        'status': 'CONFIG_CONTRACT_MISMATCH' if findings else 'ALLOWLISTED_CONFIG_CHECK_PASS',
        'scope': 'Exported config only; final app merge, OS capture and app fallback need independent evidence',
        'networkMode': mode, 'mode': config.get('mode'), 'coreIPv6': config.get('ipv6'),
        'tun': {k: tun.get(k) for k in ('enable', 'stack', 'auto-route', 'strict-route', 'auto-detect-interface', 'mtu')},
        'dualStackRouteConfigured': '::/0' in tun.get('route-address', []),
        'dns': {'enabled': dns.get('enable'), 'ipv6': dns.get('ipv6'), 'enhancedMode': dns.get('enhanced-mode'),
                'ipv6FakePoolPresent': bool(dns.get('fake-ip-range6')), 'policyCount': len(policies),
                'upstreamCount': len(filtered), 'filteredUpstreamCount': sum(all(f in s for f in ('disable-ipv6=true', 'disable-qtype-64=true', 'disable-qtype-65=true')) for s in filtered)},
        'sniffer': {'enabled': sniff.get('enable'), 'targetRecovery': {name: (sniff.get('sniff', {}).get(name) or {}).get('override-destination') for name in ('HTTP', 'TLS', 'QUIC')}},
        'counts': {'rules': len(rules), 'groups': len(groups), 'nodes': len(config.get('proxies') or []), 'providers': len(config.get('proxy-providers') or {})},
        'publicGroups': public_groups, 'findings': sorted(set(findings)),
        'privacy': 'Allowlisted fields and counts only; credentials, URLs, node names, destinations and raw rules omitted',
    }
    if live is not None:
        actual = live.get('config') or {}
        actual_tun = actual.get('tun') or {}
        mismatches = [k for k in ('mode', 'ipv6') if actual.get(k) != config.get(k)]
        mismatches += ['tun.' + k for k in ('enable', 'stack', 'strict-route') if actual_tun.get(k) != tun.get(k)]
        summary['live'] = {'status': 'LOOPBACK_API_READ_PASS',
                           'version': {k: live.get('version', {}).get(k) for k in ('version', 'meta')},
                           'mismatchedFields': mismatches}
        if mismatches:
            summary['findings'].append('EXPORTED_AND_LIVE_CONFIG_DIFFER')
            summary['status'] = 'CONFIG_CONTRACT_MISMATCH'
    return summary


def read_live(config):
    endpoint = str(config.get('external-controller') or '')
    match = re.fullmatch(r'(127\.0\.0\.1|localhost):([0-9]{1,5})', endpoint)
    if not match or not 1 <= int(match[2]) <= 65535:
        raise ValueError('Only an explicitly configured IPv4 loopback controller is supported')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def get(path):
        request = urllib.request.Request('http://127.0.0.1:' + match[2] + path,
                                         headers={'Authorization': 'Bearer ' + str(config.get('secret') or '')})
        with opener.open(request, timeout=3) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError('Controller response too large')
        return json.loads(raw)
    return {'version': get('/version'), 'config': get('/configs')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--entry', help='Optional actually imported JS; only its SHA256 is reported')
    parser.add_argument('--live', action='store_true', help='Read only an explicitly configured loopback controller')
    parser.add_argument('--output')
    parser.add_argument('--strict', action='store_true')
    args = parser.parse_args()
    try:
        config, digest = load(args.config)
        report = inspect(config, read_live(config) if args.live else None)
        report['configSHA256'] = digest
        if args.entry:
            report['entrySHA256'] = hashlib.sha256(Path(args.entry).read_bytes()).hexdigest()
    except Exception as error:
        # Exception text can embed paths/URLs/credentials from third-party parsers.
        report = {'status': 'DIAGNOSTIC_INPUT_UNAVAILABLE', 'errorType': type(error).__name__,
                  'hint': 'Provide a JSON config, or YAML with PyYAML installed; live access requires a configured loopback controller'}
    text = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        Path(args.output).write_text(text, encoding='utf8')
    else:
        print(text, end='')
    return 2 if args.strict and report['status'] != 'ALLOWLISTED_CONFIG_CHECK_PASS' else 0


if __name__ == '__main__':
    raise SystemExit(main())
