# 项目工具

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
