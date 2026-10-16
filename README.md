# RouteWeaver

保留严格路由、双栈和公司优先分流的跨平台覆写。

[下载 v14.3.0-rc.5](https://github.com/ffdm12138/RouteWeaver/releases/tag/v14.3.0-rc.5) · [文档](docs/README.md) · [需求](docs/需求.md) · [当前验收](docs/status/当前验收.md) · [变更](CHANGELOG.md)

当前每个客户端只保留一个入口，六份 JS 各自包含 `dual-stack` 和 `ipv4-local` 两种模式；默认双栈。旧的重复兼容文件已移出当前 `src/`。Shadowrocket 使用一份保留 IPv6、偏好 IPv4 的原生配置，能力边界单独说明。

| 客户端 | 直接导入 | 使用说明 |
|---|---|---|
| Windows FlClash / Mihomo | [v14.3.js](releases/v14.3/src/windows/v14.3.js) | [说明](docs/guides/使用说明.md) |
| Android Mihomo 客户端 | [v14.3-android.js](releases/v14.3/src/android/v14.3-android.js) | [说明](docs/guides/使用说明.md) |
| iOS Clash Mi | [v14.3-clashmi-domestic-protocol-r1.js](releases/v14.3/src/ios/v14.3-clashmi-domestic-protocol-r1.js) | [说明](docs/guides/ClashMi使用说明.md) |
| iOS Shadowrocket | [v14.3-shadowrocket.conf](releases/v14.3/src/ios/v14.3-shadowrocket.conf) | [说明](docs/guides/使用说明.md) |
| macOS FlClash | [v14.3-macos-flclash.js](releases/v14.3/src/macos/v14.3-macos-flclash.js) | [说明](docs/guides/MacBook使用说明.md) |
| macOS Clash Mi | [v14.3-macos-clashmi.js](releases/v14.3/src/macos/v14.3-macos-clashmi.js) | [说明](docs/guides/MacBook使用说明.md) |
| Windows Clash Verge Rev | [v14.3-clash-verge.js](releases/v14.3/src/clash-verge/v14.3-clash-verge.js) | [说明](docs/guides/ClashVerge使用说明.md) |

本地无 IPv6 出口时，按[网络模式说明](docs/guides/IPv4兼容模式.md)修改同一份 JS 顶部默认值，或通过输入字段选择模式。不是自动物理网络探测。两种模式都保留核心 IPv6 和 TUN IPv6 接管；代理远端仍可访问 IPv6。

Windows FlClash 0.9.0 有独立的[可选核心与回滚说明](docs/guides/FlClash核心接入与回滚.md)：限定的本地 IPv6 不可达停止重复退避，明显非 TLS 的短首包提前识别失败。维护者 Windows TUN 受控探测从数秒缩到 15～31 ms；完全无首包的 443 仍等待约 1 秒。这是失败反馈实验，未测量微信真实发图耗时。JS 单文件不会替换核心。

两个公共组只手动选代理节点；业务组允许跟随、单节点或明确 DIRECT。国内普通 TCP/UDP/DNS 跟组，CN IP 捷径仅 TCP；未知公网 UDP/STUN 继续保护，代理失败不会回落 DIRECT。远程规则仍固定审核提交。

公开版不含个人 VPS 直连例外。

真实 QuickJS、Boa 与 Node 的 432 项对照通过。源码、有限核心回放、Windows TUN 和包复验分别记录；Clash Verge App、Mac/iOS/Android 原生接管、Shadowrocket、公网 IPv6和真实媒体发送未统一验收，因此仍按预发布交付。用户选择正常使用后反馈。

`runtime/` 是可读共用源码，`src/` 是独立导入产物，`data/` 保存审核规则和能力表。`tools/diagnose-client.py` 可生成省略凭证、节点和目标的最终配置诊断。项目入口由 [CURRENT_RELEASE.json](CURRENT_RELEASE.json) 唯一指定。

从公开克隆复验，使用 Node.js 24.19.0、Python 3.12：

~~~sh
python -m unittest discover -s tools/tests -p "test_*.py"
python tools/verify-v14.3.py --skip-history
python tools/package-v14.3.py --skip-history
python tools/verify-v14.3.py --skip-history --with-packages
~~~

CI 复跑生成、静态、打包及公开内容扫描，核对已绑定的核心/引擎证据，不冒充设备实验。完整维护命令、可选真实引擎重跑见[维护](docs/maintenance/维护与更新.md)。历史标签和失败证据保持原样。

原创内容采用 [MIT](LICENSE)；上游规则、核心派生补丁和可选核心保留各自许可，详见[第三方声明](THIRD_PARTY_NOTICES.md)。可选核心 Release 同时提供完整对应源码、锁定依赖、许可和备份/回滚工具。
