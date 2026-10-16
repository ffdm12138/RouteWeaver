# IPv4 兼容模式

当前修订 `ipv6-fallback-r2` + `http-recovery-r1` / `v14.3.0-rc.4`。标准入口继续提供双栈；本地没有可用 IPv6 出口时，手动选择对应兼容入口。没有自动网卡探测，Wi-Fi/热点切换后需核对模式与接管。rc.2 与 rc.3 的 Windows 媒体实测均失败；rc.4 补齐已复现的 HTTP 目标恢复缺口，应用复测及无域名 IPv6 仍未解决。

## 选择文件

每个订阅只绑定一份对应入口，兼容 JS 已包含全部业务规则。

| 客户端 | 文件 | 本版能力 |
|---|---|---|
| Windows FlClash / Mihomo | [v14.3-ipv4-local.js](../../releases/v14.3/src/windows/v14.3-ipv4-local.js) | 完整 JS 兼容机制 |
| Android Mihomo | [v14.3-android-ipv4-local.js](../../releases/v14.3/src/android/v14.3-android-ipv4-local.js) | 同上，VPNService 待验收 |
| iOS Clash Mi | [v14.3-clashmi-ipv4-local.js](../../releases/v14.3/src/ios/v14.3-clashmi-ipv4-local.js) | 同上，NetworkExtension 待验收 |
| macOS FlClash | [v14.3-macos-flclash-ipv4-local.js](../../releases/v14.3/src/macos/v14.3-macos-flclash-ipv4-local.js) | 同上，Darwin TUN 待验收 |
| macOS Clash Mi | [v14.3-macos-clashmi-ipv4-local.js](../../releases/v14.3/src/macos/v14.3-macos-clashmi-ipv4-local.js) | 同上，NetworkExtension 待验收 |
| iOS Shadowrocket | [v14.3-shadowrocket-ipv4-local.conf](../../releases/v14.3/src/ios/v14.3-shadowrocket-ipv4-local.conf) | **仅 IPv4 偏好，不能等同 JS 回退** |

## 三段能力与本次修复

1. **本机到节点**：标准/兼容 JS 都为未指定地址族的域名节点补 `ip-version: ipv4-prefer`，保留同一节点的 IPv6 后备、provider 刷新和用户显式设置。不自动换节点。TCP 后备与 UDP 地址选择的能力不同；不能承诺 UDP 超时会换族。AAAA-only 或 IPv6 字面量节点仍需本地 IPv6。
2. **节点到目标**：本机用 IPv4 连节点，仍允许节点访问 IPv6 目标。rc.3 撤掉 rc.2 的公网 IPv6 前置拒绝，所有目标重新遵守原业务分组和用户选择；节点失败或缺少相应能力时仍失败，绝不转 DIRECT。
3. **本机直连目标**：兼容 JS 关闭客户端 AAAA、取消 IPv6 Fake-IP 池，并为业务/直连解析上游添加 AAAA、SVCB(TYPE64)、HTTPS(TYPE65) 过滤。这样核心内部解析也使用 A，真实 IP DNS 例外不会继续下发这些记录中的 IPv6 提示。DNS 的 `#策略组` 保持；节点引导 DNS 与局域网 `system` 解析独立保留。静态 hosts 显式设置保持。

兼容 JS 在既有嗅探端口（HTTP 的 80、8080–8880，TLS/QUIC 的 443、8443）启用域名目标重解析：可读取域名时，把缓存/字面量地址改为该域名，再按原规则与 DNS 策略建立连接。DIRECT 可重解析到 IPv4，代理仍可让节点解析并访问 IPv6；IPv4 字面量也会受到该域名重解析影响。rc.4 同时使用 HTTP Host 重解析目标，已有嗅探排除项保留。局域网名称（复用现有已审核 private 域名表，包括 .internal）保持原目标，最高优先级显式 IP 直连例外按原始目的前缀排除嗅探；不对全部私网 IP 关闭业务识别，已知公司域名仍保持原优先级。这是协议域名恢复，不是 IPv6 到 IPv4 的地址转换。核心 IPv6、TUN IPv6 地址与全路由继续保留。

过滤 SVCB/HTTPS 会停用依赖这些 DNS 记录的服务发现和 ECH 配置获取；需要这些能力且本地双栈可用时使用标准入口。不会关闭应用的 HTTPS 证书校验。

没有可读域名的私有协议、应用自带加密 DNS/缓存、被排除的连接、纯 IPv6 服务和无 A 记录的 DIRECT 目标仍可能失败。不能从任意 IPv6 地址推导等价 IPv4。节点连接超时也不能由规则脚本修好，需要手动选择可用、支持相应 UDP 与 IPv6 能力的节点；不添加微信专属 IP、全 CN UDP 直连或自动换节点。

## 导入和核对

1. 保存自己的订阅、节点与选择，替换绑定的兼容 JS，标准和兼容入口二选一。
2. Windows FlClash 0.9.0 保持核心 IPv6、TUN、严格路由开启，关闭追加系统 DNS；应用设置会在 JS 之后合并。Clash Mi 使用“内置-不覆写”，关闭额外 TUN 覆写并保持全网络接管。Android/Mac 同样检查最终配置。
3. 最终配置应有 `ipv6: true`、`dns.ipv6: false`，没有 `fake-ip-range6`；业务与 direct DNS 带上述过滤参数，节点引导 DNS 保留；HTTP/TLS/QUIC 的 `override-destination: true`，标记 `networkCompatibilityRepair: http-recovery-r1`；不再有 rc.2 的全局公网 IPv6 REJECT。
4. 保留双栈 TUN 路由。FlClash 可能将 `route-address` 合并为空数组并采用核心默认全路由，应核对实际系统 IPv4/IPv6 接管，不仅看数组文本。不要移除 IPv6 接管，以免切换网络后应代理流量绕行。
5. 由用户应用配置并重连 TUN/VPN，重新建立受影响应用的连接；分别测文字、图片、表情及其它应用。既有“国内网站”选择与“漏网之鱼”节点分别核对：未知 IP UDP 仍走兜底，不能据此认定规则错分。

系统代理只覆盖实际使用 HTTP/SOCKS 的连接；独立 DNS、普通 UDP 和绕过代理的流量不保证接管。[Windows/Android](使用说明.md)、[Clash Mi](ClashMi使用说明.md)、[MacBook](MacBook使用说明.md)。本次发布不自动安装或改动运行客户端。

## Shadowrocket 单独说明

可选 conf 保留 `ipv6 = true` 和原分流，只设置 `prefer-ipv6 = false`。rc.2 的两条公网 IPv6 拒绝已撤掉，避免误伤代理。它没有经过验证的同等上游过滤/TLS-QUIC 重解析和 Mihomo 节点默认能力；不是完整的本地无 IPv6 回退实现。原生 DNS、VPN 和应用行为仍待验收，不复制 Mihomo 字段到 conf。

## 验证范围

51 项兼容静态检查、123 项隔离 Mihomo 核心检查覆盖五种 JS。HTTP 验证完整自有请求/200 响应、原出口与排除项；另有只关闭 HTTP 目标覆盖的失败对照。TLS 使用合成 ClientHello、QUIC 使用按 RFC 9001 构造的 Initial；只验证嗅探、重解析和报文到达回环 IPv4 服务，不是完整 TLS/QUIC 会话或微信媒体验收。实验保留生产规则，DNS 端点换为自有回环、禁用后台测速，并将测试端口追加到嗅探列表；未启动系统 TUN。标准回归、包完整性和设备验收分别记录，详见[修订报告](../reports/v14.3/IPv6回退与兼容入口.md)。

[Mihomo DNS 参数](https://wiki.metacubex.one/config/dns/) · [域名嗅探](https://wiki.metacubex.one/config/sniff/) · [节点地址族](https://wiki.metacubex.one/config/proxies/#ip-version)
