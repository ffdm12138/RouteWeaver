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

const manualLabels = new Map([['DIRECT', '直连 direct'], ['REJECT', '拒绝 reject']]);
const recordedLabels = new Map([...manualLabels].map(([target, name]) => [name, target]));
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
      {proxies: ['Primary', 'Primary ↻', '故障转移1', '主节点缺失 · 已选备用',
        '跳过本档（1）', '跳过本档（2）', ...Array.from(
        {length: 57}, (_, i) => 'Node ' + i,
      )].map(node)},
      {'proxy-providers': {feed: {type: 'inline', payload: [node('Provider'), node('DIRECT')]}}},
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
        const groups = new Map(candidate['proxy-groups'].map(group => [group.name, group]));
        const sharedOptions = ['高纯净度AI用', '高网速视频用'];
        for (const [target, name] of manualLabels) {
          assert.deepEqual(groups.get(name), {
            name, type: 'select', proxies: [target], hidden: true, 'empty-fallback': 'REJECT',
          });
        }
        assert.deepEqual(groups.get('Disney+').proxies.slice(0, 4), [...sharedOptions, '直连 direct', '拒绝 reject']);
        const domestic = groups.get('国内网站');
        assert.deepEqual(domestic.proxies.slice(0, 4), ['拒绝 reject', ...sharedOptions, '直连 direct']);
        assert.equal(groups.get('Disney+')['default-selected'], '高网速视频用');
        assert.equal(domestic['default-selected'], '直连 direct');
        assert.deepEqual(groups.get('漏网之鱼').proxies.slice(0, 4), [...sharedOptions, '直连 direct', '拒绝 reject']);
        for (const name of sharedOptions) {
          const group = groups.get(name);
          assert.deepEqual(group.proxies.slice(0, 2), ['拒绝 reject', '直连 direct']);
          assert.equal(group['default-selected'], '拒绝 reject');
        }
        candidate['proxy-groups'] = candidate['proxy-groups'].filter(group => !recordedLabels.has(group.name));
        candidate['x-v14-generated'].groups = candidate['x-v14-generated'].groups.filter(name => !recordedLabels.has(name));
        for (const group of candidate['proxy-groups'].filter(group => group.type === 'select')) {
          group.proxies = group.proxies.map(option => recordedLabels.get(option) || option);
          group['default-selected'] = recordedLabels.get(group['default-selected']) || group['default-selected'];
        }
        assert.deepEqual(candidate, original, 'provider group labels must preserve baseline routing');
        cases++;
        continue;
      }

      const groups = new Map(candidate['proxy-groups'].map(group => [group.name, group]));
      assert.equal(groups.size, candidate['proxy-groups'].length);
      const pool = original['proxy-groups'].find(group => group.name === '高纯净度AI用');
      const nodes = pool.proxies.filter(name => name !== 'REJECT' && name !== 'DIRECT');
      assert.ok(groups.get('自动选择').proxies.every(name => !manualLabels.has(name) && !recordedLabels.has(name)));
      const slots = ['故障转移1 [原生]', '故障转移2', '故障转移3'];
      const skip1 = '跳过本档（1） [原生]';
      const skip2 = '跳过本档（2） [原生]';
      const originalNames = new Set(original['proxy-groups'].map(group => group.name));
      const added = candidate['proxy-groups'].filter(group => !originalNames.has(group.name));
      assert.deepEqual(added.filter(g => !g.hidden).map(g => g.name), slots);
      assert.deepEqual(candidate['proxy-groups'].slice(2, 5).map(g => g.name), slots);
      for (const [index, name] of slots.entries()) {
        const first = [skip1, skip2, '拒绝 reject'][index];
        const group = groups.get(name);
        assert.equal(group.type, 'select');
        assert.equal(group['default-selected'], first);
        assert.equal(group['empty-fallback'], 'REJECT');
        assert.deepEqual(group.proxies, [first, ...nodes]);
        assert.equal(group.use, undefined);
      }
      assert.deepEqual(groups.get(skip2), {
        name: skip2, type: 'select', proxies: [slots[2]], hidden: true, 'empty-fallback': 'REJECT',
      });
      assert.equal(groups.get(skip1).hidden, true);
      for (const [target, name] of manualLabels) {
        assert.deepEqual(groups.get(name), {
          name, type: 'select', proxies: [target], hidden: true, 'empty-fallback': 'REJECT',
        });
      }
      const aliases = new Map();
      for (const fallback of added.filter(g => g.hidden && g.name !== skip2 && !recordedLabels.has(g.name))) {
        assert.equal(fallback.type, 'fallback');
        assert.equal(fallback.interval, 3);
        assert.equal(fallback.timeout, 3000);
        assert.equal(fallback['expected-status'], 204);
        assert.equal(fallback['empty-fallback'], 'REJECT');
        assert.equal(fallback.lazy, true);
        assert.match(fallback.url, /^https:\/\/.+#routeweaver-failover$/);
        assert.ok(!fixture.proxies.some(node => node.name === fallback.name));
        if (fallback.name === skip1) {
          assert.deepEqual(fallback.proxies, slots.slice(1));
          continue;
        }
        const [primary, ...backups] = fallback.proxies;
        assert.equal(aliases.has(primary), false, 'share one chain per primary');
        aliases.set(primary, fallback.name);
        assert.deepEqual(backups, slots);
      }
      assert.deepEqual([...aliases.keys()].sort(), ['REJECT', ...nodes].sort());
      assert.equal(aliases.get('Primary'), 'Primary ↻ [原生]');
      assert.equal(aliases.get('REJECT'), '主节点缺失 · 已选备用 [原生]');
      const policies = original['proxy-groups'].filter(g => g.type === 'select'
        && original['x-v14-generated'].groups.includes(g.name));
      for (const group of policies) {
        const remapped = group.proxies.map(name => manualLabels.get(name) || aliases.get(name) || name);
        const actual = groups.get(group.name);
        const selected = group['default-selected'];
        assert.deepEqual(actual.proxies, [aliases.get('REJECT'), ...remapped]);
        assert.equal(actual['default-selected'], manualLabels.get(selected) || selected);
        actual.proxies = group.proxies;
        actual['default-selected'] = selected;
      }
      assert.ok(policies.some(g => g.name === '漏网之鱼') && policies.some(g => g.name === '国内网站'));
      candidate['proxy-groups'] = candidate['proxy-groups'].filter(group => originalNames.has(group.name));
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
      const upgradeOrder = original['proxy-groups'].filter(g => !g.hidden).map(g => g.name);
      upgradeOrder.splice(2, 0, ...slots);
      assert.deepEqual(upgraded['proxy-groups'].filter(g => !g.hidden).map(g => g.name),
        upgradeOrder);
      cases++;
    }
  }
}
console.log(JSON.stringify({status: 'PASS', cases}));
