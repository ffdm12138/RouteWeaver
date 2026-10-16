// Auto requires a native core implementing auto-local-family-r1. The JS
// requests the capability, but never claims that generating JSON proves it.
function v14AutoLocalMain(input, profileName) {
  const prepared = v14Copy(input);
  delete prepared["routeweaver-local-family"];
  if (v14Object(prepared.dns)) prepared.dns.ipv6 = true;
  if (v14Object(prepared.sniffer) && prepared.sniffer["skip-domain"] != null)
    prepared.sniffer["skip-domain"] = v14Strings(prepared.sniffer["skip-domain"], "sniffer.skip-domain").filter(value => value !== "rule-set:v14-domains-private");
  const config = v14NetworkModeBase(prepared, profileName);
  config.ipv6 = true;
  config.dns.ipv6 = true;
  config["routeweaver-local-family"] = "auto";
  v14RecoverNetworkDestination(config);
  const marker = config["x-v14-generated"];
  marker.networkMode = "auto";
  marker.automaticNetworkRevision = "auto-local-family-r1";
  marker.automaticNetworkCapability = "REQUIRES_MATCHING_NATIVE_CORE_RUNTIME_NOT_CONFIRMED_BY_JS";
  marker.localIPv6Fallback = "native-egress-observation-and-bounded-passive-evidence; no global IPv6 disable; original-egress-policy-preserved";
  marker.validationWarnings = marker.validationWarnings.concat([
    "auto 需要实现 auto-local-family-r1 的核心；覆写无法确认运行核心支持。普通核心只保留双栈/节点 IPv4 偏好/域名恢复，不能视为自动物理出口判断。",
    "匹配核心在实际出站网卡缺少 IPv6 源地址时抑制应用候选；网络变化更新状态，未知状态保留双栈。节点引导 DNS、代理远端 IPv6、显式地址族、局域网和 hosts 不改。",
    "无可靠域名的 IPv6 字面量不能透明变成 IPv4；快速失败不保证应用重试。移动端受保护 socket 的出口需要宿主提供能力，不能用 TUN 地址推断。"
  ]);
  return config;
}
