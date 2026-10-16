# RouteWeaver


跨平台的代理分流覆写脚本，面向 Windows / Android 的 FlClash、Mihomo，以及 iOS / macOS 的 Clash Mi 和 iOS Shadowrocket。

[![Verify public source](https://github.com/ffdm12138/RouteWeaver/actions/workflows/verify.yml/badge.svg)](https://github.com/ffdm12138/RouteWeaver/actions/workflows/verify.yml)
[下载 v14.3.0-rc.4](https://github.com/ffdm12138/RouteWeaver/releases/tag/v14.3.0-rc.4) · [文档](docs/README.md) · [原始需求](docs/需求.md) · [变更记录](CHANGELOG.md)

当前发布 **v14.3.0-rc.4**，对应既有 V14.3 的 `domestic-protocol-r1` 、`macos-r1` 和 `ipv6-fallback-r2` + `http-recovery-r1`。六个平台入口提供独立文件，保留原有业务行为。源码、静态合同和已有隔离核心回执分别核验；**全部平台的原生设备验收尚未完成，因此作为预发布交付。**

## 下载与导入

优先在 [Release 页面](https://github.com/ffdm12138/RouteWeaver/releases/tag/v14.3.0-rc.4) 下载对应单文件，或者下载 `v14.3-deployable.zip`。这些文件不包含节点或订阅，需保留自己的配置并手动选节点。

| 平台 / 客户端 | 独立导入文件 | 使用说明 |
|---|---|---|
| Windows FlClash / Mihomo | [v14.3.js](releases/v14.3/src/windows/v14.3.js) | [Windows](docs/guides/使用说明.md#windows) |
| Android Mihomo 客户端 | [v14.3-android.js](releases/v14.3/src/android/v14.3-android.js) | [使用说明](docs/guides/使用说明.md) |
| iOS Clash Mi | [v14.3-clashmi-domestic-protocol-r1.js](releases/v14.3/src/ios/v14.3-clashmi-domestic-protocol-r1.js) | [Clash Mi](docs/guides/ClashMi使用说明.md) |
| iOS Shadowrocket | [v14.3-shadowrocket.conf](releases/v14.3/src/ios/v14.3-shadowrocket.conf) | [使用说明](docs/guides/使用说明.md) |
| macOS FlClash | [v14.3-macos-flclash.js](releases/v14.3/src/macos/v14.3-macos-flclash.js) | [MacBook](docs/guides/MacBook使用说明.md) |
| macOS Clash Mi | [v14.3-macos-clashmi.js](releases/v14.3/src/macos/v14.3-macos-clashmi.js) | [MacBook](docs/guides/MacBook使用说明.md) |

GitHub 文件页需选择 **Raw / Download raw file** 保存文件。客户端直接导入 JS / conf，无需访问仓库本地路径。[CURRENT_RELEASE.json](CURRENT_RELEASE.json) 是当前入口的机器可读索引。

Windows FlClash 0.9.0 在应用的 TUN 设置中开启“严格路由”，关闭“追加系统 DNS”；同一份 JS 可用于系统代理模式，接管边界见使用说明。Clash Mi 使用返回对象的 `main(config)`，追加覆写选择“内置-不覆写”。Shadowrocket 需自行保留订阅和节点，原生完整国内 DNS 跟组仍待实机验证。

本地网络没有 IPv6 出口时，手动选择 [IPv4 兼容入口](docs/guides/IPv4兼容模式.md)。五种 JS 补齐内部业务 DNS 的 IPv4 解析与 HTTP/TLS/QUIC 域名重解析，撤掉 rc.2 的宽泛 IPv6 拒绝，保留代理远端 IPv6。Shadowrocket 文件仅有 IPv4 偏好。rc.2、rc.3 Windows 媒体案例均失败；rc.4 用户现已能发图，但仍转圈等待；无域名 IPv6 尚未解决。已增加[核心快速失败研究](docs/reports/v14.3/无域名IPv6与转圈等待研究.md)，通过有界实验但未接入客户端。各平台完整验收、自动出口探测和透明地址转换均未完成。

## 分流原则

- 按公司归组，Google / Gemini / YouTube 同组，共享基础设施单独归组；公司规则先于地域直连。
- 两个公共组“高纯净度AI用”“高网速视频用”只手动选择代理节点。业务组可跟随公共组、选择单节点或主动 DIRECT。
- 已审核国内域名的普通 TCP / UDP / DNS 跟随“国内网站”，默认 DIRECT；CN IP 的地域捷径仅供 TCP。
- 未知公网 UDP、通用 STUN 和未知目标仍代理或拒绝；代理故障、节点不支持 UDP 时不会自动回落 DIRECT。
- 完整规则固定到已审核提交，关键业务母域与小型安全表内嵌。冷启动下载失败时只保证内嵌基线覆盖。

## 验证和限制

当前生成器校验源码和输入哈希；静态测试覆盖完整已审核域名集合、DNS/UDP、幂等、故障与边界反例。已有 Windows 隔离 Mihomo 核心回执绑定实际源码；公开 CI 重跑生成、静态、打包和发布内容扫描，**不运行客户端 VPN/TUN 或新的原生核心实验**。

Android VPNService、iOS / macOS NetworkExtension、Shadowrocket 原生解析、公网 IPv6、WebRTC、浏览器和长时运行需独立验收。源码 / 核心 PASS 不能作为这些设备的验收结论。已知未解决项保留在 [CURRENT_RELEASE.json](CURRENT_RELEASE.json)、[版本报告](docs/README.md)和 [SECURITY.md](SECURITY.md)。

## 项目布局

~~~text
RouteWeaver/
├── AGENTS.md / GOALS.md / PLANS.md / PROMPTS.md
├── README.md / CURRENT_RELEASE.json / CHANGELOG.md
├── LICENSE / THIRD_PARTY_NOTICES.md / third_party/
├── .github/workflows/       # Windows / Linux 公开克隆验证
├── docs/                   # 需求、使用、维护、参考、版本报告
├── harness/                # 分阶段计划、上下文、检查记录
├── releases/v14.3/
│   ├── src/<platform>/     # 可直接导入的当前入口
│   ├── data/               # 来源锁和已审核规则
│   ├── tools/ / tests/     # 生成器和合同检查
│   └── metadata/ / validation/  # 来源、固定输入和有界证据
├── tools/                  # 项目验证、打包和公开内容扫描
├── dist/<version>/         # 本地构建输出，上传到 Release，不提交 Git
├── archive/                # 本地历史原字节，不提交 Git
└── .work/                  # 本地实验、缓存，不提交 Git
~~~

[目录职责](docs/reference/项目结构.md) · [开发约定](AGENTS.md) · [阶段计划](PLANS.md) · [维护工具](tools/README.md) · [贡献指南](CONTRIBUTING.md)

## 从公开克隆复验

需要 Git、Node.js 24.19.0 和 Python 3.12（CI 固定 3.12.10）；无需 npm / pip 依赖。

~~~sh
git clone https://github.com/ffdm12138/RouteWeaver.git
cd RouteWeaver
python tools/verify-v14.3.py --skip-history
python tools/package-v14.3.py --skip-history
python tools/verify-v14.3.py --skip-history --with-packages
python tools/audit-publication.py --strict --archive dist/v14.3/v14.3-deployable.zip --archive dist/v14.3/v14.3-audit-evidence.zip --archive dist/v14.3/v14.3-macos.zip
~~~

`--skip-history` 明确记录 `SKIPPED_HISTORY`，仅跳过未公开的本地历史归档。当前需求、六个入口、公开固定输入和已有核心回执的 SHA256 仍核对。公开版的需求保留共同设计目标，不含个人定制条款。[发布流程](docs/maintenance/开源与发布.md)说明包类型、校验和与后续发版步骤。

## 许可与来源

原创代码和文档采用 [MIT](LICENSE)。上游规则及其转换数据、生成文件中的相关数据部分保留各自许可，详见 [第三方声明](THIRD_PARTY_NOTICES.md)和[来源清单](third_party/SOURCES.json)。发布包同时附带原许可和来源，不将全部数据重新许可为 MIT。客户端、节点、核心可执行文件均不打包。
