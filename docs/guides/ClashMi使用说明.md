# V14.3 iOS Clash Mi 使用说明

当前 `ipv6-fallback-r1` 同时提供标准双栈与独立 [IPv4 兼容模式](IPv4兼容模式.md)。本页原有 `dns.ipv6: true` 步骤适用于标准入口；兼容入口应为核心 IPv6 开启、`dns.ipv6: false`、无 IPv6 Fake-IP 池，并保持完整 TUN/VPN 接管。不要把两份覆写叠加使用。

当前修订 **domestic-protocol-r1**。使用 [v14.3-clashmi-domestic-protocol-r1.js](../../releases/v14.3/src/ios/v14.3-clashmi-domestic-protocol-r1.js)，它与[标准入口](../../releases/v14.3/src/ios/v14.3-clashmi.js)字节相同。文件 118,837 字节，约 119 KB；关键母域、登录/API/语音及安全边界内嵌，完整规则由固定远程来源加载。脚本返回配置对象，不返回 JSON 字符串。

此前在 iOS 1.0.30.1605 出现的 String→Map 问题已采用对象返回修复。本版保留该修复及 1.0.30.1605/1.0.31.1703 的官方源码核对；本次源码和本机核心通过，手机执行与内存仍须复测。

## 导入与首次加载

1. 在「我的配置」保留自己的节点订阅。
2. 到「核心设置 → 覆写」，从文件导入 v14.3-clashmi-domestic-protocol-r1.js 并选中；类型为 **js**，**追加覆写选「内置-不覆写」**。使用新文件名避免继续加载旧覆写。
3. 在**正在使用的订阅**设置中明确绑定这个覆写。只在覆写列表中选中脚本，不能代替修改已有订阅的绑定；已有订阅可能仍指向内置覆写。「覆写规则」「覆写代理组」「追加 Apple 推送规则」保持关闭。
4. 核心使用 **规则模式**、**IPv6 开启**。保存后由用户连接 VPN。
5. 打开面板，为「高纯净度AI用」「高网速视频用」分别手动选可用节点。首次默认 REJECT；前者也是远程规则下载出口。确认规则表已加载后依赖完整长尾分流。

## 只看到四个策略组／疑似 DNS、UDP 泄漏

当前脚本在标准输入下生成 **26 个项目策略组**，包括「高纯净度AI用」「高网速视频用」「国内网站」「OpenAI 服务」「Anthropic 服务」「谷歌服务」等。保留的订阅依赖组、名称冲突后的后缀及客户端 GLOBAL 可能增加显示数量。远程规则下载失败也不会把这些组缩成四个。

只有四组时，先回到当前订阅检查上述 JS 绑定，再打开该脚本设置，将「追加覆写」设为「内置-不覆写」。检查订阅的「覆写规则」「覆写代理组」和 Apple 推送追加项已关闭，核心为规则模式、IPv6 开启，然后由用户保存并重新连接。官方流程会在 JS 后追加内置设置；内置 DNS 默认含直连解析器和 `system`，可能覆盖脚本的业务 DNS。

若面板仍显示旧组，核对其连接的是否为本机当前核心，并在日志查找脚本名、`evaluate` 或配置错误。官方 JS 加载路径在脚本未找到、空内容或返回值不支持时可能继续使用订阅原配置，因此“VPN 已连接”本身不能证明 JS 生效。

最终配置至少应保留以下内容；这是核对标准，不需要手工粘贴覆盖自己的节点：

```yaml
mode: rule
ipv6: true
dns:
  enable: true
  ipv6: true
  nameserver:
    - tls://dns.alidns.com:853#漏网之鱼&disable-reuse=true
    - tls://dot.pub:853#漏网之鱼&disable-reuse=true
  fallback: []
tun:
  enable: true
  auto-route: true
  strict-route: true
  dns-hijack: [any:53, tcp://any:53]
  route-address: [0.0.0.0/0, '::/0']
```

还应存在业务 `nameserver-policy` 和 26 个项目策略组。公司 DNS 上游带对应组名，业务 UDP 与兜底 UDP 规则仍在；只保留上面这个片段不足以替代完整脚本。IPv6 开关即使在「内置-不覆写」下仍由应用最终写入，须在核心设置开启。

DNS 检测站可能显示阿里或 DNSPod 的解析器及所在地，因为脚本本来就使用这些递归解析器；这个显示本身不能证明查询从本地网络绕过代理。需要同时观察相应组的 DNS 连接出口。UDP/WebRTC 检测须区分本机局域网地址、节点公网地址和真实本地公网地址；若出现真实本地公网出口，再核对下面的 VPN 接管设置。业务主动选择 DIRECT 属于用户选择，测试代理时应先把被测业务及公共基础服务选到代理。

2026-10-13 的排查按 Clash Mi iOS 进行：用户确认 Windows、Android 最新版本正常，但没有提供此次问题客户端的准确名称、版本、最终配置或测试网址。以上是有源码依据的定位路径；具体手机根因及泄漏消除尚未确认。详见 [iOS 排查记录](../reports/v14.3/iOS交付与覆写排查.md)。

核心优先使用规则缓存，正常更新间隔为 24 小时，拉取的是已审核的固定提交。首次下载失败时关键内嵌服务仍有基线；完整长尾覆盖需要缓存或成功下载。代理失效、节点不支持 UDP 不会自动切 DIRECT。

业务组可跟随两个公共组、选单节点或主动 DIRECT；「国内网站」默认 DIRECT，可集中切到代理；「漏网之鱼」没有 DIRECT。Google/Gemini/YouTube 同组，共享云独立，业务 DNS 跟随本组。公共组始终手动选节点，不测速择优或自动故障切换。

本轮已审核国内域名的普通 TCP、UDP、DNS 都跟随「国内网站」，包括微信相关的 weixin.qq.com、wxapp.tc.qq.com、qpic.cn、qlogo.cn。通用 STUN 名称/端口和未知公网 IP UDP 保持代理或拒绝。旧版国内 UDP/DNS 兜底优先的问题已修正；用户手机发图慢是否因此改善仍需实测，不能排除实际 IPv6/TUN/MTU 或 IP-only 连接问题。详见 [本轮报告](../reports/v14.3/国内协议跟组与小火箭精简.md)。

## TUN/VPN

按已核对应用版本，到「核心设置 → TUN」临时打开「覆写」和「启用」，设置应用选项后把 **TUN 的「覆写」关闭**。应用仍建立实际 VPN，路由配置由 JS 提供。

| 选项 | 设置 |
|---|---|
| 默认路由、includeAllNetworks、enforceRoutes | 开启 |
| excludeLocalNetworks、excludeAPNs | 关闭 |
| excludeCellularServices、excludeDeviceCommunication | 关闭 |
| TUN「覆写」 | 设置完成后关闭 |

不要把追加「不覆写」理解成核心设置全部失效。官方该分支仍会写入模式、IPv6、端口等；若应用设置改动，应查看最终配置是否为 mode: rule、ipv6: true，DNS/UDP 策略及双栈路由是否保留。脚本使用 iOS gVisor、MTU 1280，实际 NetworkExtension 文件描述符由应用建立。

## 复测与证据

导入本版后先确认不会卡住或闪退，且能建立 VPN。再核对业务 TCP/QUIC/Voice/WebRTC、A/AAAA DNS、节点切换、无 UDP/失效节点拒绝、IPv4/IPv6 接管和后台恢复。必要时查看应用与系统终止日志，判断实际内存表现。

本机实验关闭 TUN，只使用合成回环节点；三个 JS 的标准路由、DNS、选择器，以及规则表全空/首次下载被拒绝实验通过。它们不能替代手机 JS 桥、最终合并、NetworkExtension、公网 IPv6 或长期内存验收。本轮 IPv6 回环预检受环境拒绝，AAAA 查询通过也不代表 IPv6 传输通过。详细结果见[本轮报告](../reports/v14.3/国内协议跟组与小火箭精简.md)。

[通用使用说明](使用说明.md)中的出口与 DIRECT 合同仍适用。本次未导入真实订阅或替换运行客户端。
