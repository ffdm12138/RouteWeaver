# Changelog

## 2026-10-28 · CI 门禁拆分与 IPv4-only 回执刷新

- `verify.yml` 拆成两层：push/PR 运行不依赖原生回放的离线生成、静态/兼容合同、IPv4-only 一致性和洁净检查；严格来源/回执绑定、打包与归档扫描只在 Release 发布或手动 `workflow_dispatch` 时运行。生成物更新但回执尚未重绑的中间提交不再让每次 push 变红并发送失败邮件；发版时仍会严格拦截。
- 补跑 `tools/test-ipv4-only.cjs`，刷新 `releases/v14.3-ipv4-only/validation/static.json` 的 `manifestSHA256`。此前 rc.8 更新 `MANIFEST.json` 后该公开回执已过期，而 push 流程没有覆盖这项检查。
- 本地验证：公开索引扫描、31 项单元测试、严格 `verify-v14.3.py`、打包、`--with-packages`、三包归档扫描、生成检查、全部静态合同和 IPv4-only 67 项一致性通过；未运行原生回放和实机验收。

## v14.3.0-rc.8 — api-real-answer-by-mode-r1

- `fake-ip-filter` 里的 `api.openai.com` 例外按模式区分，取代 rc.7 的全模式 DoH 解析：`ipv4-local` / `ipv4-only` 抑制 AAAA 后 Chromium 拿不到 IPv6 Fake-IP 的 ULA，例外只剩一个本地解析依赖，直接回到纯 Fake-IP（代理远端解析，本地零解析依赖）；`dual-stack` / `auto` 保留真实 A/AAAA，走同一「OpenAI 服务」组的 DoH/443。
- 为什么不能靠换前缀绕过：Chromium 的地址空间表把 `fc00::/7`、`fe80::/10`、`fec0::/10`、`2001:db8::/32`、`3fff::/20` 全部判为 `local`，任何可用作 Fake-IP 的 IPv6 段都会触发公共页面 `public → local` 拦截；IPv4 `198.18.0.0/15` 不在表内，所以 IPv4 Fake-IP 一直没问题。
- 原生证据冻结：本轮没有回放核心，既有 native/macOS 回执按原字节冻结到 `validation/inputs/api-doh-before/`（10 个文件），由 `tools/record-source-only.py` 记录，`verify-v14.3.py` 强制校验「快照存在、哈希自洽、且不等于当前入口」，并断言 `appliesToCurrentEntries: false`。核心回放与实机仍为 NOT_RUN，不冒充通过。
- 两侧 `verify-v14.3.py`、`package-v14.3.py`、`--with-packages` 全过，CI 恢复 push 全严格校验。

## v14.3.0-rc.7 — api-doh-egress-r1

- `api.openai.com` 是配置中唯一被排除出 Fake-IP、必须真实解析的域名（Chromium 会把 IPv6 Fake-IP 的 ULA 判为本地网络并拦截公共页面访问 API）。此前它的解析继承业务组 DoT/853 策略，853 被运营商或节点封禁时该域名单独 SERVFAIL，其余 Fake-IP 域名无感。本修订保留真实答案，把这一条精确主机策略改为同一「OpenAI 服务」组的 DoH/443。
- 不改 Fake-IP 范围、其余 DNS 上游、分流、UDP/STUN 保护、TUN、节点组。`ipv4-local`／`auto` 模式的 DNS 过滤适配继续生效。Shadowrocket 原生配置本来就用 DoH/443，不受影响。
- 六份标准入口与六份 `ipv4-only` 入口重新生成并通过静态全量对照（27/11/10/5/73/67 项）。本轮**未运行**隔离核心回放与实机验收；既有核心回执仍绑定修改前字节，不作为本修订证据。DoH 不解析 `disable-reuse`，切换节点后该条解析可能短暂复用旧连接。
- 完整说明与回滚见 `docs/reports/v14.3/API真实解析DNS出口修复.md`。

## 未发布 — controller-readiness-r1 · 2026-10-17

- 为 rc.6 两项间歇性本地 API 回放失败增加共享控制器：实际时间上限、就绪期限、有限幂等重试、核心退出检测与有界清理；保留所有业务断言。
- 保存原始 FAIL 与修改前基线，独立记录新回放；证据校验同时核对历史失败和当前通过，不再把“必须有两项 FAIL”写死为发版条件。
- 七个客户端入口、核心二进制和固定规则不变，设备自动能力仍单独验收。详细结果见 [修复报告](docs/reports/v14.3/rc6本地API回归修复.md)。

## v14.3.0-rc.6 — auto-local-family-r1

- **rc.6 公开版已知回归（PRE-RELEASE）**：native-core 本地 API timeout；balanced-empty-core provider API ECONNREFUSED。两项保留 FAIL，不计通过；用户明确授权先发版，自动能力的设备原生接入仍未验收。

- 六份 JS 单入口默认请求 auto，保留两种显式模式；共同业务规则与节点选择不变。Shadowrocket 增加原生能力限制说明，不伪造检测支持。
- 新增可选 Windows FlClash 匹配核心/Helper：有界接口与被动网络证据、同名 A 替代确认、应用 DNS 自适应与独立节点/远端地址族。IPv6-only、用户显式 hosts/地址族、局域网、未知状态保留。
- 诊断必须读回实际原生状态，不能以保存配置代替能力证明；新原生测试与源码/包分别绑定哈希。未替换现用客户端，未认证其它平台宿主或真实媒体。
- 完整对应源码与锁定依赖独立分发，rc.5 及更早标签/附件保持不变。

## v14.3.0-rc.5 — 2026-10-16

- 各客户端只保留一个入口；六份 JS 内含双栈/IPv4 兼容模式，Shadowrocket 保留一份原生配置。
- 抽取共用运行函数与审核数据生成阶段，新增 Windows Clash Verge Rev 适配、能力表和脱敏最终配置诊断。
- 真实 QuickJS/Boa 对照 432 项；保留 Clash Mi 对象返回和序列化输入。
- Windows FlClash 专用可选核心：限定 DIRECT IPv6 网络不可达停止重复退避，明确非 TLS 短首包提前结束识别；严格路由、双栈和原分流保留。
- 已接入维护者 FlClash；有限 TUN 失败反馈显著缩短，微信真实媒体及其它设备仍独立待验收。附匹配 Helper、完整对应源码/依赖、许可及回滚。
- 稳定需求与动态验收分离；rc.1～rc.4 标签及失败证据保持。


## v14.3.0-rc.4 · 2026-10-16

- `http-recovery-r1`：IPv4-local JS 对既有 HTTP 端口使用 Host 重解析，补齐 rc.3 识别域名却仍拨原 IPv6 的缺口；原公司出口、手动 IP、LAN 与用户排除保留。标准入口和 Shadowrocket 保持原字节。
- 51 项兼容静态、123 项隔离核心通过，增加完整自有 HTTP 响应、原代理与排除项、只关闭 HTTP 目标覆盖的失败对照。标准核心证据按不变源码核对，未冒充本次全部重跑。
- 新日志确认 rc.3 生效后媒体仍失败。rc.2/rc.3 均记失败，rc.4 媒体待复测、无域名 IPv6 仍未解决；不宣称通用地址转换或偷偷改变 DIRECT 出口。

## v14.3.0-rc.3 · 2026-10-16

- `ipv6-fallback-r2`：兼容 JS 对业务/直连上游过滤 AAAA/SVCB/HTTPS，补齐客户端空 AAAA 未约束内部解析的缺口，保留节点引导与 DNS 出口选择。
- 兼容 JS 启用 TLS/QUIC 协议域名重解析，HTTP 目标替换与排除项保持；撤掉宽泛 IPv6 拒绝，恢复原业务策略和 IPv4 节点承载 IPv6 目标。
- Shadowrocket 仅保留 IPv4 偏好，不宣称同等回退。46 项新静态、101 项隔离核心及既有回归分别核验。
- rc.2 Windows 媒体失败保持记录，rc.3 应用/设备复测待做；没有任意 IPv6 到 IPv4 转换或自动网卡探测，节点超时仍需手动处理。


## v14.3.0-rc.2 · 2026-10-16

- 新增通用本地无 IPv6 出口兼容入口，保留六个标准双栈文件；所有应用共享 DNS/公网字面量快速失败机制，不添加微信特例。
- Mihomo 域名节点未显式指定地址族时默认 IPv4 优先，保留同一节点 IPv6 后备；provider 刷新和用户设置保持。
- IPv4 节点传输仍可承载 IPv6 目标；代理失败不回落 DIRECT。Shadowrocket 原生能力和验收单列。
- 新增第 12 条需求、模式指南、来源绑定、31 项静态与 37 项隔离核心检查；重新执行既有回归并纳入三种发布包。各设备实际接管和应用重试待验收。


## v14.3.0-rc.1 · 2026-10-15

- 首次公开预发布：Windows、Android、iOS Clash Mi、iOS Shadowrocket、macOS FlClash 与 macOS Clash Mi 六个独立入口。
- 保留 V14.3 国内协议跟组、公司归类、手动节点选择、固定远程来源与小型内嵌基线。
- 独立公开目录，保留共同设计需求，不包含个人目标地址例外和相关记录。
- 新增项目 Harness、来源/许可声明、Git 索引及 ZIP 内容扫描、字节保持属性和 Windows/Linux CI。
- 发布包带逐成员哈希、固定 ZIP 元数据、许可和来源，并从全新解压目录复验生成/静态合同。
- 原生设备、Shadowrocket 原生 DNS、公开 IPv6、浏览器和长时运行仍待验收。

## 2026-10-16 · rc.4 转圈等待研究（导入入口不变）

- 用户反馈更新：可以发图，仍需转圈等待；日志不能证明带宽慢。273 条不可达警告对应 29 组 IPv6 DIRECT 元组，26 组各重试 10 次。
- 增加固定 Mihomo 来源的 DIRECT IPv6 TCP 网络不可达快速失败原型、GPL-3.0 补丁、源码重建与原生对照；5 个 Go 测试函数、24 子例、123 项现有隔离核心回放通过。
- 原型未接入客户端，应用 IPv4 后备、嗅探等待及 TUN/跨平台仍待验收。当前十二个导入文件、已发布 rc.4 标签和附件不变，不作为新 JS 修复版发布。
