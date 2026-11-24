'use strict';
// Independent route/DNS observations, including unavailable remote providers.
// Native traffic and device acceptance are recorded separately.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), releaseRoot = path.join(root, 'releases/v14.3');
const f = require(path.join(releaseRoot, 'tests/current-fixture.cjs'));
const { indexDNS } = require(path.join(releaseRoot, 'tests/domain-index.cjs'));
const { driveExactHosts, mediaHost } = require(path.join(releaseRoot, 'tests/domestic-contract.cjs'));
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const release = read('CURRENT_RELEASE.json');
const mediaDomains = read('releases/v14.3/data/rules/wechat-media.json');
const priorityGroups = ['高纯净度AI用', '高网速视频用', '公共基础服务', '谷歌服务', '微软生态',
  'Steam', '苹果国际', 'Google Drive', '哔哩国际', '国内网站'];
const remainingGroups = ['自动选择', '漏网之鱼', 'OpenAI 服务', 'Anthropic 服务', 'YouTube',
  'Epic Games', 'Telegram', 'TikTok', 'Twitter', 'Discord', 'OpenRouter', 'Perplexity', 'Hugging Face',
  'xAI', 'Netflix', 'Disney+', 'Spotify', 'Meta 服务'];
const mediaProcessNames = {
  windows: ['Weixin.exe', 'WeChat.exe'], clashVerge: ['Weixin.exe', 'WeChat.exe'],
  android: ['com.tencent.mm'], macosFlClash: ['WeChat'],
};
const review = read('releases/v14.3/data/rules/domestic-resilience.json');
const newDomain = '19212021.xyz';
assert.ok(review.authorizedSuffixes.includes(newDomain));
const authorizedHosts = new Set(review.authorizedSuffixes.flatMap(h => [h, 'edge.' + h, 'nested.edge.' + h]));
const manualLabels = new Map([['DIRECT', '直连 direct'], ['REJECT', '拒绝 reject']]);
const businessDefaults = {
  DIRECT: ['国内网站', 'Steam', 'Epic Games', '苹果国际', '哔哩国际'],
  '高网速视频用': ['YouTube', 'Google Drive', 'Telegram', 'TikTok', 'Twitter', 'Discord', 'Netflix', 'Disney+', 'Spotify'],
  '高纯净度AI用': ['公共基础服务', '漏网之鱼', 'OpenAI 服务', 'Anthropic 服务', '谷歌服务', '微软生态',
    'OpenRouter', 'Perplexity', 'Hugging Face', 'xAI', 'Meta 服务'],
};
const driveRoutes = {
  'Google Drive': ['drive.google.com', 'sync.drive.google.com', 'googledrive.com', ...driveExactHosts],
  '谷歌服务': ['accounts.google.com', 'docs.google.com', 'www.googleapis.com', 'lh3.googleusercontent.com',
    'edge.drivefrontend-pa.googleapis.com'],
};
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
const hosts = [...new Set([...authorizedHosts, ...observed, ...sourceProbes, ...review.suffixes.concat(mediaDomains).flatMap(h => [h, 'media.' + h])])];
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
  let config, rules, providers, groups, platform = entry.client;
  if (entry.file.endsWith('.js')) {
    const input = {proxies: [{name: 'Synthetic', type: 'socks5', server: '127.0.0.1', port: 1080, udp: true}],
      'x-routeweaver': {'network-mode': entry.mode === 'ipv4-only' ? 'ipv4-local' : entry.mode}};
    const ctx = vm.createContext({input, console: {log() {}}});
    config = JSON.parse(JSON.stringify(vm.runInContext(source + '\nmain(input)', ctx, {timeout: 5000})));
    check(entry.client + ':' + entry.mode + ':media-sniffer-upgrade', () => {
      const userSkips = ['+.keep.example.net', 'mmbiz.qpic.cn'];
      const previous = JSON.parse(JSON.stringify(config));
      delete previous['x-v14-generated'].wechatSniffRevision;
      previous.sniffer['skip-domain'].push(...mediaDomains.map(h => '+.' + h), ...userSkips);
      ctx.input = previous;
      const upgraded = JSON.parse(JSON.stringify(vm.runInContext('main(input)', ctx, {timeout: 5000})));
      for (const pattern of mediaDomains.map(h => '+.' + h)) assert.ok(!upgraded.sniffer['skip-domain'].includes(pattern));
      for (const pattern of userSkips) assert.ok(upgraded.sniffer['skip-domain'].includes(pattern));
    });
    rules = config.rules;
    groups = new Map(config['proxy-groups'].map(group => [group.name, group]));
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
    groups = new Map(pairs(section('Proxy Group')).map(([name, fields]) => [name, f.split(fields)]));
    providers = [...new Set(rules.filter(r => r.startsWith('RULE-SET,')).map(r => f.split(r)[1]))]
      .map(url => ({name: url, remote: true, rows: remoteRows(url)}));
  }
  check(entry.client + ':' + entry.mode + ':selector-defaults', () => {
    for (const [preferred, names] of Object.entries({...businessDefaults, REJECT: ['高纯净度AI用', '高网速视频用']})) {
      for (const name of names) {
        const group = groups.get(name);
        const selected = manualLabels.get(preferred) || preferred;
        if (platform === 'shadowrocket') {
          assert.ok(group.includes('policy-select-name=' + selected) && group.includes(selected), name);
        } else {
          assert.equal(group['default-selected'], selected, name);
          assert.ok(group.proxies.includes(selected), name);
          assert.equal(group['empty-fallback'], 'REJECT', name);
        }
        const publicGroup = preferred === 'REJECT';
        const options = publicGroup ? ['直连 direct'] : ['高纯净度AI用', '高网速视频用', '直连 direct'];
        if (platform === 'shadowrocket') {
          if (preferred === 'DIRECT' || publicGroup) options.unshift('拒绝 reject');
          else options.push('拒绝 reject');
          assert.deepEqual(group.slice(1, 1 + options.length), options, name);
        } else {
          options.unshift('主节点缺失 · 已选备用');
          options.push('拒绝 reject', 'Synthetic ↻');
          assert.deepEqual(group.proxies, options, name);
        }
      }
    }
  });
  check(entry.client + ':' + entry.mode + ':group-display-order', () => {
    const visible = Array.from(groups).filter(([, group]) => platform === 'shadowrocket'
      ? !group.includes('hidden=1') : !group.hidden).map(([name]) => name);
    const expected = priorityGroups.slice();
    if (platform !== 'shadowrocket') expected.splice(2, 0, '故障转移1', '故障转移2', '故障转移3');
    assert.deepEqual(visible, expected.concat(remainingGroups));
  });
  check(entry.client + ':' + entry.mode + ':media-config', () => {
    if (platform === 'shadowrocket') {
      assert.deepEqual(config.general['always-real-ip'].split(','), mediaDomains.flatMap(h => [h, '*.' + h]));
      assert.ok(!rules.some(rule => rule.includes('PROCESS-NAME')));
      return;
    }
    assert.equal(config.dns['fake-ip-filter-mode'], 'blacklist');
    assert.equal(config['x-v14-generated'].wechatSniffRevision, 'wechat-media-sniff-r1');
    assert.deepEqual(config.sniffer.sniff.QUIC.ports, [80, 443, 8443, 8000]);
    for (const domain of mediaDomains) {
      const pattern = '+.' + domain;
      assert.equal(config.dns['fake-ip-filter'].filter(x => x === pattern).length, 1);
      assert.ok(!config.sniffer['skip-domain'].includes(pattern));
      assert.deepEqual(config.dns['nameserver-policy'][pattern],
        ['system://#disable-ipv6=true&disable-qtype-64=true&disable-qtype-65=true']);
    }
    const processRules = rules.filter(rule => rule.includes('(PROCESS-NAME,'));
    assert.deepEqual(processRules, (mediaProcessNames[entry.client] || []).map(name =>
      'AND,((DOMAIN-REGEX,^$),(IP-CIDR,0.0.0.0/0,no-resolve),(PROCESS-NAME,' + name + ')),DIRECT'));
    if (processRules.length) assert.equal(config['find-process-mode'], 'strict');
  });
  const full = {platform, config, rules, sources: new Map(providers.map(p => [p.name, p.rows]))};
  for (const stage of ['full', 'empty', 'partial', 'restored']) {
    const model = {...full, sources: new Map(providers.map(p => [p.name,
      p.remote && (stage === 'empty' || stage === 'partial' && /(?:domain-cn|domain-douyin|\/cn\.|\/douyin\.)/.test(p.name)) ? [] : p.rows]))};
    const label = entry.client + ':' + entry.mode + ':' + stage;
    counts[stage] = (counts[stage] || 0) + 1;
    const dnsPolicyFor = indexDNS(model);
    for (const [group, probes] of Object.entries(driveRoutes)) {
      for (const host of probes) {
        check(label + ':drive:' + host, () => {
          assert.deepEqual(dnsPolicyFor(host).groups, [group]);
          for (const protocol of ['TCP', 'UDP']) {
            assert.equal(f.route(model, {host, protocol, port: 443}).group, group);
          }
        });
      }
    }
    for (const host of hosts) {
      const group = mediaHost(host) ? 'DIRECT' : '国内网站';
      const dnsGroup = group === 'DIRECT' && platform !== 'shadowrocket' ? 'system' : group;
      check(label + ':dns:' + host, () => assert.deepEqual(dnsPolicyFor(host).groups, [dnsGroup]));
      for (const protocol of ['TCP', 'UDP']) {
        check(label + ':' + protocol + ':' + host, () => {
          for (const choice of ['DIRECT', '高纯净度AI用', '高网速视频用', 'Synthetic']) {
            const flow = {host, protocol, port: 443}, options = {selections: {'国内网站': choice}};
            const result = f.route(model, flow, options);
            assert.equal(result.group, group); assert.equal(result.policy, group === 'DIRECT' ? 'DIRECT' : choice);
            if (protocol === 'UDP' && group === '国内网站' && choice !== 'DIRECT') assert.equal(f.route(model, flow, {...options, udpSupported: false}).policy, 'REJECT');
          }
        });
      }
    }
    for (const host of ['not-' + newDomain, newDomain + '.example.net']) {
      check(label + ':suffix-boundary:' + host, () => {
        assert.equal(f.route(model, {host, protocol: 'TCP', port: 443}).group, '漏网之鱼');
        assert.deepEqual(dnsPolicyFor(host).groups, ['漏网之鱼']);
      });
    }
    for (const host of ['www.tiktok.com', 'api.openai.com', 'www.google.com', 'challenges.cloudflare.com']) {
      check(label + ':company:' + host, () => {
        assert.notEqual(f.route(model, {host, port: 443, protocol: 'UDP'}).group, '国内网站');
        assert.notDeepEqual(dnsPolicyFor(host).groups, ['国内网站']);
      });
    }
    for (const host of ['unknown.byteeffecttos.com', 'unknown.tencent-cloud.net', 'unknown.bytedance.com'])
      check(label + ':bounded:' + host, () => {
        if (stage === 'empty') assert.notEqual(f.route(model, {host, port: 443, protocol: 'UDP'}).group, '国内网站');
      });
    for (const flow of [{host: 'stun.amemv.com', protocol: 'UDP', port: 443},
      {host: 'stun.qpic.cn', protocol: 'UDP', port: 443}, {host: 'mmbiz.qpic.cn', protocol: 'UDP', port: 3478},
      {host: 'api.amemv.com', protocol: 'UDP', port: 3478},
      {host: 'stun.' + newDomain, protocol: 'UDP', port: 443},
      {host: 'edge.' + newDomain, protocol: 'UDP', port: 3478},
      {ip: '203.0.113.17', protocol: 'UDP', port: 443}, {ip: '2001:db8::17', protocol: 'UDP', port: 443}])
      check(label + ':guard:' + JSON.stringify(flow), () => assert.equal(f.route(model, flow).group,
        entry.mode === 'ipv4-only' && flow.ip?.includes(':') ? 'REJECT' : '漏网之鱼'));
    for (const host of ['stun.amemv.com', 'stun.qpic.cn', 'stun.' + newDomain])
      check(label + ':stun-dns:' + host, () => assert.deepEqual(dnsPolicyFor(host).groups, ['漏网之鱼']));
  }
}
const result = {revision: 'wechat-media-sniff-r1', scope: 'OFFLINE_MODELS_NOT_DEVICE_ACCEPTANCE',
  edition: release.vpsDirectRevision ? 'personal' : 'public', status: failures.length ? 'FAIL' : 'PASS',
  checks, failed: failures.length, stages: counts, sources, sizes,
  testSHA256: hash(__filename), dataSHA256: hash(path.join(releaseRoot, 'data/rules/domestic-resilience.json')),
  mediaDomainsSHA256: hash(path.join(releaseRoot, 'data/rules/wechat-media.json')),
  failures: failures.slice(0, 30)};
const at = process.argv.indexOf('--output');
if (at >= 0) { const out = path.resolve(process.argv[at + 1]); fs.mkdirSync(path.dirname(out), {recursive: true}); fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n'); }
console.log(JSON.stringify({status: result.status, checks, failed: result.failed, stages: counts, failures: failures.slice(0, 5)}));
if (failures.length) process.exitCode = 1;
