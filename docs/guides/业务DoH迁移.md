# 业务 DoH 迁移候选

个人版主版、个人版纯 IPv4、公开版主版和公开版纯 IPv4 均提供八个客户端入口。七份 Mihomo 系列 JS 的默认及按组业务 DNS 使用阿里 DoH/443，失败后在同一已选出口尝试 DNSPod DoH/443。Shadowrocket 原生配置原先已使用 DoH，上游、分流和配置字节保持一致。主版保留双栈和 IPv4 兼容选项，纯 IPv4 版继续过滤 AAAA、SVCB 和 HTTPS 记录。

## 内核要求

JS 用 `routeweaver-doh://` 表示由匹配内核处理的 HTTPS/443 上游。普通 Mihomo 不认识这个方案，会拒绝含该字段的配置。FlClash 0.9.4 的 Windows 配套核心、ProjectClash 固定内核和独立 Mihomo 已在 Windows 编译并通过隔离回环。ProjectClash 四份入口也通过了其匹配核心的配置解析。Clash Verge 需要使用配套 Mihomo；Clash Mi 的内核随 App 发布。FlClash 其他系统以及 ProjectClash 的 Apple App 仍需构建并接入宿主。Shadowrocket 自行管理连接与缓存，出口代次隔离待验证。 [Clash Mi 官方说明](https://github.com/KaringX/clashmi-docu/blob/main/guide/faq.md)

连接池绑定选中的代理链、出站代次及接口和路由标记。答案缓存与同名在途查询在选路后按相同范围隔离。切组、健康状态改变或重载后，新查询只能使用新范围内的连接和答案。HTTP/2 在同出口继续复用，TLS 按上游证书校验，拒绝跨上游重定向。节点引导、明确的 DIRECT、尾网 DNS、微信媒体直连例外保留原有配置。

候选代码接入手动选择、内核的 `fallback`、`url-test` 与负载均衡选路。可冻结的 `dialer-proxy` 链与原业务组一起按代次隔离。受支持的 TUN 自动接口根据系统路由变化更新代次。动态链中无法冻结的会话复用模式、无法定位的出口以及无法报告接口代次的宿主都会失败关闭。A 与 AAAA 查询的回归已通过。Windows 拒绝了测试进程的 IPv6 回环连接，原生 IPv6 传输待验证。

## 生成与基础验证

在每个源码工作区运行以下命令。基础回执比较迁移前后的完整生成配置，仅放行业务 DNS 变化。 [源码和编译回执](../../releases/v14.3/validation/scoped-business-doh-r1.json)

```sh
node releases/v14.3/tools/build-all.cjs --check
node tools/build-ipv4-only.cjs --check
node tools/build-projectclash.cjs --check
node tools/test-scoped-business-doh.cjs --check releases/v14.3/validation/scoped-business-doh-expected.json
```

内核补丁以固定上游 Mihomo 1.19.34 提交为基线，自带回环测试。 [内核源码、许可与测试](../../releases/v14.3/research/scoped-business-doh/README.md)

## 回滚

公开版可重新选用已有标签的对应客户端附件。 [主版 rc.21](https://github.com/ffdm12138/RouteWeaver/releases/tag/v14.3.0-rc.21) · [纯 IPv4 rc.12](https://github.com/ffdm12138/RouteWeaver/releases/tag/v14.3.0-ipv4-only-rc.12)

个人工作区有单独的 `dist/scoped-business-doh-r1/rollback-personal-source.patch`。在个人工作区恢复候选改动前的生成源后，重跑三条生成命令即可重建此前的入口。候选分支上的回执与既有发布记录分别对应各自的源码。
