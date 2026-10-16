// Explicit IPv4-local ingress mode. No system reachability probe is performed.
// Keep core IPv6 and TUN capture so IPv6 cannot escape when networks change.
function main(input) {
  const prepared = v14Copy(input);
  if (v14Object(prepared.dns)) prepared.dns.ipv6 = true;
  const config = v14NetworkModeBase(prepared);
  config.ipv6 = true;
  config.dns.ipv6 = false;
  delete config.dns["fake-ip-range6"];
  config.tun["inet6-address"] = ["fdfe:dcba:9876::1/126"];
  config.tun["route-address"] = ["0.0.0.0/0", "::/0"];
  // Real public IPv6 TUN requests fail promptly; private/LAN and mapped
  // Fake-IP domains retain the base policy. HTTP/SOCKS can still carry a
  // literal IPv6 destination over an IPv4 proxy-server connection.
  const guard = "AND,((IN-TYPE,TUN),(IP-CIDR6,::/0,no-resolve),(NOT,((IP-CIDR6,fc00::/7,no-resolve))),(NOT,((IP-CIDR6,fe80::/10,no-resolve))),(NOT,((IP-CIDR6,::1/128,no-resolve)))),REJECT";
  const position = config.rules.indexOf("DOMAIN,v14-runtime-check.invalid,REJECT");
  if (position < 0) v14Fail("Missing IPv4-local guard anchor");
  config.rules.splice(position + 1, 0, guard);
  const marker = config["x-v14-generated"];
  marker.networkMode = "ipv4-local";
  marker.localIPv6Fallback = "empty-client-AAAA-and-reject-public-literal-TUN-IPv6";
  marker.validationWarnings = marker.validationWarnings.concat([
    "IPv4-local 是手动网络模式，不探测物理出口。请保持应用核心 IPv6、完整 TUN 接管和严格路由，以保留拒绝规则。",
    "公网 IPv6 字面量 TUN 连接明确拒绝；应用是否改用 IPv4 取决于其自身后备地址。此模式不将 IPv6 地址转换为 IPv4。"
  ]);
  return config;
}
