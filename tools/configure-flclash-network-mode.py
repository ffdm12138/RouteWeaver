"""Configure the CURRENT FlClash profile's standalone JS network mode.

Read-only by default. --apply requires the expected script SHA256 and backup directory.
Changes only the default constant; never changes OS IPv6, proxies, routes, services,
profile bindings, subscription URLs, or database rows. Reload the App separately.
"""
from __future__ import annotations
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile

MODES = ('auto', 'dual-stack', 'ipv4-local')
PATTERN = re.compile(rb'(?m)^(const ROUTEWEAVER_DEFAULT_NETWORK_MODE\s*=\s*)([\"\'])(auto|dual-stack|ipv4-local)\2(;)')


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def configure_bytes(source: bytes, mode: str) -> bytes:
    if mode not in MODES:
        raise ValueError('Unsupported network mode')
    matches = list(PATTERN.finditer(source))
    if len(matches) != 1 or b'x-v14-generated' not in source:
        raise ValueError('Expected exactly one recognized standalone entry mode constant')
    match = matches[0]
    return source[:match.start(3)] + mode.encode('ascii') + source[match.end(3):]


def current_binding(client: Path) -> tuple[int, int, Path, bool]:
    prefs = json.loads((client / 'shared_preferences.json').read_bytes())['flutter.config']
    if isinstance(prefs, str):
        prefs = json.loads(prefs)
    profile_id = prefs['currentProfileId']
    with closing(sqlite3.connect((client / 'database.sqlite').resolve().as_uri() + '?mode=ro', uri=True)) as db:
        row = db.execute('SELECT extend_type, script_id FROM profiles WHERE id=?', (profile_id,)).fetchone()
        if not row or row[0] != 'script' or not isinstance(row[1], int):
            raise ValueError('Current profile is not bound to a script')
        script_id = row[1]
        remote = db.execute('SELECT url FROM scripts WHERE id=?', (script_id,)).fetchone()
    return profile_id, script_id, client / 'scripts' / (str(script_id) + '.js'), bool(remote and remote[0])


def configure(client: Path, mode: str, *, apply: bool = False,
              expected_sha256: str | None = None, expected_profile: int | None = None,
              backup_dir: Path | None = None) -> dict:
    profile_id, script_id, script, remote = current_binding(client)
    if expected_profile is not None and profile_id != expected_profile:
        raise ValueError('Current profile changed; refusing to modify another profile')
    before = script.read_bytes()
    before_sha = digest(before)
    if expected_sha256 is not None and before_sha != expected_sha256.lower():
        raise ValueError('Current script changed; expected SHA256 does not match')
    after = configure_bytes(before, mode)
    result = {'status': 'DRY_RUN', 'profileId': profile_id, 'scriptId': script_id,
              'beforeSHA256': before_sha, 'afterSHA256': digest(after),
              'expectedNetworkMode': mode, 'scriptHasRemoteUpdateURL': remote,
              'changed': after != before, 'clientReloaded': False,
              'scope': 'Only the current bound JS default constant; core/OS IPv6, routing, selections and database unchanged'}
    if not apply:
        return result
    if expected_sha256 is None or backup_dir is None:
        raise ValueError('--apply requires expected SHA256 and a backup directory')
    backup_dir.mkdir(parents=True, exist_ok=False)
    (backup_dir / 'script.before.js').write_bytes(before)
    result['createdAtUTC'] = datetime.now(timezone.utc).isoformat()
    # Recheck both binding and content immediately before the one-file atomic replacement.
    if current_binding(client)[:2] != (profile_id, script_id) or script.read_bytes() != before:
        raise RuntimeError('Binding or script changed during preparation; nothing was applied')
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix='.routeweaver-mode-', suffix='.tmp', dir=script.parent, delete=False) as output:
            temp_path = Path(output.name)
            output.write(after)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp_path, script)
        temp_path = None
        result['status'] = 'SCRIPT_MODE_APPLIED_RELOAD_REQUIRED'
        (backup_dir / 'receipt.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client-root', required=True, type=Path)
    parser.add_argument('--mode', required=True, choices=MODES)
    parser.add_argument('--expected-profile-id', type=int)
    parser.add_argument('--expected-script-sha256')
    parser.add_argument('--backup-dir', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        result = configure(args.client_root, args.mode, apply=args.apply,
                           expected_sha256=args.expected_script_sha256,
                           expected_profile=args.expected_profile_id, backup_dir=args.backup_dir)
    except Exception as error:
        # Do not print third-party parser exceptions which may contain private configuration.
        print(json.dumps({'status': 'NOT_APPLIED_OR_INTERRUPTED', 'errorType': type(error).__name__,
                          'hint': 'Verify current binding, expected hash and an unused backup directory; inspect any receipt before retrying'}))
        return 2
    print(json.dumps(result, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
