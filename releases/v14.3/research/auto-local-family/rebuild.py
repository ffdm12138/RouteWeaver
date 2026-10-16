"""Rebuild the complete corresponding-source archive. Never installs or reloads an app.

Requires Go 1.27.2 and, for --helper, the locked Rust 1.99.1 Windows GNU toolchain.
Use a short ASCII extraction directory when using the Windows GNU linker.
"""
from pathlib import Path
import argparse, hashlib, json, os, subprocess

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,required=True)
    p.add_argument('--go',required=True)
    p.add_argument('--cargo')
    p.add_argument('--rust-root',type=Path)
    p.add_argument('--test',action='store_true')
    p.add_argument('--helper',action='store_true')
    args=p.parse_args();root=args.source.resolve();core=root/'core';out=root/'rebuilt-auto';out.mkdir(exist_ok=True)
    manifest=json.loads((root/'source-files.json').read_text(encoding='utf8'))
    for e in manifest['files']:
        target=root/e['file']
        if not target.is_relative_to(root):raise ValueError('Invalid manifest path')
        if digest(target)!=e['sha256']:raise ValueError('Source byte mismatch: '+e['file'])
    env=os.environ.copy();env.update(GOTOOLCHAIN='local',GOWORK='off',GOTELEMETRY='off',CGO_ENABLED='0',GOMAXPROCS='2',GOPROXY='off',GOSUMDB='off',GOFLAGS='-mod=vendor')
    version=subprocess.check_output([args.go,'version'],env=env,encoding='utf8')
    if 'go1.27.2' not in version:raise ValueError('Use the recorded Go 1.27.2 toolchain')
    if args.test:
        subprocess.run([args.go,'test','-p','1','-tags','with_gvisor','github.com/metacubex/mihomo/component/dialer','github.com/metacubex/mihomo/dns','-run','^TestRouteWeaver','-count=1','-timeout','90s'],cwd=core,env=env,check=True,timeout=600)
    if os.name!='nt':raise ValueError('This binary/Helper pair targets Windows; other native hosts need their own integration')
    binary=out/'FlClashCore.exe'
    subprocess.run([args.go,'build','-p','2','-tags','with_gvisor','-trimpath','-ldflags','-X github.com/metacubex/mihomo/constant.Version=v1.19.32-rw-auto6-r1 -w -s -buildid=','-o',str(binary),'./cmd/core'],cwd=core,env=env,check=True,timeout=600)
    if args.helper:
        if not args.cargo or not args.rust_root:raise ValueError('--helper requires --cargo and --rust-root')
        rust=args.rust_root.resolve();env.update(CORE_SHA256=digest(binary),CORE_NAME=binary.name,CARGO_HOME=str(root/'cargo-home'),CARGO_TARGET_DIR=str(out/'cargo-target'),CARGO_BUILD_JOBS='2',RUSTC=str(rust/'bin/rustc.exe'),RUSTDOC=str(rust/'bin/rustdoc.exe'),RUSTFLAGS='--sysroot '+str(rust))
        env['PATH']=str(rust/'bin')+os.pathsep+env['PATH']
        rust_version=subprocess.check_output([str(rust/'bin/rustc.exe'),'--version'],env=env,encoding='utf8')
        if not rust_version.startswith('rustc 1.99.1 '):raise ValueError('Use locked Rust 1.99.1')
        subprocess.run([args.cargo,'build','--locked','--offline','--release','--features','windows-service'],cwd=root/'helper',env=env,check=True,timeout=600)
        data=(out/'cargo-target/release/helper.exe').read_bytes();assert digest(binary).encode() in data
        (out/'FlClashHelperService.exe').write_bytes(data)
        (out/'manifest.json').write_text(json.dumps({'coreSha256':digest(binary)})+'\n',encoding='utf8')
    report={'status':'AUTO_CORRESPONDING_SOURCE_REBUILT_NOT_INSTALLED','coreSHA256':digest(binary),'files':[{'file':x.name,'sha256':digest(x)} for x in out.iterdir() if x.is_file()],'scope':'Source-equivalent rebuild; vendor/module layouts can change binary identity. Never mix a Helper with a core of a different SHA256.'}
    (out/'rebuild-result.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report))

if __name__=='__main__':main()
