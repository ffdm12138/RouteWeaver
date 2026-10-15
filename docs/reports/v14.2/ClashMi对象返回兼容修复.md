# V14.2 Clash Mi 对象返回兼容修复

2026-10-12，用户在 **Clash Mi iOS 1.0.30.1605** 成功导入首版脚本，但执行时报 `type 'String' is not a subtype of type 'Map<String, dynamic>' in type cast`。本次 `clashmi-object-r2` 将 `main(config)` 的返回值从 JSON 字符串改为配置对象，并修正此前把输出字符串解析回对象的测试。手机上的修复后执行仍待用户复测。

## 原因与修复

首版 `clashmi-r1` 最后执行 `JSON.stringify(document)`。虽然得到的文字是有效 JSON，JavaScript 返回值的类型仍是 String。此前 fixture 又执行 `JSON.parse`，从而隐藏了客户端桥需要对象的类型约束。

按截图版本核对 [官方 1.0.30.1605 源码](https://github.com/KaringX/clashmi/blob/v1.0.30.1605/lib/app/modules/profile_patch_manager.dart)，固定提交 `f897cbddffb59a4d7f4b667c3659e5d77a15fea7`。其 JS 结果处理分别检查 Dart String、Map 与 FFI Pointer；Pointer 分支调用 `convertValue<Map<String, dynamic>>`。存在 Dart String 分支不能证明 iOS 的 JS 字符串一定映射成 Dart String。截图中的 Map 转换错误与该桥接路径一致；具体运行分支为源码与错误的推断，未在手机调试器中观察。

新版直接 `return document`，序列化交给客户端。业务规则、规则集、代理组、节点、DNS、UDP、TUN 和 DIRECT 边界与首版完全一致，只有返回类型、修订元数据和测试桥改变。旧版本与用户报错保存，不改写首版报告。

- [带修订号的新脚本](../../../releases/v14.2/src/ios/v14.2-clashmi-object-r2.js)，用于重新导入，避免旧缓存或同名副本。
- [标准入口](../../../releases/v14.2/src/ios/v14.2-clashmi.js)，与上述脚本字节一致。
- [使用说明](../../guides/ClashMi使用说明.md) · [源码与兼容性](../../../releases/v14.2/metadata/clashmi-compatibility.json)
- [用户报错与身份更正记录](../../../releases/v14.2/validation/inputs/clashmi-object-error/user-observations.json)
- [静态回执](../../../releases/v14.2/validation/clashmi.json) · [本机核心回执](../../../releases/v14.2/validation/clashmi-core.json)

用户确认第一张截图来自误装的另一客户端，因此该截图仅作为其他客户端的对象返回约束，不计为 Clash Mi 原生证据。第二张明确显示 Clash Mi 和版本 1.0.30.1605，才是本轮真实客户端失败证据。GitHub 1.0.31.1703 的先前源码快照也保留，不能替代截图中的 iOS 版本。

## 验证

| 层级 | 本轮结果 |
|---|---|
| 返回类型反例 | 修复前 JS 真实返回 String，严格对象桥拒绝；修复后真实返回 object，桥校验接受。合法 JSON 字符串、null、数组及其他标量均不能冒充对象 |
| 配置差异 | 对相同合成输入，剔除修订元数据后，首版与修复版完整核心配置完全一致 |
| 静态合同 | 11 项检查，882 条路由、604 条 DNS 归属；对象返回三次幂等、带修订号副本一致、独立生成确定性通过 |
| 本机核心路由 | 882 次观察通过 |
| 本机核心 DNS | 409 次 A/AAAA、出口切换、节点失效和 Fake-IP 观察通过 |
| 本机选择器 | 112 次 file provider、原始节点重载和自定义表达式观察通过 |
| 实机复测 | 新版在用户 iPhone 的 JS 桥、VPN 接管、DNS/UDP/IPv6 和内存承载为 NOT_RUN |

核心实验执行修复版对象输出，使用 Windows Mihomo v1.19.31 的自有回环进程、合成节点、关闭 TUN；生产 TUN 仅做核心解析。Node VM 的对象边界验证不等同于 iOS JavaScriptCore 和 Dart FFI 执行。用户确认重新导入成功后，才可记录该项真实设备通过。

## 交付与历史

正式包包含标准入口及 `object-r2` 副本、当前说明、来源清单和绑定新源码哈希的回执。全新解压后的专项对象回归、生成确定性及必要核心回放，是否执行以 `dist/v14.2/package-verification.json` 为准；原三端沿用相同源码的既有核心证据，未冒充本轮新执行。

首版的 24 份相关原文件保存于 `validation/inputs/clashmi-object-before/`，原交付包保存在 `archive/v14.2-before-clashmi-object-r2-20261012/`。两张用户截图保存在 `validation/inputs/clashmi-object-error/`，iOS 1.0.30.1605 的十份官方源码保存于 `validation/inputs/clashmi-upstream-1.0.30.1605/`。旧 [首版补做报告](ClashMi补做与验证.md)保留原文，其中字符串桥适配结论已被本轮手机反例否定。

Windows、Android、Shadowrocket 入口、已审核分类器、来源锁和十一条需求字节不变。未替换运行客户端，未使用真实节点凭证。
