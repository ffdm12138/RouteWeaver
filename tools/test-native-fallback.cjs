'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const release = require('../CURRENT_RELEASE.json');
const node = name => ({name, type: 'socks5', server: '127.0.0.1', port: 1080, udp: true});
const run = (source, input, baseline = false) => JSON.parse(JSON.stringify(vm.runInNewContext(
  source + (baseline ? '\nv14NativeFallback = config => { delete config["routeweaver-failover"]; };' : '')
    + '\nmain(input, "native-fallback-test");',
  {input, console: {log() {}}}, {timeout: 5000},
)));

let cases = 0;
const tracks = [
  {entries: release.entries, modes: ['auto', 'dual-stack', 'ipv4-local']},
  {entries: release.variants['ipv4-only'].entries, modes: ['ipv4-local']},
];
for (const {entries, modes} of tracks) {
  for (const file of Object.values(entries).filter(file => file.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(Buffer.byteLength(source) <= 131072, file);
    const inputs = [
      {proxies: ['Primary', 'Primary ↻', '故障转移1', '主节点缺失 · 已选备用', ...Array.from(
        {length: 59}, (_, i) => 'Node ' + i,
      )].map(node)},
      {'proxy-providers': {feed: {type: 'inline', payload: [node('Provider')]}}},
      {proxies: [node('Primary')], 'proxy-providers': {feed: {type: 'file', path: './fixture.yaml'}}},
    ];
    for (const mode of modes) for (const fixture of inputs) {
      const input = {
        ...fixture,
        'routeweaver-failover': {name: '旧版故障转移'},
        'x-routeweaver': {'network-mode': mode},
      };
      const original = run(source, input, true);
      const candidate = run(source, input);
      assert.equal(candidate['routeweaver-failover'], undefined);
      assert.deepEqual(run(source, candidate), candidate, 'regeneration must be idempotent');
      if (fixture['proxy-providers']) {
        const warnings = candidate['x-v14-generated'].validationWarnings;
        const index = warnings.findIndex(warning => /proxy-providers.+故障转移未启用/.test(warning));
        assert.notEqual(index, -1, 'provider fallback must be disclosed');
        warnings.splice(index, 1);
        assert.deepEqual(candidate, original, 'provider profile must retain baseline routing');
        cases++;
        continue;
      }

      const groups = new Map(candidate['proxy-groups'].map(group => [group.name, group]));
      assert.equal(groups.size, candidate['proxy-groups'].length);
      const pool = original['proxy-groups'].find(group => group.name === '高纯净度AI用');
      const slots = ['故障转移1 [原生]', '故障转移2', '故障转移3'];
      const added = candidate['proxy-groups'].slice(original['proxy-groups'].length);
      assert.deepEqual(added.filter(g => !g.hidden).map(g => g.name), slots);
      for (const name of slots) {
        const group = groups.get(name);
        assert.equal(group.type, 'select');
        assert.equal(group['default-selected'], 'REJECT');
        assert.equal(group['empty-fallback'], 'REJECT');
        assert.deepEqual(group.proxies, pool.proxies);
        assert.equal(group.use, undefined);
      }
      const aliases = new Map();
      for (const fallback of added.filter(g => g.hidden)) {
        const [primary, ...backups] = fallback.proxies;
        assert.equal(aliases.has(primary), false, 'share one chain per primary');
        aliases.set(primary, fallback.name);
        assert.equal(fallback.type, 'fallback');
        assert.equal(fallback.interval, 3);
        assert.equal(fallback.timeout, 3000);
        assert.equal(fallback['expected-status'], 204);
        assert.equal(fallback['empty-fallback'], 'REJECT');
        assert.equal(fallback.lazy, true);
        assert.match(fallback.url, /^https:\/\/.+#routeweaver-failover$/);
        assert.deepEqual(backups, slots);
        assert.ok(!fixture.proxies.some(node => node.name === fallback.name));
      }
      assert.deepEqual([...aliases.keys()].sort(), pool.proxies.slice().sort());
      assert.equal(aliases.get('Primary'), 'Primary ↻ [原生]');
      assert.equal(aliases.get('REJECT'), '主节点缺失 · 已选备用 [原生]');
      const policies = original['proxy-groups'].filter(g => g.type === 'select'
        && original['x-v14-generated'].groups.includes(g.name));
      for (const group of policies) {
        const remapped = group.proxies.map(name => name === 'REJECT' ? name : aliases.get(name) || name);
        assert.deepEqual(groups.get(group.name).proxies, [aliases.get('REJECT'), ...remapped]);
        groups.get(group.name).proxies = group.proxies;
      }
      assert.ok(policies.some(g => g.name === '漏网之鱼') && policies.some(g => g.name === '国内网站'));
      candidate['proxy-groups'] = candidate['proxy-groups'].slice(0, original['proxy-groups'].length);
      candidate['x-v14-generated'].groups = original['x-v14-generated'].groups;
      assert.deepEqual(candidate, original, 'only fallback groups and selector options may change');

      const legacy = structuredClone(original);
      const primary = '漏网之鱼 · 回退主节点';
      const fallback = '漏网之鱼 · 原生回退';
      legacy['x-v14-generated'].groups.push(primary, fallback);
      legacy['proxy-groups'].push({name: primary, type: 'select', proxies: ['Primary']},
        {name: fallback, type: 'fallback', hidden: true, proxies: [primary]});
      legacy['proxy-groups'].find(g => g.name === '漏网之鱼').proxies.push(fallback);
      const upgraded = run(source, legacy);
      assert.equal(upgraded['proxy-groups'].some(g => g.name === primary || g.name === fallback), false);
      assert.deepEqual(upgraded['proxy-groups'].filter(g => !g.hidden).map(g => g.name),
        original['proxy-groups'].filter(g => !g.hidden).map(g => g.name).concat(slots));
      cases++;
    }
  }
}
console.log(JSON.stringify({status: 'PASS', cases}));
