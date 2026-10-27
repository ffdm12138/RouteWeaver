# V14.3 单入口交付

## rc.6：自动模式与原生能力边界

当前源码修订 `auto-local-family-r1`，六份 JS 默认请求 `auto`，每客户端仍一份入口，保留 `dual-stack`／`ipv4-local`。自动出口判断需要匹配原生核心，普通核心接受覆写不等于已接入；Shadowrocket 只保留原生 IPv4 偏好与 IPv6 开启。Windows 指定 FlClash 核心/Helper 已完成新编译和隔离验证，但本轮未安装，维护者此前手动兼容客户端不变。移动端受保护 socket 和其它平台宿主仍需独立接入，真实 TUN/媒体/公网 IPv6 未验收。当前说明与证据入口：`docs/guides/自动网络模式.md`、`docs/reports/v14.3/自动本地地址族与跨端能力.md`。

以下涉及 rc.5 的接入记录只认证原版本，不认证 rc.6 自动能力。


当前 `auto-local-family-r1 / shared-runtime-r1 / single-entry-r1`，已发布标签 v14.3.0-rc.6。`controller-readiness-r1` 为尚未发布的本地回放维护修订，详见[修复报告](../../docs/reports/v14.3/rc6本地API回归修复.md)。保留既有业务合同和双栈，各客户端只保留以下一个当前文件。

| 客户端 | 入口 |
|---|---|
| Windows FlClash / Mihomo | [v14.3.js](src/windows/v14.3.js) |
| Android Mihomo 客户端 | [v14.3-android.js](src/android/v14.3-android.js) |
| iOS Clash Mi | [v14.3-clashmi-domestic-protocol-r1.js](src/ios/v14.3-clashmi-domestic-protocol-r1.js) |
| iOS Shadowrocket | [v14.3-shadowrocket.conf](src/ios/v14.3-shadowrocket.conf) |
| macOS FlClash | [v14.3-macos-flclash.js](src/macos/v14.3-macos-flclash.js) |
| macOS Clash Mi | [v14.3-macos-clashmi.js](src/macos/v14.3-macos-clashmi.js) |
| Windows Clash Verge Rev | [v14.3-clash-verge.js](src/clash-verge/v14.3-clash-verge.js) |

JS 默认请求 auto，需要匹配的原生核心；同一文件保留 dual-stack/ipv4-local，详见[自动模式](../../docs/guides/自动网络模式.md)及[显式兼容](../../docs/guides/IPv4兼容模式.md)。保持应用严格路由、核心 IPv6 与完整接管；Clash Verge 的 GUI 后置字段按 [说明](../../docs/guides/ClashVerge使用说明.md)核对。

受限 Windows FlClash 核心修复、真实引擎对照和实际 TUN 范围见 [接入报告](../../docs/reports/v14.3/单入口优化与核心接入.md)。单文件不包含节点/订阅，不自动替换核心。其它设备、真实媒体与公网 IPv6仍待验收。

从本目录复验：

~~~text
node tools/build-all.cjs --check
node tests/static.cjs
node tests/macos-static.cjs
node tests/clash-verge.cjs
node tests/shadowrocket-lean.cjs
node tests/network-compat.cjs
node --test tests/native-controller.test.cjs
node tests/engine-parity.cjs <routeweaver-engine-check.exe>
node tests/native-core.cjs <replay-core.exe> <openssl.exe> --current-contract
node tests/native-macos.cjs <replay-core.exe> <openssl.exe>
node tests/native-clash-verge.cjs <replay-core.exe> <openssl.exe>
node tests/native-network-compat.cjs <replay-core.exe>
node tests/native-boundaries.cjs <replay-core.exe> <openssl.exe>
node tests/native-boundaries.cjs <replay-core.exe> <openssl.exe> --cold-download
~~~

`research/flclash-core-integration/` 提供固定源补丁、构建、入站测试启动器与来源记录；正式可选核心包另附完整对应源码和依赖。维护者受控 TUN 探测不等于微信或跨端验收。历史输入与失败证据保留。
