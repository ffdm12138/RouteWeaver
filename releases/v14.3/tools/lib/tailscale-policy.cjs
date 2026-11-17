'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { isIP } = require('node:net');
const path = require('node:path');

const source = {
  file: 'data/rules/tailscale-derp-map.json',
  url: 'https://controlplane.tailscale.com/derpmap/default',
  sha256: '0c8d3433db696e18e26a1ce8464c1c29d75963ecf81b28e280341bfd323cdb3a',
  reviewedOn: '2026-11-17',
};

const windows = ['tailscaled.exe', 'tailscale-ipn.exe', 'tailscale.exe'].map(name => 'PROCESS-NAME,' + name);
const processRules = {
  windows,
  clashVerge: windows,
  android: ['PROCESS-NAME,com.tailscale.ipn'],
  macosFlClash: [
    'PROCESS-NAME,tailscaled',
    'PROCESS-NAME,tailscale',
    'PROCESS-NAME,io.tailscale.ipn.macsys.network-extension',
    'PROCESS-PATH-WILDCARD,*/Tailscale.app/Contents/PlugIns/IPNExtension.appex/Contents/MacOS/IPNExtension',
  ],
};

function loadTailscalePolicy(root) {
  const bytes = fs.readFileSync(path.join(root, source.file));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), source.sha256, 'Review and pin the official DERP snapshot before building');
  const { Regions } = JSON.parse(bytes);
  const nodes = Object.values(Regions).flatMap(region => region.Nodes);
  assert.ok(nodes.length > 0, 'Empty Tailscale DERP map');
  // Official address ranges for coordination/login and logging from the firewall reference.
  const publicNetworks = new Set([
    '192.200.0.0/24', '199.165.136.0/24',
    '2606:b740:49::/48', '2606:b740:1::/48',
  ]);
  for (const node of nodes) {
    assert.match(node.HostName, /^derp[a-z0-9-]+\.tailscale\.com$/);
    for (const [address, family] of [[node.IPv4, 4], [node.IPv6, 6]]) {
      if (!address || address === 'none') continue;
      assert.equal(isIP(address), family, node.HostName + ' has an invalid DERP address');
      publicNetworks.add(address + (family === 4 ? '/32' : '/128'));
    }
  }

  return {
    source,
    publicDomain: 'tailscale.com',
    tailnetDomain: 'ts.net',
    tailnetNetworks: ['100.64.0.0/10', 'fd7a:115c:a1e0::/48'],
    publicNetworks: [...publicNetworks],
  };
}

module.exports = { loadTailscalePolicy, processRules };
