# Windows FlClash 0.9.3 三档故障转移候选

配对目标为 Windows amd64 FlClash `0.9.3+2026110401`。核心基于该 App 锁定的 Mihomo v1.19.33 分支，候选版本为 `v1.19.33-rw-failover-flclash093-r1`。 [FlClash 0.9.3 发布记录](https://github.com/chen08209/FlClash/releases/tag/v0.9.3)

## 手动部署

1. 核对 App 版本和架构。下载同一候选的 Windows 核心 ZIP 与 SHA-256 文件，用 `Get-FileHash -Algorithm SHA256 <ZIP 路径>` 核对整包，再按包内 `PACKAGE_MANIFEST.json` 核对解压后的文件。
2. 从托盘退出 FlClash。若安装了 Helper 服务，核对它指向当前 FlClash 安装目录，再停止对应服务。
3. 备份安装目录（通常为 `C:\Program Files\FlClash`）中的 `FlClashCore.exe`、`FlClashHelperService.exe`、`manifest.json`，再成套替换成 ZIP 的 `bin` 下的三个文件。`manifest.json` 和 Helper 都绑定同一个核心 SHA-256。
4. 打开 FlClash 并加载当前配置，在代理组列表确认「故障转移1」「故障转移2」「故障转移3」。当前主版与纯 IPv4 版的 Windows 覆写已写入 `routeweaver-failover`，该字段已在合并配置中时可直接沿用。0.9.3 原装核心会忽略该字段。
5. 若要回滚，退出 App 并停止对应 Helper，再成套恢复三个备份文件。

## 路由行为

三个备用组初次加载均为 REJECT。可任意启用其中几档。每个业务组从原手选出口 A 开始，主节点被确认故障后按 1 → 2 → 3 使用首个可用的手选备用。更高优先级恢复后，新连接按顺序切回。三档均选 REJECT 后，新连接立即交回原策略。

A 和全部启用的备用都故障时，新连接只尝试 A，按 A 的原有错误或超时结束。订阅移除 A 且没有可用备用时拒绝。单档手选节点被移除时跳过该档，需手动选 REJECT 才关闭该档。主策略明确选 DIRECT 或 REJECT 时照常执行。「自动选择」独立运行。

探测按当前节点实例去重，每 5 秒向 `https://www.gstatic.com/generate_204` 发出 HTTPS 204 请求，单次超时 3 秒。连续两次失败判定故障，故障后连续两次成功判定恢复。A 初始直接尝试，备用首次接管前须成功探测。TCP、UDP 及业务 DNS 上游的新连接用同一决策，选定出口不支持 UDP 时拒绝。已有连接在重连时应用当时的选择。

主版的 `auto` 在本配对核心按普通双栈运行。原生地址族自动探测由单独的 `rw-auto6-r1` 核心提供。纯 IPv4 版使用其独立入口。

## 对应源码与重建

源码 ZIP 包含锁定的核心及 Helper、Go 和 Rust 依赖、补丁、源码清单及许可证。解压后使用 `python rebuild-failover.py --toolchains <锁定工具链下载目录> --output <构建输出>` 离线重建。目录需提供清单指定的 Go 1.27.2 Windows amd64 ZIP 和 Rust/Cargo 1.99.1 Windows GNU 三个固定组件。Windows GNU Helper 构建需要 PATH 上有兼容的 GCC。每次重建的 Helper 都绑定当次核心哈希。

真实 FlClash App 与 TUN 验收独立记录。小火箭由 iOS 真机单独核对。
