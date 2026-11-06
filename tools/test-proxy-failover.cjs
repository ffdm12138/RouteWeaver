'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const release = JSON.parse(fs.readFileSync(path.join(root, 'CURRENT_RELEASE.json')));
const variant = release.variants['ipv4-only'].entries;
const key = 'routeweaver-failover';
const node = name => ({name, type: 'socks5', server: '127.0.0.1', port: 1080, udp: true});
let checked = 0;
for (const track of [release.entries, variant]) {
  for (const [platform, source] of Object.entries(track)) {
    if (!source.endsWith('.js')) continue;
    const ctx = vm.createContext({console: {log() {}}});
    vm.runInContext(fs.readFileSync(path.join(root, source), 'utf8'), ctx);
    const modes = track === variant ? ['ipv4-local'] : ['auto', 'dual-stack', 'ipv4-local'];
    for (const mode of modes) {
      ctx.input = {
        proxies: [node('Primary'), node('故障转移')],
        'proxy-providers': {feed: {type: 'inline', payload: [node('Provider')]}},
        'x-routeweaver': {'network-mode': mode},
      };
      const evaluate = () => JSON.parse(vm.runInContext('JSON.stringify(main(input))', ctx));
      const config = evaluate();
      if (platform === 'windows') {
        const spec = config[key];
        assert.equal(spec.name, '故障转移 [V14]');
        assert.equal(spec.source, '高纯净度AI用');
        assert.deepEqual(spec.policies, config['proxy-groups'].filter(g => g.type === 'select').map(g => g.name));
        assert.ok(spec.policies.includes('漏网之鱼') && spec.policies.includes('国内网站'));
        assert.ok(config['proxy-groups'].every(g => g.name !== spec.name && !g.proxies?.includes(spec.name)));
        assert.ok(config.rules.every(rule => !rule.includes(spec.name)));
        assert.ok(JSON.stringify(config.dns).includes('#漏网之鱼'));
        ctx.input = config;
        const regenerated = evaluate();
        assert.deepEqual(regenerated, config);
        assert.deepEqual(Object.keys(regenerated), Object.keys(config));
        ctx.input = {'proxy-providers': {feed: {type: 'inline', payload: [node('Provider')]}}};
        const onlyProvider = evaluate();
        assert.equal(onlyProvider[key].name, '故障转移');
        const sourceGroup = onlyProvider['proxy-groups'].find(g => g.name === onlyProvider[key].source);
        assert.deepEqual(sourceGroup.proxies, ['REJECT']);
        assert.deepEqual(sourceGroup.use, ['feed']);
      } else {
        assert.equal(config[key], undefined, platform);
        ctx.input = {...config, [key]: {name: '故障转移', source: '高纯净度AI用', policies: ['漏网之鱼']}};
        assert.equal(evaluate()[key], undefined, platform + ': inherited Windows descriptor');
      }
      checked++;
    }
  }
}
console.log(JSON.stringify({status: 'PASS', checks: checked, scope: 'WINDOWS_DESCRIPTOR_OTHER_CLIENTS_BASELINE'}));
