'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renameMain } = require('../releases/v14.3/tools/lib/compile-entries.cjs');
const { processRules } = require('../releases/v14.3/tools/lib/tailscale-policy.cjs');

const root = path.resolve(__dirname, '..');
const release = require('../CURRENT_RELEASE.json');
const sources = {
  main: release.entries.android,
  'ipv4-only': release.variants['ipv4-only'].entries.android,
};

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const adapter = read('tools/projectclash-adapter.js');
const check = process.argv.includes('--check');
for (const [track, source] of Object.entries(sources)) {
  const destination = release.projectClash.entries[track];
  let policy = renameMain(read(source), 'v14ProjectClashPolicy');
  // Apple disables process lookup on iOS, iPadOS and tvOS. The same rules
  // can match on macOS and preserve the desktop exceptions there.
  const androidProcesses = JSON.stringify(processRules.android);
  const processField = '"processRules":' + androidProcesses;
  const weChatField = 'const V14_WECHAT_PROCESSES = ["com.tencent.mm"];';
  assert.equal(policy.split(processField).length, 2, 'Android process-rule anchor changed');
  assert.equal(policy.split(weChatField).length, 2, 'Android WeChat process anchor changed');
  policy = policy.replace(processField, '"processRules":' + JSON.stringify(processRules.macosFlClash))
    .replace(weChatField, 'const V14_WECHAT_PROCESSES = ["WeChat"];');
  const code = '// RouteWeaver for ProjectClash on iOS, iPadOS, macOS and tvOS.\n' + policy + '\n' + adapter;
  assert.ok(Buffer.byteLength(code) <= 131072, destination + ' exceeds 128 KiB');
  if (check) {
    assert.equal(read(destination), code, destination + ' is stale');
  } else {
    const file = path.join(root, destination);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, code);
  }
}
console.log('ProjectClash generation passed for both tracks.');
