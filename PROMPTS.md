# RouteWeaver · Reusable Codex prompts

These are optional workflow conventions adapted from the OpenAI Cookbook development-harness example; they are not mandatory Codex files.

## Orientation

> Read AGENTS.md, GOALS.md, PLANS.md, CURRENT_RELEASE.json, docs/需求.md and docs/README.md. Identify the six active import entries, data provenance, test entry points, ignored archives and unresolved native-device acceptance. Summarize evidence and gaps before editing.

## Plan / prepare a phase

> Read the relevant harness/build/phase-*.md and its context record, plus AGENTS.md and PLANS.md. Establish exact writable scope, non-goals, source hashes, expected tests, rollback and risks. Do not mutate the user-authored requirement document.

## Execute one approved phase

> Execute only the selected approved phase. Preserve existing policy semantics, use minimal edits, verify changed outputs against source/contract tests, record actual command results and relevant hashes in harness/build-log.md. Do not assume a published configuration has been installed on devices. Do not start the next phase automatically.

## Collect evidence

> Separate generation/check mode, static classification, isolated Mihomo core behavior, reproducible package, and real-client device network takeover. Mark not-run and blocked cases explicitly; never convert a platform-simulation PASS into native acceptance.

## Review / remediation

> Perform a severity-graded review (BLOCKER / MAJOR / MINOR) of rule priority, company ownership, DNS/UDP route matching, IPv4/IPv6, proxy failure behavior, third-party licensing, private credentials, user-specific routes and release history. Link findings to exact artifacts/tests. Remediate narrowly and preserve failed historical observations.

## Completion / handoff

> Summarize changed paths, commands and observed results, hashes, unresolved gates and rollback steps. For a public release, separately verify the actual remote/tag/assets; do not claim completion if authentication, upload, license or safety gates block it. Commit/push/deployment require authorization for that specific task; publishing this repository is currently explicitly requested by the user.
