# auto-local-family-r1 — optional native automatic local-family core

This is a native extension, not a JavaScript network detector. It extends the pinned FlClash 0.9.0 / Mihomo fork source used by `../flclash-core-integration`. Both patches and their SHA256 manifests are retained. The six RouteWeaver JS entries request `routeweaver-local-family: auto`; an unmodified core cannot perform this extension merely because it accepts the generated configuration.

## Actual implementation

The core observes the selected local socket egress, not an arbitrary TUN address. It rereads that interface's source addresses within one second and invalidates its evidence when the existing default-interface monitor reports a network change. No public canary probes, persistent blacklist or extra DNS service is introduced. A usable source address alone is not proof of Internet reachability: it yields `unknown`; recent successful local IPv6 TCP connections give 30-second positive evidence. Native `ENETUNREACH` from two distinct /48 destinations can give five-second negative evidence. A single target failure, timeout, refusal or cancellation does not disable IPv6. Evidence is interface/generation bound and memory bounded.

When the selected egress has no usable IPv6 source, application-facing IPv6 Fake-IP candidates and public AAAA answers are suppressed only if an IPv4 A alternative for the same name is confirmed through its unchanged internal DNS policy (250 ms budget, eight concurrent confirmations maximum). Missing/failed/late A lookup preserves AAAA, including proxy-usable IPv6-only names; internal resolvers for nodes and proxy destinations are not globally disabled. Public AAAA filtering uses the destination's selected interface; private/link-local/loopback addresses, local names and explicit hosts are preserved. SVCB/HTTPS answers in the public resolver path are suppressed only during the no-local-v6 state. Altered real AAAA answers lose their AD claim and covering RRSIG. DNS caches belong to the internal resolver; filtering is applied again at each client response.

Local domain dialing removes unusable IPv6 candidates only when an IPv4 candidate exists and no explicit family/prefer-IPv6 or remote custom dialer overrides this choice. Literal/IPv6-only targets remain explicit and are not invented into IPv4. A DIRECT UDP hostname may use IPv4 preference; this is not a promise of transport-level retransmission or application acknowledgement. Proxy choices, routing rules, bootstrap DNS and remote IPv6 target addresses remain independent.

`DefaultSocketHook`-owned egress returns `unknown` with an explicit host-capability reason. A mobile VPN protected-socket host must supply/implement its real egress capability instead of inferring it from its virtual interface. No app binary for Android, iOS or macOS is delivered by this Windows core package. Shadowrocket cannot consume this extension through its native conf.

## Evidence and limits

The new Windows core and matching Helper have been built; source-bound Go tests and owned native DNS/SOCKS loopback experiments are recorded in `../../validation/auto-local-core.json` and `../../validation/auto-local-native.json`. The native test's off/auto comparison is a controlled mode comparison, not an actual public-network switch. The six generated entries parse under the new core. Existing rc.5 live TUN evidence remains historical and does not certify the automatic core.

**The automatic core has not been installed in the maintainer's running client in this revision. There is no new Windows/macOS/iOS/Android app-media or public-IPv6 acceptance.** Arbitrary opaque/cached IPv6 endpoints cannot be converted to equivalent IPv4 without reliable service information. Fast failure does not guarantee app IPv4 retry. No claim of universal one-script auto recovery is made.

## Matched pair, install and rollback

The Windows binary archive contains `FlClashCore.exe`, `FlClashHelperService.exe`, `manifest.json`, the immutable SHA256 pair manifest and the explicit install/rollback script. It targets only the hash-identified original FlClash 0.9.0 core or the recorded rc.5 pair. It is not a standard Mihomo CLI and must not be installed into Clash Verge, Clash Mi or another version. Installation is an explicit administrator action; never bypass the Helper core-hash check, service owner SID or manifest. The installer backs up all three files and provides rollback; normal app/core updates can replace this extension.

Do not run the installer just to inspect this source. Do not mix the rc.5 Helper with the auto core. The source archive has complete fixed Go/Rust dependencies and corresponding source. `rebuild.py --source <extracted> --go <go.exe> --test --helper --cargo <cargo.exe> --rust-root <rust-root>` rebuilds without installing. Extract to a short ASCII path for the Windows GNU linker. Layout differences can change binary bytes; every rebuilt core needs its own matching Helper and manifest, not a copied published hash.

## License and source chain

Native modifications are GPL-3.0 under the included license; individual vendored dependencies retain their licenses. The project-root MIT license covers only original RouteWeaver material and does not replace native upstream licenses. The source identity manifest pins upstream commits/archives, the rc.5 base patch and the automatic delta. The source archive includes both original module paths and corresponding vendor updates, plus per-file hashes.

Official field semantics: https://wiki.metacubex.one/en/config/proxies/ ; https://wiki.metacubex.one/en/config/dns/ ; https://wiki.metacubex.one/en/config/sniff/
