# RouteWeaver v14.3.0-ipv4-only-rc.1

新增独立纯 IPv4 预发布版本。原来的 auto/双栈版本、标签和 Release 全部保留；本版本从 `release/ipv4-only-r1` 分支发布。

六份 Mihomo JS 将本机直连和本机到代理节点的连接限定为 IPv4；代理服务器往后的出口选择不限制。保留既有公司/国内分组、DNS 跟组、公共组手动选择、业务 DIRECT、UDP 防回落和固定规则来源。节点与 provider 刷新强制 IPv4，IPv6-only 节点/目标失败，不换节点、不回落 DIRECT。显式 IPv6 hosts 的 AAAA 绕过已修复。

附件包括七份独立导入入口、公开配置 ZIP、增量源码回放 ZIP、入口清单、打包回执与 SHA256SUMS。需要打包下载时选择 `RouteWeaver-v14.3-ipv4-only-public.zip`；源码回放使用 `-public-source.zip`。

验证范围：67 项静态/幂等/分流对照；真实 QuickJS 与 Boa 各 66 项；Windows 隔离核心 120 项。发布 CI 在 Ubuntu/Windows 复跑生成、Node 静态、打包、解压静态回放和公开内容扫描，并核对已存的引擎/核心证据哈希；不把已有回执核对称为 CI 重新运行原生实验。

## 使用前必须核对

- 全机纯 IPv4 还需要 App/物理网卡阻止 VPN 外 IPv6，并使用 IPv4 系统 DNS；可用 `x-routeweaver.ipv4-lan-dns` 指定局域网 IPv4 DNS。仅系统代理不能接管任意应用的所有流量。
- App 后置合并必须保留 `ipv6: false`、`dns.ipv6: false` 和节点 IPv4 设置，TUN 严格路由继续开启。
- Shadowrocket conf 不能单独保证节点连接采用 IPv4，必须额外使用 IPv4 字面量节点或禁用节点 AAAA 解析，并在订阅更新后复核。
- 当前环境的 `::1` 阳性对照被 EACCES 阻止；IPv6 服务零命中不能单独认证可用双栈网络的完整防旁路效果。
- 真实 TUN、手机/Mac、媒体与 Shadowrocket 原生接管未验收。本版本不替换运行中的客户端，也不附带或安装核心。

各平台导入和详细边界见本标签的 `releases/v14.3-ipv4-only/README.md`。继续作为 Pre-release 交付。
