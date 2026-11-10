# macOS FlClash 故障小本子

适用于 FlClash 的 macOS 主版和纯 IPv4 版。每次记录 FlClash 与核心版本、macOS 版本、实际绑定的脚本 SHA-256、网络模式和故障时间。摘录 App 合并后的 `tun`、DNS 关键字段和脱敏错误，订阅 URL、节点凭证与原始日志留在本机。

## TUN 启动和路由

| 现象 | 只读检查 | 恢复判据 |
| --- | --- | --- |
| `Start TUN listening error: ... add route: 0.0.0.0/0: file exists` | 对照最终 YAML 的 `tun.auto-route`、`route-address` 及 `inet4-route-address`、`inet6-route-address`。检查 FlClash 的 TUN 自定义路由是否在合并时写回默认前缀。用 `route -n get default` 和 `netstat -rn -f inet` 核对物理默认路由与 VPN 路由。 | 使用 Mac 候选并让自定义路由留空。开启 TUN 后由 Darwin 核心建立更具体的接管网段，物理默认路由仍在。关闭再开启及重载订阅后结果一致。 |
| `Unsupported tunName(FlClash) in darwin` | 查看下一条 TUN 结果，用 `ifconfig -l` 核对核心自动选择的 `utun`。FlClash 可在合并时写入自己的设备名。 | 核心选出的 `utun` 出现，TUN 成功监听并有流量经过。 |
| 节点测速有值，YouTube、Codex 或微信连接失败 | 核心测速可绕开应用入站。先查 TUN 启动、最终配置和路由。使用 TUN 单开做对照，分别验证实际应用流量与 DNS。 | YouTube 和 Codex 实际请求成功，日志或连接页显示对应流量走预期策略。 |
| 订阅或覆写下载报 `connectionError` / HTTP 404 | 用出错时间对照下载操作，确认实际绑定的脚本及最后一次成功应用的时间。 | 目标下载成功，重新应用后最终配置与预期脚本哈希和模式对应。 |

2026-11-10 的 Mac 日志在 16:02 连续两次报添加 IPv4 默认路由冲突。旧 Mac FlClash 入口继承了桌面脚本的显式默认路由。当前候选在主版三种模式和纯 IPv4 版都交给核心自动生成，Mac 实机接管待复测。 [Darwin 自动路由](https://github.com/MetaCubeX/sing-tun/blob/v0.4.28/tun_rules.go#L100-L185) · [TUN 加路由实现](https://github.com/MetaCubeX/sing-tun/blob/v0.4.28/tun_darwin.go#L316-L331)

## 系统 DNS 和应用媒体

主版 rc.13、纯 IPv4 rc.4 已补齐已审核微信域名对远程表的离线依赖。排查旧版时，远程表不可用会使 `servicewechat.com` 等主机缺少离线分流。现行版的此类覆盖可从回执核对。 [规则修订记录](../reports/v14.3/云端规则审核与离线修复.md)

- **局域网名称或 TCP DNS 失败。** 用 `scutil --dns` 检查系统和分域 resolver，和最终 YAML 的 `dns`、`tun.dns-hijack` 对照。在 TUN 单开时分别验证公网及所需局域网名称、UDP 53 和 TCP 53。FlClash 0.9.3 后置合并的默认劫持为 `any:53`，需要 TCP 53 时在 App 的 TUN 覆写里同时配置 `any:53`、`tcp://any:53`，再核对最终配置。macOS 的局域网 DNS 接管须单独验收。 [FlClash 合并代码](https://github.com/chen08209/FlClash/blob/v0.9.3/lib/common/task.dart#L199-L217) · [Mihomo TUN 文档](https://wiki.metacubex.one/config/inbound/tun/)
- **TUN 正常但微信发图仍慢或失败。** 在同一网络、同一策略和同一测试图下记录发送时间、实际媒体主机或字面量 IP、地址族、DNS 返回、命中规则和出口。用这些证据分别判断 DNS、嗅探、地址族与节点传输。现行已审核媒体域名的普通 TCP、UDP 和 DNS 跟随「国内网站」，该组默认 DIRECT，仍可主动选代理。无域名的地址及通用 STUN 走各自保护规则。实际图片发送完成才算媒体验收。 [国内媒体覆盖与兼容边界](../reports/v14.3/云端规则审核与离线修复.md) · [历史微信现场复核](../reports/v14.3/微信媒体独立复核_20261016.md)
- **地址族检查。** 用 `netstat -rn -f inet6` 区分物理出口与 TUN 路由。主版 `ipv4-local` 抑制业务 AAAA、保留核心 IPv6 和 TUN 接管。纯 IPv4 版禁用核心 IPv6，物理 IPv6 的防旁路由 App 和系统负责，单独记录结果。

## 维护和实机验收

当前个人版与公开版的两条发布轨都已回归已审核的微信媒体覆盖，包含远程表为空、部分缺失和恢复。六个 Mihomo 客户端对已核对的媒体主机继续使用各模式的 Fake-IP 和嗅探策略，Shadowrocket 走原生域名 DNS 策略。隔离核心也复核了合成的微信媒体域名流量。 [媒体和国内规则回执](../../releases/v14.3/validation/domestic-resilience/darwin-tun-r1.json) · [隔离核心回执](../../releases/v14.3/validation/proxy-failover/darwin-tun-r1.json)

改动 Mac FlClash 的 TUN 或网络模式时，两条发布轨都要查最终配置，包含从带有旧 `/0` 的配置升级。依次验证 TUN 单开、浏览器及 Codex、DNS、关闭后重开和重载订阅。留存修复前后脚本 SHA-256 和脱敏的路由摘要，区分源码、隔离核心与 Mac 实机结果。 [导入和设置](MacBook使用说明.md)
