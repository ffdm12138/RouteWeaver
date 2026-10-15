# V14.2 Clash Mi 补做与验证

2026-10-12 用户追加 iOS Clash Mi。新增端修订 `clashmi-r1`，规则基线仍为 `embedded-domain-r1`，继承 [最终需求](../../需求.md) 的十一条合同。第 10 条原三客户端范围在本轮扩展为 Windows、Android、iOS Shadowrocket 与 iOS Clash Mi；原需求字节和历史报告保留。本轮没有更新远程规则来源，也没有替换运行客户端。

## 交付和来源

- [独立 Clash Mi JS](../../../releases/v14.2/src/ios/v14.2-clashmi.js)
- [导入与应用设置](../../guides/ClashMi使用说明.md)
- [生成来源与源码哈希](../../../releases/v14.2/metadata/clashmi-sources.json)
- [官方源码兼容性记录](../../../releases/v14.2/metadata/clashmi-compatibility.json)
- [静态回执](../../../releases/v14.2/validation/clashmi.json) · [本机核心回执](../../../releases/v14.2/validation/clashmi-core.json)

核对 [官方发布 1.0.31.1703](https://github.com/KaringX/clashmi/releases/tag/v1.0.31.1703)，固定提交 `daef7be6c40d49a98a174a82c10599e163e71afd`。覆写管理器支持 JS，并调用 `main(config)`；字符串结果直接写成核心配置。新增入口因此返回 JSON 文本，避免依赖移动端对象桥转换。官方管理器、最终覆写、VPN 服务、iOS 路由实现和许可证共九份源码已保存并绑定哈希。

生成器从当前已审核 Android 原字节构建独立脚本，再拼入 iOS 适配器。没有运行时 require、仓库文件依赖或凭证。业务规则、规则 provider、组、节点、sniffer、选择保存和 DNS 分类逐项与 Android 基线完全一致；DNS 仅补本机监听地址。国内主表 111,595 条、内嵌域名 115,438 条保留。项目来源锁共有 45 个固定来源，Clash Mi 与 Android 当前运行各引用其中 23 个；来源及 DIRECT 范围未改。

iOS 适配器采用官方默认 gVisor 栈与隧道地址、MTU 1280，提供双栈全路由、严格路由、UDP/TCP 53 劫持，关闭进程查找和 LAN 监听。旧 TUN 旁路字段先于依赖收集清除，订阅原有原生扩展追加规则不继承。实际 VPN 文件描述符、includeAllNetworks/enforceRoutes、系统排除项以及应用在 JS 后的最终合并仍由 Clash Mi 管理，使用说明给出必需设置。

## 分层结果

| 层级 | 本轮证据 | 结果 |
|---|---|---|
| 独立源码与桥模拟 | 10 项合同检查、882 条独立路由用例、604 条 DNS 归属；完整三次重复覆写、固定来源和生成确定性 | PASS |
| 原始核心解析 | 真实脚本输出，含生产 iOS TUN 配置；Mihomo `-t` | PASS，仅解析 |
| 本机 TCP/UDP 路由 | 882 次核心观察，含共享/公司优先级、主动 DIRECT、未知 UDP、UDP 不支持、失效节点拒绝 | PASS |
| 本机 A/AAAA DNS | 409 次观察，含两公共组/单节点/DIRECT、持续解析器切换、IPv6 回环拨号及 API Fake-IP 例外 | PASS |
| 本机选择器 | 112 次观察，覆盖 file provider、原始节点重载、自定义 override-expr 注入和选中节点删除 | PASS |
| iOS JS/最终配置 | 真实 flutter_js/JavaScriptCore 与用户已安装版本 | NOT_RUN |
| iOS NetworkExtension | 实际 VPN 路由、DNS/UDP/IPv6、公网双栈、故障和切换 | NOT_RUN |
| iOS 内存与持续运行 | 完整内嵌表及 gVisor 在约 50 MB 扩展限制下的行为 | NOT_RUN |

核心为 `Mihomo Meta v1.19.31 windows amd64`，哈希在回执中。执行时仅使用自己的回环进程及合成节点、关闭 TUN；没有发送公网目标流量。DNS 证书仅用于实验，生产入口不关闭证书验证。选择器实验保留生产手动组声明，仅停用不被业务组引用的测速功能。

首次静态发现顶层 JSON 键插入顺序使重复输出文本不同，但配置对象一致；适配器仅稳定文档顶层键序，DNS 策略插入次序保留。另一个测试假定空 override 必含表达式，已改为显式注入自定义 DIRECT 表达式，并由本机选择器实验验证防旁路。原失败回执和首版适配器保存于 `validation/inputs/clashmi-attempts/`。

首次核心实验受沙箱 `EACCES 127.0.0.1` 阻止，失败回执和原日志已保存；随后获准运行同一隔离实验并通过。这属于执行环境边界。核心回执绑定实际新增源码、适配器、生成器、测试辅助程序和来源锁。

## 交付包与边界

新增 JS、适配器、生成器、来源元数据和使用说明进入 V14.2 配置包及独立审核包；审核包额外包含专项检查、官方证据与实验回执。包校验工具对新增端单独核验当前哈希，并在全新解压目录重放专项静态、生成确定性；`--fresh-clashmi` 可重放本轮三个核心实验。当前是否运行了包内核心重放以 `dist/v14.2/package-verification.json` 为准。

旧交付包保存在 `archive/v14.2-before-clashmi-r1-20261012/`；本轮改动前的导航、文档、工具和回执原字节在 `validation/inputs/clashmi-before/`，这是一份限定文件快照。Windows、Android、Shadowrocket 入口与原规则锁均未改变。

Clash Mi 属于同一 Mihomo 语义分支，保留已审核的单标签 LAN 正则；Shadowrocket 原有 52 个单标签边界继续保留。官方 FAQ 的 [iOS 内存限制](https://clashmi.app/guide/faq)、实际 JS 桥、客户端最终设置、VPN 接管与公网 IPv6 未计为通过。详见 [手机验收步骤](../../guides/ClashMi使用说明.md)。
