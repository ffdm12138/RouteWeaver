'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fixture = require('../releases/v14.3/tests/current-fixture.cjs');
const { loadTailscalePolicy, processRules } = require('../releases/v14.3/tools/lib/tailscale-policy.cjs');

const root = path.resolve(__dirname, '..');
const policy = loadTailscalePolicy(path.join(root, 'releases/v14.3'));
const release = require('../CURRENT_RELEASE.json');
const guard = 'IP-CIDR6,::/0,REJECT,no-resolve';
const dnsServers = ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query'];
const ipRule = cidr => (cidr.includes(':') ? 'IP-CIDR6,' : 'IP-CIDR,') + cidr;
const cases = [
  { host: 'controlplane.tailscale.com', protocol: 'TCP', port: 443, group: 'DIRECT' },
  { host: 'login.tailscale.com', protocol: 'TCP', port: 443, group: 'DIRECT' },
  { host: 'log.tailscale.com', protocol: 'TCP', port: 443, group: 'DIRECT' },
  { ip: '192.200.0.112', protocol: 'TCP', port: 443, group: 'DIRECT' },
  { ip: '199.165.136.101', protocol: 'TCP', port: 443, group: 'DIRECT' },
  { ip: '172.237.28.183', protocol: 'TCP', port: 443, group: 'DIRECT' },
  { ip: '205.147.105.78', protocol: 'UDP', port: 3478, group: 'DIRECT' },
  { ip: '2403:2500:8000:1::e9a', protocol: 'UDP', port: 3478, group: 'DIRECT' },
  { ip: '2606:b740:49::1', protocol: 'TCP', port: 443, group: 'DIRECT' },
  { host: 'peer.example-tailnet.ts.net', protocol: 'TCP', port: 443, group: 'DIRECT' },
  { ip: '100.100.100.100', protocol: 'UDP', port: 53, group: 'DIRECT' },
  { ip: '100.101.102.103', protocol: 'UDP', port: 41641, group: 'DIRECT' },
  { ip: 'fd7a:115c:a1e0::21', protocol: 'TCP', port: 443, group: 'DIRECT' },
  { ip: '198.51.100.77', protocol: 'UDP', port: 3478, group: '漏网之鱼' },
  { ip: '198.51.100.77', protocol: 'UDP', port: 41641, group: '漏网之鱼' },
  { host: 'tailscale.com.evil.example.net', protocol: 'TCP', port: 443, group: '漏网之鱼' },
  { host: 'ts.net.evil.example.net', protocol: 'UDP', port: 3478, group: '漏网之鱼' },
  { host: 'chatgpt.com', ip: '100.90.10.1', protocol: 'TCP', port: 443, group: 'OpenAI 服务' },
  { host: 'stun.l.google.com', protocol: 'UDP', port: 3478, group: '谷歌服务' },
];

function readSection(text, name) {
  return text.split('[' + name + ']')[1].split(/\r?\n\[/)[0]
    .split(/\r?\n/).map(row => row.trim()).filter(row => row && !row.startsWith('#'));
}

function checkFlows(model, ipv4Only) {
  for (const { group, ...flow } of cases) {
    const expected = ipv4Only && flow.ip?.includes(':') ? 'REJECT' : group;
    assert.equal(fixture.route(model, flow).group, expected, JSON.stringify(flow));
    if (group === '漏网之鱼' && flow.protocol === 'UDP')
      assert.equal(fixture.route(model, flow, { udpSupported: false }).policy, 'REJECT');
  }
}

function checkShadowrocket(text, ipv4Only) {
  const rules = readSection(text, 'Rule');
  const hosts = new Map(readSection(text, 'Host').map(row => row.split(/\s+=\s+/, 2)));
  const sources = new Map(rules.filter(rule => rule.startsWith('RULE-SET,')).map(rule => [fixture.split(rule)[1], []]));
  const firstUdpGuard = rules.findIndex(rule => rule.startsWith('AND,((PROTOCOL,UDP),(DST-PORT,3478)'));
  assert.ok(firstUdpGuard > 0);
  for (const cidr of [...policy.publicNetworks, ...policy.tailnetNetworks]) {
    const order = rules.indexOf(ipRule(cidr) + ',DIRECT,no-resolve');
    assert.ok(order >= 0 && order < firstUdpGuard, cidr);
  }
  for (const name of [policy.publicDomain, '*.' + policy.publicDomain])
    assert.equal(hosts.get(name), 'server:' + dnsServers.join(','));
  for (const name of [policy.tailnetDomain, '*.' + policy.tailnetDomain])
    assert.equal(hosts.get(name), 'server:system');
  if (ipv4Only) assert.equal(rules[0], guard);
  checkFlows({ rules, sources, platform: 'shadowrocket' }, ipv4Only);
}

function checkMihomo(file, platform, mode) {
  const configInput = {
    proxies: [{ name: 'Fixture', type: 'socks5', server: '127.0.0.1', port: 1080, udp: true }],
    'find-process-mode': 'off',
    'x-routeweaver': { 'network-mode': mode, 'ipv4-lan-dns': ['192.168.1.1'] },
  };
  const ctx = vm.createContext({ console: { log() {} } });
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file, timeout: 3000 });
  const config = JSON.parse(JSON.stringify(ctx.main(configInput)));
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.main(config))), config, 'idempotent config');
  const providerName = config['x-v14-generated'].tailscalePublicProvider;
  assert.deepEqual(config['rule-providers'][providerName], {
    type: 'inline', behavior: 'ipcidr', payload: policy.publicNetworks,
  });
  const expectedProcess = processRules[platform] || [];
  assert.deepEqual(config.rules.filter(rule => rule.startsWith('PROCESS-')), expectedProcess.map(rule => rule + ',DIRECT'));
  assert.equal(config['find-process-mode'], expectedProcess.length ? 'strict' : 'off');

  const ipv4Only = mode === 'ipv4-only';
  if (ipv4Only) assert.ok(config.rules.indexOf(guard) >= 0 && config.rules.indexOf(guard) < 2);
  const firstUdpGuard = config.rules.findIndex(rule => rule.startsWith('AND,((NETWORK,UDP),(DST-PORT,3478)'));
  const providerRule = config.rules.indexOf('RULE-SET,' + providerName + ',DIRECT,no-resolve');
  assert.ok(providerRule >= 0 && providerRule < firstUdpGuard);
  if (mode !== 'dual-stack') assert.ok(config.sniffer['skip-dst-address'].includes('rule-set:' + providerName));
  const dnsPolicy = config.dns['nameserver-policy'];
  assert.deepEqual(dnsPolicy['+.ts.net'], ['system']);
  assert.ok(config.dns['fake-ip-filter'].includes('+.ts.net'));
  const system = ipv4Only || mode === 'ipv4-local'
    ? 'system://#disable-ipv6=true&disable-qtype-64=true&disable-qtype-65=true'
    : 'system://';
  assert.deepEqual(dnsPolicy['+.tailscale.com'], [system]);

  // Suppress remote classifiers to check coverage without a provider download.
  const sources = new Map(Object.entries(config['rule-providers']).map(([name, provider]) => [
    name, provider.type !== 'inline' ? []
      : provider.behavior === 'domain' ? provider.payload.map(row => row.startsWith('+.') ? 'DOMAIN-SUFFIX,' + row.slice(2) : 'DOMAIN,' + row)
        : provider.payload,
  ]));
  checkFlows({ config, rules: config.rules, sources, platform }, ipv4Only);
}

const files = {};
let configurations = 0;
for (const [ipv4Only, entries] of [[false, release.entries], [true, release.variants['ipv4-only'].entries]]) {
  for (const [platform, name] of Object.entries(entries)) {
    const file = path.join(root, name);
    if (platform === 'shadowrocket') checkShadowrocket(fs.readFileSync(file, 'utf8'), ipv4Only);
    else {
      for (const mode of ipv4Only ? ['ipv4-only'] : ['auto', 'dual-stack', 'ipv4-local']) {
        checkMihomo(file, platform, mode);
        configurations++;
      }
    }
    files[name] = fixture.sha(file);
  }
}
console.log(JSON.stringify({
  status: 'PASS',
  entries: Object.keys(files).length,
  configurations,
  derpSource: policy.source,
  testSHA256: fixture.sha(__filename),
  modelSHA256: fixture.sha(require.resolve('../releases/v14.3/tests/current-fixture.cjs')),
  deviceAcceptance: 'NOT_RUN',
  files,
}));
