"""Build fixed FlClash sources; never install or contact a running client."""
from pathlib import Path
import argparse,hashlib,json,os,shutil,subprocess,sys,urllib.request,zipfile

HERE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
NO_WINDOW=getattr(subprocess,'CREATE_NO_WINDOW',0)

def extract(archive,destination):
    destination.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for e in z.infolist():
            p=Path(e.filename)
            assert not p.is_absolute() and '..' not in p.parts
            assert (e.external_attr>>16)&0o170000!=0o120000,'symlinks unsupported'
        z.extractall(destination)
    children=list(destination.iterdir())
    assert len(children)==1 and children[0].is_dir()
    return children[0]

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,help='Extracted corresponding-source root containing core/ and helper/')
    p.add_argument('--work',type=Path,default=Path('.work/flclash-core-rebuild'))
    p.add_argument('--go',default='go');p.add_argument('--cargo',default='cargo')
    p.add_argument('--prepare-only',action='store_true');p.add_argument('--verify-source-only',action='store_true')
    p.add_argument('--core-only',action='store_true');p.add_argument('--allow-toolchain-change',action='store_true')
    a=p.parse_args();identity=json.loads((HERE/'source-identity.json').read_text(encoding='utf8'))
    work=a.work.resolve();work.mkdir(parents=True,exist_ok=True)
    source=a.source.resolve() if a.source else work/'source'
    if not a.source:
        for label,commit,key,repo in [('flclash',identity['flclashCommit'],'flclashSourceZipSha256','FlClash'),('mihomo',identity['mihomoForkCommit'],'mihomoForkSourceZipSha256','Clash.Meta')]:
            archive=work/(label+'.zip')
            if not archive.exists():urllib.request.urlretrieve('https://codeload.github.com/chen08209/'+repo+'/zip/'+commit,archive)
            assert sha(archive)==identity[key],label+' source archive hash'
        if source.exists():raise RuntimeError('Source destination exists; choose a fresh --work directory')
        fc=extract(work/'flclash.zip',work/'flclash-upstream')
        mh=extract(work/'mihomo.zip',work/'mihomo-upstream')
        shutil.copytree(fc/'core',source/'core')
        target=source/'core/Clash.Meta'
        assert not target.exists() or not any(target.iterdir())
        shutil.copytree(mh,target,dirs_exist_ok=True)
        shutil.copytree(fc/'services/helper',source/'helper')
        subprocess.run(['git','-C',str(source/'core'),'apply','--check',str(HERE/'core.patch')],check=True,creationflags=NO_WINDOW)
        subprocess.run(['git','-C',str(source/'core'),'apply',str(HERE/'core.patch')],check=True,creationflags=NO_WINDOW)
    assert (source/'core/go.mod').is_file() and (source/'helper/Cargo.lock').is_file()
    manifest=source/'source-files.json'
    if manifest.exists():
        records=json.loads(manifest.read_text(encoding='utf8'))['files']
        for e in records:
            assert '..' not in Path(e['file']).parts
            assert sha(source/e['file'])==e['sha256'],e['file']
    if a.prepare_only or a.verify_source_only:
        print(json.dumps({'status':'FIXED_SOURCE_READY','vendoredDependencies':(source/'core/vendor/modules.txt').is_file()}));return
    if os.name!='nt':raise RuntimeError('This integration artifact targets Windows amd64 only')
    go_version=subprocess.check_output([a.go,'version'],text=True,creationflags=NO_WINDOW).strip()
    if not a.allow_toolchain_change:assert 'go1.27.2 ' in go_version,go_version
    out=work/'bin';out.mkdir(exist_ok=True)
    env=os.environ.copy();env.update({'GOTOOLCHAIN':'local','GOTELEMETRY':'off','CGO_ENABLED':'0','GOMAXPROCS':'2'})
    env['GOFLAGS']='-mod=vendor' if (source/'core/vendor/modules.txt').exists() else '-mod=readonly'
    if env['GOFLAGS']=='-mod=vendor':env.update({'GOPROXY':'off','GOSUMDB':'off'})
    subprocess.run([a.go,'build','-p','2','-tags','with_gvisor','-trimpath','-ldflags','-X github.com/metacubex/mihomo/constant.Version=v1.19.32-rw-ipv6-r2 -w -s -buildid=','-o',str(out/'FlClashCore.exe'),'./cmd/core'],cwd=source/'core',env=env,check=True,creationflags=NO_WINDOW)
    core_hash=sha(out/'FlClashCore.exe')
    (out/'manifest.json').write_text(json.dumps({'coreSha256':core_hash})+'\n',encoding='utf8')
    if not a.core_only:
        helper_source=source/'helper'
        if not str(helper_source).isascii():
            if not str(work).isascii():raise RuntimeError('Windows GNU linking needs ASCII paths: extract source to an ASCII directory or pass an ASCII --work directory')
            helper_source=work/'helper-source'
            shutil.copytree(source/'helper',helper_source,dirs_exist_ok=True)
        version=subprocess.check_output([a.cargo,'--version'],text=True,creationflags=NO_WINDOW).strip()
        if not a.allow_toolchain_change:assert version.startswith('cargo 1.99.1 '),version
        env.update({'CORE_SHA256':core_hash,'CORE_NAME':'FlClashCore.exe','CARGO_BUILD_JOBS':'2','CARGO_TARGET_DIR':str(work/'cargo-target')})
        args=[a.cargo,'build','--locked','--release','--features','windows-service','--target','x86_64-pc-windows-gnu']
        if (helper_source/'vendor').is_dir():
            args.extend(['--offline','--config','source.crates-io.replace-with="vendored-sources"','--config','source.vendored-sources.directory="vendor"'])
        subprocess.run(args,cwd=helper_source,env=env,check=True,creationflags=NO_WINDOW)
        shutil.copyfile(work/'cargo-target/x86_64-pc-windows-gnu/release/helper.exe',out/'FlClashHelperService.exe')
    print(json.dumps({'status':'BUILD_PASS_NOT_INSTALLED','coreSHA256':core_hash,'sameBytesAsMaintainerBuild':core_hash==identity['candidateCoreSha256'],'scope':'Source/locked dependency rebuild. Vendored layout and toolchains can change bytes; verify a newly built matched pair separately.'}))

if __name__=='__main__':main()
