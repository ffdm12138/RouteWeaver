# RouteWeaver v14.3.0-rc.2

本地网络没有可用 IPv6 出口时，保留原双栈入口并新增独立 **IPv4-local** 兼容文件。覆盖所有应用，不添加微信专属分流。

- 六个标准入口继续保留；六个 `-ipv4-local` 文件按客户端手动选择，绑定一份即可。
- 五种 Mihomo JS 对未显式选择地址族的域名节点默认 IPv4 优先，保留同一节点 IPv6 后备及 provider 刷新、用户显式设置。
- 兼容 JS 返回空 AAAA、取消 IPv6 Fake-IP 池，并保留核心 IPv6 和完整 TUN 路由；真实公网 IPv6 TUN 字面量明确拒绝，让具备后备地址的应用重试 IPv4。HTTP/SOCKS 仍可经 IPv4 节点传输 IPv6 目标。
- 代理失败不回落 DIRECT，既有业务、DNS/UDP 和手动选择保持。

**选择与限制**：脚本没有自动物理出口探测。没有 IPv4 后备的应用/纯 IPv6 服务仍可能失败，不提供透明地址转换。保持客户端核心 IPv6、严格路由和全路由接管。Shadowrocket 可选 conf 只有较窄的源码规则能力，可能同时拒绝代理 IPv6 目标，无 Mihomo 节点字段和同等空 AAAA 保证；原生待验收。

需求第 12 条、[模式说明](https://github.com/ffdm12138/RouteWeaver/blob/v14.3.0-rc.2/docs/guides/IPv4%E5%85%BC%E5%AE%B9%E6%A8%A1%E5%BC%8F.md)和[验证报告](https://github.com/ffdm12138/RouteWeaver/blob/v14.3.0-rc.2/docs/reports/v14.3/IPv6%E5%9B%9E%E9%80%80%E4%B8%8E%E5%85%BC%E5%AE%B9%E5%85%A5%E5%8F%A3.md)已更新。

新增 31 项静态、37 项隔离 Mihomo 检查及完整既有回归通过；拒绝规则实验关闭系统 TUN，明确将 TUN 入站替换为 SOCKS。各平台真实 TUN/VPN、应用 IPv4 重试、网络切换、公网 IPv6 和 Shadowrocket 原生仍待验收，因此继续 **Pre-release**。本次不替换用户运行客户端。

下载对应单文件，或全平台部署包 / Mac 包；审核包供离线复验。文件不含节点或订阅。全部附件校验和在 `SHA256SUMS.txt`。
