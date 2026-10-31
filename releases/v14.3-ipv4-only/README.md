<!-- ARCHITECTURE_AUDIT_CURRENT:BEGIN -->
> **当前工作区修订：architecture-audit-r1（2026-11-01）**。两轨七客户端的当前源码、有限静态清单及隔离 Windows 核心已验证；跨端设备、原生 auto 能力和真实 AI 账号任务未验收。
> 本轮未安装脚本、改动现用客户端、重启服务或发布 GitHub。历史 rc.5–rc.8 段落及旧回执仅作当时记录，不认证本轮新字节。
> 当前入口：[全架构审计与修复](../../docs/reports/v14.3/全架构审计与修复.md) · [手动部署与验证](../../docs/guides/本轮修复手动部署.md)。当前候选使用 `tools/verify-current-audit.py` 和 `tools/package-architecture-audit.py`，不重签旧正式发布链。
<!-- ARCHITECTURE_AUDIT_CURRENT:END -->

# V14.3 独立纯 IPv4 版

日期：2026-10-17。修订：`ipv4-only-r1`。这是在既有版本旁新增的版本，不替换原来的 auto／dual-stack／ipv4-local 七个入口。每个客户端在本目录仍只有一份独立导入文件。

本机直连目标、连接代理服务器都限定 IPv4。代理服务器往后的出口与远端 DNS 地址族由服务器决定。IPv6-only 节点与目标会失败，不会自动换节点、转 DIRECT 或猜测对应 IPv4。

公司、共享基础设施、国内、未知流量的分组和顺序、公共组手动选择、业务组 DIRECT、DNS 跟组、UDP 防回落及固定规则来源沿用本版本各自的原入口。个人与公开版本分别从各自原入口生成，个人目的地址例外只在个人版本保留。

| 客户端 | 导入文件 |
|---|---|
| Windows FlClash | [v14.3-windows-flclash-ipv4-only.js](src/windows/v14.3-windows-flclash-ipv4-only.js) |
| Android Mihomo / FlClash | [Android JS](src/android/v14.3-android-flclash-ipv4-only.js) |
| iOS Clash Mi | [Clash Mi JS](src/ios/v14.3-clashmi-domestic-protocol-r1-ipv4-only.js) |
| Windows Clash Verge Rev | [Clash Verge JS](src/clash-verge/v14.3-clash-verge-ipv4-only.js) |
| macOS FlClash | [Mac FlClash JS](src/macos/v14.3-macos-flclash-ipv4-only.js) |
| macOS Clash Mi | [Mac Clash Mi JS](src/macos/v14.3-macos-clashmi-ipv4-only.js) |
| iOS Shadowrocket | [Shadowrocket conf](src/ios/v14.3-shadowrocket-ipv4-only.conf) |

## Mihomo JS 行为

六份 JS 强制 `ipv6: false`、`dns.ipv6: false`，移除 IPv6 Fake-IP 池和 TUN IPv6 接口地址。原节点、内联节点和 provider 刷新成员统一使用 `ip-version: ipv4`；provider 的强制表达式放在原表达式之后，原来显式写的 IPv6 地址族也被覆盖。此入口始终执行纯 IPv4，订阅携带 auto／dual-stack 字段也不能切回旧模式。无需 rc.6 的自动地址族扩展核心；需要支持现有 provider override-expr 的核心。

业务 DNS、直连 DNS 和节点引导 DNS 均过滤 AAAA/SVCB/HTTPS，保留解析服务器与策略组。首段增加不触发解析的 IPv6 全地址拒绝，阻止到达核心的 IPv6 字面量 TCP/UDP；显式 hosts 的双栈列表保留 IPv4，IPv6-only 映射和关联别名拒绝。系统 hosts 不再读取，避免未受覆写管理的 IPv6 映射重新引入 IPv6。

### 全机纯 IPv4 的客户端设置

导入此入口后，在客户端关闭核心 IPv6 和 DNS IPv6，关闭会覆盖本脚本的额外 DNS 配置；TUN 严格路由继续开启。核对 App 最终合并配置，不能只看 JS 文件。**本轮没有改动运行中的客户端或系统网卡。**

`ipv6: false` 可能同时关闭客户端的 IPv6 TUN 接管，因此保留 `::/0` 路由字段并不能证明物理 IPv6 已被阻止。若要求设备所有流量都纯 IPv4，还须在 App 的 VPN/防旁路设置阻止 IPv6，或在所用物理网卡/路由器禁用 IPv6。仅开系统代理不能接管任意应用的 UDP、DNS 和 IPv6。

局域网 `system`/DHCP DNS 保留原语义，它们的服务器地址由宿主决定。严格纯 IPv4 使用时，系统 DNS 必须也是 IPv4；可以通过输入配置显式指定局域网 IPv4 DNS，避免系统选择 IPv6 DNS。填实际路由器/DNS 地址，不要直接照抄例子：

```yaml
x-routeweaver:
  ipv4-lan-dns:
    - 192.168.1.1
```

只有原来走 `system` 的局域网 DNS 条目采用此地址；公司和国内 DNS 仍按原组查询。仅关闭 `dns.ipv6` 不能控制系统 DNS 的网络传输地址族。此项和 App/物理网卡设置是严格纯 IPv4 的前置条件，不能把脚本生成结果当作全机验收。

## Shadowrocket 必须额外处理节点

conf 关闭 `ipv6`、保留 `prefer-ipv6 = false` 并增加 IPv6 目的拒绝，其余规则保持。**配置文件不能可靠强制订阅节点域名解析与节点 socket 的地址族。**使用纯 IPv4 节点地址，并在 Shadowrocket 中关闭节点域名的 IPv6 解析；订阅刷新后也要核对。只有 conf 不足以认证本机到节点纯 IPv4。未做 Shadowrocket 原生实机验收。

## 验证与再生成

清单在 `MANIFEST.json`，逐个绑定原入口、生成入口和生成工具的 SHA256。`validation/static.json`、`validation/native.json` 分别记录分流/幂等与本机隔离核心结果；Node/QuickJS/Boa、Windows 回环、手机/Mac、真实 TUN/媒体与公网 IPv6 独立计数。

在源码包根目录或项目根运行：

```sh
node tools/build-ipv4-only.cjs --check
node tools/test-ipv4-only.cjs
node tools/test-ipv4-only.cjs <routeweaver-engine-check.exe>
node tools/native-ipv4-only.cjs <isolated-replay-core.exe>
python tools/package-ipv4-only.py
```

源码包包含生成器、适配源码、七份绑定的既有自包含入口与新入口，支持在隔离目录重新生成和静态复验。它是本次增量的回放包，不重新认证原版整个项目的设备范围。原生实验只使用自有 TCP/UDP/DNS 回环服务，显式关闭 TUN，不使用真实节点、订阅和运行控制器。ZIP 附 SHA256、逐成员清单、许可与上游声明。

当前环境连接 `::1` 的阳性对照被 `EACCES` 拦截；该限制保留在原生回执，IPv6 服务零命中不能单独证明可用双栈网络下的拒绝效果。成功的 IPv4 连接、地址族强制与失败闭合分别有静态/核心证据；真实双栈物理网络仍待设备验证。

字段依据：[Mihomo 节点 ip-version](https://wiki.metacubex.one/config/proxies/#ip-version)、[provider 覆盖顺序](https://wiki.metacubex.one/config/proxy-providers/#overrideoverride-expr)、[DNS 附加参数](https://wiki.metacubex.one/config/dns/#附加参数)、[TUN IPv6 条件](https://wiki.metacubex.one/en/config/inbound/tun/#inet6-address)。
