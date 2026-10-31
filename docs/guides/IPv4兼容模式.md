<!-- ARCHITECTURE_AUDIT_CURRENT:BEGIN -->
> **当前工作区修订：architecture-audit-r1（2026-11-01）**。两轨七客户端的当前源码、有限静态清单及隔离 Windows 核心已验证；跨端设备、原生 auto 能力和真实 AI 账号任务未验收。
> 本轮未安装脚本、改动现用客户端、重启服务或发布 GitHub。历史 rc.5–rc.8 段落及旧回执仅作当时记录，不认证本轮新字节。
> 当前入口：[全架构审计与修复](../reports/v14.3/全架构审计与修复.md) · [手动部署与验证](本轮修复手动部署.md)。当前候选使用 `tools/verify-current-audit.py` 和 `tools/package-architecture-audit.py`，不重签旧正式发布链。
<!-- ARCHITECTURE_AUDIT_CURRENT:END -->

# 同一份脚本中的 IPv4 兼容模式

## rc.6：自动模式与原生能力边界

当前源码修订 `auto-local-family-r1`，六份 JS 默认请求 `auto`，每客户端仍一份入口，保留 `dual-stack`／`ipv4-local`。自动出口判断需要匹配原生核心，普通核心接受覆写不等于已接入；Shadowrocket 只保留原生 IPv4 偏好与 IPv6 开启。Windows 指定 FlClash 核心/Helper 已完成新编译和隔离验证，但本轮未安装，维护者此前手动兼容客户端不变。移动端受保护 socket 和其它平台宿主仍需独立接入，真实 TUN/媒体/公网 IPv6 未验收。当前说明与证据入口：`docs/guides/自动网络模式.md`、`docs/reports/v14.3/自动本地地址族与跨端能力.md`。

以下涉及 rc.5 的接入记录只认证原版本，不认证 rc.6 自动能力。


每个客户端只下载一份当前文件，文件名见根 README。原来的 `-ipv4-local.js` 不再单独分发；旧版保存在历史 Release 和本地归档。

默认 `dual-stack` 保留双栈。当前网络没有可用 IPv6 出口、应用又缓存了 IPv6 时，可在同一份 JS 顶部把这一行改成：

```js
const ROUTEWEAVER_DEFAULT_NETWORK_MODE = "ipv4-local";
```

网络恢复可用双栈后改回 `"dual-stack"` 并在客户端重新应用。若脚本输入已带有 `x-routeweaver.network-mode`，该明确设置优先；导入已生成配置再次运行时保留其兼容模式，避免幂等执行意外切回。

若输入本身是此前生成的兼容配置，旧标记会保留兼容模式；这时切回双栈需明确设置 `x-routeweaver.network-mode: dual-stack` 或清除旧生成标记，再应用。

支持自定义输入字段的客户端也可以在输入配置中设置：

```yaml
x-routeweaver:
  network-mode: ipv4-local
```

这两种方法选择的是同一份文件里的模式，不是自动网络检测。核心 IPv6、TUN 的 IPv6 接管、节点通过 IPv4 传输访问远端 IPv6 都保留；公司、国内、兜底和手动节点选择保持。兼容模式限制业务 AAAA/SVCB/HTTPS，保留节点引导和局域网独立解析，并启用可靠域名下的 HTTP/TLS/QUIC 目标重解析。

FlClash 或 Clash Verge 的 App 设置可能再次覆盖 DNS/TUN：使用规则模式，在 TUN 设置开启严格路由；让本覆写管理业务 DNS 时关闭额外 DNS 覆盖。不要关闭核心 IPv6。导入后核对最终运行配置，不能只看脚本内容。

无域名 IPv6 不能仅靠过滤 DNS 变成 IPv4。匹配的客户端核心补丁用于尽快反馈明确的不可达错误及减少不可能协议的嗅探等待，应用是否重试 IPv4另行记录。Shadowrocket 的一份 conf 只有原生 IPv4 偏好和双栈，不承诺同等恢复。

诊断工具：完整仓库中使用 `python tools/diagnose-client.py --config <导出的最终配置> --entry <实际导入的JS> --output <本地报告>`。JSON 只需 Python；YAML 另需 PyYAML。输出经过字段白名单处理，不含节点密码、订阅 URL 或原始目标地址；默认只读文件，配置了本机控制器时可明确加 `--live` 读取实际状态。

当前验证范围见[验收状态](../status/当前验收.md)，稳定行为见[最终需求](../需求.md)。
