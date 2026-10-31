// Remove only exclusions this adapter previously added. A fresh user's
// identically named provider is not ours, and must survive regeneration.
function v14PrepareNetworkInput(input) {
  const prepared = v14Copy(input), marker = prepared["x-v14-generated"];
  if (!v14Object(marker) || marker.version !== V14.version || !v14Object(prepared.sniffer)) return prepared;
  const owned = marker.networkRecovery;
  if (v14Object(owned) && owned.revision === "owned-exclusions-r1") {
    for (const pair of [["skip-domain", "addedDomains"], ["skip-dst-address", "addedDestinations"]]) {
      const remove = v14Strings(owned[pair[1]], "networkRecovery." + pair[1]);
      if (prepared.sniffer[pair[0]] != null)
        prepared.sniffer[pair[0]] = v14Strings(prepared.sniffer[pair[0]], "sniffer." + pair[0]).filter(value => !remove.includes(value));
    }
  } else if (["auto", "ipv4-local", "ipv4-only"].includes(marker.networkMode)) {
    // Older entries did not record ownership. Migrate only their generated
    // classifier reference, not user domain exclusions or destination ranges.
    const old = (marker.embeddedDomainClassifiers || []).find(row => row.tag === "private");
    if (old && /^v14-domains-private(?:-\d+)?$/.test(old.provider) && prepared.sniffer["skip-domain"] != null)
      prepared.sniffer["skip-domain"] = v14Strings(prepared.sniffer["skip-domain"], "sniffer.skip-domain").filter(value => value !== "rule-set:" + old.provider);
  }
  return prepared;
}

// Shared destination recovery; never changes the selected egress.
function v14RecoverNetworkDestination(config) {
  // Recover reliable HTTP/TLS/QUIC hostnames without changing the egress.
  // No hostname means no safe IPv6-to-IPv4 substitution.
  for (const protocol of ["HTTP", "TLS", "QUIC"])
    config.sniffer.sniff[protocol]["override-destination"] = true;
  // Preserve the destination identity needed by leading explicit IP rules.
  // A hostname rewrite happens before rule evaluation in Mihomo. Without
  // this exclusion it could erase a highest-priority manual IP exception.
  const anchor = config.rules.indexOf("DOMAIN,v14-runtime-check.invalid,REJECT");
  if (anchor < 0) v14Fail("Missing compatibility rule anchor");
  const explicitIPs = config.rules.slice(0, anchor).flatMap(rule => {
    const match = /^IP-CIDR6?,([^,]+),DIRECT(?:,no-resolve)?$/.exec(rule);
    return match ? [match[1]] : [];
  });
  const destinations = v14Strings(config.sniffer["skip-dst-address"], "sniffer.skip-dst-address");
  const domains = v14Strings(config.sniffer["skip-domain"], "sniffer.skip-domain");
  const marker = config["x-v14-generated"];
  const privateSet = marker.embeddedDomainClassifiers.find(row => row.tag === "private");
  if (!privateSet || !config["rule-providers"][privateSet.provider]) v14Fail("Missing inline private domain classifier");
  const extraDomains = V14.privateNames.map(name => "+." + name).concat("rule-set:" + privateSet.provider);
  config.sniffer["skip-dst-address"] = v14Unique(destinations.concat(explicitIPs));
  config.sniffer["skip-domain"] = v14Unique(domains.concat(extraDomains));
  marker.networkRecovery = {revision: "owned-exclusions-r1",
    addedDomains: extraDomains.filter(value => !domains.includes(value)),
    addedDestinations: explicitIPs.filter(value => !destinations.includes(value))};
  return config;
}

// Explicit IPv4-local ingress mode. No system reachability probe is performed.
// Keep core IPv6 and TUN capture so IPv6 cannot escape when networks change.
// dns.ipv6 only filters client AAAA; apply the same family restriction to
// business/direct upstreams used internally by the core. Node bootstrap and
// LAN/system resolvers remain independent. Keep every existing #policy.
function v14IPv4LocalResolver(value) {
  if (Array.isArray(value)) return value.map(v14IPv4LocalResolver);
  if (typeof value !== "string" || value === "system" || /^dhcp:\/\//.test(value)) return value;
  const at = value.indexOf("#");
  const address = at < 0 ? value : value.slice(0, at);
  const params = at < 0 ? [] : value.slice(at + 1).split("&");
  const kept = params.filter(p => p && !/^(disable-ipv6|disable-qtype-64|disable-qtype-65)(=|$)/.test(p));
  return address + "#" + kept.concat(["disable-ipv6=true", "disable-qtype-64=true", "disable-qtype-65=true"]).join("&");
}
function main(input) {
  const prepared = v14PrepareNetworkInput(input);
  if (v14Object(prepared.dns)) prepared.dns.ipv6 = true;
  const config = v14NetworkModeBase(prepared);
  config.ipv6 = true;
  delete config["routeweaver-local-family"];
  config.dns.ipv6 = false;
  delete config.dns["fake-ip-range6"];
  // AAAA is suppressed here, so no IPv6 Fake-IP ULA can reach Chromium and the
  // api.openai.com real-answer exception stops buying anything. Let the name
  // fall back to Fake-IP: the proxy resolves it remotely, which needs no local
  // resolver transport at all. Dual-stack and auto keep the exception.
  if (Array.isArray(config.dns["fake-ip-filter"]))
    config.dns["fake-ip-filter"] = config.dns["fake-ip-filter"].filter(value => value !== "api.openai.com");
  if (v14Object(config.dns["nameserver-policy"])) delete config.dns["nameserver-policy"]["api.openai.com"];
  for (const key of ["nameserver", "fallback", "direct-nameserver"])
    if (config.dns[key] != null) config.dns[key] = v14IPv4LocalResolver(config.dns[key]);
  for (const key of Object.keys(config.dns["nameserver-policy"] || {}))
    config.dns["nameserver-policy"][key] = v14IPv4LocalResolver(config.dns["nameserver-policy"][key]);
  // Raw Android subscriptions can omit TUN. Supply policy fields without
  // enabling VPN or taking ownership of the app's file descriptor.
  if (!v14Object(config.tun)) config.tun = {};
  config.tun["inet6-address"] = ["fdfe:dcba:9876::1/126"];
  config.tun["route-address"] = ["0.0.0.0/0", "::/0"];
  v14RecoverNetworkDestination(config);
  const marker = config["x-v14-generated"];
  marker.networkMode = "ipv4-local";
  marker.networkCompatibilityRepair = "http-recovery-r1";
  marker.localIPv6Fallback = "IPv4-business-resolution-and-HTTP-TLS-QUIC-hostname-recovery; original-egress-policy-preserved";
  marker.validationWarnings = marker.validationWarnings.concat([
    "IPv4-local 是手动网络模式，不探测物理出口。保持应用核心 IPv6、完整 TUN 接管和严格路由；业务 DNS 过滤 AAAA/SVCB/HTTPS，节点引导 DNS 保留双栈。",
    "HTTP/TLS/QUIC 可读域名允许重新解析 IPv4；无域名的 IPv6 字面量继续按原组处理，DIRECT 仍需本地 IPv6，代理目标仍需节点 IPv6。应用私有 DNS/缓存和显式 hosts 不保证回退。"
  ]);
  return config;
}
