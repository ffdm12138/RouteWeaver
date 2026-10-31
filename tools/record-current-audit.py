"""Seal the reviewed current candidate only after all current evidence gates pass.

This is not permission to bypass a failed test. It never modifies a legacy
receipt, a frozen input, installed clients, or the release status of old tags.
"""
from pathlib import Path
import datetime
import json
from current_audit import REVISION, MANIFEST, entries, inventory, evidence


def main():
    root = Path(__file__).resolve().parents[1]
    proofs = evidence(root)
    report = {'revision': REVISION,
        'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'status': 'CURRENT_CANDIDATE_VERIFIED_DEVICE_PENDING',
        'scope': 'Source, finite static inventories and limited isolated Windows core. Not universal deployment approval.',
        'entries': entries(root), 'evidence': proofs, 'files': inventory(root),
        'limitations': ['No native device/TUN sign-off', 'No fresh QuickJS/Boa/JavaScriptCore replay',
                       'No authenticated public AI calls', 'No production DNS-transport affinity proof',
                       'No cross-platform automatic-family extension proof',
                       'Legacy release receipts remain historical; not re-signed', 'No independent subagent reviewer']}
    (root/MANIFEST).write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'files': len(report['files']), 'entries': len(report['entries'])}))

if __name__ == '__main__':
    main()
