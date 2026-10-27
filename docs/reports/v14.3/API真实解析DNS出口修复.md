# API 真实解析 DNS 出口修复（api-doh-egress-r1）

日期：2026-10-27。修订：`api-doh-egress-r1`。范围：Windows、Android、Clash Mi、Clash Verge、两份 Mac 共六份 JS 与 `v14.3-ipv4-only` 对应六份；Shadowrocket 原生配置不适用（本轮未改其 DNS 传输）。

## 结论

`api.openai.com` 被写进 `fake-ip-filter` 是**有意保留**的兼容修补（`api-real-ip-r1`），不是误写；但它的解析被绑定在业务组 DoT/853 上，形成单点故障：853 一旦被运营商或节点封禁，这个唯一必须真实解析的域名直接 SERVFAIL，而所有走 Fake-IP 的域名无感。因此**直接删掉这条例外（原方案 A）会重新引入 Chromium 本地网络访问拦截**，不是正确修法。

本修订保留真实答案，把该主机的解析改到同一业务组的 DoH/443。其余 DNS 传输、分流、节点选择、UDP/STUN 保护均不变。

## 已核实的事实

1. 源码与本机部署脚本都在同一行硬编码该例外（本机 `scripts/369679494564286464.js` 第 2115 行，与源码 `runtime/shared/main.js.in` 一致）：
   ```js
   "fake-ip-filter": V14.privateNames.map(d => "+." + d).concat(["api.openai.com"]), "use-hosts": true,
   ```
2. 该主机没有独立 DNS 策略，落到 `rule-set:` 的「OpenAI 服务」策略，即 `v14DnsFor()` 产出的 `tls://dns.alidns.com:853#OpenAI 服务&disable-reuse=true` 与 `tls://dot.pub:853#…`。
3. 本机运行态（2026-10-27 23:1x，FlClash + TUN 生效）：
   - `Resolve-DnsName api.openai.com` → `DNS 服务器失败`；
   - `chatgpt.com` → `198.18.0.11`，`www.google.com` → `198.18.0.81`（Fake-IP 正常）；
   - `curl -x 127.0.0.1:7890 https://api.openai.com/v1/models` → HTTP 401（节点转发 443 正常）。
4. 该例外为何存在，有前一轮的实机证据：Chromium 把 IPv6 Fake-IP ULA `fdfe:dcba:9876::/64` 判为 `local` 地址空间，公共页面访问 API 被 `public → local` 检查拦截（API 根路径 421、`net::ERR_FAILED`），见 [V14.2 收尾雷霆审核](../v14.2/收尾雷霆审核.md)。删掉例外会让该回归复现。

## 设计取舍

| 方案 | 结果 |
|---|---|
| A 删除 `["api.openai.com"]` | 回到 Fake-IP，解析问题消失，但 Chromium 本地网络访问拦截复现 |
| B 手动换节点 | 依赖新节点放行 853，不治本 |
| C 指定 `#DIRECT` 解析 | 违反「解析不脱离所选出口」的既有合同，等于 DNS 直连泄漏 |
| **D（本修订）保留真实答案，改用同组 DoH/443** | 既绕过 853，也不改出口归属与失败关闭语义 |

实现：`V14.apiRealDns` 复用已审核的两个上游（`dns.alidns.com`、`doh.pub`）走 443，并写入精确主机策略：

```js
dnsPolicy["api.openai.com"] = V14.apiRealDns.map(url => url + "#" + groupName("OpenAI 服务"));
```

生成结果（标准模式）：

```yaml
api.openai.com:
  - "https://dns.alidns.com/dns-query#OpenAI 服务"
  - "https://doh.pub/dns-query#OpenAI 服务"
```

`ipv4-local`／`auto` 兼容模式由既有适配器续接 `disable-ipv6`、`disable-qtype-64`、`disable-qtype-65`，三种模式均已核对。

已知差异：`disable-reuse` 是 mihomo 的 DoT 参数（`dns/dot.go`），DoH 传输不解析它，因此该主机的 DoH 连接可能被复用；切换节点后这一条策略的解析可能短暂沿用旧连接，直到连接空闲关闭。其余策略仍是 DoT 且保持每次重新拨号。这是本修订接受的代价，写在这里而不是隐藏。

## 未改动的部分

- `fake-ip-filter` 仍保留 `api.openai.com` 与本地名称；`fake-ip-range6` 未改。
- 其余全部 `nameserver-policy`、`nameserver`、`direct-nameserver`、`proxy-server-nameserver` 未改。
- 分流规则、公司/地域优先级、UDP/STUN 保护、TUN、节点组选择、VPS 直连例外未改。
- Shadowrocket 原生配置本来就用 DoH/443，不受本问题影响。

## 验证

已执行（Node v22.22.2，本机）：

- `tools/build-all.cjs --check`：生成绑定一致，六份 JS ＋ 一份原生配置。
- `tests/static.cjs`：30 项通过（23 万余主机路由/DNS 全量对照）。
- `tests/macos-static.cjs` 13 项、`tests/clash-verge.cjs` 10 项、`tests/shadowrocket-lean.cjs` 6 项、`tests/network-compat.cjs` 73 项通过。
- `tools/build-ipv4-only.cjs --check` 与 `tools/test-ipv4-only.cjs` 67 项通过。
- 逐模式抽检 `dual-stack`／`ipv4-local`／`auto` 的策略串与再生成字节。

未执行（本轮无回放核心可执行文件，不冒充通过）：

- `tests/native-core.cjs`、`native-macos.cjs`、`native-clash-verge.cjs`、`native-dns-egress.cjs`、`native-boundaries.cjs`、`native-network-compat.cjs` 等隔离核心回放。
- 真实 TUN、Chrome/Serena 端到端、Android/iOS/macOS 实机。
- `engine-parity.cjs` 的 QuickJS/Boa 对照（需现场构建锁定引擎）。

因此本轮**不宣称核心回放通过**；既有 `validation/*.json` 核心回执仍绑定修改前源码字节，不能作为本修订的证据。

## 回滚

把六份标准入口与六份 `ipv4-only` 入口恢复到本修订前字节，或在客户端重新导入上一版入口。仅回滚 `runtime/` 而不重新生成不会改变已导入客户端的配置。

## 后续

1. 有回放核心后，重跑上述隔离核心测试并重新绑定回执，替换本轮 `NOT_RUN`。
2. 由用户在自己的 FlClash 上重新应用覆写脚本后，实测 `Resolve-DnsName api.openai.com` 返回真实 A 记录、Serena/浏览器 API 可用。
3. 若确认 853 长期不可用，再评估把整个业务 DNS 迁到 DoH/443（会失去 `disable-reuse` 的「每次重新拨号」语义，需要单独设计与验收）。
