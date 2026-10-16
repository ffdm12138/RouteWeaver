# FlClash 可选核心接入与回滚

脚本和核心解决不同层的问题。单入口脚本保留两种网络模式、原分流和 DNS 跟组；无域名 IPv6 的操作系统错误重试及 TLS 短首包等待需要核心支持。当前可选核心仅适配 Windows amd64、FlClash 0.9.0 原装核心 SHA256 `ff0bfb9172a8331da6c5dac38028f47d805b433e8b2796b61c1767d8fb6792d3`。

从同一 [rc.5 Release](https://github.com/ffdm12138/RouteWeaver/releases/tag/v14.3.0-rc.5) 下载 `v14.3-flclash-windows-core.zip` 和对应源码包。核对 `SHA256SUMS.txt`，解压到可写目录。使用管理员 PowerShell 在解压目录执行：

~~~powershell
.\install-flclash-core.ps1 -Action Install
~~~

安装器核对原装核心和候选文件哈希，完整备份 `FlClashCore.exe`、`FlClashHelperService.exe`、`manifest.json`，只停止/重启 FlClash，再成套替换这三个文件。原服务 owner SID 和校验机制保留。启动检查失败会恢复原装文件；版本或原装哈希不匹配时停止，不强行替换。备份在解压目录 `deployment/backup/`，请保留整个目录。安装不会更新你的订阅、节点或脚本选项。

恢复原装：

~~~powershell
.\install-flclash-core.ps1 -Action Rollback
~~~

不要把这套二进制用于 Clash Verge、Clash Mi、Android、Mac 或其它 FlClash 版本。更新 FlClash 后需重新核对分支、宿主协议和 Helper 校验，不能直接复用本包。

对应源码为 `v14.3-flclash-corresponding-source.zip`，含 FlClash core/Helper、实际 Mihomo 分支、12 个源文件变更记录和 vendored 依赖。`rebuild.py` 不接触正在运行的客户端；提供 Go 1.27.2、Rust/Cargo 1.99.1 和 Windows GNU 链接工具后，从解压源码根执行：

~~~powershell
python rebuild.py --source . --work .work/rebuild --go <go.exe> --cargo <cargo.exe>
~~~

需要纯源码核对时加 `--verify-source-only`。Git 中的同名工具也可以在新的工作目录下载并校验固定上游 ZIP、应用补丁，使用 `--prepare-only` 不编译。依赖布局和工具链可能影响二进制字节；新构建必须使用它自己的核心哈希重建匹配 Helper，并独立核验。对应源码、锁文件和构建参数均公开，不将“源码可重建”当作任意环境逐字节复现承诺。

本次维护者 Windows 已接入候选，严格路由/双栈保留，有限 TUN 快速失败探测通过；真实微信发送、其它平台设备和公网 IPv6 分别待验收。详细结果见[接入报告](../reports/v14.3/单入口优化与核心接入.md)。
