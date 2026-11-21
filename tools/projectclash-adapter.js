function main(input, profileName) {
  if (!v14Object(input)) v14Fail("ProjectClash 覆写需要配置对象。");
  const prepared = v14Copy(input);
  // The NetworkExtension owns its descriptor, interface and route table.
  // Use its default capture routes and discard legacy platform overrides.
  prepared.tun = {"strict-route": true, "dns-hijack": ["any:53", "tcp://any:53"]};
  for (const key of ["interface-name", "routing-mark", "x-clash-every-mode-rules",
    "x-clash-block-quic", "x-clash-ip-rewrite", "x-clash-stun-response-ip", "x-clash-stun-response-ipv6"])
    delete prepared[key];
  prepared["x-clash-udp-unsupported"] = "REJECT";
  prepared["allow-lan"] = false;
  prepared["bind-address"] = "127.0.0.1";

  const config = v14ProjectClashPolicy(prepared, profileName);
  delete config.tun["route-address"];
  delete config["routeweaver-local-family"];
  delete config.dns.listen;
  delete config.dns["x-clash-ssid-nameservers"];

  const marker = config["x-v14-generated"];
  marker.platform = "projectclash";
  marker.platformRevision = "projectclash-r1";
  marker.openIssues = ["ProjectClash App activation and Apple VPN route/DNS capture", "Device DNS caches and application connection migration"];
  if (marker.networkMode === "auto") {
    delete marker.automaticNetworkRevision;
    marker.automaticNetworkCapability = "PROJECTCLASH_USES_DUAL_STACK_POLICY";
    marker.localIPv6Fallback = "dual-stack with HTTP/TLS/QUIC destination recovery; original egress policy preserved";
    marker.validationWarnings = marker.validationWarnings.filter(text => !/auto-local-family-r1|匹配核心在|受保护 socket/.test(text));
  }
  marker.validationWarnings.push("ProjectClash 请使用 Rule 模式，并在最终配置核对业务 DNS、规则和地址族；VPN 接管由客户端管理。");
  return config;
}
