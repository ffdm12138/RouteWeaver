# RouteWeaver v14.3.0-rc.6 — 自动本地地址族候选（Pre-release）

**这是预发布，不是稳定版，也不是所有客户端已经完成自动 IPv6 回退。** 用户明确允许保留失败回归并先发布。此前公开的 rc.1～rc.5 标签、附件和历史失败结论不变。

## 功能与兼容性

- 保留每种客户端一份当前入口：Windows FlClash、Clash Verge、Android、iOS Clash Mi、macOS FlClash、macOS Clash Mi 共六份 JS，默认请求 `auto`，同一文件可选择 `dual-stack` 或 `ipv4-local`；iOS Shadowrocket 独立原生 conf。
- 保留核心 IPv6、TUN/严格路由、已有公司组和手动节点选择，以及现有 DNS/UDP 防泄漏策略。域名节点默认为 IPv4 优先，不等于远端 IPv6 被禁用。
- `auto` **需要匹配的原生核心实际支持**。静态 JS 无法监测物理网卡；普通 Mihomo/移动端/第三方客户端并不会因为读取了这个字段就自动具备能力。Shadowrocket 本次仅保留其原生 IPv4 偏好，不提供此扩展。
- 可选 Windows FlClash 0.9.0 原生自动核心与匹配 Helper：仅在有界、按实际出站接口验证的条件下调整本地地址族候选；无可用 A 替代的 IPv6-only 域名保留 IPv6；节点引导 DNS 与代理远端访问独立。它尚**未安装到维护者当前运行客户端**。
- 无域名且没有等价 IPv4 的字面量 IPv6 连接仍无法凭空转换；快速失败不保证应用一定重试 IPv4。

## 已通过的有界验证

Go 原生测试、匹配核心与 Helper 构建、自动能力原生回环测试（33 项）、网络兼容核心回放（144 项）、网络兼容静态（73 项）、真实 QuickJS/Boa 对照（648 次观察），以及 Windows/Android、Mac、Clash Verge 与小火箭静态和多项原生隔离实验。具体源码哈希与验证范围请见发行包中的 `validation/`、`PACKAGE_MANIFEST.json` 和 `auto-core-package-verification.json`。隔离实验不是实机联网、真实微信上传或全客户端验收。

## 已知失败：本版不隐瞒、不伪造通过

**公开工作树有两项独立原生回归仍为 FAIL**：

1. `native-core` 普通路由核心回放：本地 `/proxies` API 超时；较早一次 provider API 就绪检查出现 `ECONNREFUSED`。
2. `balanced-empty-core` 空规则提供者回放：`/providers/rules` 的本地连接出现 `ECONNREFUSED`。

空规则表是故意把**远程规则提供者**置于空/缺失的受控极端情形，验证内嵌分类器与失败闭合；**不是清空了用户运行中的分流规则**。日志说明测试中的本地核心 API 未按预期就绪，不能断定是分流算法失败，也不能仅凭日常使用正常就认定是纯测试误报。个人定制工作树的另一次完整回放通过，**不抵消公开工作树的这两条 FAIL**。原始失败哈希和非零退出码在 `releases/v14.3/validation/known-release-regressions.json`；本版只标记为 Pre-release，不作为稳定发布验收。自动原生核心未进行真实 Wi-Fi/蜂窝网络切换、公网 IPv6 或微信媒体实测，其他客户端宿主原生接入未完成。

## 附件选择

- 各客户端单文件入口（六份 JS、一份 Shadowrocket conf）；`v14.3-deployable.zip` 全平台配置与文档，`v14.3-macos.zip` Mac 专用入口，`v14.3-audit-evidence.zip` 审核与固定输入。
- `v14.3-rc6-flclash-windows-auto-core.zip`：仅限**匹配原装哈希**的 Windows FlClash 0.9.0，可选自动核心、匹配 Helper、manifest、安装/回滚工具、许可及已知风险说明；不要装入 Clash Verge 或其它客户端，不要混装 rc.5 Helper。
- `v14.3-rc6-flclash-auto-corresponding-source.zip`：包含 Go/Rust 对应源码、vendored 锁定依赖、源码哈希、补丁和 GPL-3.0 许可，独立于根项目 MIT 许可。构建出的核心必须使用其自身哈希重新生成匹配 Helper。
- `SHA256SUMS.txt` 与各 ZIP 旁置哈希用于下载后复核；`package-verification.json`、`auto-core-package-verification.json` 与 `known-release-regressions.json` 分别说明包验证、对应源码和未通过测试。

**本次发布不会远程替换任何正在运行的客户端；用户当前稳定使用的 Windows 手动 IPv4 兼容环境维持原状。**
