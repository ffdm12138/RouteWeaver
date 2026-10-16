# RouteWeaver v14.3.0-rc.4

修复 rc.3 在本地无 IPv6 时遗漏的 HTTP 路径：兼容 JS 原先只按 HTTP Host 分流，仍拨原 IPv6。现在在既有 HTTP 端口使用 Host 重解析，有 A 的 DIRECT 可以使用 IPv4；TLS/QUIC、DNS 过滤和原业务出口选择保留。适用于所有可识别的 HTTP 业务，没有微信专属规则。

最高优先级显式 IP、LAN 名称和用户嗅探排除继续生效；标准双栈及 Shadowrocket 文件保持原字节。使用对应 `-ipv4-local.js`，核对最终配置中 `networkCompatibilityRepair=http-recovery-r1` 与 HTTP/TLS/QUIC 的目标覆盖为 true。兼容模式会重解析带可读域名的 IPv4 字面量，也会影响应用刻意选择的服务器；[模式指南](https://github.com/ffdm12138/RouteWeaver/blob/v14.3.0-rc.4/docs/guides/IPv4%E5%85%BC%E5%AE%B9%E6%A8%A1%E5%BC%8F.md)说明设置与影响。

51 项兼容静态、123 项隔离核心检查通过，含完整自有 HTTP 响应、公司代理、LAN/手动 IP/用户排除及关闭 HTTP 目标覆盖的失败对照。标准入口按不变的源码哈希核对既有核心回执；本次不是重新运行全部原生测试。发布包、CI、附件校验各自记录。

**rc.2 与 rc.3 的 Windows 媒体实测均失败。rc.4 尚未完成微信媒体实测。** 日志仍有无法嗅探的 IPv6 连接，JS 不能把无域名的任意 IPv6 转成 IPv4；原 DIRECT 策略不会静默改成代理。各平台 TUN/VPN、公开 IPv6、跨网络切换及 Shadowrocket 原生未验收，继续 Pre-release。不会自动安装或修改运行客户端。

十二个单文件、三种 ZIP 和包回执不包含订阅或节点。附件校验和见 `SHA256SUMS.txt`，详细[问题和验证范围](https://github.com/ffdm12138/RouteWeaver/blob/v14.3.0-rc.4/docs/reports/v14.3/HTTP%E5%9F%9F%E5%90%8D%E9%87%8D%E8%A7%A3%E6%9E%90%E4%BF%AE%E5%A4%8D.md)。

发布核验完成：源码 `3d8a485dc078b50e6b528514e582e9d92e35e9f7` 的 [Windows/Ubuntu CI](https://github.com/ffdm12138/RouteWeaver/actions/runs/38884042324) 均成功，20 个附件全部匿名下载并逐一匹配 SHA256，三份 ZIP CRC 通过。[发布回执](https://github.com/ffdm12138/RouteWeaver/blob/main/harness/releases/v14.3.0-rc.4.json)在发布后补记。媒体复测与无域名 IPv6 仍未解决。

### 2026-10-16 后续日志与研究

用户在 rc.4 已能发送图片，但仍有转圈等待；尚未完成完整媒体及无域名 IPv6 回退验收。严格路由、双栈接管、原分流和当前十二个导入文件保持。

已增加固定 Mihomo 源码的 DIRECT IPv6 TCP 网络不可达快速失败原型，5 个 Go 测试函数/24 子例、12 个原生对照及现有 123 项隔离回放通过；代理链经 DIRECT 拨节点时保留原重试。它尚未接入客户端，不能将核心实验视为微信/TUN/其它平台验收。

- [原型源码与证据](https://github.com/ffdm12138/RouteWeaver/tree/0359ee361c5e0dc4623bf5caf0b5381d12e8e9f4/releases/v14.3/research/ipv6-direct-fast-fail)
- [日志与完整边界](https://github.com/ffdm12138/RouteWeaver/blob/0359ee361c5e0dc4623bf5caf0b5381d12e8e9f4/docs/reports/v14.3/无域名IPv6与转圈等待研究.md)
- [四套公开覆写方案比较](https://github.com/ffdm12138/RouteWeaver/blob/0359ee361c5e0dc4623bf5caf0b5381d12e8e9f4/docs/reports/v14.3/公开覆写方案比较与改进取舍.md)

本次后续研究没有覆盖此 Release 的标签或附件。当前下载仍是 rc.4，核心原型需要客户端集成和实机验收后再交付。
