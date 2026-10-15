# V14.3 MacBook 适配

日期：2026-10-14。用户授权新增 FlClash 和 Clash Mi 两个 MacBook 版本，保持现有 JS 与最终需求的业务行为。修订 `macos-r1`，沿用 `domestic-protocol-r1`；未修改 Windows、Android、iOS Clash Mi 或 Shadowrocket 入口字节，未更换运行客户端。

## 平台适配

- FlClash 从当前 Windows 桌面 JS 生成，只补 Darwin TUN 参数清理、有效 utun 名称及出口网卡检测。设备名缺省交由核心寻找空闲 utun；TUN enable/auto-route 保留应用选择，不强制启用。
- Clash Mi 从当前 iOS JS 生成，保留对象返回、gVisor、MTU 1280、双栈全路由、应用提供文件描述符的 Apple NetworkExtension 路径；平台标记和待验收说明改为 macOS。

公司/共享服务归组、Google/Gemini/YouTube 同组、两公共组手动选节点、DIRECT 语义、国内普通 TCP/UDP/DNS、STUN 与未知公网 IP UDP 保护、固定来源、DNS 上游与相邻 UDP REJECT 均保持一致。完整配置比较仅剔除平台 TUN 和说明标记；业务规则及 DNS/代理组选项逐项等价。

依据：[Mihomo v1.19.31 Darwin 网卡实现](https://github.com/MetaCubeX/mihomo/blob/v1.19.31/listener/sing_tun/server.go)、[Clash Mi 固定版本 Apple VPN 服务](https://github.com/KaringX/clashmi/blob/f897cbddffb59a4d7f4b667c3659e5d77a15fea7/lib/app/local_services/vpn_service.dart)、[Apple 平台栈与最终覆写](https://github.com/KaringX/clashmi/blob/f897cbddffb59a4d7f4b667c3659e5d77a15fea7/lib/app/modules/clash_setting_manager.dart)。已有 Clash Mi 官方快照及 SHA256 继续受生成器约束。

## 验证

`metadata/macos-sources.json` 绑定两个实际生成入口、基础入口、生成器与适配器 SHA256。`validation/macos-static.json` 记录 11 项检查：每客户端 233,096 个审核域名/探测子域的 TCP 与 DNS 对照、917 个既有用例、规则全空/部分为空、三次幂等、已有入口与四种旧版合成输入升级、输入不变和对象返回。

`validation/macos-core.json` 记录两个实际 Mac JS 输出在自有 Windows Mihomo 回环核心中的配置解析、TCP/UDP、A/AAAA DNS、手动选择器和入站防旁路实验。只使用合成节点和自有回环 DNS；执行关闭 TUN。沙箱首次拒绝 127.0.0.1 控制连接的失败保存在 `validation/inputs/macos-attempts/sandbox-loopback-denied.json`，不作为通过证据。最终状态及实际观测数量以 `metadata/macos-delivery.json` 绑定的回执为准。

最终回执 `MACOS_LOCAL_CORE_PASS_DEVICE_PENDING`：每客户端 917 项路由、431 项 DNS/Fake-IP、112 项手动选择器、2 项入站观察，共 1,462 项；两客户端共 2,924 项。Mac 静态最终回执 `MACOS_STATIC_PASS`，11 项检查通过。

原三个平台的核心回执仍绑定原字节；未重跑的项目不标为本轮新通过。Mac App JS 引擎、客户端最终合并、实际 TUN/NetworkExtension、Wi-Fi/有线切换、局域网 DNS、公网 IPv4/IPv6 与长期运行未验证；AAAA 查询通过不等于 IPv6 传输通过。完整长尾覆盖继续依赖远程缓存或下载。

独立部署包、Mac 专用包和审核包放 `dist/v14.3/`。包校验核对 CRC、成员 SHA256、凭证范围，并在全新解压审核包内重新执行生成及静态检查；包内未重跑原生核心。

## 本轮微信反馈

用户最初反馈 iOS 微信可发图但稍慢，随后确认关闭 VPN 也会等待，并表示这项无需继续排查。此项按用户要求收住，没有增加微信直连规则、改 DNS、关闭 IPv6或调整 iOS MTU。该对照不能确定网络根因，也不支持把此次等待归因于脚本；前次报告中的未确定结论保留。

导入步骤见 [MacBook 使用说明](../../guides/MacBook使用说明.md)。
