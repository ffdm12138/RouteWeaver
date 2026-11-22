# Mihomo 业务 DoH 出口隔离

此补丁基于 MetaCubeX/mihomo `v1.19.34` 对应提交 `0455d0d28c4526937380505153e65a843d8612e8`。Mihomo 派生段按同目录的 GPL-3.0 许可证提供。补丁由 RouteWeaver 的 CMCC 手动切组原型扩展而来。 [固定上游](https://github.com/MetaCubeX/mihomo/tree/0455d0d28c4526937380505153e65a843d8612e8)

`routeweaver-doh://` 在解析时转换为验证证书的 HTTPS/443。DNS 计划先固定所选代理及受支持的拨号链，然后再查答案缓存或启动真实交换。每个上游限制为 16 个按实际出口和代次分开的 HTTP 连接池，同一出口的查询可复用；失效范围的 HTTP/2 连接会在后续外查时回收。主备串行交换，备用继承同一份出口计划。有效的 NXDOMAIN 和空答案仍属于终态。

在干净的固定上游源码目录应用 `core.patch`。本次构建使用 Go 1.27.2。

```sh
git apply /path/to/core.patch
go test -count=2 -run '^(TestEgressDoHPrototype|TestScopedDoH.*)$' ./dns ./config
go build -trimpath -ldflags '-X github.com/metacubex/mihomo/constant.Version=v1.19.34-rw-scoped-doh-r1' .
```

## FlClash 0.9.4

在固定 FlClash 源码的 `core/Clash.Meta` 中先应用通用补丁对三份文件以外的改动，再应用 FlClash 补丁。该补丁保留分支自己的健康选路、循环拨号防护和配置重载钩子。

```sh
git apply --exclude=adapter/outboundgroup/urltest.go --exclude=component/proxydialer/byname.go --exclude=tunnel/tunnel.go /path/to/core.patch
git apply /path/to/flclash-0.9.4.patch
go test -run '^(TestEgressDoHPrototype|TestScopedDoH.*)$' ./dns ./config
cd ..
go build -tags with_gvisor -trimpath ./cmd/core
```

## ProjectClash

在固定 ProjectClash 内核源码应用 `git apply /path/to/projectclash.patch`。补丁使用该分支的原子代理表和组选择结构。Windows 编译需要在 `third_party/sing-tun/internal/wintun/amd64/` 提供校验过的 `wintun.dll`。本次复用 Go 模块 `github.com/metacubex/sing-tun@v0.4.29` 的 `internal/wintun/amd64/wintun.dll`。校验值和两个宿主的固定源码见 [upstream.json](upstream.json)。

```sh
go test -run '^(TestEgressDoHPrototype|TestScopedDoH.*)$' ./dns ./config
go build -trimpath .
```

测试使用独立本机回环 HTTP/2 上游、假 DNS 数据和受控健康状态，并用真实 SOCKS 协商验证动态拨号链的选路。此目录不包含可执行文件。站点证书仍由既有 TLS 验证逻辑校验。 [配置、支持范围与回滚](../../../../docs/guides/业务DoH迁移.md)
