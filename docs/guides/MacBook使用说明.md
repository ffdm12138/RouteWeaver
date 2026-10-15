# V14.3 MacBook 使用说明

Mac 适配修订 **macos-r1**，业务合同仍为 **domestic-protocol-r1**。Apple Silicon 和 Intel 使用同一份 JS，区别由客户端及其核心二进制处理。

| 客户端 | 导入文件 | 字节 |
|---|---|---:|
| FlClash macOS | [v14.3-macos-flclash.js](../../releases/v14.3/src/macos/v14.3-macos-flclash.js) | 117,852 |
| Clash Mi macOS | [v14.3-macos-clashmi.js](../../releases/v14.3/src/macos/v14.3-macos-clashmi.js) | 118,839 |

两份文件独立运行，不读取项目目录；保留自己的节点订阅，将对应 JS 用作该订阅的覆写。标准合成输入生成 26 个项目策略组。公司、共享服务、国内网站、DNS/UDP 跟组、API 真实地址解析、IPv6、手动节点选择及固定远程来源均与现版一致。

## FlClash

1. 导入自己的订阅，再在其 JS 覆写中导入 `v14.3-macos-flclash.js`，保存并使该订阅使用这份覆写。
2. 使用规则模式，开启核心 IPv6；需要全系统接管时开启 TUN 和自动路由，按应用提示授权 TUN 服务。JS 保留客户端的 TUN 开关和自动路由开关。
3. 为「高纯净度AI用」「高网速视频用」各手动选一个可用节点。首个公共组也是规则下载出口，初始 REJECT 时需要先选节点。
4. 检查生成配置保留 `dns.ipv6: true`、UDP/TCP 53 劫持、`route-address: [0.0.0.0/0, '::/0']`、业务 DNS 策略及项目策略组。规则成功下载或已有有效缓存后才具备完整长尾覆盖。

适配会移除跨平台遗留的 Windows/Linux TUN 名称、文件描述符和不适用的 Linux/Android 参数；有效的 `utun数字` 与 Mac 物理出口 `en数字` 等显式配置保留。未指定设备名时由 Mihomo 选择空闲的 utun 编号，避免固定占用 utun0。出口网卡自动检测开启，Wi-Fi/有线切换仍须实机检查。[Mihomo v1.19.31 实现](https://github.com/MetaCubeX/mihomo/blob/v1.19.31/listener/sing_tun/server.go)

仅使用系统代理时，接管范围限于实际使用代理入口的应用。系统 UDP、应用自有 DNS 和未使用代理的连接需要 TUN 接管。Mihomo 官方还注明 macOS 不能自动劫持发往局域网的 DNS；应核对最终系统 DNS、TUN 内 DNS 及实际出口，JS 不修改系统网络设置。[官方 TUN 文档](https://wiki.metacubex.one/config/inbound/tun/)

## Clash Mi

1. 在「核心设置 → 覆写」导入 `v14.3-macos-clashmi.js`，类型选择 JS，追加覆写选择 **内置-不覆写**。
2. 在**正在使用的订阅**设置中绑定这份覆写；关闭「覆写规则」「覆写代理组」和追加 Apple 推送直连规则。
3. 核心使用规则模式、IPv6 开启。配置应用 TUN/VPN 选项后将 **TUN 的覆写关闭**，由 JS 保留路由；应用继续建立实际 VPN。按应用提示允许 VPN 或系统扩展。
4. 在应用提供的选项中开启默认路由、includeAllNetworks、enforceRoutes，关闭网络/APNs 等排除项。若版本中选项位置变化，应以最终配置和实际 VPN 路由为准。
5. 手动选择两个公共组的节点，检查业务 DNS、双栈路由和 26 个项目策略组，再确认远程表已加载。

Mac Clash Mi 沿用已核对的 Apple NetworkExtension 路径：gVisor、MTU 1280、应用提供实际 TUN 文件描述符，`main(config)` 返回对象。不会使用 FlClash 创建网卡的方式。应用最终合并仍能改写模式、IPv6、TUN/扩展参数；必须在应用中核对。[Clash Mi 固定版本源码](https://github.com/KaringX/clashmi/blob/f897cbddffb59a4d7f4b667c3659e5d77a15fea7/lib/app/local_services/vpn_service.dart)

## 出口与验证边界

业务组可选两个公共组、单节点或主动 DIRECT；「国内网站」默认 DIRECT，已审核国内域名普通 TCP/UDP/DNS 都跟随此组。未知公网 IP UDP、通用 STUN 继续代理或拒绝。代理节点失败或不支持 UDP 不会自动直连。固定规则的缓存和 24 小时刷新由核心负责；首次无缓存且下载失败时只保证关键内嵌名单。

Mac 源码合同、完整有限域名对照、幂等与隔离 Windows Mihomo 核心回放分开记录。Mac 上的 JS 引擎、最终合并、TUN/NetworkExtension、公网 IPv6 和网络切换尚未实机验收。详细证据见 [MacBook 适配报告](../reports/v14.3/MacBook适配.md)。
