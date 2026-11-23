# RouteWeaver

业务组统一按「主节点缺失 · 已选备用 → 高纯净度AI用 → 高网速视频用 → 直连 direct → 拒绝 reject」排列。两个公共组和「漏网之鱼」也可手选 DIRECT，首次导入沿用各组的原默认值。 [使用说明](docs/guides/使用说明.md)

跨平台分流覆写，按客户端选择对应入口。每个网络版本都提供七份 JS 和一份 Shadowrocket 原生配置。本目录是独立公开版源码。

## 版本与下载

| 版本 | 本地入口 | GitHub 预发布 |
|---|---|---|
| 支持 IPv6 的主版 | [各客户端导入文件](releases/v14.3/README.md) | [主版 v14.3.0-rc.24](https://github.com/ffdm12138/RouteWeaver/releases/tag/v14.3.0-rc.24) |
| 纯 IPv4 版 | [各客户端导入文件](releases/v14.3-ipv4-only/README.md) | [纯 IPv4 v14.3.0-ipv4-only-rc.15](https://github.com/ffdm12138/RouteWeaver/releases/tag/v14.3.0-ipv4-only-rc.15) |

两条发布线的 JS 都支持三档原生故障转移。规则模式下在原组选择 A，再手选所需的三个备用，按 A → 1 → 2 → 3 选路。活动链探测间隔 3 秒，超时 3 秒。 [故障转移说明](docs/guides/故障转移.md)

## 主版快速导入

| 客户端 | 直接导入 | 使用说明 |
|---|---|---|
| Windows FlClash / Mihomo | [v14.3-windows-flclash.js](releases/v14.3/src/windows/v14.3-windows-flclash.js) | [说明](docs/guides/使用说明.md) |
| Android FlClash（Mihomo 核心） | [v14.3-android-flclash.js](releases/v14.3/src/android/v14.3-android-flclash.js) | [说明](docs/guides/使用说明.md) |
| iOS Clash Mi | [v14.3-clashmi-domestic-protocol-r1.js](releases/v14.3/src/ios/v14.3-clashmi-domestic-protocol-r1.js) | [说明](docs/guides/ClashMi使用说明.md) |
| iOS Shadowrocket | [v14.3-shadowrocket.conf](releases/v14.3/src/ios/v14.3-shadowrocket.conf) | [说明](docs/guides/使用说明.md) |
| macOS FlClash | [v14.3-macos-flclash.js](releases/v14.3/src/macos/v14.3-macos-flclash.js) | [说明](docs/guides/MacBook使用说明.md) |
| macOS Clash Mi | [v14.3-macos-clashmi.js](releases/v14.3/src/macos/v14.3-macos-clashmi.js) | [说明](docs/guides/MacBook使用说明.md) |
| Windows Clash Verge Rev | [v14.3-clash-verge.js](releases/v14.3/src/clash-verge/v14.3-clash-verge.js) | [说明](docs/guides/ClashVerge使用说明.md) |
| ProjectClash（iPhone、iPad、Mac、Apple TV） | [v14.3-projectclash.js](releases/v14.3/src/projectclash/v14.3-projectclash.js) | [说明](docs/guides/ProjectClash使用说明.md) |

主版默认请求 auto，实际自动判断需要匹配的原生核心。用原装核心且本地无 IPv6 出口时，可手动选同一份 JS 的 `ipv4-local` 模式。需要限制核心的本地连接和节点拨号都使用 IPv4 时，导入纯 IPv4 版。两种模式的设备接管设置分别核对。 [网络模式与设备设置](docs/guides/IPv4兼容模式.md)

## 文档与验证

- [使用与维护文档](docs/README.md) · [需求](docs/需求.md) · [当前验收](docs/status/当前验收.md) · [变更记录](CHANGELOG.md)
- [当前文件与发布记录](CURRENT_RELEASE.json) · [开源与发布流程](docs/maintenance/开源与发布.md)

业务 DNS 沿用原业务组，使用阿里云和 DNSPod 的标准 DoH/443。DIRECT 拨号和明确直连域名使用设备系统 DNS。原版 Mihomo 配置解析已通过。 [迁移与回滚](docs/guides/业务DoH迁移.md)

原装 Windows FlClash 0.9.4 和固定 ProjectClash 内核的隔离回放覆盖首次默认值、手选、订阅刷新及 TCP、UDP、DoH、DoT 选路。各端导入界面与 TUN/VPN 待实机验收。 [FlClash 回执](releases/v14.3/validation/proxy-failover/selector-option-order-r1.json) · [ProjectClash 回执](releases/v14.3/validation/projectclash-selector-option-order-r1.json)

原创内容采用 [MIT](LICENSE)，上游规则与历史可选核心使用各自的许可。 [第三方声明](THIRD_PARTY_NOTICES.md)
