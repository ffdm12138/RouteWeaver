# V14.2 Apple 内置分流修复

2026-10-11，当前修订 `apple-inline-r1`，前一修订 `thunder-closeout-r6`。用户已授权修复。结论：补齐 `apple.com.cn`、`aaplimg.com` 及其子域的内置连接和 DNS 分类，三端同步；Windows/Android 隔离 Mihomo 核心验证通过。**HTTP 541 根因未定，浏览器登录、TUN/VPN 和 iOS 原生没有实机验证。运行中的客户端未替换。**

## 修复范围

两个后缀已在既有、固定提交的 Apple 分类器中；本轮将其升格到 [共用业务表](../../../releases/v14.2/data/rules/business-services.json)，再生成 Windows、Android 和 Shadowrocket 文件。远程 Apple 表即使有效但内容为空，两个后缀也能先于国内地域规则命中「苹果国际」。

Windows/Android 每个后缀新增业务规则和相邻 REJECT，并新增 `+.域名` DNS 策略。iOS 每个后缀新增内置规则，原有根域与通配 DNS 主机项保持相同值并提前放入内置分类。两端完整生成结果仅有上述差异及修订标记，iOS 其他规则和 DNS 行保持原样。

DNS 服务器、IPv6、Fake-IP、两个手动公共组和规则下载出口均未调整。业务组手动选择 DIRECT 继续生效；选择代理后不支持 UDP 或节点故障时，拒绝或失败，不改为直连。

## 验证与回执

| 验证 | 本轮结果 | 范围 |
|---|---:|---|
| 主静态合同 | 2,673 项通过 | 三端来源模型、既有合同、升级及生成幂等 |
| Apple 专项静态 | 98 项通过 | 精确改动、根域/多级子域、四个登录域名、空表、所有远程表为空、错误后缀边界 |
| 修复前反例 | 8 个保留 | Windows/Android 两个根域及代表子域：TCP 默认国内 DIRECT，DNS 漏网之鱼 |
| 空 Apple 表核心路由 | 130 项通过 | Windows/Android 各 65，手动跟随两公共组、DIRECT、UDP 拒绝和断节点 |
| 空 Apple 表核心 DNS | 128 项通过 | Windows/Android 各 64，A/AAAA 与三种业务选择、相反组选择及断节点 |
| 既有核心路由 / DNS | 1,764 / 818 项通过 | 本轮重新执行，非沿用 R6 回执 |
| 手动选择器 / 入站 | 224 / 4 次通过 | 自建回环服务、关闭 TUN |
| 原发现程序独立复审 | 221 项通过 | 既有 CDN/STUN 有限边界 |

[Apple 静态回执](../../../releases/v14.2/validation/apple-inline.json)、[空表核心回执](../../../releases/v14.2/validation/apple-inline-core.json) 和 [修复元数据](../../../releases/v14.2/metadata/apple-inline-review.json) 绑定实际源码与测试哈希。空表实验使用测试目录中的有效空 Apple 文件提供者，核心确认 `ruleCount=0`；不是远程下载失败实验。DNS 上游在实验中替换成自建回环 DoT/DoH，证明的是策略出口，不证明真实公共解析器选择的 Apple CDN 地区。

主静态继续通过全量 111,595 个国内后缀、223,190 个根/子名称的有限回放；52 个此前声明的单标签 LAN 平台差异仍单独保留。既有 10,636 个业务样本未发现新增分组或 DNS/UDP 错配。测试范围不等于完整互联网覆盖。

旧 R5/R6 精确差异检查原先把“当前文件仍为历史版本”作为前提，本轮改为读取不可变的修复前基线；当前输出由 Apple 专项的完整差异检查约束。入站回归曾在核心规则尚未加载时得到 502，增加全部文件提供者就绪检查后，历史 DIRECT 旁路的 200 和修复后 REJECT 均重现。沙箱回环拒绝及初次失败尝试另行保留，不作为通过计数。

## 交付与实际登录

Windows 文件为 [v14.2.js](../../../releases/v14.2/src/windows/v14.2.js)，Android 文件为 [v14.2-android.js](../../../releases/v14.2/src/android/v14.2-android.js)，iOS 候选为 [v14.2-shadowrocket.conf](../../../releases/v14.2/src/ios/v14.2-shadowrocket.conf)。正式包和全新解压回放结果以 `dist/v14.2/package-verification.json` 为准；当前源码与本机核心状态见 [验收回执](../../../releases/v14.2/validation/final-acceptance.json)。

修复前 R6 的 515 份源码、报告、回执和正式包已完整归档于 `archive/v14.2-before-apple-inline-r1-20261011/`，逐文件核对 SHA256。R1–R6 历史结论按原字节保留。

本轮没有操作 Apple 账号、提交密码或尝试认证。更新 Windows 覆写后，关闭旧 Apple 页面及旧连接，重新开浏览器会话测试；若仍出现 541，需要根据出口变化和该失败 POST 的响应证据继续定位，不能认定这两个规则缺口就是 541 的根因。
