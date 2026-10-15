# V14.3 国内协议跟组与自包含小火箭配置

当前修订 domestic-protocol-r1 / ios-delivery-r2。已审核国内域名的普通 TCP、UDP、DNS 跟随「国内网站」，默认 DIRECT；公司/共享服务优先，未知公网 IP UDP 和通用 STUN 保持代理或拒绝。业务选择代理后，失败节点或 UDP 不支持不得自动直连。

| 客户端 | 直接导入 | 字节 |
|---|---|---:|
| Windows | [v14.3.js](src/windows/v14.3.js) | 116,057 |
| MacBook FlClash | [v14.3-macos-flclash.js](src/macos/v14.3-macos-flclash.js) | 117,852 |
| MacBook Clash Mi | [v14.3-macos-clashmi.js](src/macos/v14.3-macos-clashmi.js) | 118,839 |
| Android | [v14.3-android.js](src/android/v14.3-android.js) | 115,943 |
| Clash Mi | [v14.3-clashmi-domestic-protocol-r1.js](src/ios/v14.3-clashmi-domestic-protocol-r1.js) | 118,837 |
| 小火箭 | [v14.3-shadowrocket.conf](src/ios/v14.3-shadowrocket.conf) | 1,746,654 |

Clash Mi 标准入口与带修订号入口字节相同，返回配置对象。当前订阅绑定新的 js，追加覆写选择「内置-不覆写」，规则模式、核心 IPv6 开启。标准输入生成 26 个项目策略组。完整步骤见 [Clash Mi 说明](../../docs/guides/ClashMi使用说明.md)。

Windows FlClash 0.9.0 需要在应用「设置 → 网络 → TUN」开启**严格路由**，「追加系统 DNS」保持关闭；应用设置会覆盖脚本中的严格路由值。用户按建议调整后反馈 TUN DNS 检测不再泄露。系统代理可沿用同一份 Windows JS：关闭 TUN、开启系统代理、保留规则模式，但系统 DNS/UDP 和代理绕过列表不由脚本全量接管。见 [Windows 使用说明](../../docs/guides/使用说明.md#windows)。

小火箭保留 9,149 行 Host 表，使用 15 份固定提交远程规则，移除 111,464 行重复国内域名规则。业务与关键国内 DNS 显式声明跟组；其余国内域名采用原生直连 DNS/所选代理节点远端解析，需要在设备验证。配置不含真实节点，先保留自己的订阅，再导入 .conf，路由选择「配置」。

三份 JS 的源码静态和隔离本机核心实验通过；小火箭只有有限源码模型检查。原生 DNS/JS、iOS VPN、Android VPN、公网 IPv6 和长时内存未验收。微信发图慢的根因未确定。本轮未更换运行客户端。结果见 [当前报告](../../docs/reports/v14.3/国内协议跟组与小火箭精简.md)和 [需求](../../docs/需求.md)。

Mac 适配 `macos-r1` 继承相同业务行为，FlClash 使用 Darwin utun，Clash Mi 使用 Apple NetworkExtension。两入口的源码/幂等和 Windows Mihomo 回放单独绑定；Mac App 与实际接管仍待设备验收。见 [MacBook 导入](../../docs/guides/MacBook使用说明.md)和 [适配报告](../../docs/reports/v14.3/MacBook适配.md)。

从本目录执行：

~~~text
node tools/build-balanced.cjs --check
node tools/build-macos.cjs --check
node tools/build-shadowrocket-lean.cjs --check
node tests/static.cjs
node tests/macos-static.cjs
node tests/shadowrocket-lean.cjs
node tests/native-core.cjs <mihomo.exe> <openssl.exe> --current-contract
node tests/native-macos.cjs <mihomo.exe> <openssl.exe>
node tests/native-boundaries.cjs <mihomo.exe> <openssl.exe>
node tests/native-boundaries.cjs <mihomo.exe> <openssl.exe> --cold-download
~~~

审核包包含固定公开输入、原字节基线、当前模型与核心回执。核心和 OpenSSL 二进制须自行提供；包不含私钥、真实订阅或节点密码。生成与静态检查可从独立审核包复验，包内历史失败回执不是当前验收。
