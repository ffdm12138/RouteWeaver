# 纯 IPv4 独立版本交付

日期：2026-10-17。修订：`ipv4-only-r1`。

本次用户明确要求在既有自用与 release 版本旁各新增一版，本机直连和本机到代理服务器的连接全部采用 IPv4，代理服务器后续出口不作限制。此要求只覆盖新增的 `releases/v14.3-ipv4-only/`；原版 `auto`、`dual-stack`、`ipv4-local` 及原稳定合同保持原样。本次没有改绑、重载或替换正在运行的客户端，也没有修改系统网卡。

个人和公开目录分别从各自 `CURRENT_RELEASE.json.entries` 的实际字节生成七个入口。`tools/build-ipv4-only.cjs` 与 `tools/ipv4-only-runtime.js` 在两目录相同；新增目录有独立清单与 SHA256，根清单以 `variants.ipv4-only` 指向它。原来的七份导入源码均按原哈希复核。

六份 JS 只改变本地地址族相关行为：核心/DNS IPv6 关闭，节点和 provider 刷新后成员强制 IPv4，节点引导 DNS 同样过滤 IPv6 及服务发现提示，IPv6 目的地址在到达核心时拒绝，显式 hosts 只保留活动 IPv4 映射。IPv6-only hosts 与别名在规则阶段拒绝，原映射仅保留在非活动元数据，保证重复覆写稳定。App/系统负责其掌握的 IPv6 旁路和系统 DNS 地址族。

补测保留了一个真实反例：只关闭 `dns.ipv6` 时，显式 hosts 中的 IPv6 仍可直接返回 AAAA。修复后，六个客户端入口的该项查询均为空。第一次回环 API 实验被沙箱 `EACCES` 阻止；Clash Mi 实验还触发了回放核心的“禁止开启 TUN”保护，随后测试显式关闭实验 TUN。原始失败记录保存在本地实验/验证历史，没有把失败改写为通过。

| 验证层 | 两版各自结果 |
|---|---|
| 分流、组、远程锁、输入与幂等 | 67 项 PASS |
| 真 QuickJS / Boa 与 Node 对照 | 每引擎 66 项，共 132 项 PASS |
| Windows 隔离核心 | 120 项 PASS，覆盖直连/代理 TCP、UDP、A/AAAA/SVCB/HTTPS、显式 hosts、IPv6-only 节点、provider 刷新和显式 IPv6 设置覆盖 |
| 自用/公开语义对照 | 七入口只允许个人精确目的地址规则、标记和相应嗅探排除的差异 |
| ZIP | CRC、逐成员 SHA256、独立解压再生成和静态回放，结果在各自 `dist/v14.3-ipv4-only/package-verification.json` |
| 运行客户端、真实 TUN/媒体、手机/Mac、Shadowrocket | NOT_RUN |

IPv6 阳性回环连接 `::1` 在本机被 `EACCES` 阻止。因此 IPv6 测试服务零命中不单独认证“可用双栈网络下所有路径已阻断”；成功的 IPv4 传输、源码强制地址族与失败闭合按各自观察记录。原生实验只使用受控 SOCKS5 节点、临时 DNS/回环服务，并用空的远程分类表隔离网络依赖；完整分流和远程锁由与原入口的静态等价检查覆盖，不能据此声称重新验收了原版的全部远程/设备功能。

每份原生回执绑定最终入口清单、测试源码和实际核心 SHA256。真实引擎回执也绑定实际 runner SHA256。源码 ZIP 是本次增量的有界回放包，带七份原入口的固定字节、生成源码、测试、许可和来源清单；未捆绑或安装核心。

严格全机纯 IPv4 必须完成[使用说明](../../../releases/v14.3-ipv4-only/README.md)中的 App/网卡和 IPv4 系统 DNS 设置；仅导入 JS 不能改变 App 后置合并和 VPN 外流量。Shadowrocket conf 还不能强制节点地址族，需要使用 IPv4 字面量节点或禁用其节点 AAAA 解析并独立实机复核。公开版已按用户后续授权发布独立预发布标签 `v14.3.0-ipv4-only-rc.1`：https://github.com/ffdm12138/RouteWeaver/releases/tag/v14.3.0-ipv4-only-rc.1。Windows/Ubuntu 标签 CI 通过，15 个附件匿名重新下载 SHA256 全部一致；原 main、13 个原远程引用及六个旧 Release 的正文和附件保持。匿名 API 受共享出口限流，匿名网页与附件下载另外验证。
