'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const release = require('../CURRENT_RELEASE.json');
const bridge = process.argv[2];
const node = (name, options = {}) => ({
  name, type: 'socks5', server: 'node.example.test', port: 1080, udp: true, ...options,
});
const profileName = 'ProjectClash 测试';
const legacy = {
  mode: 'global',
  tun: {enable: true, stack: 'gvisor', 'file-descriptor': 42, 'route-exclude-address': ['203.0.113.0/24']},
  dns: {listen: '0.0.0.0:1053', 'x-clash-ssid-nameservers': {'synthetic': ['192.0.2.10']}},
  'interface-name': 'foreign',
  'routing-mark': 1,
  'x-clash-udp-unsupported': 'DIRECT',
  'x-clash-every-mode-rules': ['MATCH,DIRECT'],
  'x-clash-block-quic': 'all',
  'x-clash-ip-rewrite': ['192.0.2.10,192.0.2.11'],
  'x-clash-stun-response-ip': '192.0.2.10',
  'x-clash-stun-response-ipv6': '2001:db8::10',
};
const feed = {type: 'inline', payload: [node('Provider', {'ip-version': 'ipv6'})],
  override: {'override-expr': ['.["ip-version"] = "ipv6"']}};
const fixtures = [
  {proxies: [node('A ↻'), node('B', {'ip-version': 'ipv6'}), node('故障转移1')]},
  {'proxy-providers': {Feed: feed}},
  {proxies: [node('A')], 'proxy-providers': {Feed: feed}},
];

function replay(file, config) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  // Same JSON round trip as ProjectClash's ScriptEngine. JSC is also replayed
  // by the optional macOS runner using the platform framework.
  const context = {json: JSON.stringify(config), profileName, console: undefined};
  const output = vm.runInNewContext(source + `\n(function () {
    const config = JSON.parse(json);
    if (config && typeof config === 'object' && !Array.isArray(config) && config['proxy-providers'] === undefined)
      config['proxy-providers'] = {};
    return JSON.stringify(main(config, profileName));
  })()`, context, {filename: file, timeout: 5000});
  return JSON.parse(output);
}

let count = 0;
for (const [track, file] of Object.entries(release.projectClash.entries)) {
  const ipv4Only = track === 'ipv4-only';
  const base = ipv4Only ? release.variants[track].entries.android : release.entries.android;
  for (const mode of ipv4Only ? ['dual-stack'] : [undefined, 'dual-stack', 'ipv4-local']) {
    for (const fixture of fixtures) {
      const input = {...legacy, ...fixture, 'x-routeweaver': {'network-mode': mode}};
      const config = replay(file, input);
      const marker = config['x-v14-generated'];
      const current = replay(base, input);
      assert.equal(marker.platform, 'projectclash');
      assert.equal(marker.networkMode, ipv4Only ? 'ipv4-only' : mode ?? 'auto');
      assert.equal(config.mode, 'rule');
      assert.equal(config.ipv6, !ipv4Only);
      assert.equal(config.dns.ipv6, !ipv4Only && mode !== 'ipv4-local');
      assert.equal(config['x-clash-udp-unsupported'], 'REJECT');
      assert.equal(config['allow-lan'], false);
      assert.deepEqual(config.tun, {
        'strict-route': true, 'dns-hijack': ['any:53', 'tcp://any:53'],
        ...(mode === 'ipv4-local' ? {'inet6-address': ['fdfe:dcba:9876::1/126']} : {}),
      });
      for (const key of ['interface-name', 'routing-mark', 'x-clash-every-mode-rules', 'x-clash-block-quic',
        'x-clash-ip-rewrite', 'x-clash-stun-response-ip', 'x-clash-stun-response-ipv6',
        'routeweaver-local-family']) assert.equal(config[key], undefined, key);
      assert.equal(config.dns.listen, undefined);
      assert.equal(config.dns['x-clash-ssid-nameservers'], undefined);

      const nonProcessRules = value => value.rules.filter(rule => !rule.includes('PROCESS-'));
      assert.deepEqual(nonProcessRules(config), nonProcessRules(current));
      assert.ok(config.rules.includes('PROCESS-NAME,tailscaled,DIRECT'));
      assert.ok(config.rules.some(rule => rule.includes('(PROCESS-NAME,WeChat)')));
      assert.deepEqual(config['proxy-groups'], current['proxy-groups']);
      assert.deepEqual(config['rule-providers'], current['rule-providers']);
      assert.deepEqual(config.proxies, current.proxies);
      assert.deepEqual(config['proxy-providers'], current['proxy-providers']);
      assert.equal(JSON.stringify(config.dns['nameserver-policy']), JSON.stringify(current.dns['nameserver-policy']));
      if (release.vpsDirectRule) assert.equal(config.rules[0], release.vpsDirectRule);
      if (ipv4Only) {
        assert.ok(config.rules.slice(0, 2).includes('IP-CIDR6,::/0,REJECT,no-resolve'));
        assert.ok(config.proxies.every(proxy => proxy['ip-version'] === 'ipv4'));
        if (fixture['proxy-providers']) {
          const provider = config['proxy-providers'].Feed;
          assert.equal(provider.payload[0]['ip-version'], 'ipv4');
          assert.equal(provider.override['override-expr'].at(-1), '.["ip-version"] = "ipv4"');
        }
      }
      assert.equal(JSON.stringify(replay(file, config)), JSON.stringify(config), `${track}/${mode} idempotence`);
      if (bridge) {
        for (const [sample, expected] of [[input, config], [config, config]]) {
          const output = execFileSync(bridge, [path.join(root, file), profileName], {
            input: JSON.stringify(sample), encoding: 'utf8', timeout: 10000,
          });
          assert.equal(JSON.stringify(JSON.parse(output)), JSON.stringify(expected), 'JavaScriptCore parity');
        }
      }
      count++;
    }
  }
  for (const invalid of [null, [], '{}', {proxies: []}]) assert.throws(() => replay(file, invalid));
}
console.log(JSON.stringify({status: 'PASS', cases: count, javaScriptCore: bridge ? 'PASS' : 'NOT_RUN'}));
