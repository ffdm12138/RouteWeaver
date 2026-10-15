"""Audit actual Git index blobs and optional ZIP members; never print secrets."""
from __future__ import annotations
import argparse
import io
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {'.git', '.work', 'archive', 'dist', '__pycache__', 'node_modules',
            '.venv', 'venv', 'experiments'}
PRIVATE_EXT = {'.key', '.p12', '.pfx', '.p8', '.pem', '.env'}
PATTERNS = {
    'API_OR_GIT_TOKEN': re.compile(
        r'(?:github_pat_[a-zA-Z0-9_]{18,}|gh[pousr]_[a-zA-Z0-9_]{28,}|'
        r'sk-(?:proj-)?[a-zA-Z0-9_-]{24,}|AIza[a-zA-Z0-9_-]{32,}|'
        r'xox[baprs]-[a-zA-Z0-9-]{16,})'),
    'PRIVATE_KEY_HEADER': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'URL_EMBEDDED_CREDENTIAL': re.compile(r"""https?://[^\s/@:"']+:[^\s/@"']+@[^\s/"']+"""),
    'PROXY_IMPORT_URI': re.compile(r'\b(?:vmess|vless|trojan|ss|ssr|hysteria2)://', re.I),
    'SUBSCRIPTION_QUERY': re.compile(r'[?&](?:token|access_token|password|api_key)=[a-zA-Z0-9_%.-]{12,}', re.I),
    'PASSWORD_ASSIGNMENT': re.compile(
        r"""(?:password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*["'][^\\"'\r\n]{12,}["']""", re.I),
}
LOCAL_PATH = re.compile(r'(?:[Ee]:[\\/]2[\\/]|[A-Za-z]:\\Users\\[^\\\s]+)')


def indexed_files(root: Path):
    """Return staged blobs, even if the working copy has since been edited."""
    run = subprocess.run(['git', 'ls-files', '--stage', '-z'], cwd=root, capture_output=True)
    if run.returncode:
        raise RuntimeError('Initialize Git and stage the intended public files before auditing.')
    entries = []
    for item in run.stdout.split(b'\0'):
        if not item:
            continue
        meta, raw_name = item.split(b'\t', 1)
        mode, oid, stage = meta.decode('ascii').split()
        if stage != '0':
            raise RuntimeError('Resolve the Git index conflicts before publication.')
        entries.append((raw_name.decode('utf-8'), mode, oid))
    if not entries:
        raise RuntimeError('No indexed files: refusing to report an empty audit as PASS.')
    ids = list(dict.fromkeys(oid for _, _, oid in entries))
    data = subprocess.run(['git', 'cat-file', '--batch'], cwd=root,
                          input=('\n'.join(ids) + '\n').encode('ascii'),
                          capture_output=True, check=True).stdout
    stream = io.BytesIO(data)
    blobs = {}
    for oid in ids:
        actual, kind, size = stream.readline().split()
        if actual.decode('ascii') != oid or kind != b'blob':
            raise RuntimeError('Only regular file blobs may be published by this preflight.')
        blobs[oid] = stream.read(int(size))
        if stream.read(1) != b'\n':
            raise RuntimeError('Malformed Git batch output.')
    return [(name, blobs[oid], mode) for name, mode, oid in entries]


def inspect_file(name: str, raw: bytes, mode: str = '100644'):
    path = PurePosixPath(name.replace('\\', '/'))
    findings = []
    if path.is_absolute() or '..' in path.parts or re.match(r'^[A-Za-z]:', name):
        findings.append('UNSAFE_PATH')
    if any(part.lower() in EXCLUDED for part in path.parts):
        findings.append('FORBIDDEN_PUBLIC_PATH')
    if mode not in {'100644', '100755'}:
        findings.append('NON_REGULAR_FILE')
    lower = path.name.lower()
    if path.suffix.lower() in PRIVATE_EXT or (lower.startswith('.env') and lower != '.env.example'):
        findings.append('PRIVATE_FILE_TYPE')
    if path.suffix.lower() in {'.exe', '.dll', '.zip', '.pyc'}:
        findings.append('RUNTIME_OR_NESTED_ARCHIVE')
    if len(raw) > 90 * 1024 * 1024:
        findings.append('VERY_LARGE_FILE')
    text = '' if b'\0' in raw[:8192] else raw.decode('utf-8', 'replace')
    findings.extend(kind for kind, pattern in PATTERNS.items() if pattern.search(text))
    return findings, bool(LOCAL_PATH.search(text))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--strict', action='store_true')
    parser.add_argument('--archive', action='append', default=[], metavar='ZIP')
    args = parser.parse_args()
    findings, local = [], []
    counts = {}

    def audit(name, raw, mode='100644'):
        kinds, has_local = inspect_file(name, raw, mode)
        for kind in kinds:
            findings.append({'file': name, 'kind': kind})
            counts[kind] = counts.get(kind, 0) + 1
        if has_local:
            local.append(name)

    files = indexed_files(ROOT)
    indexed = {name: raw for name, raw, _ in files}
    for name, raw, mode in files:
        audit(name, raw, mode)
    inventory = json.loads(indexed['third_party/SOURCES.json'])
    for record in inventory['licenses'] + inventory['sourceManifests']:
        name = record['file']
        if name not in indexed or hashlib.sha256(indexed[name]).hexdigest() != record['sha256']:
            findings.append({'file': name, 'kind': 'PROVENANCE_HASH_MISMATCH'})
            counts['PROVENANCE_HASH_MISMATCH'] = counts.get('PROVENANCE_HASH_MISMATCH', 0) + 1
    license_members = {name: raw for name, raw in indexed.items()
                       if name in {'LICENSE', 'THIRD_PARTY_NOTICES.md'} or name.startswith('third_party/')}
    archives = []
    for filename in args.archive:
        path = Path(filename)
        if not path.is_absolute():
            path = ROOT / path
        with zipfile.ZipFile(path) as archive:
            if archive.testzip() is not None:
                raise RuntimeError('ZIP CRC failed: ' + path.name)
            names = archive.namelist()
            if len(set(names)) != len(names):
                raise RuntimeError('ZIP contains duplicate names: ' + path.name)
            for name, expected in license_members.items():
                if name not in names or archive.read(name) != expected:
                    findings.append({'file': name, 'archive': path.name, 'kind': 'MISSING_OR_STALE_LICENSE_NOTICE'})
                    counts['MISSING_OR_STALE_LICENSE_NOTICE'] = counts.get('MISSING_OR_STALE_LICENSE_NOTICE', 0) + 1
            for member in archive.infolist():
                if member.is_dir():
                    continue
                file_type = (member.external_attr >> 16) & 0o170000
                mode = '120000' if file_type == 0o120000 else '100644'
                prior = len(findings)
                audit(member.filename, archive.read(member), mode)
                for finding in findings[prior:]:
                    finding['archive'] = path.name
            archives.append({'file': path.name, 'members': len(names), 'crc': 'PASS'})
    report = {'scope': 'actual Git index blobs and all supplied ZIP members',
              'scannedFiles': len(files), 'archives': archives, 'findingCounts': counts,
              'findings': findings,
              'localPathFiles': local, 'publicationReady': not findings,
              'caveat': 'Heuristic credential scan; source provenance and human review remain necessary.'}
    target = ROOT / '.work/publication-audit.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'indexedFiles': len(files), 'archives': archives,
                      'findingCounts': counts,
                      'localPathFiles': len(local), 'publicationReady': not findings}, ensure_ascii=False))
    if args.strict and findings:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
