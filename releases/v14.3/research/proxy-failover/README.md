# Windows FlClash 故障转移候选

此功能配对仓库锁定的 FlClash 0.9.0 Windows amd64 和 Mihomo 分支。导入本次 Windows 主版或纯 IPv4 版脚本后，由支持 `routeweaver-failover` 的核心创建「故障转移」选择组。默认 REJECT。手选备用代理即启用，切回 REJECT 时，新连接立即走原策略。

配对核心以仓库的 `v1.19.32-rw-ipv6-r2` 对应源码为基线。主版的显式 `dual-stack` 和 `ipv4-local` 仍可选。`rw-auto6-r1` 的原生地址族探测属于另一套核心，当前候选中的 `auto` 按普通双栈运行。

匹配包内的 `FlClashCore.exe`、`FlClashHelperService.exe` 和 `manifest.json` 须作为一套校验。部署前核对 App 版本、系统架构和三件套 SHA-256，备份当前三件套和覆写绑定。按本机已授权的 FlClash 安装流程手动更换整套；回滚时同时恢复旧三件套与旧绑定。随包的源码依据 GPL-3.0 和各依赖原许可证提供。

项目内用 `python tools/build-proxy-failover.py --toolchains <锁定工具链下载目录> --output dist/v14.3` 构建。完整对应源码 ZIP 解压后，用 `python rebuild-failover.py --toolchains <同一目录> --output <构建输出>` 离线重建。工具读取目录中的 Go 1.27.2 Windows amd64 ZIP 和 Rust/Cargo 1.99.1 Windows GNU 的三个固定组件，核对包内清单的哈希，使用系统临时目录。Windows GNU 构建需要 PATH 上有兼容的 GCC。每次重建的 Helper 都用该次核心哈希构建。

主出口连续两次探测失败且备用有新鲜的成功结果后，新流量切到备用。主出口连续两次成功后切回。探测地址为核心的 HTTPS 204 地址，每 5 秒一次，单次超时 3 秒。策略组中保存的手选节点仍是主出口。已有长连接和既有 DNS 上游连接按应用正常重连时机切换。
