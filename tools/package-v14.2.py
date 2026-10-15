"""Create focused standalone packages; verify CRC, member hashes and fresh replay."""
import argparse, hashlib, json, os, pathlib, re, subprocess, tempfile, zipfile

project = pathlib.Path(__file__).resolve().parent.parent
release = project / 'releases/v14.2'
dist = project / 'dist/v14.2'
digest = lambda data: hashlib.sha256(data).hexdigest()
sha = lambda path: digest(path.read_bytes())
parser = argparse.ArgumentParser()
parser.add_argument('--node', default='node')
parser.add_argument('--fresh-dns', action='store_true')
parser.add_argument('--fresh-routing', action='store_true')
parser.add_argument('--fresh-apple', action='store_true')
parser.add_argument('--fresh-embedded', action='store_true')
parser.add_argument('--fresh-clashmi', action='store_true')
parser.add_argument('--core')
parser.add_argument('--openssl')
args = parser.parse_args()
dist.mkdir(parents=True, exist_ok=True)
fresh_root = project / '.work/packaging'
fresh_root.mkdir(parents=True, exist_ok=True)

for name, status in [('static', 'STATIC_PASS'), ('repair-review', 'REPAIR_REGRESSION_PASS'), ('domestic-audit', 'DOMESTIC_AUDIT_PASS'), ('domestic-selector', 'DOMESTIC_SELECTOR_PASS'), ('api-browser-compat', 'API_BROWSER_COMPAT_STATIC_PASS'), ('api-browser-regression', 'API_REAL_IP_CORE_PASS_BROWSER_TUN_RETEST_PENDING'), ('native-routing', 'CORE_ROUTING_PASS'), ('native-dns-egress', 'CORE_DNS_EGRESS_PASS'), ('thunder-repair', 'THUNDER_REPAIR_STATIC_PASS'), ('thunder-domain-coverage', 'THUNDER_DOMAIN_COVERAGE_PASS'), ('native-selectors', 'CORE_MANUAL_SELECTORS_PASS'), ('thunder-r2', 'THUNDER_R2_STATIC_PASS'), ('thunder-r3', 'THUNDER_R3_STATIC_PASS'), ('thunder-r4', 'THUNDER_R4_ELEVEN_CONTRACTS_STATIC_PASS'), ('thunder-r5', 'THUNDER_R5_ELEVEN_CONTRACTS_STATIC_PASS'), ('native-inbound-guard', 'CORE_INBOUND_GUARD_PASS')]:
    receipt = json.loads((release / f'validation/{name}.json').read_text(encoding='utf-8-sig'))
    assert receipt['status'] == status
    for source in receipt['sourceFiles']:
        assert sha(release / source['file']) == source['sha256'], f'Stale {name}: {source["file"]}'
lock = json.loads((release / 'data/rule-sources.lock.json').read_text(encoding='utf-8-sig'))
for name, status in [('clashmi', 'CLASHMI_STATIC_PASS'), ('clashmi-core', 'CLASHMI_LOCAL_CORE_PASS')]:
    receipt = json.loads((release / f'validation/{name}.json').read_text(encoding='utf-8-sig'))
    assert receipt['status'] == status
    for source in receipt['sourceFiles']:
        assert sha(release / source['file']) == source['sha256'], f'Stale {name}: {source["file"]}'
clashmi_review = json.loads((release / 'metadata/clashmi-review.json').read_text(encoding='utf-8-sig'))
assert clashmi_review['status'] == 'CLASHMI_SOURCE_LOCAL_CORE_PASS_DEVICE_PENDING'
for entry in [*clashmi_review['entries'], *clashmi_review['evidence'].values(), clashmi_review['generatedSources'], clashmi_review['compatibility']]:
    assert sha(release / entry['file']) == entry['sha256'], 'Stale Clash Mi review: ' + entry['file']
for source in lock['sources']:
    assert re.search(r'/[a-f0-9]{40}/', source['url'])
    assert sha(release / source['file']) == source['sha256']
    assert sha(release / source['classifier']['file']) == source['classifier']['sha256']

deploy_files = ['README.md', 'src/windows/v14.2.js', 'src/android/v14.2-android.js', 'src/ios/v14.2-shadowrocket.conf',
                'tools/generate-v14.2-shadowrocket.js', 'tools/sync-reviewed-data.cjs', 'metadata/shadowrocket-sources.json', 'data/direct-rule-pins.json',
                'data/rules/classification-review.json', 'data/rules/domestic-direct.json', 'metadata/domestic-selector-amendment.json', 'metadata/api-browser-compatibility.json']
deploy_files += [p.relative_to(release).as_posix() for folder in ['data/shadowrocket', 'data/rules/company-inputs'] for p in (release / folder).rglob('*') if p.is_file()]
deploy_files += ['data/rules/cdn-regex-review.json','tools/validate-cdn-regex.cjs','metadata/thunder-r5-review.json','metadata/thunder-closeout-review.json','validation/thunder-closeout.json','validation/thunder-r5.json','validation/independent-r5.json']
deploy_files += ['metadata/apple-inline-review.json','validation/apple-inline.json','validation/apple-inline-core.json']
deploy_files += ['metadata/embedded-domain-review.json','data/rules/embedded-domains.json','data/rules/embedded-source-review.json','tools/build-embedded-domains.cjs','validation/embedded-domains.json','validation/embedded-domains-core.json','validation/embedded-domains-download-failure.json']
deploy_files += ['src/ios/v14.2-clashmi.js', 'tools/clashmi-adapter.js', 'tools/generate-v14.2-clashmi.cjs',
                 'metadata/clashmi-sources.json', 'metadata/clashmi-compatibility.json', 'metadata/clashmi-review.json',
                 'validation/clashmi.json', 'validation/clashmi-core.json']
deploy_files += [e['file'] for e in json.loads((release / 'metadata/clashmi-compatibility.json').read_text(encoding='utf-8-sig'))['snapshots']]
deploy_files += ['src/ios/v14.2-clashmi-object-r2.js','validation/inputs/clashmi-object-error/user-observations.json']
deploy_files += [entry[file] if file=='file' else entry['classifier']['file'] for entry in lock['sources'] for file in ['file','classifier']]
deploy_files += ['data/rules/azure-async-review.json', 'tools/validate-azure-async.cjs', 'metadata/thunder-r4-review.json', 'validation/thunder-r4.json', 'validation/inputs/r4-attempts/initial-static.json', 'data/rules/company-core.json', 'data/rules/safety-classifiers.json', 'metadata/thunder-r3-review.json', 'validation/final-acceptance.json']
deploy_files += ['data/rules/business-services.json', 'data/rule-sources.lock.json', 'metadata/thunder-repair-review.json', 'metadata/thunder-r2-review.json']
native_sources = json.loads((release / 'metadata/shadowrocket-sources.json').read_text(encoding='utf-8-sig'))
deploy_files += [entry['file'] for entry in native_sources['dnsPolicy']['reviewedInputs']]
# The second audit uses type-separated, reviewed native projections; a fresh
# deployable must include their raw proof bytes and their compiled classifiers.
for entry in native_sources['classifierProjections']:
    deploy_files.extend([entry['file'], entry['classifier']['file']])
audit_files = []
for path in release.rglob('*'):
    if not path.is_file():
        continue
    rel = path.relative_to(release).as_posix()
    if rel.startswith('.work/'):
        continue
    if rel.startswith('validation/') and (path.suffix in {'.key', '.crt', '.db'} or '/ruleset/' in rel):
        continue
    if rel.startswith('validation/experiments/') and not (path.suffix in {'.json', '.log'}):
        continue
    if rel.startswith('validation/experiments/') and '/ruleset/' in rel:
        continue
    if path.name == 'organize-workspace.ps1':
        continue
    audit_files.append(rel)

def render_document(source, destination):
    """Keep one workspace source and retarget local links for a standalone ZIP."""
    if source == project / 'docs/需求.md':
        return source.read_bytes()  # The frozen contract has no links to retarget.
    text = source.read_text(encoding='utf-8-sig')
    def rewrite(match):
        label, target = match.group(1), match.group(2).strip('<>')
        if re.match(r'^(https?://|mailto:|#)', target):
            return match.group(0)
        path_part, separator, anchor = target.partition('#')
        resolved = (source.parent / path_part).resolve()
        if resolved.is_relative_to(release):
            packed = pathlib.Path(resolved.relative_to(release))
        elif resolved.is_relative_to(project / 'docs'):
            packed = pathlib.Path('docs') / resolved.relative_to(project / 'docs')
        else:
            location = resolved.relative_to(project).as_posix() if resolved.is_relative_to(project) else target
            return f'{label}（源工作区：`{location}`）'
        relative = pathlib.Path(os.path.relpath(packed, pathlib.Path(destination).parent)).as_posix()
        return f'[{label}]({relative}{separator}{anchor})'
    return re.sub(r'(?<!!)\[([^\]]+)\]\(([^)]+)\)', rewrite, text).encode('utf-8')

def check_packed_links(contents):
    for name, data in contents.items():
        if not name.endswith('.md') or name.startswith('validation/inputs/'):
            continue
        for target in re.findall(r'(?<!!)\[[^\]]+\]\(([^)]+)\)', data.decode('utf-8-sig')):
            target = target.strip('<>')
            if re.match(r'^(https?://|mailto:|#)', target):
                continue
            resolved = pathlib.PurePosixPath(os.path.normpath(str(pathlib.PurePosixPath(name).parent / target.split('#')[0])).replace('\\', '/')).as_posix()
            assert resolved in contents, f'Broken package link: {name} -> {target}'

def check_package_privacy(contents):
    synthetic_passwords = synthetic_secrets = 0
    def walk(value, filename):
        nonlocal synthetic_passwords, synthetic_secrets
        if isinstance(value, dict):
            for key, item in value.items():
                if key == 'password' and item:
                    assert item == 'test-only', f'Non-synthetic node password: {filename}'
                    synthetic_passwords += 1
                if key == 'secret' and item:
                    assert filename.startswith('validation/'), f'Controller secret in deployment: {filename}'
                    assert re.fullmatch(r'[a-f0-9]{32}', item or ''), f'Unknown controller credential: {filename}'
                    assert value.get('external-controller', '').startswith('127.0.0.1:'), f'Non-loopback controller: {filename}'
                    assert value.get('proxies') and all(p.get('server') in {'127.0.0.1', '::1'} for p in value['proxies']), f'Non-synthetic controller config: {filename}'
                    synthetic_secrets += 1
                walk(item, filename)
        elif isinstance(value, list):
            for item in value:
                walk(item, filename)
    for filename, data in contents.items():
        assert '.work' not in pathlib.PurePosixPath(filename).parts
        assert pathlib.PurePosixPath(filename).suffix.lower() not in {'.key', '.pem', '.crt', '.db', '.exe', '.dll'}, filename
        assert not re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----', data), f'Private key: {filename}'
        assert not re.search(rb'(?:ss|ssr|vmess|vless|trojan)://[A-Za-z0-9]', data), f'Node URI: {filename}'
        if filename.endswith('.json'):
            walk(json.loads(data.decode('utf-8-sig')), filename)
    return {'status': 'NO_REAL_CREDENTIALS_KEYS_CACHE_OR_CORE_PASS', 'syntheticTestPasswords': synthetic_passwords, 'syntheticLoopbackControllerSecrets': synthetic_secrets}

acceptance = json.loads((release / 'validation/final-acceptance.json').read_text(encoding='utf-8-sig'))
assert acceptance['status'] == 'SOURCE_AND_LOCAL_CORE_PASS_DEVICE_PENDING'
assert acceptance['repairRevision'] == 'embedded-domain-r1'
assert sha(release / acceptance['embeddedReview']['file']) == acceptance['embeddedReview']['sha256']
closeout = json.loads((release / 'validation/thunder-closeout.json').read_text(encoding='utf-8-sig'))
assert closeout['status'] == 'THUNDER_CLOSEOUT_EDGE_AUDIT_PASS'
for entry in closeout['sourceFiles']:
    assert sha(release / entry['file']) == entry['sha256'], 'Stale closeout: ' + entry['file']
assert not closeout['domesticCoverage']['unexpectedDifferences']
assert len(closeout['domesticCoverage']['knownSingleLabelDifferences']) == 52
assert sha(release / acceptance['closeoutReview']['file']) == acceptance['closeoutReview']['sha256']
for entry in acceptance['receipts'].values():
    assert sha(release / entry['file']) == entry['sha256'], f'Stale acceptance: {entry["file"]}'
common_status = {'sourceAndLocalCore': 'PASS', 'deviceAcceptance': acceptance['deviceAcceptance'], 'shadowrocketNative': 'NOT_RUN',
                 'ipv6Transport': acceptance['ipv6Transport'], 'openAIConnectivity': acceptance['openAIConnectivity'], 'deployedClientChanged': False}
assert acceptance['clashmiReview']['sha256'] == sha(release / 'metadata/clashmi-review.json')
common_status['clashmi'] = {'sourceAndLocalCore': 'PASS', 'platformRevision': clashmi_review['revision'],
                           'javaScriptCore': 'NOT_RUN', 'networkExtension': 'NOT_RUN', 'memory50MB': 'NOT_RUN'}
source_files = sorted({release / file for file in deploy_files + audit_files} | {p for p in (project / 'docs').rglob('*.md')} | {project / 'CURRENT_RELEASE.json', project / 'tools/verify-layout.py', project / 'tools/package-v14.2.py', project / 'tools/record-thunder-r3.py', project / 'tools/record-thunder-r4.py', project / 'tools/record-thunder-r5.py'})
source_files = sorted(set(source_files) | {project / 'tools/record-thunder-closeout.py', project / 'tools/record-apple-inline.py', project / 'tools/record-embedded-domains.py'} | {project / file for file in ['README.md', 'AGENTS.md', '.ignore', 'archive/README.md', 'archive/catalog.json', 'dist/README.md']} |
                      {project / entry['to'] for entry in json.loads((release / 'validation/root-entry-archive.json').read_text(encoding='utf-8-sig'))['files']})
source_files = sorted(set(source_files) | {project / 'tools/record-clashmi.py'})
verification = {'version': '14.2', 'repairRevision': acceptance['repairRevision'], 'featureRevision': acceptance['featureRevision'], 'compatibilityRevision': acceptance['compatibilityRevision'], 'layoutRevision': acceptance['layoutRevision'], 'status': 'RUNNING', 'acceptance': common_status,
                'sourceFiles': [{'file': p.relative_to(project).as_posix(), 'sha256': sha(p)} for p in source_files], 'packages': []}
for kind, files in [('deployable', deploy_files), ('audit-evidence', audit_files)]:
    contents = {file: (release / file).read_bytes() for file in sorted(set(files))}
    for path in (project / 'docs').rglob('*.md'):
        target_name = 'docs/' + path.relative_to(project / 'docs').as_posix()
        contents[target_name] = render_document(path, target_name)
    contents['README.md'] = render_document(release / 'README.md', 'README.md')
    if kind == 'audit-evidence':
        for file in ['v14.1.js', 'v14.1-android.js', 'v14.1-shadowrocket.conf', 'generate-v14.1-shadowrocket.js', 'rule-sources.lock.json', 'direct-rule-pins.json']:
            contents['validation/inputs/baseline/' + file] = (project / 'archive/workspace-before-v14.2-20261010' / file).read_bytes()
    check_packed_links(contents)
    privacy = check_package_privacy(contents)
    manifest = {'version': '14.2', 'repairRevision': acceptance['repairRevision'], 'featureRevision': acceptance['featureRevision'], 'compatibilityRevision': acceptance['compatibilityRevision'], 'layoutRevision': acceptance['layoutRevision'], 'kind': kind, 'acceptance': common_status,
                'members': [{'file': file, 'bytes': len(data), 'sha256': digest(data)} for file, data in contents.items()]}
    contents['PACKAGE-MANIFEST.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    target = dist / f'v14.2-{kind}.zip'
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for file, data in contents.items():
            archive.writestr(file, data)
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(contents)
        for member in manifest['members']:
            data = archive.read(member['file'])
            assert len(data) == member['bytes'] and digest(data) == member['sha256']
        work = pathlib.Path(tempfile.mkdtemp(prefix=f'v14.2-{kind}-', dir=fresh_root))
        for member in archive.infolist():
            dest = (work / member.filename).resolve()
            assert dest.is_relative_to(work.resolve())
        archive.extractall(work)
    result = {'file': target.name, 'sha256': sha(target), 'bytes': target.stat().st_size, 'members': len(contents),
              'crc': 'PASS', 'memberSHA256': 'PASS', 'privacy': privacy, 'freshExtraction': work.relative_to(project).as_posix()}
    if kind == 'audit-evidence':
        replay = subprocess.run([args.node, str(work / 'tests/static.cjs')], cwd=work, capture_output=True, text=True, encoding='utf-8')
        (work / 'fresh-static.log').write_text(replay.stdout + replay.stderr, encoding='utf-8')
        assert replay.returncode == 0, replay.stdout + replay.stderr
        static_replay = json.loads((work / 'validation/static.json').read_text(encoding='utf-8-sig'))
        result['freshStaticReplay'] = static_replay['status']
        result['freshStaticChecks'] = len(static_replay['checks'])
        replay = subprocess.run([args.node, str(work / 'tests/clashmi.cjs')], cwd=work, capture_output=True, text=True, encoding='utf-8')
        (work / 'fresh-clashmi-static.log').write_text(replay.stdout + replay.stderr, encoding='utf-8')
        assert replay.returncode == 0, replay.stdout + replay.stderr
        clashmi_static = json.loads((work / 'validation/clashmi.json').read_text(encoding='utf-8-sig'))
        assert clashmi_static['status'] == 'CLASHMI_STATIC_PASS'
        result['freshClashMiStaticReplay'] = {'status': clashmi_static['status'], 'checks': len(clashmi_static['checks']),
                                             'routingCases': clashmi_static['routingCases'], 'DNSCases': clashmi_static['dnsCases'],
                                             'objectBridgeRegression':clashmi_static['bridgeRegression']}
        replay = subprocess.run([args.node, str(work / 'tests/independent-r5.cjs')], cwd=work, capture_output=True, text=True, encoding='utf-8')
        (work / 'fresh-independent-r5.log').write_text(replay.stdout + replay.stderr, encoding='utf-8')
        assert replay.returncode == 0, replay.stdout + replay.stderr
        independent_replay = json.loads((work / 'validation/independent-r5.json').read_text(encoding='utf-8-sig'))
        assert independent_replay['status'] == 'THREE_PLATFORM_INDEPENDENT_REVIEW_PASS'
        result['freshIndependentR5Replay'] = independent_replay['status']
        result['freshIndependentR5Checks'] = len(independent_replay['checks'])
        result['freshClashMiCoreReplay'] = {'status': 'NOT_RUN', 'sourceReceipt': 'validation/clashmi-core.json'}
        if args.fresh_clashmi:
            assert args.core and args.openssl
            replay = subprocess.run([args.node, str(work / 'tests/native-clashmi.cjs'), args.core, args.openssl], cwd=work, capture_output=True, text=True, encoding='utf-8')
            (work / 'fresh-clashmi-core.log').write_text(replay.stdout + replay.stderr, encoding='utf-8')
            assert replay.returncode == 0, replay.stdout + replay.stderr
            clashmi_core = json.loads((work / 'validation/clashmi-core.json').read_text(encoding='utf-8-sig'))
            assert clashmi_core['status'] == 'CLASHMI_LOCAL_CORE_PASS'
            result['freshClashMiCoreReplay'] = {'status': clashmi_core['status'], 'observations': {
                r['kind']: sum(p['cases'] for p in r['receipt']['platforms']) for r in clashmi_core['runs']}}
        if args.fresh_dns:
            assert args.core and args.openssl
            replay = subprocess.run([args.node, str(work / 'tests/native-dns-egress.cjs'), args.core, args.openssl], cwd=work, capture_output=True, text=True, encoding='utf-8')
            (work / 'fresh-dns.log').write_text(replay.stdout + replay.stderr, encoding='utf-8')
            assert replay.returncode == 0, replay.stdout + replay.stderr
            dns_replay = json.loads((work / 'validation/native-dns-egress.json').read_text(encoding='utf-8-sig'))
            result['freshDNSReplay'] = dns_replay['status']
            result['freshDNSCases'] = sum(p['cases'] for p in dns_replay['platforms'])
            result['freshIPv6Preflight'] = dns_replay['ipv6Preflight']
        if args.fresh_routing:
            assert args.core
            replay = subprocess.run([args.node, str(work / 'tests/native-routing.cjs'), args.core], cwd=work, capture_output=True, text=True, encoding='utf-8')
            (work / 'fresh-routing.log').write_text(replay.stdout + replay.stderr, encoding='utf-8')
            assert replay.returncode == 0, replay.stdout + replay.stderr
            routing_replay = json.loads((work / 'validation/native-routing.json').read_text(encoding='utf-8-sig'))
            result['freshRoutingReplay'] = routing_replay['status']
            result['freshRoutingCases'] = sum(p['cases'] for p in routing_replay['platforms'])
            replay = subprocess.run([args.node, str(work / 'tests/native-selectors.cjs'), args.core], cwd=work, capture_output=True, text=True, encoding='utf-8')
            (work / 'fresh-selectors.log').write_text(replay.stdout + replay.stderr, encoding='utf-8')
            assert replay.returncode == 0, replay.stdout + replay.stderr
            selector_replay = json.loads((work / 'validation/native-selectors.json').read_text(encoding='utf-8-sig'))
            result['freshSelectorReplay'] = selector_replay['status']
            result['freshSelectorObservations'] = sum(p['cases'] for p in selector_replay['platforms'])
            replay = subprocess.run([args.node, str(work / 'tests/native-inbound-guard.cjs'), args.core], cwd=work, capture_output=True, text=True, encoding='utf-8')
            (work / 'fresh-inbound.log').write_text(replay.stdout + replay.stderr, encoding='utf-8')
            assert replay.returncode == 0, replay.stdout + replay.stderr
            inbound_replay = json.loads((work / 'validation/native-inbound-guard.json').read_text(encoding='utf-8-sig'))
            result['freshInboundReplay'] = inbound_replay['status']
            result['freshInboundObservations'] = sum(p['cases'] for p in inbound_replay['platforms'])
        if args.fresh_apple:
            assert args.core and args.openssl
            replay = subprocess.run([args.node, str(work / 'tests/native-apple-inline.cjs'), args.core, args.openssl], cwd=work, capture_output=True, text=True, encoding='utf-8')
            (work / 'fresh-apple-core.log').write_text(replay.stdout + replay.stderr, encoding='utf-8')
            assert replay.returncode == 0, replay.stdout + replay.stderr
            apple_replay = json.loads((work / 'validation/apple-inline-core.json').read_text(encoding='utf-8-sig'))
            assert apple_replay['status'] == 'APPLE_INLINE_LOCAL_CORE_PASS'
            result['freshAppleCoreReplay'] = apple_replay['status']
            result['freshAppleRoutingCases'] = sum(p['cases'] for p in apple_replay['runs'][0]['receipt']['platforms'])
            result['freshAppleDNSCases'] = sum(p['cases'] for p in apple_replay['runs'][1]['receipt']['platforms'])
        if args.fresh_embedded:
            assert args.core and args.openssl
            for mode,suffix,status in [([], 'core','EMBEDDED_DOMAIN_LOCAL_CORE_PASS'),(['--cold-download'],'download-failure','EMBEDDED_DOMAIN_COLD_DOWNLOAD_CORE_PASS')]:
                replay = subprocess.run([args.node,str(work / 'tests/native-embedded-domains.cjs'),args.core,args.openssl,*mode],cwd=work,capture_output=True,text=True,encoding='utf-8')
                (work / ('fresh-embedded-'+suffix+'.log')).write_text(replay.stdout+replay.stderr,encoding='utf-8')
                assert replay.returncode == 0, replay.stdout+replay.stderr
                receipt=json.loads((work / ('validation/embedded-domains-'+suffix+'.json')).read_text(encoding='utf-8-sig'))
                assert receipt['status'] == status
                result['freshEmbedded'+suffix.title().replace('-','')+'Replay']={'status':status,'routingCases':sum(p['cases'] for p in receipt['runs'][0]['receipt']['platforms']),'DNSCases':sum(p['cases'] for p in receipt['runs'][1]['receipt']['platforms'])}
    else:
        check = subprocess.run([args.node, str(work / 'tools/sync-reviewed-data.cjs'), '--check'], cwd=work, check=True, capture_output=True)
        unchanged = ['src/ios/v14.2-shadowrocket.conf', 'metadata/shadowrocket-sources.json', 'src/ios/v14.2-clashmi.js', 'src/ios/v14.2-clashmi-object-r2.js', 'metadata/clashmi-sources.json']
        before = [sha(work / name) for name in unchanged]
        subprocess.run([args.node, str(work / 'tools/generate-v14.2-shadowrocket.js')], cwd=work, check=True, capture_output=True)
        subprocess.run([args.node, str(work / 'tools/generate-v14.2-clashmi.cjs')], cwd=work, check=True, capture_output=True)
        assert [sha(work / name) for name in unchanged] == before
        result['freshGeneratorReplay'] = 'DETERMINISTIC_PASS'
    verification['packages'].append(result)

verification['status'] = 'PACKAGE_CRC_HASH_FRESH_REPLAY_PASS'
verification['platformRevision'] = clashmi_review['revision']
verification['validationScope'] = {'existingClientLocalCore': 'CURRENT_HASH_BOUND_RECEIPTS; fresh runs only when corresponding flags requested',
                                  'clashmiLocalCore': 'FRESH_EXTRACTION_REPLAY' if args.fresh_clashmi else 'CURRENT_HASH_BOUND_RECEIPT',
                                  'nativeIOSAndMemory': 'NOT_RUN'}
(dist / 'package-verification.json').write_text(json.dumps(verification, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(dist / 'SHA256SUMS.txt').write_text(''.join(f'{p["sha256"]}  {p["file"]}\n' for p in verification['packages']), encoding='utf-8')
print(json.dumps({'status': verification['status'], 'packages': verification['packages']}, ensure_ascii=False))
