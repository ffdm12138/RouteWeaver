// Clash Verge Rev owns listeners, mode and selected GUI TUN/DNS keys after scripts.
// This transform supplies the routing contract; inspect the final effective config.
function main(input, profileName) {
  if (!v14Object(input)) v14Fail("Clash Verge 覆写输入必须是配置对象。");
  const prepared = v14Copy(input);
  const prior = prepared["x-v14-generated"];
  if (v14Object(prior) && prior.platform === "clash-verge") prior.platform = "desktop";
  const config = v14VergeBase(prepared);
  // The GUI/service controls activation. Preserve explicit activation choices.
  for (const key of ["enable", "auto-route"]) {
    if (v14Object(input.tun) && Object.prototype.hasOwnProperty.call(input.tun, key))
      config.tun[key] = input.tun[key];
  }
  config.tun["strict-route"] = true;
  config.tun["route-address"] = ["0.0.0.0/0", "::/0"];
  // Never transfer a foreign platform's privileged TUN descriptor or redirect marks.
  for (const key of ["file-descriptor", "auto-redirect", "auto-redirect-input-mark", "auto-redirect-output-mark",
    "iproute2-table-index", "iproute2-rule-index", "include-android-user", "include-package", "exclude-package"])
    delete config.tun[key];
  const marker = config["x-v14-generated"];
  marker.platform = "clash-verge";
  marker.platformRevision = "clash-verge-r1";
  marker.client = {name:"Clash Verge Rev", reviewedVersion:"2.5.8", scriptEngine:"Boa 0.22.0",
    supportedPlatform:"Windows", nativeAcceptance:"NOT_RUN"};
  marker.acceptedBoundaries = ["remote-node-to-destination-ip-family", "Verge restores app-owned mode, listeners and saved TUN/DNS keys after scripts", "per-flow DNS affinity"];
  marker.openIssues = ["Verify final Rule mode, strict-route, dual-stack routes and DNS override ownership in the client", "native Windows TUN, DNS/UDP/IPv6 capture and application fallback"];
  marker.validationWarnings = v14Unique(marker.validationWarnings.concat([
    "Clash Verge Rev 请使用规则模式并在 TUN 设置开启严格路由；保存的 GUI 字段可能覆盖脚本，导入后核对最终运行配置。",
    "让本覆写管理业务 DNS 时请关闭额外 DNS 覆盖；IPv4-local 仍须保留核心 IPv6 和双栈 TUN，脚本不能改变应用后置合并。"
  ]));
  return config;
}
