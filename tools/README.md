# 项目工具

## rc.6：自动模式与原生能力边界

当前源码修订 `auto-local-family-r1`，六份 JS 默认请求 `auto`，每客户端仍一份入口，保留 `dual-stack`／`ipv4-local`。自动出口判断需要匹配原生核心，普通核心接受覆写不等于已接入；Shadowrocket 只保留原生 IPv4 偏好与 IPv6 开启。Windows 指定 FlClash 核心/Helper 已完成新编译和隔离验证，但本轮未安装，维护者此前手动兼容客户端不变。移动端受保护 socket 和其它平台宿主仍需独立接入，真实 TUN/媒体/公网 IPv6 未验收。当前说明与证据入口：`docs/guides/自动网络模式.md`、`docs/reports/v14.3/自动本地地址族与跨端能力.md`。

以下涉及 rc.5 的接入记录只认证原版本，不认证 rc.6 自动能力。


从项目根目录运行 Python 工具，需要 Python 3.12 和 Node.js 24；均只使用标准库。

| 工具 | 用途 |
|---|---|
| `audit-publication.py --strict` | 检查 Git 索引中的真实字节和禁止公开的路径；`--archive <zip>` 检查发布包每个成员 |
| `verify-v14.3.py --skip-history` | 公开克隆的当前入口、生成输入与已有核心回执绑定检查；历史目录明确记为 `SKIPPED_HISTORY` |
| `verify-v14.3.py` | 默认使用公开范围，与显式 `--skip-history` 相同，核对当前源码与已有回执 |
| `package-v14.3.py --skip-history` | 构建三种 ZIP，附许可与来源，检查 CRC/SHA256，并全新解压重跑生成/静态检查 |
| `verify-v14.3.py --skip-history --with-packages` | 复核 ZIP 与当前入口、回执的绑定 |

当前版本的生成器与路由测试在 `releases/v14.3/tools/` 和 `releases/v14.3/tests/`。根目录 `record-*`、`restore-ios-delivery.py` 是已有证据的维护工具，部分被回执按哈希引用；整理目录时不移动或改写它们。`package-v14.2.py` 和 `verify-layout.py` 保留旧版工作流，当前入口以 `CURRENT_RELEASE.json` 为准。

公开克隆不包含根 `archive/`、`.work/`、`dist/`；公开的 `validation/inputs/` 是当前离线生成与反例测试必需的固定输入。公开验证明确记录 `SKIPPED_HISTORY`，不跳过当前源码、需求合同、公开基线、来源锁或核心回执的 SHA256 核对。打包和静态回放不会重新运行原生核心或实机验收。


`network_release.py` 为第 12 条兼容模式回执的共同记录/核对模块；`record-v14.3.py` 在新静态/核心回执与当前文件哈希一致后更新标准与兼容入口索引。更新源码后必须重做受影响的实验，不能仅修改回执哈希。

rc.4 的隔离核心测试另外加载 `tests/native-ipv4-recovery.cjs`，该模块须随审核包分发并绑定哈希。它验证自有完整 HTTP 请求/响应和排除边界，并生成合成 TLS ClientHello / RFC 9001 QUIC Initial，验证报文和地址解析，不宣称完整会话或原生设备验收。


2026-10-16 当前整理：每个客户端仅一个当前入口，JS 内含双栈/IPv4 兼容模式；生产源码在 `runtime/` 共用函数中维护，统一 `build-all.cjs` 生成。新增 Clash Verge、真实 QuickJS/Boa 对照和只读脱敏诊断。Windows FlClash 可选核心的受限 TUN 实测、对应源码与回滚范围见 `docs/reports/v14.3/单入口优化与核心接入.md`；历史命令或结论不替代当前验收。
