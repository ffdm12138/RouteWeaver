# ProjectClash 使用说明

同一份 RouteWeaver 脚本可绑定到 ProjectClash 的 iPhone、iPad、Mac 和 Apple TV 配置。上游源码核对版本为 iOS/iPadOS 1.0.13 (133)、macOS 1.0.15 (100) 和 tvOS 1.0.16 (49)。 [客户端源码](https://github.com/ProjectClash/Clash-Client/tree/f84db6a964505c9f8592cc2dd1b16a25454b3dd7) · [固定内核](https://github.com/ProjectClash/Clash/tree/c8f2fc1d58bf9ac856a0bf161bc9489591821f45)

| 版本 | 导入文件 |
|---|---|
| 主版 | [v14.3-projectclash.js](../../releases/v14.3/src/projectclash/v14.3-projectclash.js) |
| 纯 IPv4 | [v14.3-projectclash-ipv4-only.js](../../releases/v14.3-ipv4-only/src/projectclash/v14.3-projectclash-ipv4-only.js) |

## 绑定到订阅

1. 导入完整的 Clash/Mihomo 订阅，规则方案选「配置自带规则」。运行模式选「规则（Rule）」。
2. iPhone 和 iPad 打开配置库，点对应订阅右侧的 ⓘ，进入「配置覆写 → 覆写脚本」。Mac 在侧边栏进「配置（Profiles）」，打开对应配置的「覆写脚本」。导入上表的文件或公开附件 URL，并选中该脚本。 [iPhone 与 iPad 指南](https://clash.md/zh/guide/ios) · [Mac 指南](https://clash.md/zh/guide/macos)
3. Apple TV 在当前 Profile 的「脚本（Script）」填可访问的 HTTPS 脚本地址，再点「立即更新」。公开版可填 GitHub 预发布的 JS 附件地址。个人版可使用自己的私有 HTTPS 地址。 [Apple TV 指南](https://clash.md/zh/guide/tvos) · [公开预发布](../../README.md#版本与下载)
4. 检查配置并更新订阅。为「高纯净度AI用」「高网速视频用」手选节点，按需为「故障转移1～3」指定备用。三档原生回退适用于直接列出节点的订阅。使用代理 provider 的订阅沿用分流与手动选择。 [三档故障转移](故障转移.md)

同一配置绑定一份 RouteWeaver 脚本。应用的全局脚本、自定义前置规则、模块和 DNS 强制覆写可以在脚本后生效。让 RouteWeaver 管理分流时，请关闭会改写这些设置的选项，并核对最终配置。

## 网络与验收

- 主版默认按双栈策略工作，保留 HTTP、TLS 和 QUIC 域名恢复。只有 IPv4 的本地网络可在导入前把脚本顶部的 `ROUTEWEAVER_DEFAULT_NETWORK_MODE` 改成 `ipv4-local`，过滤业务 DNS 的 AAAA、SVCB 和 HTTPS 记录。ProjectClash 的 NetworkExtension 自行决定设备 IPv6 路由。
- 纯 IPv4 版限制内核本机直连、DNS 和节点拨号使用 IPv4，并拒绝进入内核的 IPv6 流量。Apple TV 的 IP Stack 设置应跟随配置，设备级 IPv6 防旁路仍取决于 App/VPN 和网络。局域网的 `system` DNS 使用系统设置。 [纯 IPv4 说明](../../releases/v14.3-ipv4-only/README.md)
- macOS 内核支持按进程识别微信和 Tailscale。iPhone、iPad 和 Apple TV 走相同的域名与 IP 规则。 [上游内核能力](https://clash.md/zh/core)
- 固定 ProjectClash 内核已在隔离回环中验证 TCP、UDP、DoH、DoT 和订阅刷新后的三档回退。Apple App 导入、VPN 接管与真实流量待实机验收。 [回执](../../releases/v14.3/validation/projectclash-r1.json)

更改共享策略后，依次重新生成主版、纯 IPv4 版和 ProjectClash 入口，再回放 ProjectClash 规则。命令在仓库根执行。

```sh
node releases/v14.3/tools/build-all.cjs
node tools/build-ipv4-only.cjs
node tools/build-projectclash.cjs
node tools/test-projectclash.cjs
```
