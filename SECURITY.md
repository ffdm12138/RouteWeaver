# Security policy

RouteWeaver is a set of network-policy configuration scripts, not an audited security product. DNS, UDP, IPv6, WebRTC and TUN/VPN behavior depend on the client version, OS, mode, node support and rule-download state. There is **no guarantee of zero leaks**.

## Report a vulnerability

Use GitHub's private vulnerability reporting if enabled; otherwise open an issue without exposing live credentials, subscriptions, endpoints or private infrastructure. Do not paste node passwords, Clash API secrets, private keys or subscription URLs into issues or logs.

## Publication preflight

Run `python tools/audit-publication.py --strict` on the *staged* Git file set before publishing. This heuristic catches common credential patterns only. Manually inspect config URLs, project and Git history, rule snapshot terms, and release ZIP contents. Never add `archive/`, `.work/`, `dist/` or actual subscriber profiles to the public Git history.

## Behavioral safety boundaries

- A selected proxy which fails or does not support UDP must never silently become DIRECT.
- Business/unknown traffic must not be swallowed by broad geographical rules.
- User-selected DIRECT and documented explicit exceptions are intentional and should be visibly identifiable to operators.
- A source contract pass or Windows isolated Mihomo replay does not establish Android, iOS or macOS native-client acceptance.

Upstream rule data are not covered by our own code license. See [third-party notices](THIRD_PARTY_NOTICES.md).


The optional IPv4-local mode does not probe physical reachability. Keep core IPv6 and full TUN/VPN interception enabled. Business DNS filters AAAA/SVCB/HTTPS; TLS/QUIC hostname recovery can re-resolve literal destinations, including IPv4 literals, within the documented ports and exclusions. HTTPS/SVCB filtering affects ECH discovery and associated service discovery. Original egress choices remain; opaque IPv6 literals cannot be translated automatically, and failing proxies never become DIRECT. rc.2 media failure remains recorded; rc.3 device/media acceptance is pending. Shadowrocket offers IPv4 preference only. See [IPv4-local guide](docs/guides/IPv4兼容模式.md).
