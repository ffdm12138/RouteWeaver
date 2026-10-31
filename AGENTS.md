<!-- ARCHITECTURE_AUDIT_CURRENT:BEGIN -->
> **当前工作区修订：architecture-audit-r1（2026-11-01）**。两轨七客户端的当前源码、有限静态清单及隔离 Windows 核心已验证；跨端设备、原生 auto 能力和真实 AI 账号任务未验收。
> 本轮未安装脚本、改动现用客户端、重启服务或发布 GitHub。历史 rc.5–rc.8 段落及旧回执仅作当时记录，不认证本轮新字节。
> 当前入口：[全架构审计与修复](docs/reports/v14.3/全架构审计与修复.md) · [手动部署与验证](docs/guides/本轮修复手动部署.md)。当前候选使用 `tools/verify-current-audit.py` 和 `tools/package-architecture-audit.py`，不重签旧正式发布链。
<!-- ARCHITECTURE_AUDIT_CURRENT:END -->

# RouteWeaver 工作约定

## rc.6：自动模式与原生能力边界

当前源码修订 `auto-local-family-r1`，六份 JS 默认请求 `auto`，每客户端仍一份入口，保留 `dual-stack`／`ipv4-local`。自动出口判断需要匹配原生核心，普通核心接受覆写不等于已接入；Shadowrocket 只保留原生 IPv4 偏好与 IPv6 开启。Windows 指定 FlClash 核心/Helper 已完成新编译和隔离验证，但本轮未安装，维护者此前手动兼容客户端不变。移动端受保护 socket 和其它平台宿主仍需独立接入，真实 TUN/媒体/公网 IPv6 未验收。当前说明与证据入口：`docs/guides/自动网络模式.md`、`docs/reports/v14.3/自动本地地址族与跨端能力.md`。

以下涉及 rc.5 的接入记录只认证原版本，不认证 rc.6 自动能力。


当前 rc.5：七个单入口，六 JS 内含双模式；shared-runtime-r1 / client-integration-r1。Windows FlClash 已由用户明确授权接入匹配核心和 Helper，有限 TUN 快速失败通过；真实微信及跨端设备不可据此宣称验收。后续更换运行客户端仍须相应用户授权。当前范围见 docs/status/当前验收.md，稳定合同见 docs/需求.md。



当前用户请求优先。根 README 是使用入口，`docs/需求.md` 是公开业务设计合同，`CURRENT_RELEASE.json` 指定七个当前入口。

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
- `dist/<version>/` 为本地构建输出，仍不进 Git；上游许可和来源随每个发布包附带。<!-- TEMP_LIFECYCLE_20261023 --> 不再新建持久 `.work/`、修改前快照或日期工作树。当前 v14.3 打包的解压复验使用系统 `TemporaryDirectory`，正常结束和 Python 异常后自动收尾；固定 `dist/v14.3/package-verification.json` 保存本次解压复验成功/失败、对应包 SHA 与关键命令 stdout/stderr。清理完成后 `freshExtraction` 为 null；若清理失败，仅记录实际仍存在的临时目录并明确报错。
- 遗留 `.work/packaging`、`.work/core` 不因名称而自动可删：先确认无运行任务和路径依赖，独有补丁、对应源码、冻结输入与既有失败证据须保留到正式位置或验证已有完整保留件，再清理逐项确认的副本/可再生输出。`package-v14.2.py` 仅为历史入口，不用于当前发版；若确需历史复验，先修正其临时目录生命周期。

开发阶段在 `harness/build/`，执行结果记入 `harness/build-log.md`，上下文与审阅分别在 `harness/context/`、`harness/code_review/`。

## 已封签 native 回放的临时目录收尾

当前 `releases/v14.3/tests/fixture.cjs` 由既有回执的源码 SHA 绑定，保持原字节。它按代码位置创建 `.work/core/v14.3/<本次实验目录>`，没有 `TMP`/`TEMP` 环境变量覆盖入口；切换 cwd 也不会改变该位置。只在明确需要执行既有原生回放时临时使用此路径，不恢复持久 `.work` 工作树，不为目录整理改 fixture 或重签旧收据。

- **运行前**确认单写者、没有冲突的 native/core 进程，记录 `.work/core/v14.3/` 已有目录名单；先按现有证据规则保护已绑定的历史失败回执。只将本次运行明确新建的实验目录纳入本次收尾，不能按整个 `.work` 或全部 `core/v14.3` 批量删除。
- **运行后**保留真实退出码、源码 SHA 和当前正式回执。`captureExperiment` 只复制实验目录顶层的 `.json`/`.log` 到 `releases/v14.3/validation/experiments/<kind>/`，不递归保存全部子目录，也不删除原沙箱；回执中的 `home` 可能是这个正式证据位置，不能据此误删正式回执或认定原运行树已完整保留。
- **收回前**确认本次 Node/core 子进程已退出，再将本次目录中的拟收回文件与已有正式文件或保留 ZIP 的具体 member 逐件核对 SHA，记录原路径与保留位置后，只删除已验证的副本，再移除已经为空的目录。不同字节的 CJS、嵌套日志、失败 JSON、运行输入及密钥不得作为普通缓存抹去；没有完整保留证明就继续保留待处理。若确需收拢整份独有历史证据，使用明确的私有证据容器并保留原相对路径和 SHA，不混入会发布的 `dist/v14.3` 资产集合。

此规则是封签脚本的显式运行后收尾要求；它不声称 fixture 已改为自动清理。以后新增的非封签工具应使用系统临时目录并在结束后收尾。
