// App entry point: Clash Mi evaluates main(decodedYaml) with flutter_js.
// Return the config object. The client owns JSON/YAML serialization.
function main(input) {
  if (typeof input === "string") input = JSON.parse(input);
  if (!v14Object(input)) v14Fail("Clash Mi 覆写输入必须是配置对象。");
  const prepared = v14Copy(input);
  // The app supplies the actual NetworkExtension file descriptor after JS.
  // Rebuild routing before collecting dependencies from obsolete bypass sets.
  prepared.tun = {
    enable: true,
    stack: "gvisor",
    mtu: 1280,
    "auto-route": true,
    "auto-detect-interface": false,
    "strict-route": true,
    "inet4-address": ["172.19.0.1/30"],
    "inet6-address": ["fdfe:dcbe:9876::1/126"],
    "route-address": ["0.0.0.0/0", "::/0"],
    "dns-hijack": ["any:53", "tcp://any:53"]
  };
  // Do not inherit subscription-specific native extension routes or appended
  // DIRECT rules. The app's own final patch and UI switches need separate QA.
  delete prepared.extension;
  delete prepared["interface-name"];
  delete prepared["routing-mark"];
  const config = v14ClashMiBase(prepared);
  config.dns.listen = "127.0.0.1:1053";
  config["find-process-mode"] = "off";
  config["allow-lan"] = false;
  config["bind-address"] = "127.0.0.1";
  const marker = config["x-v14-generated"];
  marker.platform = "clashmi-ios";
  marker.platformRevision = "clashmi-object-r2";
  marker.clashMi = {
    reviewedAppVersion: "1.0.30.1605",
    alsoReviewedAppVersion: "1.0.31.1703",
    bridgeResult: "config-object",
    tunOwner: "script-routes-app-NetworkExtension-file-descriptor",
    appFinalPatch: "noOverwrite; rule; IPv6 on; TUN overwrite off",
    nativeAcceptance: "NOT_RUN",
    memoryAcceptance: "NOT_RUN"
  };
  marker.acceptedBoundaries = [
    "remote-node-to-destination-ip-family",
    "Clash Mi final patch and iOS NetworkExtension settings are outside JS",
    "per-flow DNS affinity"
  ];
  marker.openIssues = [
    "iOS JavaScriptCore import and NetworkExtension TCP/UDP/DNS/IPv6 acceptance",
    "iOS 50 MiB VPN memory limit and full embedded-classifier long-run acceptance",
    "device DNS caches and application connection migration"
  ];
  marker.validationWarnings = v14Unique(marker.validationWarnings.concat([
    "Clash Mi 请选追加不覆写、规则模式、核心 IPv6 开启，并关闭应用 TUN 覆写与追加 Apple 推送直连规则。",
    "iOS includeAllNetworks/enforceRoutes 及 VPN 排除项由应用设置控制；源码和本机 Mihomo 不证明实机接管。"
  ]));
  // Stabilise only document-level key order. DNS rule-set policy precedence
  // depends on insertion order and must not be sorted recursively.
  const document = {};
  for (const key of Object.keys(config).sort()) document[key] = config[key];
  return document;
}
