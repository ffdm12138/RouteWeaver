"""Check the exact DNS transport delta and replay the current import files."""

from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import tempfile

from current_audit import checked_path, read, sha


ROOT = Path(__file__).resolve().parents[1]
REVISION = 'standard-business-doh-r1'
CORE_TAG = 'v1.19.34'
CORE_ASSET_SHA256 = 'f6b855de8722781caea62686f0301f89625fc558d48c1103ffdd98dad7f7f488'
CORE_EXE_SHA256 = '3252ed9449c0e904fd07452b18366b90da77e14a5696e567de11d7839d6cf4b6'

CONFIG_EDITS = (
    (b'directDns: ["https://dns.alidns.com/dns-query#DIRECT", "https://doh.pub/dns-query#DIRECT"]',
     b'directDns: ["system://"]'),
    (b'groupDnsUrls: ["tls://dns.alidns.com:853", "tls://dot.pub:853"]',
     b'groupDnsUrls: ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"]'),
    (b'V14.groupDnsUrls.map(url => url + "#" + group + "&disable-reuse=true")',
     b'V14.groupDnsUrls.map(url => url + "#" + group)'),
)
COMMENT_EDITS = (
    (b'  // The one name outside Fake-IP (see fake-ip-filter) must return a real\n'
     b'  // answer, so it cannot ride the DoT/853 policy: a carrier or node that drops\n'
     b'  // 853 turns it into SERVFAIL. Same reviewed upstreams, DoH on 443.\n',
     b'  // Preserve the explicit DoH policy for OpenAI real answers.\n'),
    (b"  // OpenAI's real-answer API still uses its group's egress. Resolve it over\n"
     b'  // DoH/443 because some carriers and nodes block the shared DoT/853 policy.\n',
     b'  // Keep the exact real-answer API policy ahead of broader provider matches.\n'),
)


def before_doh(source: bytes) -> bytes:
    for previous, current in CONFIG_EDITS:
        if source.count(current) != 1:
            raise ValueError('Missing or ambiguous standard DNS transport change')
        source = source.replace(current, previous)
    # Some generated clients strip comments entirely.
    for previous, current in COMMENT_EDITS:
        source = source.replace(current, previous)
    return source


def entries_by_track(release):
    return {
        'main': {**release['entries'], 'projectclash': release['projectClash']['entries']['main']},
        'ipv4-only': {
            **release['variants']['ipv4-only']['entries'],
            'projectclash': release['projectClash']['entries']['ipv4-only'],
        },
    }


NODE_CHECK = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {previous, source, modes, emitProfiles} = JSON.parse(fs.readFileSync(0, 'utf8'));
const endpoints = ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query'];
const dot = ['tls://dns.alidns.com:853', 'tls://dot.pub:853'];

function generate(code) {
  const context = vm.createContext({console: {log() {}}});
  vm.runInContext(code, context, {timeout: 5000});
  return input => {
    context.input = structuredClone(input);
    return JSON.parse(vm.runInContext('JSON.stringify(main(input, "synthetic"))', context, {timeout: 5000}));
  };
}

function migrate(resolvers) {
  return [...new Set(resolvers.map(url => {
    const [address, tag = ''] = url.split('#');
    if (dot.includes(address)) {
      const policy = tag.split('&').filter(param => param !== 'disable-reuse=true');
      return endpoints[dot.indexOf(address)] + '#' + policy.join('&');
    }
    const [group, ...options] = tag.split('&');
    if (group === 'DIRECT' && endpoints.includes(address))
      return 'system://' + (options.length ? '#' + options.join('&') : '');
    return url;
  }))];
}

const buildPrevious = generate(previous);
const buildCurrent = generate(source);
const a = {name: 'Fixture A', type: 'socks5', server: '192.0.2.10', port: 1080, udp: true};
const b = {name: 'Fixture B', type: 'socks5', server: '198.51.100.10', port: 1080};
const profiles = [];
for (const mode of modes) {
  for (const profile of [
    {proxies: [a, b]},
    {'proxy-providers': {Fixture: {type: 'inline', payload: [a, b]}}},
  ]) {
    profile['x-routeweaver'] = {'network-mode': mode};
    if (mode === 'ipv4-only') profile['x-routeweaver']['ipv4-lan-dns'] = ['192.168.50.1'];
    const expected = buildPrevious(profile);
    const actual = buildCurrent(profile);
    expected.dns.nameserver = migrate(expected.dns.nameserver);
    for (const [key, resolvers] of Object.entries(expected.dns['nameserver-policy']))
      expected.dns['nameserver-policy'][key] = migrate(resolvers);
    assert.deepEqual(actual, expected);
    assert.deepEqual(Object.keys(actual.dns['nameserver-policy']), Object.keys(expected.dns['nameserver-policy']));
    assert.deepEqual(buildCurrent(actual), actual);
    assert.deepEqual(actual.dns['direct-nameserver'], ['system']);
    assert.equal(actual.dns['direct-nameserver-follow-policy'], false);
    assert.deepEqual(actual.dns.fallback, []);
    assert.deepEqual(actual.dns.nameserver.map(url => url.split('#')[0]), endpoints);
    assert.ok(Object.values(actual.dns['nameserver-policy']).some(resolvers =>
      resolvers.some(url => url.startsWith('system://#disable-ipv6=true'))));
    const dns = JSON.stringify(actual.dns);
    assert.doesNotMatch(dns, /tls:\/\/|routeweaver-doh:\/\/|https:\/\/(?:dns\.alidns\.com|doh\.pub)\/dns-query#DIRECT/);
    if (emitProfiles) profiles.push(actual);
  }
}
process.stdout.write(JSON.stringify({checks: modes.length * 2, profiles}));
"""


def verify_receipt(root, release, edition):
    settings = release['standardBusinessDoh']
    receipt = read(checked_path(root, settings['verification']))
    if (receipt['revision'] != REVISION or receipt['edition'] != edition
            or receipt['status'] != 'PASS_OFFICIAL_MIHOMO_PARSE_AND_DNS_DELTA'
            or receipt['core']['executableSHA256'] != CORE_EXE_SHA256
            or receipt['core']['archiveSHA256'] != CORE_ASSET_SHA256
            or receipt['core']['tag'] != CORE_TAG
            or receipt['runnerSHA256'] != sha(root / 'tools/standard_business_doh.py')):
        raise ValueError('Missing verified standard DoH replay')
    for track, entries in entries_by_track(release).items():
        expected_count = 6 if track == 'main' else 2
        results = receipt['tracks'][track]
        if set(results) != set(entries):
            raise ValueError('Incomplete standard DoH entry inventory')
        for client, file in entries.items():
            path = checked_path(root, file)
            result = results[client]
            count = expected_count if path.suffix == '.js' else 0
            if (result['file'] != file or result['sha256'] != sha(path)
                    or result['officialCoreParses'] != count or result['profileChecks'] != count):
                raise ValueError('Stale standard DoH receipt: ' + file)


def parse_profile(core, home, config):
    for name, provider in config['rule-providers'].items():
        if provider['type'] != 'inline':
            config['rule-providers'][name] = {'type': 'inline', 'behavior': provider['behavior'], 'payload': []}
    config.update({'tun': {'enable': False}, 'geo-auto-update': False, 'external-controller': ''})
    file = home / 'profile.json'
    file.write_text(json.dumps(config, ensure_ascii=False), encoding='utf-8')
    subprocess.run([str(core), '-t', '-d', str(home), '-f', str(file)], cwd=home,
                   check=True, capture_output=True, timeout=10)


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
                previous = before_doh(data)
                request = {
                    'previous': previous.decode(), 'source': data.decode(),
                    'modes': modes, 'emitProfiles': core is not None,
                }
                proc = subprocess.run(['node', '-e', NODE_CHECK], input=json.dumps(request).encode(),
                                      cwd=root, capture_output=True, timeout=20)
                if proc.returncode:
                    raise ValueError(file + '\n' + proc.stderr.decode(errors='replace')[:3500])
                result = json.loads(proc.stdout)
                case['baselineSHA256'] = sha256(previous).hexdigest()
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
    with tempfile.TemporaryDirectory(prefix='routeweaver-standard-doh-') as temporary:
        tracks = run_checks(ROOT, core, Path(temporary))
    totals = [item for track in tracks.values() for item in track.values()]
    if args.output:
        release = read(ROOT / 'CURRENT_RELEASE.json')
        receipt = {
            'revision': REVISION, 'edition': 'personal' if release.get('vpsDirectRevision') else 'public',
            'status': 'PASS_OFFICIAL_MIHOMO_PARSE_AND_DNS_DELTA', 'runnerSHA256': sha(Path(__file__)),
            'core': {'tag': CORE_TAG, 'executableSHA256': CORE_EXE_SHA256, 'archiveSHA256': CORE_ASSET_SHA256},
            'tracks': tracks, 'deviceAcceptance': 'NOT_RUN',
        }
        args.output.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({
        'entries': len(totals), 'profileChecks': sum(item['profileChecks'] for item in totals),
        'officialCoreParses': sum(item['officialCoreParses'] for item in totals),
    }))


if __name__ == '__main__':
    main()
