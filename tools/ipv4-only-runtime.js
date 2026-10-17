// Local egress is IPv4 only. A proxy's onward connection remains its decision.
// This adapter is appended at build time; clients import one standalone file.
const ROUTEWEAVER_IPV4_ONLY_REVISION = "ipv4-only-r1";
const RW4_FORCE_FAMILY = '.["ip-version"] = "ipv4"';

function rw4Resolver(value) {
  if (Array.isArray(value)) return value.map(rw4Resolver);
  if (typeof value !== "string" || value === "system" || /^dhcp:\/\//.test(value)) return value;
  const at = value.indexOf("#"), address = at < 0 ? value : value.slice(0, at);
  const params = at < 0 ? [] : value.slice(at + 1).split("&");
  const kept = params.filter(p => p && !/^(disable-ipv4|disable-ipv6|disable-qtype-(1|28|64|65))(=|$)/.test(p));
  return address + "#" + kept.concat(["disable-ipv6=true", "disable-qtype-64=true", "disable-qtype-65=true"]).join("&");
}

function rw4IPv6(value) { return typeof value === "string" && value.includes(":"); }

function main(input, profileName) {
  if (RW4_ACCEPT_SERIALIZED && typeof input === "string") {
    try { input = JSON.parse(input); } catch (_) { v14Fail("Clash Mi JSON 输入无效。"); }
  }
  if (!v14Object(input)) v14Fail("覆写输入必须是配置对象。");
  const prepared = v14Copy(input);
  const previous = v14Object(prepared["x-v14-generated"]) ? prepared["x-v14-generated"] : {};
  if (v14Object(previous.ipv4OnlyBlockedHosts) && Object.keys(previous.ipv4OnlyBlockedHosts).length) {
    prepared.hosts = v14Object(prepared.hosts) ? prepared.hosts : {};
    for (const [name, value] of Object.entries(previous.ipv4OnlyBlockedHosts))
      if (!Object.prototype.hasOwnProperty.call(prepared.hosts, name)) prepared.hosts[name] = v14Copy(value);
  }
  // This entry deliberately cannot be switched back to auto/dual-stack by an
  // inherited subscription field or by a previous generated marker.
  prepared["x-routeweaver"] = Object.assign({}, v14Object(prepared["x-routeweaver"]) ? prepared["x-routeweaver"] : {}, {"network-mode":"ipv4-local"});
  for (const provider of Object.values(prepared["proxy-providers"] || {})) {
    if (v14Object(provider) && v14Object(provider.override) && Array.isArray(provider.override["override-expr"]))
      provider.override["override-expr"] = provider.override["override-expr"].filter(expr => expr !== RW4_FORCE_FAMILY);
  }
  const config = rw4BaseMain(prepared, profileName);
  config.ipv6 = false;
  delete config["routeweaver-local-family"];
  config.dns.ipv6 = false;
  delete config.dns["fake-ip-range6"];
  // System hosts can contain IPv6 addresses outside this script's control.
  config.dns["use-system-hosts"] = false;
  for (const node of config.proxies || []) node["ip-version"] = "ipv4";
  for (const provider of Object.values(config["proxy-providers"] || {})) {
    for (const node of provider.payload || []) node["ip-version"] = "ipv4";
    provider.override["ip-version"] = "ipv4";
    const exprs = (provider.override["override-expr"] || []).filter(expr => expr !== RW4_FORCE_FAMILY);
    // A refresh, or an earlier user expression, must not restore IPv6.
    provider.override["override-expr"] = exprs.concat(RW4_FORCE_FAMILY);
  }
  for (const key of ["nameserver", "fallback", "direct-nameserver", "default-nameserver", "proxy-server-nameserver"])
    if (config.dns[key] != null) config.dns[key] = rw4Resolver(config.dns[key]);
  for (const key of Object.keys(config.dns["nameserver-policy"] || {}))
    config.dns["nameserver-policy"][key] = rw4Resolver(config.dns["nameserver-policy"][key]);

  // Keep IPv4 members of explicit hosts. A hosts entry containing only IPv6
  // is rejected by name instead of guessing a replacement IPv4 address.
  const hostRejects = [], blockedHosts = new Set(), blockedMappings = {};
  const hostSource = v14Copy(config.hosts || {});
  for (const [name, value] of Object.entries(config.hosts || {})) {
    const values = Array.isArray(value) ? value : [value];
    if (!values.some(rw4IPv6)) continue;
    const kept = values.filter(value => !rw4IPv6(value));
    if (kept.length) config.hosts[name] = Array.isArray(value) ? kept : kept[0];
    else {
      // The core's hosts middleware can answer AAAA before dns.ipv6 filtering.
      // Preserve the mapping only as inert metadata for repeated generation.
      blockedHosts.add(name);
    }
  }
  // CNAME-style hosts aliases must not reintroduce an IPv6-only mapping.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, value] of Object.entries(hostSource))
      if (!blockedHosts.has(name) && typeof value === "string" && blockedHosts.has(value)) { blockedHosts.add(name); changed = true; }
  }
  for (const name of blockedHosts) {
    blockedMappings[name] = hostSource[name];
    delete config.hosts[name];
    const kind = name.startsWith("+.") ? "DOMAIN-SUFFIX" : name.includes("*") ? "DOMAIN-WILDCARD" : "DOMAIN";
    hostRejects.push(kind + "," + (kind === "DOMAIN-SUFFIX" ? name.slice(2) : name) + ",REJECT");
  }
  // no-resolve leaves normal domain/company classification untouched. Cached
  // and literal IPv6 packets reaching the core are rejected, including UDP.
  const guard = "IP-CIDR6,::/0,REJECT,no-resolve";
  const original = config.rules.filter(rule => rule !== guard && !hostRejects.includes(rule));
  const first = original[0] && /^IP-CIDR,[^,]+,DIRECT,no-resolve$/.test(original[0]) ? [original.shift()] : [];
  config.rules = first.concat(guard, hostRejects, original);
  delete config.tun["inet6-address"];
  delete config.tun["inet6-route-address"];
  // Retain the requested catch-all route as an anti-bypass intention. With
  // core IPv6 disabled, physical IPv6 blocking is the app/OS owner's duty.
  config.tun["route-address"] = ["0.0.0.0/0", "::/0"];

  const marker = config["x-v14-generated"];
  marker.networkMode = "ipv4-only";
  marker.ipv4OnlyRevision = ROUTEWEAVER_IPV4_ONLY_REVISION;
  marker.ipv4OnlyBlockedHosts = blockedMappings;
  marker.nodeAddressFamilyDefault = "ipv4-forced-including-explicit-and-refreshed-provider-nodes";
  marker.localIPv6Fallback = "disabled; IPv6-only endpoints fail; no node switching or DIRECT fallback";
  marker.notes = "IPv4-only local egress; proxy onward family remains server-controlled; existing routing and DNS group affinity retained";
  delete marker.automaticNetworkRevision;
  delete marker.automaticNetworkCapability;
  marker.validationWarnings = marker.validationWarnings.filter(text => !/IPv4-local|auto-local-family|自动物理|代理目标仍需节点 IPv6|V14.2 已开启核心双栈/.test(text)).concat([
    "独立纯 IPv4 版：本机直连与到节点连接限定 IPv4；不控制代理服务器后续出口。IPv6-only 节点/目标会失败。",
    "App 后置合并必须保留 ipv6=false、dns.ipv6=false 和节点 IPv4；TUN/VPN 外的 IPv6 由 App/操作系统阻止，系统代理不能接管所有流量。",
    "局域网 system/DHCP DNS 保留原语义；严格纯 IPv4 使用时，系统 DNS 服务器与物理网卡也须禁用 IPv6，或通过 x-routeweaver.ipv4-lan-dns 显式提供 IPv4 DNS。"
  ]);
  const lanDNS = prepared["x-routeweaver"]["ipv4-lan-dns"];
  if (lanDNS != null) {
    if (!Array.isArray(lanDNS) || !lanDNS.length || lanDNS.some(s => typeof s !== "string" || !/^(?:udp:\/\/|tcp:\/\/)?(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(s)))
      v14Fail("ipv4-lan-dns 必须是非空的 IPv4 DNS 地址数组。");
    for (const [key, values] of Object.entries(config.dns["nameserver-policy"]))
      if (Array.isArray(values) && values.includes("system")) config.dns["nameserver-policy"][key] = rw4Resolver(lanDNS);
  }
  return config;
}
