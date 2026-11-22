"""Verify the native fallback entries and prepare or verify either release track."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile

from current_audit import checked_path, read, sha


ROOT = Path(__file__).resolve().parents[1]
SUMS = 'SHA256SUMS.txt'
SELECTOR_ORDER_CHECKS = {
    'selector_order_and_fresh_defaults',
    'selector_order_after_manual_choice',
    'selector_order_and_saved_choices_after_node_removal',
    'public_manual_DIRECT_tcp_udp_dns',
    'catchall_manual_DIRECT_while_domestic_proxies_tcp_udp_dns',
}


def entry_digest(path, previous_digest, system_dns=False):
    source = path.read_bytes()
    previous = source
    if system_dns:
        # Check the old receipt against the original bytes reconstructed by
        # undoing exactly the DIRECT DNS edit. Its device scope stays historical.
        if path.suffix == '.conf':
            changes = (
                (b'direct-dns-server = system', b'direct-dns-server = https://dns.alidns.com/dns-query,https://doh.pub/dns-query'),
                (b'dns-direct-system = true', b'dns-direct-system = false'),
            )
        else:
            changes = ((
                b'"direct-nameserver": ["system"], "direct-nameserver-follow-policy": false,',
                b'"direct-nameserver": V14.directDns.slice(), "direct-nameserver-follow-policy": true,',
            ),)
        for current, original in changes:
            if previous.count(current) != 1:
                raise ValueError('Missing unambiguous DIRECT DNS change: ' + str(path))
            previous = previous.replace(current, original)
    if sha256(previous).hexdigest() != previous_digest:
        raise ValueError('Stale entry evidence or unrelated source change: ' + str(path))
    return sha256(source).hexdigest()


def projectclash_assets(root, candidate, edition, system_dns=False, selector_order=False):
    receipt = read(checked_path(root, candidate['verification']))
    if (receipt['status'] != 'PASS_ISOLATED_PROJECTCLASH_CORE' or receipt['edition'] != edition
            or receipt['revision'] != candidate['revision'] or receipt['core']['commit'] != candidate['reviewedCoreCommit']):
        raise ValueError('Missing or incompatible ProjectClash replay')
    for file, digest in receipt['harness'].items():
        if sha(checked_path(root, file)) != digest:
            raise ValueError('Stale ProjectClash replay harness: ' + file)
    required = {
        'wechat_real_ipv4_with_ordinary_fakeip_and_filtered_aaaa_https',
        'video_egress_tcp_udp_dns:rr4---sn-oguelnsr.googlevideo.com',
        'video_egress_tcp_udp_dns:archive.ubuntu.com',
        'google_egress_tcp_udp_dns:accounts.youtube.com',
        'youtube_unsupported_udp_rejected',
        'fallback_to_D',
        'reload_legacy_reject_skips_to_tier3',
        'reload_removed_primary_and_all_backups_rejects',
        'openai_mode_correct_encrypted_dns_selected_group',
    }
    if selector_order:
        required.update(SELECTOR_ORDER_CHECKS)
    assets = {}
    for track, file in candidate['entries'].items():
        source = checked_path(root, file)
        proof = receipt['tracks'][track]
        if proof['file'] != file or not required.issubset(proof['checks']):
            raise ValueError('Stale or incomplete ProjectClash evidence: ' + file)
        assets[track] = (source, entry_digest(source, proof['sha256'], system_dns))
    if set(assets) != {'main', 'ipv4-only'}:
        raise ValueError('Expected one ProjectClash entry per track')
    return assets


def verify_source(root):
    release = read(root / 'CURRENT_RELEASE.json')
    candidate = release['nativeFallback']
    revision = release.get('currentRevision')
    system_dns = revision == 'direct-system-dns-r1'
    selector_order = revision == 'selector-option-order-r1'
    receipt = read(checked_path(root, candidate['verification']))
    edition = 'personal' if release.get('vpsDirectRevision') else 'public'
    if (receipt['revision'] != candidate['revision'] or receipt['edition'] != edition
            or receipt['status'] != 'PASS_ISOLATED_STOCK_CORE'):
        raise ValueError('Missing or incompatible native fallback evidence')

    tracks = {'main': release['entries'], 'ipv4-only': release['variants']['ipv4-only']['entries']}
    projectclash = projectclash_assets(root, release['projectClash'], edition, system_dns, selector_order)
    tags = release['directSystemDns']['releaseTags'] if system_dns else candidate['releaseTags']
    if tags is not None and (set(tags) != set(tracks) or len(set(tags.values())) != 2):
        raise ValueError('Expected two distinct track tags')
    assets = {}
    for track, entries in tracks.items():
        proofs = receipt['tracks'][track]
        if len(entries) != 7 or set(entries) != set(proofs):
            raise ValueError('Expected seven bound entries per track')
        files = {}
        for client, file in entries.items():
            path = checked_path(root, file)
            proof = proofs[client]
            if proof['file'] != file:
                raise ValueError('Stale entry evidence: ' + file)
            if path.suffix == '.js' and proof['coreChecks'] != len(receipt['checks']):
                raise ValueError('Incomplete core replay: ' + file)
            files[path.name] = (path, entry_digest(path, proof['sourceSHA256'], system_dns))
        if len(files) != 7:
            raise ValueError('Duplicate asset basename')
        path, digest = projectclash[track]
        if path.name in files:
            raise ValueError('Duplicate ProjectClash asset basename')
        files[path.name] = (path, digest)
        if tags is not None:
            assets[tags[track]] = files
    if not receipt['checks']:
        raise ValueError('Empty core replay inventory')
    if candidate['revision'] in ('domestic-resilience-r1', 'backup-slot-skip-r1'):
        if receipt['runnerSHA256'] != sha(root / 'tools/replay-resilience.py') or receipt['hostSHA256'] != sha(root / 'tools/stock-core-host.py'):
            raise ValueError('Stale isolated replay runner')
    if candidate['revision'] == 'backup-slot-skip-r1':
        required = {
            'skip_tier1_first_connection_uses_tier2',
            'skip_tiers1_and2_first_connection_uses_tier3',
            'reload_legacy_reject_skips_to_tier3',
            'reload_removed_primary_and_tier1_uses_tier2',
            'reload_removed_primary_and_first_two_tiers_uses_tier3',
            'reload_removed_primary_and_all_backups_rejects',
        }
        if not required.issubset(receipt['checks']):
            raise ValueError('Missing backup-slot skip replay')
    if selector_order and not SELECTOR_ORDER_CHECKS.issubset(receipt['checks']):
        raise ValueError('Missing selector order, default or saved choice replay')
    if selector_order or revision in ('youtube-apt-routing-r1', 'direct-system-dns-r1'):
        required = {
            'video_egress_tcp_udp_dns:rr4---sn-oguelnsr.googlevideo.com',
            'video_egress_tcp_udp_dns:archive.ubuntu.com',
            'video_egress_tcp_udp_dns:security.ubuntu.com',
            'google_egress_tcp_udp_dns:geminiweb-pa.clients6.google.com',
            'google_egress_tcp_udp_dns:accounts.youtube.com',
            'google_egress_tcp_udp_dns:youtube.googleapis.com',
            'youtube_unsupported_udp_rejected',
        }
        if not required.issubset(receipt['checks']):
            raise ValueError('Missing YouTube, Ubuntu APT or protected Google egress replay')
    if candidate['revision'] == 'domestic-resilience-r1':
        checks = [
            ('domestic-resilience/after.json', 'tools/test-domestic-resilience.cjs'),
            ('domestic-resilience/dns-order.json', 'tools/test-dns-policy-order.cjs'),
            ('domestic-resilience/quickjs.json', 'tools/check-quickjs.py'),
            ('domestic-resilience/regression.json', 'tools/verify-resilience.py'),
            ('cloud-rule-audit/after.json', 'tools/test-company-audit.cjs'),
        ]
        expected = {file: sha(root / file) for entries in tracks.values() for file in entries.values()}
        for name, runner in checks:
            report = read(root / 'releases/v14.3/validation' / name)
            if report['status'] != 'PASS' or report['testSHA256'] != sha(root / runner):
                raise ValueError('Failed or stale current validation: ' + name)
            subset = {file: digest for file, digest in expected.items() if name != 'domestic-resilience/dns-order.json' or file.endswith('.js')}
            if report['sources'] != subset:
                raise ValueError('Stale source bindings: ' + name)
        dns = read(root / 'releases/v14.3/validation/domestic-resilience/dns-order.json')
        if dns['modelSHA256'] != sha(root / 'releases/v14.3/tests/domain-index.cjs'):
            raise ValueError('Stale DNS model evidence')
    return assets


def verify_static():
    # The existing routing suites write receipts. Replay the index in a
    # temporary directory so the older tracked receipts keep their bytes.
    with tempfile.TemporaryDirectory(prefix='routeweaver-release-') as temp:
        snapshot = Path(temp)
        subprocess.run(['git', 'checkout-index', '--all', '--prefix=' + snapshot.as_posix() + '/'],
                       cwd=ROOT, check=True, timeout=60)
        verify_source(snapshot)
        suites = runpy.run_path(str(snapshot / 'tools/run-architecture-audit.py'))['SUITES']
        commands = [*suites['build'], ['node', 'tools/build-projectclash.cjs', '--check'], ['node', 'tools/test-projectclash.cjs'],
                    ['node', 'tools/test-native-fallback.cjs'], ['node', 'tools/test-tailscale-direct.cjs'],
                    ['node', 'tools/test-company-audit.cjs'], ['node', 'tools/test-dns-policy-order.cjs'],
                    *suites['regression'], *suites['platform']]
        for command in commands:
            subprocess.run(command, cwd=snapshot, check=True, timeout=90)
        subprocess.run(['node', 'tools/test-domestic-resilience.cjs'], cwd=snapshot, check=True, timeout=900)
        with ThreadPoolExecutor(max_workers=2) as pool:
            runs = [pool.submit(subprocess.run, command, cwd=snapshot, check=True, timeout=480)
                    for command in suites['static'] + suites['macos']]
            for run in runs:
                run.result()


def sums(files):
    return ''.join(f'{digest}  {name}\n' for name, (_, digest) in sorted(files.items())).encode('ascii')


def verify_assets(directory, files):
    if {path.name for path in directory.iterdir()} != set(files) | {SUMS}:
        raise ValueError('Release assets differ from the track inventory')
    if checked_path(directory, SUMS).read_bytes() != sums(files):
        raise ValueError('SHA256SUMS differs from the track inventory')
    for name, (_, digest) in files.items():
        if sha(checked_path(directory, name)) != digest:
            raise ValueError('Release asset differs: ' + name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--static', action='store_true')
    parser.add_argument('--tag')
    action = parser.add_mutually_exclusive_group()
    action.add_argument('--assets', type=Path)
    action.add_argument('--stage', type=Path)
    args = parser.parse_args()
    inventory = verify_source(ROOT)
    directory = args.assets or args.stage
    if (directory or args.tag) and args.tag not in inventory:
        parser.error('Specify a release tag configured for this candidate')
    if args.static:
        verify_static()
    if directory:
        files = inventory[args.tag]
        directory = directory.resolve()
        if args.stage:
            directory.mkdir(parents=True, exist_ok=True)
            if any(path.is_symlink() or path.name not in set(files) | {SUMS} for path in directory.iterdir()):
                raise ValueError('Staging directory contains unrelated or linked files')
            for name, (source, _) in files.items():
                shutil.copyfile(source, directory / name)
            (directory / SUMS).write_bytes(sums(files))
        verify_assets(directory, files)
    print(json.dumps({'tag': args.tag, 'source': 'PASS', 'static': 'PASS' if args.static else 'NOT_RUN',
                      'assets': len(inventory[args.tag]) + 1 if directory else 'NOT_RUN',
                      'deviceAcceptance': 'NOT_RUN'}))


if __name__ == '__main__':
    main()
