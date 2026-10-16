# Contributing to RouteWeaver

Thanks for helping improve cross-platform route-policy correctness. File an issue before broad policy refactors or rule-provider changes. Include the OS, app/core version, network mode (TUN/VPN/system proxy), expected rule and actual observed behavior; redact real nodes and credentials.

1. Read `AGENTS.md`, `GOALS.md`, `docs/需求.md` and `CURRENT_RELEASE.json`.
2. Work against an explicit reviewable issue or `harness/build/` phase; do not overwrite frozen historical evidence.
3. For V14.3, run generator `--check` tests and applicable static tests from `releases/v14.3/`; run appropriate isolated native tests when editing runtime semantics.
4. Keep tests and receipts distinct from real-device validation. Attach a minimal synthetic reproduction where possible.
5. Review upstream rule licenses/commit pins and run `python tools/audit-publication.py --strict` against the staged set.
6. Explain code changes, scope, test commands, limitations, and which user requirements they address.

**Do not change the user's authoritative `docs/需求.md` as a side effect of a pull request.** Propose amendments separately.


For the IPv6 fallback revision, regenerate both standard and optional entries and run `tests/network-compat.cjs`; behavior changes also require the scoped `native-network-compat.cjs` replay and affected existing regressions. Preserve explicit node/provider settings. Record client AAAA, Fake-IP, core/TUN routing and application retry as separate observations; test both internal DNS resolution and readable TLS/QUIC hostname recovery with their negative controls. The owned-loopback replay uses synthetic ClientHello/Initial packets and does not establish complete sessions, TUN/device behavior or media success.
