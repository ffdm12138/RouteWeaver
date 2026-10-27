"""Verify current replays and keep superseded rc.6 FAIL evidence immutable."""

EXPECTED = {'native-core': 'BALANCED_LOCAL_CORE_PASS',
            'balanced-empty-core': 'BALANCED_LOCAL_CORE_PASS'}
LEGACY = 'PRE_RELEASE_WITH_DISCLOSED_UNRESOLVED_NATIVE_REGRESSIONS'
REPAIRED = 'RC6_NATIVE_API_REGRESSIONS_REPAIRED_DEVICE_PENDING'


def verify_regressions(root, sha, read):
    known = read(root / 'validation/known-release-regressions.json')
    assert known['status'] in (LEGACY, REPAIRED)
    unresolved = known['knownUnresolved']
    if known['status'] == LEGACY:
        assert {item['test'] for item in unresolved} == set(EXPECTED)
        for item in unresolved:
            receipt = root / item['validationFile']
            assert sha(receipt) == item['validationSHA256']
            assert read(receipt)['status'] == 'FAIL' and item['exitCode'] == 1
        return known

    assert not unresolved
    assert {item['test'] for item in known['resolved']} == set(EXPECTED)
    binding = known['repairEvidence']
    assert sha(root / binding['file']) == binding['sha256']
    repair = read(root / binding['file'])
    assert repair['status'] == REPAIRED
    for source in repair['sourceFiles']:
        assert sha(root / source['file']) == source['sha256'], source['file']
    for source in repair['projectSourceFiles']:
        assert sha(root.parent.parent / source['file']) == source['sha256'], source['file']
    for artifact in repair['historicalArtifacts']:
        assert sha(root / artifact['file']) == artifact['sha256'], artifact['file']

    archived = {item['sourceFile']: item for item in repair['archivedSources']}
    for item in known['resolved']:
        original = root / item['validationFile']
        assert sha(original) == item['validationSHA256']
        before = read(original)
        assert before['status'] == 'FAIL' and item['exitCode'] == 1
        for source in before['sourceFiles']:
            file = archived.get(source['file'], source)['file']
            assert sha(root / file) == source['sha256'], source['file']
        resolution = item['resolution']
        assert resolution['validationFile'] == 'validation/' + item['test'] + '.json'
        current = root / resolution['validationFile']
        assert sha(current) == resolution['validationSHA256']
        assert read(current)['status'] == EXPECTED[item['test']] == resolution['status']

    jobs = {'controller-unit': 'CONTROLLER_UNIT_PASS',
            'full-1': EXPECTED['native-core'], 'full-2': EXPECTED['native-core'],
            'empty-1': EXPECTED['balanced-empty-core'], 'empty-2': EXPECTED['balanced-empty-core'],
            'cold-1': 'BALANCED_COLD_DOWNLOAD_CORE_PASS',
            'macos-1': 'MACOS_LOCAL_CORE_PASS_DEVICE_PENDING',
            'verge-1': 'CLASH_VERGE_LOCAL_CORE_PASS_DEVICE_PENDING'}
    assert len(repair['runs']) == len(jobs)
    assert {run['name'] for run in repair['runs']} == set(jobs)
    for run in repair['runs']:
        assert run['exitCode'] == 0 and run['status'] == jobs[run['name']]
        log = run['runLog']
        assert sha(root / log['file']) == log['sha256']
        if run['name'] == 'controller-unit':
            assert run['cases'] == 8
            continue
        receipt = run['receipt']
        assert sha(root / receipt['file']) == receipt['sha256']
        proof = read(root / receipt['file'])
        assert proof['status'] == run['status'] and proof['coreSHA256'] == repair['coreSHA256']
        for source in proof['sourceFiles']:
            assert sha(root / source['file']) == source['sha256'], source['file']
    return known
