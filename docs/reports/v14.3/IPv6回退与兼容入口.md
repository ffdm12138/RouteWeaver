# IPv6 回退与兼容入口

2026-10-16，当前修订 `ipv6-fallback-r2`，追加修复 `http-recovery-r1`，公开交付 `v14.3.0-rc.4`。保留标准双栈与手动兼容入口，按需求第 12 条分别处理本机到节点、节点到目标和本机直连。没有替换运行客户端。

## rc.2 实机失败与定位

用户替换的 Windows 日志确认 rc.2 兼容脚本已生效，但图片仍失败、表情曾卡顿。62 秒窗口中有 113 条公网 IPv6 TUN REJECT、28 条代理链路 deadline 警告；同时存在 IPv4 尝试，不能说应用完全不回退，也不能把所有失败归因于 IPv6。相同 IPv4 的 TCP 与未知 IP UDP 可分别命中国内组与兜底组，符合现有防护合同；不能用全 CN UDP DIRECT 掩盖节点超时。

原始日志、订阅和节点信息不公开。rc.2 的生成/隔离核心检查只认证当时范围，未认证应用重试。当前保留其已发布标签和附件，修订前本地源码、文档及回执已按原字节归档。

## 修复

- 撤掉所有兼容入口中新增的宽泛公网 IPv6 拒绝，恢复原规则优先级和手动选择。IPv4 节点传输可以继续承载 IPv6 TCP/UDP 目标。
- 五种 JS 兼容入口在客户端 AAAA 过滤以外，为业务/直连上游增加 `disable-ipv6=true`、`disable-qtype-64=true`、`disable-qtype-65=true`。保留 DNS 策略组、节点引导解析、LAN/system 和显式 hosts。节点引导的显式 IPv6 选择仍可用。
- 仅在兼容 JS 的既有 HTTP/TLS/QUIC 嗅探端口启用目标域名重解析，让带可读域名的缓存/字面量连接能重新走 A 记录。rc.4 补齐 HTTP Host 目标重解析，排除项保留。IPv4 字面量也可能按协议域名重新解析，模式影响已明示。
- 协议重解析前排除最高优先级显式 IP 直连前缀及局域网名称，防止先清除目的 IP 而吞掉手动例外；保留用户排除项与公司域名优先，不对全部私网 IP 关闭识别。
- 保留核心 IPv6、双栈 TUN 地址/路由和严格路由；不改变公共组手动选节点、公司优先、未知 UDP/STUN 保护、失败不回落 DIRECT 或固定规则源。
- Shadowrocket 撤掉宽泛拒绝，只保留其原生 IPv4 偏好；明确它没有与 JS 等效的回退能力，原生仍未验收。

标准入口的业务配置没有这一 DNS/嗅探变化，只更新共同修订标记；已有节点域名 IPv4 优先默认值及显式设置保留。每个平台仍独立导入，兼容文件不叠加标准文件。[模式指南](../../guides/IPv4兼容模式.md)列出实际设置。

## 证据与范围

`validation/network-compat-static.json`：51 项检查，包括五种 JS 三次幂等、节点/provider 默认与显式族、过滤前后 DNS 出口一致、节点引导保持、TLS/QUIC/HTTP 设置、兼容规则与标准规则逐字相同、TUN/代理/LAN 路由、Shadowrocket 能力限制。标准 JS 上限 128 KiB、标准生成 JSON 上限 192 KiB 保持；兼容 JSON 由于每个 DNS 上游显式过滤，单独采用 256 KiB 上限并检查。

`validation/network-compat-core.json`：Mihomo v1.19.31、SHA256 `1fa8055e03596fc35167f70e9ecd1890517d38d960a39177445746a1b0defc2b`，123 项真实核心隔离检查。保留节点/provider、刷新、同节点地址族后备、远端拒绝无 DIRECT 等既有检查；对五种兼容输出解析、A/AAAA、SVCB/HTTPS/TXT、内部 DIRECT TCP/UDP IPv4、HTTP/TLS/QUIC 域名恢复、原规则代理 IPv6 TCP/UDP、AAAA-only DIRECT 失败分别验证。

两个受控反例只移除候选配置的上游过滤，仍保持 `dns.ipv6=false`：真实 IP DNS 例外返回 HTTPS IPv6 提示、核心内部 DIRECT 使用 AAAA。候选过滤后两个现象不再发生。另验证独立节点 DNS 仍支持显式 IPv6 节点、嗅探 skip-domain、生效的局域网名称排除，完整 private 表中的 .internal 名称，以及显式 IP 与公司 TLS 名称碰撞。显式 IP 对照在基础策略生成后、兼容适配之前注入 `127.0.0.1/32,DIRECT`，仅用于回环测试，不是新增生产直连范围。这些是隔离配置对照，不是旧设备重放。

实验所有拨号绑定回环；DNS 端点换为自有回环并固定实验 DNS 传输 DIRECT，保留生产过滤；保留生产主规则，关闭后台测速，向嗅探白名单追加自有临时端口。TLS ClientHello / QUIC Initial 到达 IPv4 回环服务后返回合成回执，未完成完整加密会话。无系统 TUN、真实订阅、公开 IPv6 或客户端合并验收。脚本和测试模块按哈希绑定，失败尝试留在本地实验目录，不计为通过。

标准入口保留不变源码的既有完整业务、Mac、有效空表与冷下载核心证据；本次重新运行受影响兼容核心和当前静态合同，并重建三种发布包。实际结果与数量以本版绑定回执为准。源码、核心、包、公开 CI、设备结论不互相替代。

## 尚未解决与验收

Windows rc.2 和 rc.3 媒体案例均记录为失败。rc.4 已在隔离核心补齐 HTTP 恢复，真实媒体仍待复测；无域名 IPv6 路径仍未解决。没有域名映射的私有协议/缓存 IPv6 字面量无法透明转换；本地无 IPv6 时其 DIRECT 仍可能失败，脚本不会偷偷代理。代理节点超时、缺少 UDP/远端 IPv6 仍需用户手动选择可用节点。SVCB/HTTPS 过滤影响依赖这些记录的 ECH/服务发现，属于可选模式的已知取舍。

Android VPNService、Apple NetworkExtension、macOS TUN、Shadowrocket、网络切换、公网 IPv6 和微信真实媒体结果均待各自验收。JS 无自动物理网络探测。下一次用户现场日志必须同时核对新标记、最终 DNS 参数、实际规则与所选节点，不将空 AAAA 或单条连接成功等同业务恢复。

依据：[DNS 参数](https://wiki.metacubex.one/config/dns/)、固定 [v1.19.31 嗅探实现](https://github.com/MetaCubeX/mihomo/blob/v1.19.31/component/sniffer/dispatcher.go)、[DIRECT 实现](https://github.com/MetaCubeX/mihomo/blob/v1.19.31/adapter/outbound/direct.go)、[RFC 9001](https://www.rfc-editor.org/rfc/rfc9001.html)。未更新外部规则来源锁。

## rc.3 后续失败与 rc.4 HTTP 修复

17:18:43–17:19:48 新日志确认 rc.3 真实生效，但仍有 1,323 条 IPv6 DIRECT 网络不可达警告（134 组连接元组），主要端口为 80。HTTP 仅识别域名分流而不重建目标连接的缺口已在旧源码复现，rc.4 增加 HTTP 目标恢复、完整自有响应、公司代理及排除项对照。此前标准入口完全未改，已有标准核心回执仅按不变源码继续核对；新兼容实验重新运行。详细统计、实验限制和仍未解决的无域名 IPv6 见[本轮报告](HTTP域名重解析修复.md)。

## 2026-10-16 后续日志：可发送，仍转圈等待

rc.4 用户现在能够发图，但仍有发送转圈；用户澄清不能认定是上传带宽慢。新窗口 273 条 IPv6 DIRECT 网络不可达警告对应 29 组元组，其中 26 组各重试 10 次。域名恢复被实际使用，剩余无域名路径仍未闭合。

已完成独立核心快速失败原型：仅 DIRECT 字面量 IPv6 TCP 的原生网络不可达停止本次重复拨号，保留原分流和代理远端 IPv6。5 个 Go 测试函数、23 子例和 123 项现有隔离核心回放通过；未接入任何客户端，也不能保证应用 IPv4 后备。现有 rc.4 导入文件和已发布附件不变。详见[无域名 IPv6 与转圈等待研究](无域名IPv6与转圈等待研究.md)。
