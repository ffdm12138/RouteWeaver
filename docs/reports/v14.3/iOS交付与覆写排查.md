# V14.3 iOS 入口恢复与覆写排查

日期：2026-10-13。规则修订仍为 `balanced-r1`，交付修订为 `ios-delivery-r1`。用户报告“小火箭配置不见了”、另一个客户端只有四个策略组并有 DNS/UDP 泄漏；后续确认 Windows、Android 最新版本正常。此次未提供问题客户端的准确名称、当前版本、最终配置或检测结果，按此前使用的 Clash Mi iOS 调查，不能把此推断视为客户端身份确认。

## 小火箭入口与包遗漏

V14.3 发布登记原先只把 Shadowrocket 指向 `archive/v14.2-before-balanced-r1-20261012/`。部署工具只收集 JS 生成清单，因此最新部署包和独立审核包均未提供直接导入的小火箭当前文件。这是交付遗漏，历史文件没有删除。

现恢复 [v14.3-shadowrocket.conf](../../../releases/v14.3/src/ios/v14.3-shadowrocket.conf)，更新注册表、README 和两个 ZIP。文件为不可变 V14.2 候选的原字节副本，大小 **6,168,748 字节**，SHA256 为 `4813040cc00845c0d0cfda47123194598dce6d6d89e4b5e8a377f3ac516774f9`。内部 V14.2 标识、21 份固定远程来源和原生未验收声明保留；没有重新生成分类器或改变运行来源。

交付来源及设置绑定见 [ios-delivery.json](../../../releases/v14.3/metadata/ios-delivery.json)。在完整项目根目录运行 `python tools/restore-ios-delivery.py` 可恢复文件和重建交付清单。Windows、Android 和 Clash Mi JS 均与 `balanced-r1` 的已绑定哈希相同。

## 四组、DNS 与 UDP 的定位依据

实际执行当前三个 JS 的标准合成输入，均生成 **26 个项目策略组**。Clash Mi 返回配置对象，规则模式、核心/DNS IPv6、业务 DNS `nameserver-policy`、空 fallback、UDP 拒绝保护和双栈 TUN 全路由均在。远程 provider 下载失败不会把生成的组减少到四个。

Clash Mi 的 [官方覆写说明](https://clashmi.app/guide/faq#clashmi覆写是如何工作的)确认：自定义配置之后还会执行内置覆写。此前已保存并绑定 1.0.30.1605 与 1.0.31.1703 的官方源码，不把二者当作此次用户已确认版本。具体风险有：

- 当前订阅绑定可独立于覆写列表的全局选中项。官方 `getProfilePatchScriptPath` 在未找到绑定、脚本缺失、内容为空、返回值不支持等路径可继续使用订阅原配置；四组可来自原订阅。运行中的 VPN 不证明 JS 已执行。
- [官方设置生成源码](https://github.com/KaringX/clashmi/blob/f897cbddffb59a4d7f4b667c3659e5d77a15fea7/lib/app/modules/clash_setting_manager.dart)在内置覆写下可写入 DNS。默认 DNS 包含裸 IP 解析器及 `system`，默认 `respect-rules=false`，可以破坏业务 DNS 跟随。订阅级规则/代理组覆写也能替换 JS 生成内容。
- 同一源码的 `defaultConfigNoOverwrite` 仍保留模式、IPv6、TUN 和扩展设置。因此选择「内置-不覆写」之后仍须设置规则模式、核心 IPv6 开启、TUN 顶部覆写关闭。`includeAllNetworks`、`enforceRoutes` 和 VPN 排除项由应用建立 NetworkExtension 时读取，JS 不能代改。

上述路径能解释报告的症状，尚未确认手机实际走了哪一条。具体设置与最终配置核对见 [Clash Mi 使用说明](../../guides/ClashMi使用说明.md)。DNS 测试站显示固定递归解析器的所在地，本身不足以证明本地网络泄漏；UDP 检测也需区分局域网地址、代理节点公网地址与本地公网出口。

## 验证与未完成项

本轮恢复仅改变交付布局和说明。小火箭与冻结基线保持相同字节；三端 JS 未改变；现有静态、幂等和本机核心回执仍按实际源码哈希核对。单独的 Clash Mi 调查通过 `tests/clashmi-ios-investigation.cjs` 复用现有 TCP/UDP 和 A/AAAA DNS 实验，回执为 `validation/clashmi-ios-investigation.json`；执行范围是 Windows Mihomo 自有回环节点，生产 TUN 先解析、执行关闭 TUN。结果以回执状态为准，初次沙箱阻止回环连接的失败另行保留。

补充调查的 **882 条 TCP/UDP 路由用例通过**。DNS 阶段未全部通过：在去除 `api.openai.com` 真实地址例外的旧配置反例中，期望 Fake-IP 答案的断言失败；同轮 IPv6 回环预检为 `EACCES`，两者因果关系尚未确认。补充调查整体保留 `FAIL`，不能把它计作新的 DNS/双栈通过。此前 `balanced-r1` 源码相同的完整回执仍保持其原日期及范围，不覆盖此次失败，也不证明用户手机正常。

包复验检查 CRC、成员 SHA256、当前小火箭文件和重新解压后的离线生成/静态合同。包内没有重新执行的原生实验不计为 fresh native pass。

**手机端准确客户端、最终配置、JS 桥执行、NetworkExtension 接管、DNS/UDP 实际出口与公网 IPv6仍未验收。用户报告的泄漏没有被标记为已修复。** 此次没有替换或停止运行中的客户端，也没有接触真实订阅和节点凭证。
