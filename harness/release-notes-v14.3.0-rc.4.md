# RouteWeaver v14.3.0-rc.4

修复 rc.3 在本地无 IPv6 时遗漏的 HTTP 路径：兼容 JS 原先只按 HTTP Host 分流，仍拨原 IPv6。现在在既有 HTTP 端口使用 Host 重解析，有 A 的 DIRECT 可以使用 IPv4；TLS/QUIC、DNS 过滤和原业务出口选择保留。适用于所有可识别的 HTTP 业务，没有微信专属规则。

最高优先级显式 IP、LAN 名称和用户嗅探排除继续生效；标准双栈及 Shadowrocket 文件保持原字节。使用对应 `-ipv4-local.js`，核对最终配置中 `networkCompatibilityRepair=http-recovery-r1` 与 HTTP/TLS/QUIC 的目标覆盖为 true。兼容模式会重解析带可读域名的 IPv4 字面量，也会影响应用刻意选择的服务器；[模式指南](https://github.com/ffdm12138/RouteWeaver/blob/v14.3.0-rc.4/docs/guides/IPv4%E5%85%BC%E5%AE%B9%E6%A8%A1%E5%BC%8F.md)说明设置与影响。

51 项兼容静态、123 项隔离核心检查通过，含完整自有 HTTP 响应、公司代理、LAN/手动 IP/用户排除及关闭 HTTP 目标覆盖的失败对照。标准入口按不变的源码哈希核对既有核心回执；本次不是重新运行全部原生测试。发布包、CI、附件校验各自记录。

**rc.2 与 rc.3 的 Windows 媒体实测均失败。rc.4 尚未完成微信媒体实测。** 日志仍有无法嗅探的 IPv6 连接，JS 不能把无域名的任意 IPv6 转成 IPv4；原 DIRECT 策略不会静默改成代理。各平台 TUN/VPN、公开 IPv6、跨网络切换及 Shadowrocket 原生未验收，继续 Pre-release。不会自动安装或修改运行客户端。

十二个单文件、三种 ZIP 和包回执不包含订阅或节点。附件校验和见 `SHA256SUMS.txt`，详细[问题和验证范围](https://github.com/ffdm12138/RouteWeaver/blob/v14.3.0-rc.4/docs/reports/v14.3/HTTP%E5%9F%9F%E5%90%8D%E9%87%8D%E8%A7%A3%E6%9E%90%E4%BF%AE%E5%A4%8D.md)。
