'use strict';
// User-authorized 2026-10-13: reviewed domestic domain DNS/TCP/UDP follow its selector.
// IP-only geographic shortcuts stay below the unknown public UDP guard.
module.exports=(code,replace)=>{
 const start='  // All public UDP precedes geographic DIRECT, regardless of port/name/family.';
 const end='  add("MATCH", groupName("漏网之鱼")); config.rules = rules; config.mode = "rule";';
 const a=code.indexOf(start),b=code.indexOf(end,a);if(a<0||b<0)throw Error('Domestic routing base changed');
 code=code.slice(0,a)+`  // Corporate/LAN/manual rules above retain priority. Recognisable generic
  // STUN stays protected before domestic domain classifications.
  for (const network of ["TCP", "UDP"]) {
    for (const port of V14.stunPorts) add("AND,((NETWORK," + network + "),(DST-PORT," + port + "),(NOT,((IN-TYPE,INNER))))", groupName("漏网之鱼"));
    for (const host of V14.stunHostPatterns) add("AND,((NETWORK," + network + "),(DOMAIN-WILDCARD," + host + "),(NOT,((IN-TYPE,INNER))))", groupName("漏网之鱼"));
  }
  const domesticPolicy = groupName("国内网站");
  for (const d of V14_DOMESTIC_SEEDS) add("DOMAIN-SUFFIX," + d, domesticPolicy);
  for (const tag of V14_DOMESTIC_SETS) addDomainSet(tag, domesticPolicy);
  addDomainSet("cn", domesticPolicy);
  add("DOMAIN-SUFFIX,cn", domesticPolicy);
  // Unclassified IP-only public UDP cannot reach geographic TCP shortcuts.
  add("AND,((NETWORK,UDP),(NOT,((IN-TYPE,INNER))))", groupName("漏网之鱼"));
  add("RULE-SET," + ruleSet("ip", "cn"), domesticPolicy, true);
`+code.slice(b);
 const needle='  // No public .cn/CN classification can force an unknown UDP\'s DNS to DIRECT.\n  // DIRECT TCP still has a separate final resolver; bootstrap is explicit.\n';
 code=replace(code,needle,`  // Existing corporate literals and rule-set policies above win. The
  // reviewed domestic domain inventories now use the same selectable egress.
  // Name-only STUN protection cannot identify a hidden protocol on an ordinary host.
  let stunDNSSet = "v14-generic-stun-domain-guard", stunDNSIndex = 1;
  while (config["rule-providers"][stunDNSSet]) stunDNSSet = "v14-generic-stun-domain-guard-" + (++stunDNSIndex);
  config["rule-providers"][stunDNSSet] = {type:"inline", behavior:"classical", payload:V14.stunHostPatterns.map(d=>"DOMAIN-WILDCARD,"+d)};
  dnsPolicy["rule-set:" + stunDNSSet] = v14DnsFor(groupName("漏网之鱼"));
  // Preserve existing local/private-name fallback unless an earlier corporate
  // policy or explicit system/manual literal already identifies it.
  dnsPolicy["rule-set:" + embeddedDomainSet("private")] = v14DnsFor(groupName("漏网之鱼"));
  dnsPolicy["rule-set:" + embeddedDomainSet("category-doh")] = v14DnsFor(groupName("漏网之鱼"));
  let domesticSeedsSet = "v14-domestic-protocol-seeds", domesticSetIndex = 1;
  while (config["rule-providers"][domesticSeedsSet]) domesticSeedsSet = "v14-domestic-protocol-seeds-" + (++domesticSetIndex);
  config["rule-providers"][domesticSeedsSet] = {type:"inline", behavior:"classical", payload:V14_DOMESTIC_SEEDS.concat(["cn"]).map(d=>"DOMAIN-SUFFIX,"+d)};
  dnsPolicy["rule-set:" + domesticSeedsSet] = v14DnsFor(domesticPolicy);
  for (const tag of V14_DOMESTIC_SETS.concat(["cn"])) {
    if (V14_REVIEWED_DOMAINS[tag]) dnsPolicy["rule-set:" + embeddedDomainSet(tag)] = v14DnsFor(domesticPolicy);
    dnsPolicy["rule-set:" + ruleSet("domain", tag)] = v14DnsFor(domesticPolicy);
  }
`);
 code=replace(code,'auditRepairRevision: "balanced-r1"','auditRepairRevision: "balanced-r1", domesticProtocolRevision: "domestic-protocol-r1"');
 return code;
};
