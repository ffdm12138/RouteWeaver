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
  const prepared = v14Copy(input);
  if (v14Object(prepared.dns)) prepared.dns.ipv6 = true;
  const config = v14NetworkModeBase(prepared);
  config.ipv6 = true;
  config.dns.ipv6 = false;
  delete config.dns["fake-ip-range6"];
  for (const key of ["nameserver", "fallback", "direct-nameserver"])
    if (config.dns[key] != null) config.dns[key] = v14IPv4LocalResolver(config.dns[key]);
  for (const key of Object.keys(config.dns["nameserver-policy"] || {}))
    config.dns["nameserver-policy"][key] = v14IPv4LocalResolver(config.dns["nameserver-policy"][key]);
  config.tun["inet6-address"] = ["fdfe:dcba:9876::1/126"];
  config.tun["route-address"] = ["0.0.0.0/0", "::/0"];
  // With a readable TLS/QUIC hostname, replace a cached literal destination
  // with that hostname. DIRECT then resolves an A record; a selected proxy
  // retains remote DNS/IPv6 ability. Do not rewrite HTTP Host destinations.
  // Without a hostname a literal IPv6 cannot be converted to an IPv4 target.
  for (const protocol of ["TLS", "QUIC"])
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
  config.sniffer["skip-dst-address"] = [...new Set(v14Strings(config.sniffer["skip-dst-address"], "sniffer.skip-dst-address").concat(explicitIPs))];
  // Keep LAN names at their original addresses. Do not skip every private
  // address: known company domains must retain their existing priority.
  config.sniffer["skip-domain"] = [...new Set(v14Strings(config.sniffer["skip-domain"], "sniffer.skip-domain").concat(V14.privateNames.map(name => "+." + name)))];
  const marker = config["x-v14-generated"];
  marker.networkMode = "ipv4-local";
  marker.localIPv6Fallback = "IPv4-business-resolution-and-TLS-QUIC-hostname-recovery; original-egress-policy-preserved";
  marker.validationWarnings = marker.validationWarnings.concat([
    "IPv4-local 是手动网络模式，不探测物理出口。保持应用核心 IPv6、完整 TUN 接管和严格路由；业务 DNS 过滤 AAAA/SVCB/HTTPS，节点引导 DNS 保留双栈。",
    "TLS/QUIC 可读域名允许重新解析 IPv4；无域名的 IPv6 字面量继续按原组处理，DIRECT 仍需本地 IPv6，代理目标仍需节点 IPv6。应用私有 DNS/缓存和显式 hosts 不保证回退。"
  ]);
  return config;
}
