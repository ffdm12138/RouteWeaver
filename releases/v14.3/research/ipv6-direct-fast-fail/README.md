# 无本地 IPv6 时的 DIRECT 快速失败研究

这是 **核心补丁原型**，没有进入 rc.4 JS / conf，没有替换任何运行客户端，也不提供客户端安装包。它解决已明确不可达后的重复 TCP 拨号等待，不能替无域名 IPv6 推导等价 IPv4，不能保证应用会重试 IPv4。

上游固定到 Mihomo v1.19.31，提交 `ab405bad5beeeac8b003bb01f60f134f6df54471`。`upstream.json` 记录源 ZIP、补丁、修改前后文件及许可证的 SHA256；`proof.json` 绑定原生对照、规则回放和源码重建。当前应用实际内置核心版本未独立读出，不宣称它与研究核心逐字节相同。

## 补丁范围

- 只在原生 `type: direct` 的 TCP 拨号失败处标记：实际字面量 IPv6、无 Host 覆盖、原生网络不可达 errno。Windows 明确识别 Winsock `WSAENETUNREACH=10051`，其他系统使用 `ENETUNREACH`；不是匹配错误字符串。
- 同一次隧道拨号从最多 10 次改为 1 次，保留系统错误并关闭失败连接。新连接重新尝试，无全局失败缓存，网络恢复后不永久禁用 IPv6。
- 不改规则、分组、目标、节点、DNS、TUN 或本地/代理出口。IPv4、IPv4 映射地址、Host 覆盖、COMPATIBLE、代理传输的 INNER 元数据、未知 UDP、一般超时及代理错误沿用原逻辑。
- 没有修改 UDP socket 写入/ICMP 错误上报，也没有实现物理出口探测、TUN 错误转译、嗅探预算调整或应用 IPv4 后备。

## 已完成的有界验证

Windows 自有回环接口、文档 IPv6 地址、关闭 TUN/DNS/真实节点，用同一 Go 工具链构建原版和候选。五次 DIRECT 失败对照、可达 IPv4/IPv6、IPv4 代理运输保持 IPv6 目标、代理失败保持原重试、不静默改出口，以及服务端先发协议的嗅探等待对照，见 `native-proof.json`。真实系统网络不可达，而非用 REJECT 代替。

现有 123 项隔离核心实验在独立公开源码克隆中用候选核心回放，见 `production-policy-proof.json`。覆盖既有 DNS 过滤、HTTP/TLS/QUIC 恢复、公司优先级、LAN、显式 IP、用户排除及原代理 TCP/UDP 语义。没有修改正式版本的核心回执。

这些是实验核心结果；微信转圈是否消失、应用何时重试 IPv4、系统 TUN/VPN、公网 IPv6 和其他平台仍待验收。`rc4-log-summary.json` 只公开脱敏汇总，原始日志和用户配置保持私有。

## 复现

需要 Windows/amd64、Git、Node.js、Python，以及 Go 1.27.2。先按 `upstream.json` 下载固定源 ZIP，并验证记录的 SHA256；Go 工具链来源和 SHA256 在 `proof.json`。依赖遵循原 `go.mod` / `go.sum`，保留模块校验和 TLS 检查，不使用浮动规则或真实订阅。

在完整仓库根执行，参数路径换为自己的已校验文件：

~~~powershell
python releases/v14.3/research/ipv6-direct-fast-fail/reproduce.py --source-zip .work/mihomo-v1.19.31-source.zip --go .work/go/bin/go.exe --work-dir .work/ipv6-core-replay
~~~

输出目录必须是尚不存在的 `.work` 子目录。脚本只在该目录解压、应用补丁、编译和测试，生成的两个 EXE 只用于实验，不安装。完整复现需要下载上游固定依赖；网络和代理沿用运行环境。回放里的随机控制器密钥仅限实验，不上传生成的运行配置。

只检查固定源码和补丁时可省略 Go，追加 `--prepare-only`。独立审核 ZIP 的相应路径是 `research/ipv6-direct-fast-fail/reproduce.py`，从该包根目录执行，仍使用包内新的 `.work` 目录；工具自动区分完整仓库与独立审核包。

## 许可和来源

`direct-ipv6-fast-fail.patch` 包含对 Mihomo 的修改及新增源文件，按随附 [GPL-3.0](LICENSE) 分发；保留 Mihomo / MetaCubeX 及其贡献者的原有权利。修改日期 2026-10-16，修改目的和范围见上文及 `upstream.json`。根目录 MIT 不能替代这些上游条款。未分发 Mihomo 二进制、完整依赖或客户端，不表示上游认可本补丁。
