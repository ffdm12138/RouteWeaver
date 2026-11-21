'use strict';

const { isIP } = require('node:net');
const sealed = require('./fixture.cjs');

function cidrRule(row) {
  if (row.includes(',') || !row.includes('/')) return row;
  const family = isIP(row.split('/')[0]);
  return family ? (family === 6 ? 'IP-CIDR6,' : 'IP-CIDR,') + row : row;
}

// These models have no OS process metadata. Keep the original rule indices and
// let the real core replay handle process identification.
const usesProcess = rule => rule.startsWith('PROCESS-') || rule.includes('(PROCESS-NAME,');
function currentModel(model) {
  const rules = model.rules.map(rule => usesProcess(rule)
    ? 'NOT,((MATCH)),' + sealed.split(rule).at(-1) : rule);
  const name = model.config?.['x-v14-generated']?.tailscalePublicProvider;
  const payload = model.sources.get(name);
  const sources = payload?.length ? new Map(model.sources).set(name, payload.map(cidrRule)) : model.sources;
  return { ...model, rules, sources };
}

module.exports = {
  ...sealed,
  cidrRule,
  matches: (rule, flow, model) => !usesProcess(rule) && sealed.matches(cidrRule(rule), flow, model),
  route: (model, flow, options) => sealed.route(currentModel(model), flow, options),
  routeSlow: (model, flow, options) => sealed.routeSlow(currentModel(model), flow, options),
};
