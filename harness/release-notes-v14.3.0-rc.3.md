# RouteWeaver v14.3.0-rc.3

修复 rc.2 IPv4 兼容模式的两个核心缺口：客户端空 AAAA 没有约束内部目标解析，宽泛 IPv6 拒绝会误伤可代理的 IPv6 目标。保留标准双栈与独立兼容文件，适用于所有应用，不新增微信特例。

- 五种兼容 JS 增加业务/直连上游 AAAA、SVCB、HTTPS 过滤；DNS 仍跟原策略组，节点引导解析和显式地址族保留。
- TLS/QUIC 在既有嗅探端口恢复可读域名并重解析；HTTP 目标替换保持关闭，局域网名称和最高优先级显式 IP 例外排除目标重写。撤掉宽泛 IPv6 拒绝，原分流和 IPv4 节点承载 IPv6 目标恢复。
- 公司优先、未知 UDP/STUN 保护、手动选节点及失败不回落 DIRECT 保持。Shadowrocket 可选 conf 仅有 IPv4 偏好，不能等同 JS 回退。

**安装**：无本地 IPv6 出口时下载对应 `-ipv4-local.js`，替换当前绑定；不要与标准脚本叠加。保持核心 IPv6、全 TUN/VPN 接管和严格路由，关闭追加系统 DNS，核对应用最终合并的 DNS/嗅探设置。详见[模式指南](https://github.com/ffdm12138/RouteWeaver/blob/v14.3.0-rc.3/docs/guides/IPv4%E5%85%BC%E5%AE%B9%E6%A8%A1%E5%BC%8F.md)。

46 项新增静态、101 项隔离核心与既有回归分别有哈希回执。TLS/QUIC 检查使用合成握手首包和回环服务，验证域名恢复及报文路径；不是完整会话或设备 TUN 验收。

**已知限制**：rc.2 Windows 媒体案例仍记录为失败；rc.3 尚待应用复测。没有域名映射的纯 IPv6 私有协议无法透明转换，代理节点超时仍需手动处理。过滤 SVCB/HTTPS 会影响相应服务发现/ECH。没有自动网卡探测。各平台设备接管、公网 IPv6、网络切换和 Shadowrocket 原生均待验收，因此继续 **Pre-release**。

对应单文件、全平台/Mac 部署包和审核包都不含节点或订阅。全部附件校验和见 `SHA256SUMS.txt`，范围见[验证报告](https://github.com/ffdm12138/RouteWeaver/blob/v14.3.0-rc.3/docs/reports/v14.3/IPv6%E5%9B%9E%E9%80%80%E4%B8%8E%E5%85%BC%E5%AE%B9%E5%85%A5%E5%8F%A3.md)。

发布校验完成：最终源码 `1923d715779ec72fd73ca34c26fd37c05bf58e92` 的 [Windows/Ubuntu CI](https://github.com/ffdm12138/RouteWeaver/actions/runs/38877191183) 均成功，20 个附件已全部公开下载并逐一匹配 SHA256。完整[发布回执](https://github.com/ffdm12138/RouteWeaver/blob/main/harness/releases/v14.3.0-rc.3.json)在发布后文档补记保存；设备与媒体复测仍待完成。
