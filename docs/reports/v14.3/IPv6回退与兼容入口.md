# IPv6 回退与兼容入口

2026-10-16，修订 `ipv6-fallback-r1`，公开交付 `v14.3.0-rc.2`。用户授权处理本地网络没有 IPv6 出口的通用机制，并选择保留双栈、另提供 IPv4 兼容入口。需求第 12 条已纳入最终合同；没有替换运行客户端。

## 发现与边界

Windows 故障窗口内，国内目标经 DIRECT 连接公网 IPv6 返回 `unreachable network`；文字正常、图片异常、表情曾短暂停顿。虚拟网卡和 TUN 的 IPv6 路由不能证明物理网络有公网 IPv6。原始诊断日志仅在私人工作目录，不进入公开仓库或发布包。这个证据说明本次连接失败的直接原因，不证明所有 iOS/macOS 图片问题都来自同一原因，也不证明新版已在微信完成实测。

本机到节点、节点到目标、本机直接到目标分别处理。不能由 IPv6 字面量推导等价 IPv4，也不能通过静默改选代理或关闭所有 IPv6 来承诺回退。此前研究的 12 项概念实验不充当当前源码验收；本轮新增实验直接绑定生成源码。

## 实现

- 五种 JS 的标准入口与新增兼容入口，为未显式选择地址族的域名节点补 `ipv4-prefer`；保留显式值、字面量和 provider 自定义地址族表达式。条件默认值覆盖 provider 刷新，不改变两个公共组的手动选择。
- 兼容入口取消客户端 AAAA 与 IPv6 Fake-IP 池，保留核心 IPv6、IPv6 TUN 地址和全路由。所有应用的真实公网 IPv6 TUN 请求前置 REJECT；域名映射、局域网和原业务分组继续处理。应用有后备地址时可重试 IPv4，无后备时明确失败。
- 节点传输地址族与远端目标地址族独立：IPv4 节点传输可承载 IPv6 TCP/UDP 目标；远端拒绝不会回落 DIRECT。
- Shadowrocket 提供单独、能力较窄的源码入口：保留 IPv6 接管、IPv4 偏好和公网 IPv6 拒绝。不能限定入站，也不声称支持 Mihomo 节点字段或同等 DNS 语义；原生仍待验收。

生成输入为 `tools/network-compat.cjs`、`tools/network-compat-runtime.js`、`tools/ipv4-local-adapter.js`；六份兼容入口由 `tools/build-network-compat.cjs` 产生。标准 Mac 继续从 Windows/iOS 继承业务。没有更新固定远程规则来源。

## 当前证据

新增 `validation/network-compat-static.json` 为 31 项静态检查：五种 JS 三次幂等、默认/显式节点族、provider 自定义表达式、DNS/Fake-IP/TUN 联动、各协议公网字面量拒绝、SOCKS 与局域网原策略，以及 Shadowrocket 声明边界。

新增 `validation/network-compat-core.json` 为 37 项真实 Mihomo v1.19.31 隔离检查：9 种 TCP 节点/provider 地址族选择、provider 刷新、远端失败无 DIRECT、IPv4 外层 UDP 承载 IPv6 目标；另对五种 JS 兼容配置分别做原始配置解析、DNS A/AAAA、IPv4 节点承载 IPv6 目标及拒绝规则实验。拒绝实验仅把 `IN-TYPE,TUN` 替换为 `SOCKS`，未启动系统 TUN。TCP IPv6 后备在本机 `::1` 验证，不代表公网 IPv6 可用。UDP 地址族偏好只影响地址选择，不能据此声称所有 UDP/QUIC 协议都会在连接超时后换族。REJECT 的系统反馈和应用重试同样须设备验收。[官方地址族语义](https://wiki.metacubex.one/config/proxies/#ip-version)。

标准入口的完整业务静态、完整规则核心、Mac 核心、空表/冷下载失败回归均重新绑定本次源码；数量、执行结果及工具哈希以 `metadata/balanced-review.json`、`metadata/macos-delivery.json`、`metadata/network-compat-delivery.json` 为准。公开 CI 复验来源、绑定、静态与包，不在云 runner 冒充设备或新的原生核心测试。

JS 三段能力的源码和上述本机核心范围可复验。Windows/Android/macOS/iOS 实际 TUN/VPN、客户端最终合并、Wi-Fi/热点切换、真实远端 IPv6 出口、应用 IPv4 重试和 Shadowrocket 原生均为 **NOT_RUN / DEVICE_PENDING**。纯 IPv6 目标和没有 IPv4 后备的应用仍可能失败。新版是预发布。

## 交付

六个标准入口继续登记在 `CURRENT_RELEASE.json.entries`；六个手动兼容入口登记在 `compatibilityEntries`，默认为双栈，无物理出口自动检测。部署包、审核包和 Mac 包纳入相应兼容文件、说明和绑定证据。使用步骤见[IPv4 兼容模式](../../guides/IPv4兼容模式.md)。发布与远程下载复验结果见[执行记录](https://github.com/ffdm12138/RouteWeaver/blob/main/harness/build-log.md)。
