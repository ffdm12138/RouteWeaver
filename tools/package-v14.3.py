"""Package standalone entries and a replayable audit, with explicit validation scope."""
from pathlib import Path
import argparse, hashlib, json, re, shutil, subprocess, tempfile, zipfile

project=Path(__file__).resolve().parents[1]
release=project/'releases/v14.3'
dist=project/'dist/v14.3'
work=project/'.work/packaging'
HTTP_REPORT='docs/reports/v14.3/HTTP域名重解析修复.md'
parser=argparse.ArgumentParser()
parser.add_argument('--node',default='node')
parser.add_argument('--skip-history',action='store_true',default=True,help='Build from a public clone without local historical archives.')
args=parser.parse_args()
process_flags=getattr(subprocess,'CREATE_NO_WINDOW',0)
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
subprocess.run([__import__('sys').executable,str(project/'tools/verify-v14.3.py'),'--node',args.node,*(['--skip-history'] if args.skip_history else [])],cwd=project,check=True,capture_output=True,creationflags=process_flags)
dist.mkdir(parents=True,exist_ok=True)
work.mkdir(parents=True,exist_ok=True)
review=read(release/'metadata/balanced-review.json')
manifest=read(release/'metadata/balanced-sources.json')
delivery=read(release/'metadata/ios-delivery.json') if (release/'metadata/ios-delivery.json').exists() else None
mac=read(release/'metadata/macos-delivery.json') if (release/'metadata/macos-delivery.json').exists() else None
network=read(release/review['networkCompatibility']['file'])

def links(raw):
    # Only current prose links are projected to the independent ZIP layout.
    # Code, evidence and immutable before inputs retain exact bytes.
    text=raw.decode('utf-8')
    text=text.replace('../../releases/v14.3/','../../').replace('releases/v14.3/','').replace('../../docs/','docs/')
    return text.encode('utf-8')

def docs():
    names=['docs/需求.md','docs/README.md','docs/guides/ClashMi使用说明.md','docs/guides/使用说明.md','docs/maintenance/维护与更新.md','docs/reference/项目结构.md','docs/reports/v14.3/可靠精简与远程来源审核.md','docs/reports/v14.3/国内协议跟组与小火箭精简.md']
    names.extend([network['guide'],network['report'],HTTP_REPORT])
    if delivery:
        names.append('docs/reports/v14.3/iOS交付与覆写排查.md')
        names.append(delivery['report'])
    names.append('docs/maintenance/开源与发布.md')
    if mac:
        names.extend([mac['guide'],mac['report']])
    result={n:(project/n).read_bytes() if n=='docs/需求.md' else links((project/n).read_bytes()) for n in names}
    result['docs/README.md']='# 当前包文档\n\n- [最终需求](需求.md)\n- [使用说明](guides/使用说明.md)\n- [Clash Mi 导入](guides/ClashMi使用说明.md)\n- [V14.3 可靠精简与来源审核](reports/v14.3/可靠精简与远程来源审核.md)\n- [维护方法](maintenance/维护与更新.md)\n\n历史版本正文仅在项目 docs/reports/ 和 archive/ 中保留，本包不把旧结论作为本版认证。\n'.encode('utf-8')
    result['docs/README.md']+='\n- [IPv4 兼容模式](guides/IPv4兼容模式.md)\n- [IPv6 回退修订](reports/v14.3/IPv6回退与兼容入口.md)\n'.encode('utf-8')
    result['docs/README.md']+='\n- [HTTP 域名重解析修复与实机失败](reports/v14.3/HTTP域名重解析修复.md)\n'.encode('utf-8')
    if delivery:
        result['docs/README.md']+='\n- [iOS 入口恢复与覆写排查](reports/v14.3/iOS交付与覆写排查.md)\n'.encode('utf-8')
        result['docs/README.md']+='\n- [当前国内协议与小火箭精简](reports/v14.3/国内协议跟组与小火箭精简.md)\n'.encode('utf-8')
    if mac:
        result['docs/README.md']+='\n- [MacBook 导入](guides/MacBook使用说明.md)\n- [MacBook 适配](reports/v14.3/MacBook适配.md)\n'.encode('utf-8')
    for name in ['LICENSE','THIRD_PARTY_NOTICES.md']:
        result[name]=(project/name).read_bytes()
    for file in (project/'third_party').rglob('*'):
        if file.is_file():
            result[file.relative_to(project).as_posix()]=file.read_bytes()
    result['docs/maintenance/维护与更新.md']=result['docs/maintenance/维护与更新.md'].replace('根目录执行：'.encode('utf-8'),'下面的 Python 命令仅适用于完整项目工作区。独立审核 ZIP 从根目录运行前述 Node 命令；project-tools 中的 Python 文件只供源码审查。\n\n项目根目录执行：'.encode('utf-8'))
    return result

def credential_check(files,deploy=False):
    forbidden=[]
    for name,raw in files.items():
        if Path(name).suffix.lower() in {'.key','.pem','.p12','.pfx','.exe','.dll','.zip'}:
            forbidden.append(name)
        if name.startswith('src/') and Path(name).suffix.lower() in {'.js','.conf'}:
            text=raw.decode('utf-8')
            if re.search(r'https?://[^/\s:@]+:[^/\s@]+@',text):
                forbidden.append(name+': credential URL')
            if re.search(r'(?:password|secret|token)\s*[:=]\s*[\"\'][A-Za-z0-9_-]{16,}[\"\']',text):
                forbidden.append(name+': credential literal')
    assert not forbidden,forbidden
    return {'status':'PASS','scope':'No private keys, executable/cache/nested ZIP, credential URLs or hard-coded credential literals in deployed entry source; audit uses public rules and synthetic fixtures only'}

def write_zip(label,files):
    assert HTTP_REPORT in files, 'Current HTTP repair report missing from '+label
    checks=credential_check(files,label=='deployable')
    package_manifest={'version':'14.3','revision':'balanced-r1','kind':label,'files':{n:sha(raw) for n,raw in sorted(files.items())},'credentials':checks,'deviceAcceptance':'NOT_RUN'}
    if delivery:
        package_manifest['deliveryRevision']=delivery['revision']
        package_manifest['domesticProtocolRevision']=delivery['domesticProtocolRevision']
    if mac:
        package_manifest['macosRevision']=mac['revision']
    package_manifest['networkCompatibilityRevision']=network['revision']
    package_manifest['networkCompatibilityRepair']=network['repairRevision']
    files=dict(files)
    files['PACKAGE_MANIFEST.json']=(json.dumps(package_manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    target=dist/('v14.3-'+label+'.zip')
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name,raw in sorted(files.items()):
            assert not name.startswith('/') and '..' not in Path(name).parts
            info=zipfile.ZipInfo(name,date_time=(2026,10,16,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.create_system=3
            info.external_attr=0o100644 << 16
            z.writestr(info,raw,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        for name,raw in files.items():
            assert sha(z.read(name))==sha(raw),name
    result={'file':target.relative_to(project).as_posix(),'sha256':sha(target.read_bytes()),'bytes':target.stat().st_size,'members':len(files),'credentials':checks,'crc':'PASS','memberSHA256':'PASS'}
    (dist/(target.name+'.sha256')).write_text(result['sha256']+'  '+target.name+'\n',encoding='utf-8')
    return target,result

deploy={e['file']:(release/e['file']).read_bytes() for e in manifest['entries']}
deploy.update({n:(release/n).read_bytes() for n in ['metadata/balanced-sources.json','metadata/balanced-review.json','metadata/source-comparison.json','data/rule-sources.lock.json','data/rules/embedded-policy.json']})
if delivery:
    sr=delivery['shadowrocket']
    for name in [sr['file'],sr['provenance']['file'],sr['sourceManifest']['file'],sr['staticEvidence']['file'],'metadata/ios-delivery.json']:
        deploy[name]=(release/name).read_bytes()
if mac:
    for name in [e['file'] for e in mac['entries']]+['metadata/macos-sources.json','metadata/macos-delivery.json']:
        deploy[name]=(release/name).read_bytes()
for name in [e['file'] for e in network['entries']]+['metadata/network-compat.json','metadata/network-compat-delivery.json']+[e['file'] for e in network['testEvidence'].values()]:
    deploy[name]=(release/name).read_bytes()
deploy.update(docs())
deploy['README.md']=links((release/'README.md').read_bytes())
deploy_target,deploy_result=write_zip('deployable',deploy)

audit={}
for file in release.rglob('*'):
    if not file.is_file():
        continue
    rel=file.relative_to(release)
    if 'experiments' in rel.parts or '.work' in rel.parts or '__pycache__' in rel.parts:
        continue
    if file.suffix.lower() in {'.pyc','.key','.pem','.exe','.dll','.zip'}:
        continue
    audit[rel.as_posix()]=file.read_bytes()
audit.update(docs())
audit['README.md']=links((release/'README.md').read_bytes())
for name in ['record-v14.3.py','verify-v14.3.py','package-v14.3.py','verify-layout.py','network_release.py']:
    audit['project-tools/'+name]=(project/'tools'/name).read_bytes()
if delivery:
    audit['project-tools/restore-ios-delivery.py']=(project/'tools/restore-ios-delivery.py').read_bytes()
if mac:
    audit['project-tools/record-macos.py']=(project/'tools/record-macos.py').read_bytes()
audit_target,audit_result=write_zip('audit-evidence',audit)
mac_result=None
if mac:
    mac_files={e['file']:(release/e['file']).read_bytes() for e in mac['entries']}
    for e in network['entries']:
        if e['platform'].startswith('macos'):
            mac_files[e['file']]=(release/e['file']).read_bytes()
    for name in ['metadata/macos-sources.json','metadata/macos-delivery.json','metadata/network-compat.json','metadata/network-compat-delivery.json']:
        mac_files[name]=(release/name).read_bytes()
    for name in [mac['guide'],mac['report'],'docs/需求.md']:
        mac_files[name]=docs()[name]
    for name in [network['guide'],network['report'],HTTP_REPORT]:
        mac_files[name]=docs()[name]
    for name,raw in docs().items():
        if name in {'LICENSE','THIRD_PARTY_NOTICES.md'} or name.startswith('third_party/'):
            mac_files[name]=raw
    mac_files['README.md']=('# V14.3 MacBook\n\n业务合同 domestic-protocol-r1，Mac 适配 macos-r1。\n\n'
        '- FlClash：导入 src/macos/v14.3-macos-flclash.js；在应用开启 TUN 和自动路由。\n'
        '- Clash Mi：导入 src/macos/v14.3-macos-clashmi.js 并绑定正在使用的订阅；追加内置-不覆写、规则模式、IPv6 开启、TUN 覆写关闭。\n\n'
        '两个公共组先手动选节点，确认完整规则已下载。详见 [导入说明](docs/guides/MacBook使用说明.md)。\n\n'
        '源码与本机 Windows Mihomo 回放通过；Mac App、TUN/NetworkExtension 实机接管未验收。包不含实际节点或订阅。\n').encode('utf-8')
    mac_files['README.md']+='\n本地没有 IPv6 出口时手动选对应的 -ipv4-local.js；保持核心 IPv6 与完整 TUN 接管。详见 [IPv4 兼容模式](docs/guides/IPv4兼容模式.md)。\n'.encode('utf-8')
    _,mac_result=write_zip('macos',mac_files)

fresh=Path(tempfile.mkdtemp(prefix='v14.3-audit-',dir=work))
with zipfile.ZipFile(audit_target) as z:
    z.extractall(fresh)
commands=['tools/build-balanced.cjs','tools/build-shadowrocket-lean.cjs','tests/static.cjs','tests/shadowrocket-lean.cjs']
if mac:
    commands.extend(['tools/build-macos.cjs','tests/macos-static.cjs'])
commands.extend(['tools/build-network-compat.cjs','tests/network-compat.cjs'])
for name in commands:
    command=[args.node,str(fresh/name),*(['--check'] if name.startswith('tools/') else [])]
    run=subprocess.run(command,cwd=fresh,capture_output=True,text=True,encoding='utf-8',timeout=600,creationflags=process_flags)
    (fresh/(Path(name).stem+'-fresh.log')).write_text(run.stdout+run.stderr,encoding='utf-8')
    assert run.returncode==0,(name,run.stdout[-4000:],run.stderr[-2000:])
static=read(fresh/'validation/static.json')
assert static['status']=='BALANCED_STATIC_PASS'
for e in manifest['entries']:
    assert sha((fresh/e['file']).read_bytes())==e['sha256']
if delivery:
    sr=delivery['shadowrocket']
    assert sha((fresh/sr['file']).read_bytes())==sr['sha256']
    assert sha((fresh/sr['immutableSource']).read_bytes())==sr['immutableSourceSHA256']
    assert sha((fresh/'metadata/ios-delivery.json').read_bytes())==sha((release/'metadata/ios-delivery.json').read_bytes())
    for e in delivery['jsEntries']:
        assert sha((fresh/e['file']).read_bytes())==e['sha256']
if mac:
    fresh_mac=read(fresh/'validation/macos-static.json')
    assert fresh_mac['status']=='MACOS_STATIC_PASS'
    for e in mac['entries']:
        assert sha((fresh/e['file']).read_bytes())==e['sha256']
result={'version':'14.3','date':'2026-10-16','revision':'balanced-r1','status':'PACKAGE_CRC_SHA_FRESH_STATIC_PASS',
        'packages':[deploy_result,audit_result]+([mac_result] if mac_result else []),'freshExtraction':fresh.relative_to(project).as_posix(),
        'freshGeneration':'PASS','freshStaticChecks':len(static['checks']),'freshStaticPlatforms':[{k:p[k] for k in ['platform','fullInventoryHosts','normalRouting','normalDNS','criticalColdRouting','criticalColdDNS','existingCases']} for p in static['platforms']],
        'nativeCore':'SOURCE_HASH_IDENTICAL_BOUND_LOCAL_RECEIPTS_INCLUDED','freshNativeCoreReplay':'NOT_RUN',
        'sourceReviewSHA256':sha((release/'metadata/balanced-review.json').read_bytes()),
        'frozenContractSHA256':sha((project/'docs/需求.md').read_bytes()),'packageToolSHA256':sha(Path(__file__).read_bytes()),
        'clientDeployment':False,'appJavaScriptCore':'NOT_RUN','deviceAcceptance':'NOT_RUN','iOSLongRunMemory':'NOT_RUN'}
if delivery:
    result.update(deliveryRevision=delivery['revision'],
                  domesticProtocolRevision=delivery['domesticProtocolRevision'],
                  shadowrocket='LEAN_STATIC_PASS_NATIVE_DEVICE_PENDING_IN_BOTH_PACKAGES',
                  freshShadowrocketStatic=read(fresh/'validation/shadowrocket-lean.json')['status'],
                  iosDeliverySHA256=sha((release/'metadata/ios-delivery.json').read_bytes()))
if mac:
    result.update(macosRevision=mac['revision'],freshMacGeneration='PASS',
                  freshMacStatic=fresh_mac['status'],freshMacStaticChecks=len(fresh_mac['checks']),
                  macosDeliverySHA256=sha((release/'metadata/macos-delivery.json').read_bytes()),macosDeviceAcceptance='NOT_RUN')
result['networkCompatibilityRevision']=network['revision']
result['freshNetworkCompatibilityStatic']=read(fresh/'validation/network-compat-static.json')['status']
for entry in network['entries']:
    assert sha((fresh/entry['file']).read_bytes())==entry['sha256']
result['historyVerification']='SKIPPED_HISTORY' if args.skip_history else 'PASS'
(dist/'package-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':result['status'],'packages':result['packages'],'freshStaticChecks':result['freshStaticChecks'],'freshNativeCoreReplay':'NOT_RUN'},ensure_ascii=False))
