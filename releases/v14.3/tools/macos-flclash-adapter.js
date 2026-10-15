// FlClash macOS uses a core-created utun; the app owns enable / auto-route.
function main(input) {
  if (!v14Object(input)) v14Fail("FlClash macOS 覆写输入必须是配置对象。");
  const prepared = v14Copy(input);
  const tun = v14Object(prepared.tun) ? prepared.tun : {};
  // An omitted device lets Mihomo choose a free utun index on Darwin.
  // Keep an explicitly valid macOS name; discard Windows/Linux names and FDs.
  if (typeof tun.device !== "string" || !/^utun[0-9]+$/.test(tun.device)) delete tun.device;
  for (const key of ["file-descriptor", "auto-redirect", "auto-redirect-input-mark", "auto-redirect-output-mark",
    "iproute2-table-index", "iproute2-rule-index", "gso", "gso-max-size", "include-interface", "exclude-interface",
    "include-uid", "include-uid-range", "exclude-uid", "exclude-uid-range", "include-android-user",
    "include-package", "exclude-package", "include-mac-address", "exclude-mac-address"]) delete tun[key];
  tun["auto-detect-interface"] = true;
  prepared.tun = tun;
  delete prepared.android;
  delete prepared.extension;
  delete prepared["routing-mark"];
  // Preserve an explicit Mac physical interface, but remove migrated Windows names.
  if (prepared["interface-name"] && !/^(?:en|bridge|bond|ppp)[0-9]+$/.test(prepared["interface-name"])) delete prepared["interface-name"];
  const config = v14MacOSBase(prepared);
  const marker = config["x-v14-generated"];
  marker.platform = "macos-flclash";
  marker.platformRevision = "macos-r1";
  marker.macOS = {client:"FlClash", bridgeResult:"config-object", tunOwner:"Mihomo-Darwin-utun",
    switches:"app owns enable / auto-route", nativeAcceptance:"NOT_RUN"};
  marker.acceptedBoundaries = ["remote-node-to-destination-ip-family", "FlClash final merge and macOS TUN/system DNS are outside JS", "per-flow DNS affinity"];
  marker.openIssues = ["macOS app import, privileged TUN helper, LAN DNS, TCP/UDP/IPv6 capture and Wi-Fi/interface switching", "device DNS caches and application connection migration"];
  return config;
}
