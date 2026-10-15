"""Regenerate V14.2 R2 audit identity from the final reviewed source bytes.
This command never changes production rules, clients, or the historical R1 receipt.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RELEASE = ROOT / "releases/v14.2"
READ = lambda file: json.loads(file.read_text(encoding="utf-8-sig"))
SHA = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
CURRENT = READ(ROOT / "CURRENT_RELEASE.json")
assert CURRENT["repairRevision"] == "thunder-repair-r2"
source_names = [
    "src/windows/v14.2.js",
    "src/android/v14.2-android.js",
    "src/ios/v14.2-shadowrocket.conf",
    "tools/generate-v14.2-shadowrocket.js",
    "metadata/shadowrocket-sources.json",
    "tests/thunder-r2.cjs",
    "tests/cases.cjs",
]
inputs = READ(RELEASE / "validation/inputs/thunder-r2-before/manifest.json")
for item in inputs["files"]:
    assert SHA(RELEASE / "validation/inputs/thunder-r2-before" / item["file"]) == item["sha256"]
lock = READ(RELEASE / "data/rule-sources.lock.json")
assert len(lock["sources"]) == 45
for entry in lock["sources"]:
    assert SHA(RELEASE / entry["file"]) == entry["sha256"]
    assert SHA(RELEASE / entry["classifier"]["file"]) == entry["classifier"]["sha256"]

test_status = {
    "static": "STATIC_PASS", "thunder-r2": "THUNDER_R2_STATIC_PASS",
    "thunder-domain-coverage": "THUNDER_DOMAIN_COVERAGE_PASS",
    "native-routing": "CORE_ROUTING_PASS",
    "native-dns-egress": "CORE_DNS_EGRESS_PASS",
    "native-selectors": "CORE_MANUAL_SELECTORS_PASS",
}
test_evidence = {}
for name, expected in test_status.items():
    file = RELEASE / ("validation/" + name + ".json")
    actual = READ(file)
    assert actual["status"] == expected, name
    test_evidence[name] = {"file": file.relative_to(RELEASE).as_posix(), "status": expected,
                           "sha256": SHA(file)}
report = READ(RELEASE / "validation/thunder-r2.json")
assert report["checks"] and report["status"] == "THUNDER_R2_STATIC_PASS"
coverage = READ(RELEASE / "validation/thunder-domain-coverage.json")
assert coverage["hostCount"] >= 10325
assert all(p["dnsMismatchCount"] == 0 and not p["udpInconsistencies"] for p in coverage["platforms"])
r2 = {
    "version": "14.2", "date": "2026-10-10", "revision": "thunder-repair-r2",
    "priorRevision": "thunder-repair-r1",
    "status": "REPAIRED_LOCAL_CORE_VERIFIED_IOS_DEVICE_PENDING",
    "authorization": "User requested a thunder audit and repair of three independent Windows, Android and iOS profiles on 2026-10-10",
    "contract": {"file": "docs/需求.md", "sha256": SHA(ROOT / "docs/需求.md"), "amended": False},
    "remoteSourceChanges": 0,
    "beforeManifest": {"file": "validation/inputs/thunder-r2-before/manifest.json",
                       "sha256": SHA(RELEASE / "validation/inputs/thunder-r2-before/manifest.json")},
    "r1Metadata": {"file": "metadata/thunder-repair-review.json",
                   "sha256": SHA(RELEASE / "metadata/thunder-repair-review.json")},
    "lockedSources": {"file": "data/rule-sources.lock.json", "sha256": SHA(RELEASE / "data/rule-sources.lock.json"),
                      "count": len(lock["sources"])},
    "entries": [{"file": name, "sha256": SHA(RELEASE / name)} for name in source_names],
    "testEvidence": test_evidence,
    "findings": [
        {"id": "R2-01", "severity": "MAJOR", "description": "Legacy GEOSITE migration could download an unreviewed mutable branch",
         "resolution": "Fail closed when no exact reviewed commit/path binding exists; distinguish recognition from source generation",
         "acceptance": "STATIC_MUTATION_REPLAY_PASS"},
        {"id": "R2-02", "severity": "MAJOR", "description": "Native mixed streaming media, ASN and keyword lists could steal unrelated company traffic and produce cross-group DNS",
         "resolution": "Pin and embed reviewed Netflix/Disney/Epic Games DOMAIN/DOMAIN-SUFFIX plus separate no-resolve Mihomo-reviewed IP prefixes; suppress broad native keyword, ASN and User-Agent matching",
         "acceptance": "CROSS_PLATFORM_STATIC_PASS_IOS_NATIVE_NOT_RUN"},
        {"id": "R2-03", "severity": "MAJOR", "description": "Absent HTTP proxy provider bootstrap policy silently became DIRECT",
         "resolution": "Set REJECT by default; preserve explicitly specified DIRECT or fixed usable node, retaining fail-closed semantics",
         "acceptance": "STATIC_BOOTSTRAP_REPLAY_PASS"},
        {"id": "R2-04", "severity": "MAJOR", "description": "Exact known external DoH hosts could reach Android/iOS domestic DIRECT",
         "resolution": "Add ten reviewed exact resolver destinations to Android guard and generated iOS configuration; keep Windows preexisting block",
         "acceptance": "THREE_PLATFORM_STATIC_AND_WINDOWS_ANDROID_CORE_ROUTING_PASS"},
        {"id": "R2-05", "severity": "MINOR", "description": "Loopback core tests over-trusted asynchronous reject log lines and one-shot idempotent controller requests",
         "resolution": "Judge REJECT by zero outbound relay connections and datagrams; retry only transient local API resets for idempotent GET, PUT and DELETE, without suppressing failed core results",
         "acceptance": "TWO_CONSECUTIVE_FULL_NATIVE_ROUTING_REPLAYS_PASS"},
    ],
    "metrics": {"staticChecks": len(READ(RELEASE / "validation/static.json")["checks"]),
                "r2IndependentChecks": len(report["checks"]),
                "r2PreviousCounterexamples": len(report["beforeCounterexamples"]),
                "localCoreRoutingCases": sum(p["cases"] for p in READ(RELEASE / "validation/native-routing.json")["platforms"]),
                "localCoreDNSCases": sum(p["cases"] for p in READ(RELEASE / "validation/native-dns-egress.json")["platforms"]),
                "localCoreSelectorObservations": sum(p["cases"] for p in READ(RELEASE / "validation/native-selectors.json")["platforms"]),
                "finiteDomainSample": coverage["hostCount"],
                "crossPlatformClassifierDifferences": len(coverage["differences"])},
    "knownLimits": [
        "Shadowrocket native parse/DNS proxy selectors/VPN/UDP unsupported and cache behavior NOT_RUN",
        "Windows TUN/FlClash IPv6 public-network, Android VpnService and external packet capture NOT_RUN",
        "A bounded set of 10 DoH destinations cannot stop arbitrary user-defined application DoH",
        "Reviewed regex rules not expressible as safe bounded DOMAIN/DOMAIN-SUFFIX in native iOS are not projected; fall back to protected proxy",
        "First full native-routing attempt saw intermittent REJECT log assertion failure, and later a connection reset; subsequent full reruns passed; flakiness needs device/core confirmation",
        "All domain apex/subhost evidence is a finite set, not a proof of every keyword, regex, CNAME or dynamic tenant",
        "Proxy provider bootstrap now refuses unauthenticated first downloads without an explicit outbound selection",
    ],
    "clientDeployment": False,
}
path = RELEASE / "metadata/thunder-r2-review.json"
path.write_text(json.dumps(r2, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"revision": r2["revision"], "files": len(source_names), "sourceCount": len(lock["sources"]),
                  "tests": list(test_evidence), "metrics": r2["metrics"]}, ensure_ascii=False))
