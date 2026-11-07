'use strict';
// Independent route/DNS observations, including unavailable remote providers.
// Native traffic and device acceptance are recorded separately.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), releaseRoot = path.join(root, 'releases/v14.3');
const f = require(path.join(releaseRoot, 'tests/fixture.cjs'));
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const release = read('CURRENT_RELEASE.json');
const review = read('releases/v14.3/data/rules/domestic-resilience.json');
const locks = [...read('releases/v14.3/data/rule-sources.lock.json').sources,
  ...read('releases/v14.3/validation/inputs/v14.2-baseline/data/rule-sources.lock.json').sources];
const rawRows = file => fs.readFileSync(file, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const loaded = new Map();
function remoteRows(url) {
  if (loaded.has(url)) return loaded.get(url);
  let source = locks.find(s => s.url === url);
  assert.ok(source, 'Unbound source URL');
  let file = path.join(releaseRoot, source.classifier.file);
  if (!fs.existsSync(file)) file = path.join(releaseRoot, 'validation/inputs/v14.2-baseline', source.classifier.file);
  assert.equal(hash(file), source.classifier.sha256);
  const rows = rawRows(file).map(s => s.includes(',') ? s : source.behavior === 'domain'
    ? (s.startsWith('+.') ? 'DOMAIN-SUFFIX,' + s.slice(2) : 'DOMAIN,' + s) : 'IP-CIDR,' + s);
  loaded.set(url, rows);
  return rows;
}
const observed = ['api.amemv.com', 'v5.douyinvod.com', 'p3.douyinpic.com', 'v3.douyinstatic.com',
  'video.idouyinvod.com', 'szextshort.weixin.qq.com', 'wxapp.tc.qq.com', 'mmbiz.qpic.cn',
  'servicewechat.com', 'apd-pcdnwxlogin.teg.tencent-cloud.net',
  'lf-dy-sourcecdn-tos.bytegecko.com', ...review.exactHosts];
const sourceProbes = review.sourceIds.flatMap(id => {
  const source = locks.find(s => s.id === id);
  return remoteRows(source.url).flatMap(row => {
    const [kind, domain] = f.split(row);
    assert.equal(kind, 'DOMAIN-SUFFIX');
    return [domain, 'media.' + domain];
  });
});
const hosts = [...new Set([...observed, ...sourceProbes, ...review.suffixes.flatMap(h => [h, 'media.' + h])])];
const sources = {}, failures = [], counts = {}, sizes = [];
let checks = 0;
function check(name, body) {
  checks++;
  try { body(); } catch (e) { failures.push({name, error: String(e.message).slice(0, 500)}); }
}
const entries = [
  ...Object.entries(release.entries).flatMap(([client, file]) =>
    (file.endsWith('.js') ? ['auto', 'dual-stack', 'ipv4-local'] : ['native']).map(mode => ({client, file, mode}))),
  ...Object.entries(release.variants['ipv4-only'].entries).map(([client, file]) => ({client, file, mode: 'ipv4-only'})),
];
for (const entry of entries) {
  const file = path.join(root, entry.file), source = fs.readFileSync(file, 'utf8');
  sources[entry.file] = hash(file);
  let config, rules, providers, platform = entry.client;
  if (entry.file.endsWith('.js')) {
    const input = {proxies: [{name: 'Synthetic', type: 'socks5', server: '127.0.0.1', port: 1080, udp: true}],
      'x-routeweaver': {'network-mode': entry.mode === 'ipv4-only' ? 'ipv4-local' : entry.mode}};
    const ctx = vm.createContext({input, console: {log() {}}});
    config = JSON.parse(JSON.stringify(vm.runInContext(source + '\nmain(input)', ctx, {timeout: 5000})));
    rules = config.rules;
    providers = Object.entries(config['rule-providers']).map(([name, p]) => ({name, remote: p.type !== 'inline',
      rows: p.type === 'inline' ? p.behavior === 'domain' ? p.payload.map(s => s.startsWith('+.')
        ? 'DOMAIN-SUFFIX,' + s.slice(2) : 'DOMAIN,' + s) : p.payload : remoteRows(p.url)}));
    sizes.push({client: entry.client, mode: entry.mode, scriptBytes: Buffer.byteLength(source), configBytes: Buffer.byteLength(JSON.stringify(config))});
  } else {
    platform = 'shadowrocket';
    const section = name => source.split('[' + name + ']')[1].split(/\r?\n\[/)[0].split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
    const pairs = rows => rows.map(s => { const i = s.indexOf('='); return [s.slice(0, i).trim(), s.slice(i + 1).trim()]; });
    config = {general: Object.fromEntries(pairs(section('General'))), hosts: pairs(section('Host'))};
    rules = section('Rule');
    providers = [...new Set(rules.filter(r => r.startsWith('RULE-SET,')).map(r => f.split(r)[1]))]
      .map(url => ({name: url, remote: true, rows: remoteRows(url)}));
  }
  const full = {platform, config, rules, sources: new Map(providers.map(p => [p.name, p.rows]))};
  for (const stage of ['full', 'empty', 'partial', 'restored']) {
    const model = {...full, sources: new Map(providers.map(p => [p.name,
      p.remote && (stage === 'empty' || stage === 'partial' && /(?:domain-cn|domain-douyin|\/cn\.|\/douyin\.)/.test(p.name)) ? [] : p.rows]))};
    const label = entry.client + ':' + entry.mode + ':' + stage;
    counts[stage] = (counts[stage] || 0) + 1;
    for (const host of hosts) {
      check(label + ':dns:' + host, () => assert.deepEqual(f.dnsPolicyFor(model, host).groups, ['国内网站']));
      for (const protocol of ['TCP', 'UDP']) {
        check(label + ':' + protocol + ':' + host, () => {
          for (const choice of ['DIRECT', '高纯净度AI用', '高网速视频用', 'Synthetic']) {
            const flow = {host, protocol, port: 443}, options = {selections: {'国内网站': choice}};
            const result = f.route(model, flow, options);
            assert.equal(result.group, '国内网站'); assert.equal(result.policy, choice);
            if (protocol === 'UDP' && choice !== 'DIRECT') assert.equal(f.route(model, flow, {...options, udpSupported: false}).policy, 'REJECT');
          }
        });
      }
    }
    for (const host of ['www.tiktok.com', 'api.openai.com', 'www.google.com', 'challenges.cloudflare.com']) {
      check(label + ':company:' + host, () => {
        assert.notEqual(f.route(model, {host, port: 443, protocol: 'UDP'}).group, '国内网站');
        assert.notDeepEqual(f.dnsPolicyFor(model, host).groups, ['国内网站']);
      });
    }
    for (const host of ['unknown.byteeffecttos.com', 'unknown.tencent-cloud.net', 'unknown.bytedance.com'])
      check(label + ':bounded:' + host, () => {
        if (stage === 'empty') assert.notEqual(f.route(model, {host, port: 443, protocol: 'UDP'}).group, '国内网站');
      });
    for (const flow of [{host: 'stun.amemv.com', protocol: 'UDP', port: 443},
      {host: 'api.amemv.com', protocol: 'UDP', port: 3478},
      {ip: '203.0.113.17', protocol: 'UDP', port: 443}, {ip: '2001:db8::17', protocol: 'UDP', port: 443}])
      check(label + ':guard:' + JSON.stringify(flow), () => assert.equal(f.route(model, flow).group,
        entry.mode === 'ipv4-only' && flow.ip?.includes(':') ? 'REJECT' : '漏网之鱼'));
    check(label + ':stun-dns', () => assert.deepEqual(f.dnsPolicyFor(model, 'stun.amemv.com').groups, ['漏网之鱼']));
  }
}
const result = {revision: 'domestic-resilience-r1', scope: 'OFFLINE_MODELS_NOT_DEVICE_ACCEPTANCE',
  edition: release.vpsDirectRevision ? 'personal' : 'public', status: failures.length ? 'FAIL' : 'PASS',
  checks, failed: failures.length, stages: counts, sources, sizes,
  testSHA256: hash(__filename), dataSHA256: hash(path.join(releaseRoot, 'data/rules/domestic-resilience.json')),
  failures: failures.slice(0, 30)};
const at = process.argv.indexOf('--output');
if (at >= 0) { const out = path.resolve(process.argv[at + 1]); fs.mkdirSync(path.dirname(out), {recursive: true}); fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n'); }
console.log(JSON.stringify({status: result.status, checks, failed: result.failed, stages: counts, failures: failures.slice(0, 5)}));
if (failures.length) process.exitCode = 1;
