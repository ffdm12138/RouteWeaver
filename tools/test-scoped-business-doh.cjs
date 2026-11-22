'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const release = require('../CURRENT_RELEASE.json');
const dnsSources = [
  ['dns.alidns.com', 'dns.alidns.com'],
  ['dot.pub', 'doh.pub'],
];
const scheme = 'routeweaver-doh://';

function tracks() {
  return {
    main: { ...release.entries, projectclash: release.projectClash.entries.main },
    'ipv4-only': { ...release.variants['ipv4-only'].entries, projectclash: release.projectClash.entries['ipv4-only'] },
  };
}

function scenarios(mode) {
  const a = { name: 'Fixture primary', type: 'socks5', server: '192.0.2.2', port: 1080, udp: true };
  const b = { name: 'Fixture backup', type: 'socks5', server: '198.51.100.2', port: 1080, udp: true, 'dialer-proxy': a.name };
  const profile = { 'x-routeweaver': { 'network-mode': mode } };
  return [
    { ...profile, proxies: [a, b] },
    { ...profile, proxies: [a], 'proxy-providers': { Fixture: { type: 'inline', payload: [b] } } },
  ];
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function encodeGroup(group) {
  return group.replace(/[%#&=]/g, character => encodeURIComponent(character));
}

function oldDNS(host, mapping) {
  if (!Array.isArray(mapping)) return mapping;
  return mapping.map(value => {
    if (typeof value !== 'string') return value;
    const [address, fragment] = value.split('#');
    if (fragment == null) return value;
    const [group, ...params] = fragment.split('&');
    const dot = /^tls:\/\/(dns\.alidns\.com|dot\.pub):853$/.exec(address);
    const apiDoH = host === 'api.openai.com' && /^https:\/\/(dns\.alidns\.com|doh\.pub)\/dns-query$/.test(address);
    if (!dot && !apiDoH) return value;
    const resolver = dot ? dnsSources.find(([before]) => before === dot[1])[1] : new URL(address).hostname;
    return scheme + resolver + '/dns-query#' + [encodeGroup(group), ...params.filter(p => p !== 'disable-reuse=true')].join('&');
  });
}

function digest(output) {
  return createHash('sha256').update(JSON.stringify(canonical(output))).digest('hex');
}

function transformExpected(config) {
  config.dns.nameserver = oldDNS('', config.dns.nameserver);
  for (const [host, policy] of Object.entries(config.dns['nameserver-policy'] || {})) {
    config.dns['nameserver-policy'][host] = oldDNS(host, policy);
  }
  return config;
}

function scopedPolicy(ns) {
  return typeof ns === 'string' && ns.startsWith(scheme);
}

function checkPolicy(dns) {
  assert.ok(dns.nameserver.every(scopedPolicy));
  for (const values of [dns.nameserver, ...Object.values(dns['nameserver-policy'])]) {
    const list = Array.isArray(values) ? values : [values];
    assert.ok(!list.some(ns => typeof ns === 'string' && /^tls:\/\//.test(ns)), 'business DoT survived');
    if (!list.some(scopedPolicy)) continue;
    assert.equal(list.length, 2);
    const [primary, backup] = list.map(ns => new URL(ns));
    assert.equal(primary.protocol, 'routeweaver-doh:');
    assert.equal(primary.hostname, 'dns.alidns.com');
    assert.equal(backup.protocol, 'routeweaver-doh:');
    assert.equal(backup.hostname, 'doh.pub');
    assert.equal(primary.pathname, '/dns-query');
    assert.equal(backup.pathname, '/dns-query');
    assert.equal(primary.hash, backup.hash);
    assert.ok(primary.hash && !primary.hash.includes('disable-reuse=true'));
  }
  for (const key of ['default-nameserver', 'proxy-server-nameserver', 'direct-nameserver']) {
    assert.ok(!dns[key].some(scopedPolicy), key);
  }
  assert.deepEqual(dns.fallback, []);
}

function readOutput(context) {
  return JSON.parse(JSON.stringify(context.main(context.input, 'isolated-scoped-doh')));
}

const [phase, baseline] = process.argv.slice(2);
assert.ok(['--baseline', '--check'].includes(phase) && baseline, 'expected --baseline or --check and a baseline file');
const previous = phase === '--check' ? JSON.parse(fs.readFileSync(baseline, 'utf8')) : {};
let runtimeChecks = 0;
let nativeChecks = 0;
const observed = {};
for (const [track, entries] of Object.entries(tracks())) {
  assert.equal(Object.keys(entries).length, 8);
  for (const [platform, file] of Object.entries(entries)) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const label = track + '/' + platform;
    if (file.endsWith('.conf')) {
      assert.match(source, /^dns-server = .*https:\/\/dns\.alidns\.com\/dns-query.+https:\/\/doh\.pub\/dns-query/m);
      assert.doesNotMatch(source, /^(?:dns-server|direct-dns-server) = .*tls:\/\//m);
      observed[label] = digest(source);
      nativeChecks++;
      continue;
    }
    const context = vm.createContext({ console: { log() {} } });
    vm.runInContext(source, context, { timeout: 5000 });
    const modes = track === 'main' ? ['auto', 'dual-stack', 'ipv4-local'] : ['ipv4-only'];
    for (const mode of modes) {
      for (const [index, input] of scenarios(mode).entries()) {
        context.input = input;
        const first = readOutput(context);
        const key = label + '/' + mode + '/' + index;
        if (phase === '--baseline') {
          observed[key] = digest(transformExpected(first));
        } else {
          checkPolicy(first.dns);
          observed[key] = digest(first);
          context.input = first;
          assert.equal(digest(readOutput(context)), observed[key], key + ': idempotence');
        }
        runtimeChecks++;
      }
    }
  }
}
if (phase === '--baseline') {
  fs.writeFileSync(baseline, JSON.stringify(observed, null, 2) + '\n');
} else {
  assert.deepEqual(Object.keys(observed), Object.keys(previous));
  for (const [key, value] of Object.entries(observed)) {
    assert.equal(value, previous[key], key + ': configuration outside the intended DNS migration changed');
  }
}
console.log(JSON.stringify({ phase, runtimeChecks, nativeChecks }));
