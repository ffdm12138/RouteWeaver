> **支持 IPv6 的主版**。七份 JS 支持三档原生故障转移。 [使用说明](../../docs/guides/故障转移.md)

业务 DoH 候选需要匹配核心。使用原装客户端时，导入既有发布附件。 [迁移与回滚](../../docs/guides/业务DoH迁移.md)

DIRECT 拨号使用设备当前的系统 DNS。应用主动查询真实记录时，原有业务 DNS 策略仍然适用。

**Windows FlClash 0.9.4 建议开启「自动关闭连接」。** 使用原装核心时，手动从 DIRECT 切到代理后，既有 DoH 查询仍可能复用旧直连。隔离测试确认关连接完成后的首笔新查询走新节点。这项证据仅覆盖手动切组。开启时会关闭核心追踪的业务连接。原装核心的自动故障转移仍可能复用旧 DNS 连接。 [FlClash 切组逻辑](https://github.com/chen08209/FlClash/blob/v0.9.4/lib/providers/actions/proxies.dart#L166-L211)

本轮完成配置对照和 Windows 原版核心隔离验证，设备验收待补。Shadowrocket 使用其原生 DIRECT DNS 字段，建议使用支持直连域名专用 DNS 的 2.2.92 或更新版本，实际 DNS 优先级待设备确认。 [Shadowrocket 2.2.92 版本记录](https://t.me/s/ShadowrocketNews?before=1641)

<!-- ARCHITECTURE_AUDIT_CURRENT:BEGIN -->
> **历史架构审计基线 architecture-audit-r1（2026-11-01）**。两轨七客户端的当时源码、有限静态清单及隔离 Windows 核心已验证；跨端设备、原生 auto 能力和真实 AI 账号任务未验收。
> 本轮未安装脚本、改动现用客户端、重启服务或发布 GitHub。历史 rc.5–rc.8 段落及旧回执仅作当时记录，不认证本轮新字节。
> 审计资料 [全架构审计与修复](../../docs/reports/v14.3/全架构审计与修复.md) · [手动部署与验证](../../docs/guides/本轮修复手动部署.md)。该候选使用 `tools/verify-current-audit.py` 和 `tools/package-architecture-audit.py`，不重签旧正式发布链。
<!-- ARCHITECTURE_AUDIT_CURRENT:END -->

# V14.3 单入口交付

## rc.6：自动模式与原生能力边界

当前源码修订 `auto-local-family-r1`，六份 JS 默认请求 `auto`，每客户端仍一份入口，保留 `dual-stack`／`ipv4-local`。自动出口判断需要匹配原生核心，普通核心接受覆写不等于已接入；Shadowrocket 只保留原生 IPv4 偏好与 IPv6 开启。Windows 指定 FlClash 核心/Helper 已完成新编译和隔离验证，但本轮未安装，维护者此前手动兼容客户端不变。移动端受保护 socket 和其它平台宿主仍需独立接入，真实 TUN/媒体/公网 IPv6 未验收。当前说明与证据入口：`docs/guides/自动网络模式.md`、`docs/reports/v14.3/自动本地地址族与跨端能力.md`。

以下涉及 rc.5 的接入记录只认证原版本，不认证 rc.6 自动能力。


公开预发布见[版本与下载](../../README.md#版本与下载)中的「支持 IPv6 的主版」。活动链的探测间隔 3 秒，超时 3 秒。各客户端使用以下对应文件。

| 客户端 | 入口 |
|---|---|
| Windows FlClash / Mihomo | [v14.3-windows-flclash.js](src/windows/v14.3-windows-flclash.js) |
| Android FlClash（Mihomo 核心） | [v14.3-android-flclash.js](src/android/v14.3-android-flclash.js) |
| iOS Clash Mi | [v14.3-clashmi-domestic-protocol-r1.js](src/ios/v14.3-clashmi-domestic-protocol-r1.js) |
| iOS Shadowrocket | [v14.3-shadowrocket.conf](src/ios/v14.3-shadowrocket.conf) |
| macOS FlClash | [v14.3-macos-flclash.js](src/macos/v14.3-macos-flclash.js) |
| macOS Clash Mi | [v14.3-macos-clashmi.js](src/macos/v14.3-macos-clashmi.js) |
| Windows Clash Verge Rev | [v14.3-clash-verge.js](src/clash-verge/v14.3-clash-verge.js) |
| ProjectClash（iPhone、iPad、Mac、Apple TV） | [v14.3-projectclash.js](src/projectclash/v14.3-projectclash.js) · [导入说明](../../docs/guides/ProjectClash使用说明.md) |

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
