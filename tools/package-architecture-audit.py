"""Create and extract-verify the current source/import candidate, never a live config.

Old release packages/receipts stay untouched. All work uses an automatically
cleaned temporary directory. The last good candidate is replaced only after CRC,
member SHA256, source gate, generation and fresh smoke tests pass.
"""
from __future__ import annotations
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from current_audit import MANIFEST, REVISION, checked_path, read, sha, verify

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist/architecture-audit'


def main() -> int:
    DIST.mkdir(parents=True, exist_ok=True)
    receipt = {'revision': REVISION, 'status': 'RUNNING', 'tests': [], 'liveClientWrites': False,
               'scope': 'CRC_AND_MEMBER_HASHES_PLUS_FRESH_EXTRACTED_SOURCE_GENERATION_REGRESSION_AND_TOOL_TESTS_NOT_DEVICE'}
    directory = None
    try:
        gate = verify(ROOT)
        acceptance = read(ROOT/MANIFEST)
        flavor = gate['flavor']
        names = sorted(set(acceptance['files']) | {MANIFEST.as_posix()})
        package_files = {name: sha(checked_path(ROOT, name)) for name in names}
        # Fail on real credential-like artifacts, not on generic field names in source.
        private_key = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')
        api_key = re.compile(rb'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b')
        for name in names:
            raw = checked_path(ROOT, name).read_bytes()
            if private_key.search(raw) or api_key.search(raw):
                raise ValueError('Credential-like material in candidate: '+name)
            if '/src/' in name and re.search(rb'https?://[^/\s:@]+:[^/\s@]+@', raw):
                raise ValueError('Credential URL in import source: '+name)
        package_manifest = {'revision': REVISION, 'kind': 'SOURCE_AND_IMPORT_CANDIDATE',
                            'flavor': flavor, 'files': package_files,
                            'acceptanceSHA256': gate['manifestSHA256'],
                            'deviceAcceptance': 'NOT_VERIFIED',
                            'releaseChannel': 'GitHub Pre-release (publication is an external event)'}
        target = DIST / ('RouteWeaver-'+REVISION+'-'+flavor+'.zip')
        with tempfile.TemporaryDirectory(prefix='RouteWeaver-package-check-') as directory:
            temp = Path(directory)
            staged = temp/'candidate.zip'
            with zipfile.ZipFile(staged, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                for name in names:
                    item = zipfile.ZipInfo(name, date_time=(2026,11,1,0,0,0))
                    item.compress_type = zipfile.ZIP_DEFLATED
                    archive.writestr(item, checked_path(ROOT, name).read_bytes())
                item = zipfile.ZipInfo('PACKAGE_MANIFEST.json', date_time=(2026,11,1,0,0,0))
                item.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(item, json.dumps(package_manifest, ensure_ascii=False, indent=2)+'\n')
            extracted = temp/'extracted'
            extracted.mkdir()
            with zipfile.ZipFile(staged) as archive:
                if archive.testzip() is not None:
                    raise ValueError('ZIP CRC failed')
                if len(archive.namelist()) != len(set(archive.namelist())):
                    raise ValueError('Duplicate ZIP member')
                if set(archive.namelist()) != set(names) | {'PACKAGE_MANIFEST.json'}:
                    raise ValueError('ZIP member set differs')
                for item in archive.infolist():
                    path = PurePosixPath(item.filename)
                    if path.is_absolute() or '..' in path.parts or '\\' in item.filename or ':' in item.filename:
                        raise ValueError('Unsafe ZIP path')
                    raw = archive.read(item)
                    if item.filename in package_files and hashlib.sha256(raw).hexdigest() != package_files[item.filename]:
                        raise ValueError('ZIP member digest differs')
                archive.extractall(extracted)
            commands = [
                [sys.executable, '-X', 'utf8', 'tools/verify-current-audit.py'],
                ['node', 'releases/v14.3/tools/build-all.cjs', '--check'],
                ['node', 'tools/build-ipv4-only.cjs', '--check'],
                ['node', 'tools/test-architecture.cjs', '--output', str(temp/'fresh-regressions.json')],
                [sys.executable, '-X', 'utf8', '-m', 'unittest', 'discover', '-s', 'tools/tests', '-p', 'test_*.py'],
                [sys.executable, '-X', 'utf8', 'tools/verify-current-audit.py'],
            ]
            for command in commands:
                process = subprocess.run(command, cwd=extracted, capture_output=True, text=True,
                    encoding='utf-8', errors='replace', timeout=40,
                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                receipt['tests'].append({'command': ['python' if x == sys.executable else x.replace(str(temp), '<temporary>') for x in command],
                    'exitCode': process.returncode, 'stdout': process.stdout[-4000:].replace(str(temp), '<temporary>'),
                    'stderr': process.stderr[-4000:].replace(str(temp), '<temporary>')})
                if process.returncode:
                    raise ValueError('Fresh extraction test failed: '+command[3 if command[0] == sys.executable else 1])
            # Negative control: even a harmless change to an import must invalidate
            # the sealed candidate. Restore only this disposable extraction.
            import_name = next(name for name in acceptance['entries'] if name.endswith('.js'))
            import_path = extracted/import_name
            original = import_path.read_bytes()
            try:
                import_path.write_bytes(original+b'\n// synthetic integrity test\n')
                negative = subprocess.run([sys.executable, '-X', 'utf8', 'tools/verify-current-audit.py'],
                    cwd=extracted, capture_output=True, text=True, encoding='utf-8', timeout=20)
                if negative.returncode == 0:
                    raise ValueError('Verifier accepted a modified import')
                receipt['tamperedImportRejected'] = True
            finally:
                import_path.write_bytes(original)
            restored = subprocess.run([sys.executable, '-X', 'utf8', 'tools/verify-current-audit.py'],
                cwd=extracted, capture_output=True, text=True, encoding='utf-8', timeout=20)
            if restored.returncode:
                raise ValueError('Restored extraction no longer verifies')
            receipt['restoredExtractionVerified'] = True
            # Confirm no source drift while the archive was being tested.
            if verify(ROOT)['manifestSHA256'] != gate['manifestSHA256']:
                raise ValueError('Candidate changed while packaging')
            digest = sha(staged)
            # TEMP and the workspace may be on different Windows volumes.
            # Stage one verified file on the destination volume, then replace it
            # atomically; never leave a persistent temporary backup behind.
            local_stage = None
            try:
                with tempfile.NamedTemporaryFile(prefix='.candidate-', suffix='.tmp', dir=DIST, delete=False) as output:
                    local_stage = Path(output.name)
                    with staged.open('rb') as source:
                        shutil.copyfileobj(source, output)
                    output.flush()
                    os.fsync(output.fileno())
                if sha(local_stage) != digest:
                    raise ValueError('Cross-volume copy digest differs')
                os.replace(local_stage, target)
            finally:
                if local_stage is not None and local_stage.exists():
                    local_stage.unlink()
            target.with_suffix('.zip.sha256').write_text(digest+'  '+target.name+'\n', encoding='utf-8')
            receipt.update(status='CURRENT_CANDIDATE_PACKAGE_PASS_DEVICE_PENDING', flavor=flavor,
                           file=target.name, bytes=target.stat().st_size, sha256=digest,
                           entries=len(acceptance['entries']), members=len(names)+1,
                           acceptanceSHA256=gate['manifestSHA256'], archiveCRC='PASS', memberSHA256='ALL_MATCH')
    except Exception as error:
        receipt.update(status='FAIL', errorType=type(error).__name__, error=str(error))
    finally:
        receipt['temporaryDirectoryRemoved'] = directory is None or not Path(directory).exists()
        receipt['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        (DIST/'package-verification.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k:v for k,v in receipt.items() if k != 'tests'}, ensure_ascii=False))
    return int(receipt['status'] != 'CURRENT_CANDIDATE_PACKAGE_PASS_DEVICE_PENDING' or not receipt['temporaryDirectoryRemoved'])

if __name__ == '__main__':
    raise SystemExit(main())
