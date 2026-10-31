<!-- ARCHITECTURE_AUDIT_CURRENT:BEGIN -->
> **当前工作区修订：architecture-audit-r1（2026-11-01）**。两轨七客户端的当前源码、有限静态清单及隔离 Windows 核心已验证；跨端设备、原生 auto 能力和真实 AI 账号任务未验收。
> 本轮仅发布公开源码与候选交付，未安装脚本、改动现用客户端或重启服务。当前公开预发布版本为 `v14.3.0-rc.9`；真实设备验收仍未完成。历史 rc.5–rc.8 段落及旧回执仅作当时记录，不认证本轮新字节。
> 当前入口：[全架构审计与修复](docs/reports/v14.3/全架构审计与修复.md) · [手动部署与验证](docs/guides/本轮修复手动部署.md)。当前候选使用 `tools/verify-current-audit.py` 和 `tools/package-architecture-audit.py`，不重签旧正式发布链。
<!-- ARCHITECTURE_AUDIT_CURRENT:END -->

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

## 2026-10-16 · http-recovery-r1 / rc.4

rc.3 已在用户客户端生效，但新的 Windows 媒体实测失败，取代上一节的待测状态。HTTP 只分流却未重解析原 IPv6 的缺口已复现并修复；51 项兼容静态、123 项隔离核心通过，标准入口哈希不变。发布阶段已完成：个人包、公开全新克隆包、双平台 CI 和 20 个附件匿名下载校验均通过，源码 `3d8a485dc078b50e6b528514e582e9d92e35e9f7`；见 `harness/releases/v14.3.0-rc.4.json`。媒体设备复测、无域名 IPv6、公网出口与跨网络切换仍未完成；未改运行客户端。

## 2026-10-16 · 无域名 IPv6 与转圈等待

核心研究有界完成：固定上游源码补丁、同工具链对照、完整源码重建和现有 123 项隔离回放通过。rc.4 用户可发送但仍转圈，上传带宽下降未被证实。当前入口不变。

待完成：客户端内置核心集成、各 TUN/VPN 栈及时反馈、应用 IPv4 重试、嗅探协议等待、UDP 错误传递和实际网络切换。无可靠映射的 IPv6-only DIRECT 仍需真实 IPv6 出口；不静默改变出口。原型不是这些未完成项的验收。

## 2026-10-16 · 公开覆写方案比较

四套候选已固定提交和文件哈希并完成阅读，未执行/复制实现或改托管规则。比较报告在 `docs/reports/v14.3/公开覆写方案比较与改进取舍.md`。已补字段归属文档；后续按字节等价的共享模块抽取、真实 JS 引擎对照、最终配置诊断、观察记录分离顺序整理。生产 JS 尚未重构，核心集成/设备回退继续待做。

## 2026-10-16 · rc.5 implementation

Shared runtime extraction, seven single entries, both in-file modes, Windows Clash Verge adapter, capability table, allowlisted diagnostics, 432 real-engine comparisons and complete owned-core regression are implemented. The matched FlClash core/Helper was installed with explicit user authorization; narrow Windows TUN failure probes passed. Complete corresponding source, vendored dependencies and rollback materials accompany optional binary assets. Package/CI/release completion is recorded in the execution log; media/other-device/public-IPv6 acceptance remains separate.

## 2026-10-17 · rc.6 pre-release risk acceptance

User requested prerelease while two public native loopback core regressions remain unresolved. Both FAIL receipts and SHA256 are retained in `releases/v14.3/validation/known-release-regressions.json`; independent private-worktree successes do not supersede them. Windows auto-native implementation and all six JS entries are candidate-ready. Native integration of Android, iOS, macOS and the actual Windows auto core/TUN/media is still outstanding, as are public IPv6 and network-change device acceptance. Release only as GitHub Pre-release, never Stable.
