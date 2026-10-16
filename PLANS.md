# 执行计划

公开合同：[需求](docs/需求.md)。仅在此独立公开目录开发和发版。

| 阶段 | 交付 | 状态 |
|---|---|---|
| 00 | 固定公开输入、共同需求与六个无个人例外入口，独立 Git 边界 | COMPLETE |
| 01 | 根文档、使用/维护/参考索引、Harness、许可和来源 | COMPLETE |
| 02 | 配置差异、生成、静态、公开克隆、包校验、内容扫描 | COMPLETE |
| 03 | main、预发布标签、GitHub CI、Release 附件与下载复验 | COMPLETE |

下一步：分别补充 Windows/Android/iOS/macOS 原生设备、完整国内 DNS、节点失败、UDP、IPv6、WebRTC、浏览器和长时运行验收。记录客户端/系统版本和网络条件，保留失败及未解决结论。

已公开 [v14.3.0-rc.1](https://github.com/ffdm12138/RouteWeaver/releases/tag/v14.3.0-rc.1)，发布提交 `750b4ccd1320b260228a1c739a7b7939294fe146` 的 Windows/Ubuntu CI 通过。14 个附件重新下载后全部匹配 SHA256，未登录访问和下载核对通过。原生设备验收继续作为后续工作。

需求合同、分流优先级和固定远程规则源变化需明确审核。发版不安装客户端、不改外层工作区。实际结果见 [build-log](harness/build-log.md)。


## 2026-10-16 · ipv6-fallback-r1 / rc.2

用户授权通用无本地 IPv6 出口机制，选择保留双栈并新增手动兼容入口，包含本地版及公开新版发布。源码/31 项新静态/37 项隔离核心/完整业务及 Mac/空表/冷下载回归已完成。需求第 12 条、六份兼容入口、各端使用说明和绑定工具已更新。

本轮发布阶段 COMPLETE：本地定制版与全新公开克隆的三包解压回放通过；公开提交 `3b56ff81fa424d8a223709b4eace6ed6b5bebbde` 的 Windows/Ubuntu CI 成功；带说明 rc.2 标签及预发布已公开；20 个附件全部未登录下载并匹配 SHA256。设备 TUN/VPN、应用 IPv4 重试与网络切换仍待实机验收。发布回执见 `harness/releases/v14.3.0-rc.2.json`。

## 2026-10-16 · ipv6-fallback-r2 / rc.3

发布阶段 COMPLETE：内部业务 DNS 过滤、TLS/QUIC 域名重解析、撤掉宽泛 IPv6 拒绝，以及显式 IP/LAN 名称排除均完成。46 项新静态与 101 项隔离核心通过；既有完整回归、个人包、最终公开干净克隆与双平台 CI 均通过。源码 `1923d715779ec72fd73ca34c26fd37c05bf58e92` 已绑定新标签，20 个附件全部公开下载并逐一匹配 SHA256。见 `harness/releases/v14.3.0-rc.3.json`。

设备验收未完成：rc.2 Windows 媒体案例失败保持记录，rc.3 尚待媒体复测。没有可靠域名映射的 IPv6 字面量、节点超时、原生 TUN/VPN、公网 IPv6 和网络切换仍保留边界。运行客户端未修改。
