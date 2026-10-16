# IPv4 兼容模式

`ipv6-fallback-r1` 保留标准双栈入口，并提供六份独立的 `ipv4-local` 入口。网络没有可用本地 IPv6 出口、应用仍尝试 IPv6 而卡住时，手动选择兼容入口。脚本不探测网卡，不自动随 Wi-Fi/热点切换模式；恢复可用双栈网络后可换回标准入口。

## 选择文件

每个订阅只绑定一份对应客户端入口。兼容入口已包含全部业务规则，不叠加标准脚本。

| 客户端 | IPv4 兼容文件 |
|---|---|
| Windows FlClash / Mihomo | [v14.3-ipv4-local.js](../../releases/v14.3/src/windows/v14.3-ipv4-local.js) |
| Android Mihomo | [v14.3-android-ipv4-local.js](../../releases/v14.3/src/android/v14.3-android-ipv4-local.js) |
| iOS Clash Mi | [v14.3-clashmi-ipv4-local.js](../../releases/v14.3/src/ios/v14.3-clashmi-ipv4-local.js) |
| macOS FlClash | [v14.3-macos-flclash-ipv4-local.js](../../releases/v14.3/src/macos/v14.3-macos-flclash-ipv4-local.js) |
| macOS Clash Mi | [v14.3-macos-clashmi-ipv4-local.js](../../releases/v14.3/src/macos/v14.3-macos-clashmi-ipv4-local.js) |
| iOS Shadowrocket | [v14.3-shadowrocket-ipv4-local.conf](../../releases/v14.3/src/ios/v14.3-shadowrocket-ipv4-local.conf)；能力限制见下文 |

## 到节点、节点到目标、直连分别处理

五种 Mihomo JS 的标准和兼容入口都为没有显式地址族设置的**域名节点**补 `ip-version: ipv4-prefer`。节点有可达 A 地址时优先使用 IPv4，并保留同一节点的 IPv6 后备；不更换用户选中的节点。AAAA-only、IPv6 字面量节点仍需要本地 IPv6 能力。已有 `ip-version`、provider 固定覆写、自定义地址族表达式和字面量节点保持其选择。provider 的默认值用条件表达式处理，刷新后仍生效。

地址族偏好不是通用连通性探测：TCP 可并发尝试双栈并优先 IPv4；UDP 的该字段主要选择解析结果中的 IPv4，不保证所有 UDP/QUIC 节点协议在超时后自动换族。本轮 IPv6 后备验证范围是 TCP，UDP 验证范围是 IPv4 外层承载 IPv6 目标。

到节点用 IPv4，不限制代理协议把 IPv6 目标交给远端。支持相应 TCP/UDP 和 IPv6 出口的节点仍可访问 IPv6 目标。远端没有 IPv6 出口时返回失败，不改用 DIRECT。[Mihomo 节点地址族](https://wiki.metacubex.one/config/proxies/#ip-version)、[provider 覆写](https://wiki.metacubex.one/config/proxy-providers/#override)。

兼容 JS 保留核心 `ipv6: true` 与完整 IPv4/IPv6 TUN 路由；向应用的 DNS 返回空 AAAA，取消 IPv6 Fake-IP 地址池，A 查询继续使用现有策略。已知域名和业务 DNS/UDP 按原分组处理。应用缓存或自行提供的真实公网 IPv6 进入 TUN 时优先 REJECT，不等待无效直连反复超时。局域网、ULA、回环及已映射回域名的 Fake-IP 继续按既有规则处理。[DNS IPv6](https://wiki.metacubex.one/config/dns/#ipv6)、[TUN IPv6 地址](https://wiki.metacubex.one/config/inbound/tun/#inet6-address)。

这对所有应用生效，不添加微信特例。拒绝也覆盖原本可能走代理的公网 IPv6 字面量 TUN 连接，因为这类请求无法可靠识别应用是否有等价 IPv4 地址。HTTP/SOCKS 代理入口仍可把 IPv6 目标交给节点。REJECT 让核心停止该连接，不保证所有系统向 UDP 应用即时返回错误。应用存在 IPv4 后备并正确处理失败时才会重试；纯 IPv6 服务、没有后备的应用或应用自己的重试错误仍会失败。脚本没有 NAT64/NAT46 或透明地址转换能力。

## 导入和核对

1. 保留自己的订阅、节点和手动选择，按上表更换绑定的覆写文件。标准入口和兼容入口二选一。
2. 保持核心 IPv6 开启，保持 TUN/VPN、全路由和严格路由；不要用关闭系统 IPv6、移除 IPv6 路由或关闭 VPN 来代替兼容入口。否则拒绝规则可能接不到连接。
3. Windows FlClash 0.9.0 应用设置在 JS 之后合并：开启 TUN 严格路由，关闭追加系统 DNS，保留核心 IPv6。DNS 覆写不能重新打开 `dns.ipv6` 或添加 `fake-ip-range6`。Android、macOS 同样核对最终配置；Clash Mi 使用“内置-不覆写”，关闭 TUN 覆写并保留全网络接管。
4. 核对最终配置：`ipv6: true`、`dns.ipv6: false`、没有 `dns.fake-ip-range6`、TUN 同时覆盖 `0.0.0.0/0` 和 `::/0`，公网 IPv6 TUN 拒绝规则在公司/地域规则之前。局域网例外继续保留。
5. 应用配置后由用户重连 TUN/VPN；需要时重新打开受影响应用，使旧连接和缓存重新建立。测试文字、图片、表情和其它应用，同时记录网络、系统与客户端版本。不要把这一步视为已完成的设备验收。

系统代理模式只接管实际使用 HTTP/SOCKS 的连接；绕过代理、独立 DNS 和普通 UDP 不保证经过核心。完整的应用级 IPv6 字面量快速失败需要实际 TUN/VPN 接管。[Windows 和 Android](使用说明.md)、[Clash Mi](ClashMi使用说明.md)、[MacBook](MacBook使用说明.md)。

## Shadowrocket 单独说明

兼容 conf 保留 `ipv6 = true` 以接管 IPv6，设置 `prefer-ipv6 = false`，并前置公网 IPv6 与常见 NAT64 前缀的拒绝规则。它没有 Mihomo 的 `IN-TYPE` 和 `ip-version` 等价能力，不能宣称实现了相同的节点地址族默认值或严格的空 AAAA 语义。其规则也无法只限定 TUN，因此可能拒绝代理原本能访问的 IPv6 目标；需要这些服务时使用标准 conf。

该文件仅通过有限源码模型，Shadowrocket 原生 DNS、规则求值/远端解析和回退行为尚未实机验证。不要复制 Mihomo 字段到 conf，也不要把上述 JS 核心实验当作 Shadowrocket 通过。

## 验收范围

新增静态检查、隔离 Mihomo、完整既有业务回归和包校验分别有哈希回执。新增核心实验关闭 TUN，并把守卫中的 TUN 入站显式替换为 SOCKS 来验证拒绝语义；真实系统 IPv6 路由、FlClash 最终合并、Android VPNService、Apple NetworkExtension、网络切换和微信 IPv4 重试均待设备验收。证据见[修订报告](../reports/v14.3/IPv6回退与兼容入口.md)。
