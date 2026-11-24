# 业务 DNS 迁移至标准 DoH

两轨 Mihomo 系列入口通过原有业务组连接阿里云 `https://dns.alidns.com/dns-query` 和 DNSPod `https://doh.pub/dns-query`。阿里列首，Mihomo 可以并发查询多个上游。业务 DNS 使用 HTTPS 443 和原有 TLS 证书验证，连接及答案复用由客户端内置核心处理。手动换组和自动故障转移后，核心仍可能复用已有的 DoH 连接或缓存答案。 [Mihomo DNS 配置](https://wiki.metacubex.one/en/config/dns/)

DIRECT 拨号、Tailscale 官方控制域、显式直连与微信/QQ 媒体域名默认使用阿里 `https://223.5.5.5/dns-query#DIRECT`、`https://223.6.6.6/dns-query#DIRECT` 和 DNSPod `https://doh.pub/dns-query#DIRECT` 三个直连 DoH（并开启 `direct-nameserver-follow-policy: true`），避免 macOS / Linux / Android 在开启 TUN 系统 DNS 接管时因 `system` 只剩 TUN 地址而引发全站直连断网。校园网与科研网域名 `edu.cn`、`ac.cn` 走双路策略 `["system://", ...directDns]`，优先尝试系统 DNS 并在失败时自动回退到上述直连 DoH（兼容与纯 IPv4 模式下附加 IPv4/SVCB/HTTPS 过滤）。可切换业务组的早到真实查询仍由原 DNS 策略处理，节点服务器引导保持独立。Shadowrocket 保留原生 `direct-dns-server = system` 并更新 `DIRECT` 兜底 DoH 与 `edu.cn`/`ac.cn` 条目。

导入对应客户端的 JS 或 conf 即可使用。迁移只依赖原版核心支持的 DNS 配置。 [公开导入文件](../../README.md#版本与下载)

## 验证与回滚

生成检查核对两个网络版本。全量配置对照覆盖两条直连 DNS 路径、校园网 STUN 保护、桌面 IPv6 校园网 TUN 旁路与幂等性。原版 Mihomo v1.19.34 完成 56 份合成配置解析，真实客户端和 TUN/VPN 尚未验收。 [本版解析回执](../../releases/v14.3/validation/direct-doh-edu-r1.json) · [历史纯 DoH 回执](../../releases/v14.3/validation/standard-business-doh-r1.json)

公开版回滚时，从先前预发布下载对应客户端附件并重新导入。 [主版 DoT 回滚](https://github.com/ffdm12138/RouteWeaver/releases/tag/v14.3.0-rc.21) · [纯 IPv4 DoT 回滚](https://github.com/ffdm12138/RouteWeaver/releases/tag/v14.3.0-ipv4-only-rc.12)
