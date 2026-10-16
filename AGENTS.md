# RouteWeaver 工作约定

2026-10-16 用户授权 `ipv6-fallback-r1`：保留标准双栈，六份独立 `ipv4-local` 入口由 `tools/build-network-compat.cjs` 生成并登记在 `compatibilityEntries`。未指定族的域名节点补 IPv4 优先且保留后备；兼容 JS 保留核心 IPv6/TUN 全路由、空 AAAA/取消 fake6、前置公网 IPv6 TUN 拒绝。无自动物理网络探测。Shadowrocket 单列能力限制，设备重试与接管待验收。

当前用户请求优先。根 README 是使用入口，`docs/需求.md` 是公开业务设计合同，`CURRENT_RELEASE.json` 指定六个当前入口。

- 此目录是独立公开源；只提交本目录的文件，不引用或上传外层个人工作区。公开版不包含个人目标地址例外或相关历史。
- 用户设计目标保留在 `docs/需求.md`，不要为整理目录改写合同；共同目标不等于所有平台已通过设备验收。
- 运行入口在 `releases/v14.3/src/<platform>/`，规则在 `data/`。客户端直接导入独立 JS / conf，不读取本地仓库路径。
- 公司规则先于地域 DIRECT；Google/Gemini/YouTube 同组，共享基础设施独立。DIRECT 是主动选择或明确国内/局域网例外；代理失败或 UDP 不支持不得自动直连。
- 两个公共组只手动选代理节点，不提供 DIRECT、测速择优或故障切换；业务组可跟随公共组、选单节点或主动 DIRECT。
- 审核过的国内域名普通 TCP/UDP/DNS 跟随国内组；通用 STUN、未知公网 UDP 保持保护，CN IP 捷径仅供 TCP。
- 远程规则固定已审核提交。先保存候选、哈希和分类差异，再审核采用；不得改为浮动来源。
- 固定输入、原始源码、失败反例和既有回执保留原字节。`.gitattributes` 不转换行尾；不要批量格式化 `validation/inputs/`。
- 修改后执行生成、静态及必要的隔离核心实验。源码、本机核心、包回放与真实设备验收分别报告，不相互替代。
- 不放入真实订阅、节点密码、私钥、运行中控制器凭证。不要替换运行客户端或改系统网络。
- 公开克隆使用 `python tools/verify-v14.3.py --skip-history`、`python tools/package-v14.3.py --skip-history`；详细发版步骤见 `docs/maintenance/开源与发布.md`。
- `dist/<version>/` 为本地构建输出，`.work/` 为实验和解压复验；均不进 Git。上游许可和来源随每个发布包附带。

开发阶段在 `harness/build/`，执行结果记入 `harness/build-log.md`，上下文与审阅分别在 `harness/context/`、`harness/code_review/`。
