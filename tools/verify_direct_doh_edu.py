"""Check the two-path DIRECT DoH and campus DNS delta and replay the current import files."""

from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import tempfile

from current_audit import checked_path, read, sha
from standard_business_doh import CORE_ASSET_SHA256, CORE_EXE_SHA256, CORE_TAG, entries_by_track, parse_profile


ROOT = Path(__file__).resolve().parents[1]
REVISION = 'direct-doh-edu-r1'
DESKTOP_CLIENTS = {'windows', 'clashVerge', 'macosFlClash'}

NODE_CHECK = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {source, modes, desktop, emitProfiles} = JSON.parse(fs.readFileSync(0, 'utf8'));

const BUSINESS_ENDPOINTS = ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query'];
const DIRECT_DOH = [
  'https://223.5.5.5/dns-query#DIRECT',
  'https://223.6.6.6/dns-query#DIRECT',
  'https://doh.pub/dns-query#DIRECT',
];
const IPV4_SUFFIX = 'disable-ipv6=true&disable-qtype-64=true&disable-qtype-65=true';
const DIRECT_DOH_IPV4 = DIRECT_DOH.map(url => url + '&' + IPV4_SUFFIX);
const EDU_DNS = ['system://', ...DIRECT_DOH];
const EDU_DNS_IPV4 = ['system://#' + IPV4_SUFFIX, ...DIRECT_DOH_IPV4];
const EDU_BYPASS_IPV6 = ['2001:250::/32', '2001:da8::/32', '2001:cc0::/32'];

function generate(code) {
  const context = vm.createContext({console: {log() {}}});
  vm.runInContext(code, context, {timeout: 5000});
  return input => {
    context.input = structuredClone(input);
    return JSON.parse(vm.runInContext('JSON.stringify(main(input, "synthetic"))', context, {timeout: 5000}));
  };
}

const buildCurrent = generate(source);
const a = {name: 'Fixture A', type: 'socks5', server: '192.0.2.10', port: 1080, udp: true};
const b = {name: 'Fixture B', type: 'socks5', server: '198.51.100.10', port: 1080};
const profiles = [];

for (const mode of modes) {
  const ipv4 = mode === 'ipv4-local' || mode === 'ipv4-only';
  for (const profile of [
    {proxies: [a, b]},
    {'proxy-providers': {Fixture: {type: 'inline', payload: [a, b]}}},
  ]) {
    profile['x-routeweaver'] = {'network-mode': mode};
    if (mode === 'ipv4-only') profile['x-routeweaver']['ipv4-lan-dns'] = ['192.168.50.1'];
    const actual = buildCurrent(profile);
    assert.deepEqual(buildCurrent(actual), actual);
    assert.deepEqual(actual.dns.fallback, []);
    assert.deepEqual(actual.dns.nameserver.map(url => url.split('#')[0]), BUSINESS_ENDPOINTS);
    const dnsJson = JSON.stringify(actual.dns);
    assert.doesNotMatch(dnsJson, /tls:\/\/|routeweaver-doh:\/\//);

    assert.equal(actual.dns['direct-nameserver-follow-policy'], true);
    assert.deepEqual(actual.dns['direct-nameserver'], ipv4 ? DIRECT_DOH_IPV4 : DIRECT_DOH);
    assert.deepEqual(actual.dns['nameserver-policy']['+.tailscale.com'], ipv4 ? DIRECT_DOH_IPV4 : DIRECT_DOH);
    assert.deepEqual(actual.dns['nameserver-policy']['+.weixin.qq.com'], DIRECT_DOH_IPV4);

    assert.ok(actual.dns['fake-ip-filter'].includes('+.edu.cn'));
    assert.ok(actual.dns['fake-ip-filter'].includes('+.ac.cn'));

    const policyKeys = Object.keys(actual.dns['nameserver-policy']);
    const stunIdx = policyKeys.indexOf('rule-set:v14-generic-stun-domain-guard');
    assert.ok(stunIdx >= 0, 'missing v14-generic-stun-domain-guard in nameserver-policy');
    for (const pattern of ['+.edu.cn', '+.ac.cn']) {
      const idx = policyKeys.indexOf(pattern);
      assert.ok(idx > stunIdx, pattern + ' must follow generic STUN guard in nameserver-policy');
      assert.deepEqual(actual.dns['nameserver-policy'][pattern], ipv4 ? EDU_DNS_IPV4 : EDU_DNS);
    }

    const rules = actual.rules;
    const stunRuleIdx = Math.max(...rules.map((r, i) => /generic-stun|DOMAIN-WILDCARD,(?:\*\.)?(?:stun|turn)\./.test(r) ? i : -1));
    assert.ok(stunRuleIdx >= 0, 'missing STUN guard rules');
    for (const domain of ['edu.cn', 'ac.cn']) {
      const ruleIdx = rules.indexOf(`DOMAIN-SUFFIX,${domain},DIRECT`);
      assert.ok(ruleIdx > stunRuleIdx, `${domain} rule must follow STUN guard`);
    }

    const exclude = actual.tun && actual.tun['route-exclude-address'];
    if (desktop && !ipv4) {
      assert.deepEqual(exclude, EDU_BYPASS_IPV6);
    } else {
      assert.equal(exclude, undefined);
    }

    if (emitProfiles) profiles.push(actual);
  }
}

process.stdout.write(JSON.stringify({checks: modes.length * 2, profiles}));
"""


def verify_receipt(root, release, edition):
    settings = release['directDohEdu']
    receipt = read(checked_path(root, settings['verification']))
    if (receipt['revision'] != REVISION or receipt['edition'] != edition
            or receipt['status'] != 'PASS_OFFICIAL_MIHOMO_PARSE_AND_DIRECT_DOH_EDU'
            or receipt['core']['executableSHA256'] != CORE_EXE_SHA256
            or receipt['core']['archiveSHA256'] != CORE_ASSET_SHA256
            or receipt['core']['tag'] != CORE_TAG
            or receipt['runnerSHA256'] != sha(root / 'tools/verify_direct_doh_edu.py')):
        raise ValueError('Missing verified DIRECT DoH + edu/ac replay')
    for track, entries in entries_by_track(release).items():
        expected_count = 6 if track == 'main' else 2
        results = receipt['tracks'][track]
        if set(results) != set(entries):
            raise ValueError('Incomplete DIRECT DoH + edu/ac entry inventory')
        for client, file in entries.items():
            path = checked_path(root, file)
            result = results[client]
            count = expected_count if path.suffix == '.js' else 0
            if (result['file'] != file or result['sha256'] != sha(path)
                    or result['officialCoreParses'] != count or result['profileChecks'] != count):
                raise ValueError('Stale DIRECT DoH + edu/ac receipt: ' + file)


def run_checks(root, core, home):
    release = read(root / 'CURRENT_RELEASE.json')
    tracks = entries_by_track(release)
    proof = {}
    for track, entries in tracks.items():
        modes = ['auto', 'dual-stack', 'ipv4-local'] if track == 'main' else ['ipv4-only']
        proof[track] = {}
        for client, file in entries.items():
            path = checked_path(root, file)
            data = path.read_bytes()
            case = {'file': file, 'sha256': sha256(data).hexdigest(), 'profileChecks': 0, 'officialCoreParses': 0}
            if path.suffix == '.js':
                request = {
                    'source': data.decode(),
                    'modes': modes,
                    'desktop': client in DESKTOP_CLIENTS,
                    'emitProfiles': core is not None,
                }
                proc = subprocess.run(['node', '-e', NODE_CHECK], input=json.dumps(request).encode(),
                                      cwd=root, capture_output=True, timeout=20)
                if proc.returncode:
                    raise ValueError(file + '\n' + proc.stderr.decode(errors='replace')[:3500])
                result = json.loads(proc.stdout)
                case['profileChecks'] = result['checks']
                for config in result['profiles']:
                    try:
                        parse_profile(core, home, config)
                    except subprocess.CalledProcessError as error:
                        message = (error.stdout + error.stderr).decode(errors='replace')
                        raise ValueError(file + ': ' + message[-2000:]) from error
                    case['officialCoreParses'] += 1
            proof[track][client] = case
    return proof


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--core', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if (args.core is None) != (args.output is None):
        parser.error('Specify --core with --output to record official parsing, or neither for static comparison')
    core = args.core.resolve() if args.core else None
    if core and sha(core) != CORE_EXE_SHA256:
        parser.error('Use the pinned official Windows amd64 executable from the verified release archive')
    with tempfile.TemporaryDirectory(prefix='routeweaver-direct-doh-edu-') as temporary:
        tracks = run_checks(ROOT, core, Path(temporary))
    totals = [item for track in tracks.values() for item in track.values()]
    if args.output:
        release = read(ROOT / 'CURRENT_RELEASE.json')
        receipt = {
            'revision': REVISION,
            'edition': 'personal' if release.get('vpsDirectRevision') else 'public',
            'status': 'PASS_OFFICIAL_MIHOMO_PARSE_AND_DIRECT_DOH_EDU',
            'runnerSHA256': sha(Path(__file__)),
            'core': {'tag': CORE_TAG, 'executableSHA256': CORE_EXE_SHA256, 'archiveSHA256': CORE_ASSET_SHA256},
            'tracks': tracks,
            'deviceAcceptance': 'NOT_RUN',
        }
        args.output.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({
        'entries': len(totals),
        'profileChecks': sum(item['profileChecks'] for item in totals),
        'officialCoreParses': sum(item['officialCoreParses'] for item in totals),
    }))


if __name__ == '__main__':
    main()
