# 业务 DNS 迁移至标准 DoH

两轨 Mihomo 系列入口通过原有业务组连接阿里云 `https://dns.alidns.com/dns-query` 和 DNSPod `https://doh.pub/dns-query`。阿里列首，Mihomo 可以并发查询多个上游。业务 DNS 使用 HTTPS 443 和原有 TLS 证书验证，连接及答案复用由客户端内置核心处理。手动换组和自动故障转移后，核心仍可能复用已有的 DoH 连接或缓存答案。 [Mihomo DNS 配置](https://wiki.metacubex.one/en/config/dns/)

DIRECT 拨号和已有的明确直连域名使用设备系统 DNS。直连域名原有的记录类型过滤继续生效。可切换业务组的早到真实查询仍由原 DNS 策略处理。节点服务器和解析器的引导设置沿用独立路径。四种发行组合的分流、Fake-IP、三档故障转移及地址族配置沿用各自行为。Shadowrocket 保留原生配置。

导入对应客户端的 JS 或 conf 即可使用。迁移只依赖原版核心支持的 DNS 配置。 [公开导入文件](../../README.md#版本与下载)

## 验证与回滚

生成检查核对两个网络版本。全量配置对照保留既有 DNS 策略顺序，并验证其余字段一致。原版 Mihomo v1.19.34 接受合成配置，真实客户端和 TUN/VPN 尚未验收。 [本版解析回执](../../releases/v14.3/validation/standard-business-doh-r1.json)

公开版回滚时，从先前预发布下载对应客户端附件并重新导入。 [主版 DoT 回滚](https://github.com/ffdm12138/RouteWeaver/releases/tag/v14.3.0-rc.21) · [纯 IPv4 DoT 回滚](https://github.com/ffdm12138/RouteWeaver/releases/tag/v14.3.0-ipv4-only-rc.12)
