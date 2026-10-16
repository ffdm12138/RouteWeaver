# V14.3 单入口交付

当前 `single-entry-r1 / shared-runtime-r1 / client-integration-r1`，公开标签 v14.3.0-rc.5。保留既有业务合同和双栈，各客户端只保留以下一个当前文件。

| 客户端 | 入口 |
|---|---|
| Windows FlClash / Mihomo | [v14.3.js](src/windows/v14.3.js) |
| Android Mihomo 客户端 | [v14.3-android.js](src/android/v14.3-android.js) |
| iOS Clash Mi | [v14.3-clashmi-domestic-protocol-r1.js](src/ios/v14.3-clashmi-domestic-protocol-r1.js) |
| iOS Shadowrocket | [v14.3-shadowrocket.conf](src/ios/v14.3-shadowrocket.conf) |
| macOS FlClash | [v14.3-macos-flclash.js](src/macos/v14.3-macos-flclash.js) |
| macOS Clash Mi | [v14.3-macos-clashmi.js](src/macos/v14.3-macos-clashmi.js) |
| Windows Clash Verge Rev | [v14.3-clash-verge.js](src/clash-verge/v14.3-clash-verge.js) |

JS 默认 dual-stack；本地无 IPv6 出口时改同一文件顶部常量为 ipv4-local，详见 [网络模式](../../docs/guides/IPv4兼容模式.md)。保持应用严格路由、核心 IPv6 与完整接管；Clash Verge 的 GUI 后置字段按 [说明](../../docs/guides/ClashVerge使用说明.md)核对。

受限 Windows FlClash 核心修复、真实引擎对照和实际 TUN 范围见 [接入报告](../../docs/reports/v14.3/单入口优化与核心接入.md)。单文件不包含节点/订阅，不自动替换核心。其它设备、真实媒体与公网 IPv6仍待验收。

从本目录复验：

~~~text
node tools/build-all.cjs --check
node tests/static.cjs
node tests/macos-static.cjs
node tests/clash-verge.cjs
node tests/shadowrocket-lean.cjs
node tests/network-compat.cjs
node tests/engine-parity.cjs <routeweaver-engine-check.exe>
node tests/native-core.cjs <replay-core.exe> <openssl.exe> --current-contract
node tests/native-macos.cjs <replay-core.exe> <openssl.exe>
node tests/native-clash-verge.cjs <replay-core.exe> <openssl.exe>
node tests/native-network-compat.cjs <replay-core.exe>
node tests/native-boundaries.cjs <replay-core.exe> <openssl.exe>
node tests/native-boundaries.cjs <replay-core.exe> <openssl.exe> --cold-download
~~~

`research/flclash-core-integration/` 提供固定源补丁、构建、入站测试启动器与来源记录；正式可选核心包另附完整对应源码和依赖。维护者受控 TUN 探测不等于微信或跨端验收。历史输入与失败证据保留。
