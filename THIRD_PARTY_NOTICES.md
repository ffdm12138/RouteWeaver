# Third-party notices

The root [MIT license](LICENSE) applies to original RouteWeaver contributions. Upstream rule data and copied client-source excerpts retain their own copyright and license terms, including when they appear in a generated configuration. A generated file containing upstream data must not be described as entirely MIT-licensed.

| Upstream / authors | Material | License and retained copy |
|---|---|---|
| [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat) and its contributors | Pinned rule snapshots, MRS files, decoded classifiers, embedded subsets and recorded candidates | [GPL version 3 text](third_party/licenses/MetaCubeX-GPL-3.0.txt) |
| [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script) and its contributors | Pinned Shadowrocket lists, historical fixed inputs and derived embedded rules | [GPL version 2 text](third_party/licenses/blackmatrix7-GPL-2.0.txt) |
| [KaringX/clashmi](https://github.com/KaringX/clashmi) and its contributors | Unmodified source excerpts used to inspect the client bridge and settings | GPL version 3 texts retained alongside each source snapshot; locations are listed in [SOURCES.json](third_party/SOURCES.json) |

## Source and modification records

[third_party/SOURCES.json](third_party/SOURCES.json) records license hashes and upstream Git blob identities, pinned rule revisions, source-lock hashes, and the existing manifests for copied client-source excerpts. The source locks identify each raw file, exact download URL, SHA256, format and derived classifier.

- Current rules: `releases/v14.3/data/rule-sources.lock.json`.
- Immutable baseline and upstream Shadowrocket rules: `releases/v14.3/validation/inputs/v14.2-baseline/data/rule-sources.lock.json`.
- Saved candidates, not enabled automatically: `releases/v14.3/validation/inputs/latest-candidate/manifest.json`.
- Client excerpts: `releases/v14.3/metadata/clashmi-compatibility.json`.

RouteWeaver transforms data by normalizing classifier formats, decoding MRS for finite tests, filtering duplicate domestic rows, selecting reviewed embedded subsets, and assigning its own policy-group names. Generators, exact inputs and SHA256 manifests accompany the audit package / repository; the deployable configurations use the same byte-bound outputs. Upstream copyright/license headers present in raw snapshots remain preserved. Changes and classification counterexamples are documented in `docs/reports/v14.3/`.

The three distribution ZIPs include this notice, both rule-license texts and `third_party/SOURCES.json`. The audit ZIP additionally contains the raw inputs, transformation code, test fixtures and original client-excerpt licenses. Small deployable/Mac ZIPs link to the public versioned repository for their corresponding generator inputs.

This is an aggregate of separately licensed contributions; the root MIT grant does not replace upstream terms or grant rights on behalf of upstream authors. No upstream endorsement is implied. The three JS/config packages do not bundle client binaries. A separately named optional Windows FlClash core pair and its complete corresponding-source asset are described below. Client licenses and trademarks are retained.

## Isolated Mihomo core research

`releases/v14.3/research/ipv6-direct-fast-fail/` contains a patch derived from MetaCubeX/mihomo v1.19.31, commit `ab405bad5beeeac8b003bb01f60f134f6df54471`. The patch and new core sources retain GPL-3.0 terms; the complete license and modification/source hashes are in that directory. It is an undeployed research prototype. No Mihomo binary or dependency tree is distributed. Root MIT terms do not replace the upstream license. The existing rc.4 release assets remain unchanged.

## Current optional Windows FlClash core

`releases/v14.3/research/flclash-core-integration/` contains GPL-3.0-derived patches from FlClash commit `03f955382409a4a7ac1f3f92e46d9fcc6d39f106` and its actual Mihomo fork commit `8380d0e7462f061a964323e9bf3129a236fcc5d5`, plus build/source/installation records. The full GPL text is retained there. Root MIT terms do not replace these terms. No third-party project endorsement is implied.

The rc.5 optional core asset contains the modified Windows core, the unmodified upstream Helper rebuilt against its exact hash, a matching manifest, GPL text, dependency notices and a rollback installer. The separate complete corresponding-source ZIP contains the exact core/Helper sources, modified-source records, build/install scripts, locked Go/Rust dependency source trees and their original licenses. It is released alongside the binary, not replaced by a link to a floating upstream branch. The three normal configuration/audit/Mac packages remain separate. JavaScript engine comparison tools are original harnesses using pinned QuickJS/Boa bindings; their binary is not part of the standard packages.
