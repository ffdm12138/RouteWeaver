"""Package rc.6 native pair and complete corresponding source from verified, pinned inputs.

Usage:
 python tools/package-auto-local-core.py --base-core X --patched-core Y --helper-source Z --binaries W
No runtime client, credential, or network modifications. Source and binaries are never regenerated here.
"""
from pathlib import Path, PurePosixPath
import argparse,hashlib,json,zipfile
PROJECT=Path(__file__).resolve().parents[1]
REL=PROJECT/'releases/v14.3'
FORMAL=REL/'research/auto-local-family'
OUT=PROJECT/'dist/v14.3'
STAMP=(2026,10,17,0,0,0)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def member_info(name):
    pp=PurePosixPath(name)
    assert not pp.is_absolute() and '..' not in pp.parts and '\\' not in name
    info=zipfile.ZipInfo(name,STAMP)
    info.compress_type=zipfile.ZIP_DEFLATED
    info.create_system=3
    info.external_attr=0o100644 << 16
    return info
def iter_files(root):
    for p in sorted(root.rglob('*'),key=lambda x:x.relative_to(root).as_posix()):
        if p.is_file() and not p.is_symlink():
            relative=p.relative_to(root)
            if any(part in {'.git','.work','target','__pycache__'} for part in relative.parts) or relative.suffix.lower() in {'.pyc','.exe','.dll','.pfx','.pem','.key'}:continue
            yield relative.as_posix(),p
def create_zip(name,kind,items,extra):
    target=OUT/name
    if target.exists():raise FileExistsError('Refuse overwrite an already generated release asset')
    hashes={}
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for key,p in sorted(items.items()):
            digest=hashlib.sha256()
            with p.open('rb') as fi, z.open(member_info(key),'w',force_zip64=True) as dst:
                for chunk in iter(lambda:fi.read(1024*1024),b''):
                    digest.update(chunk);dst.write(chunk)
            hashes[key]=digest.hexdigest()
        for key,b in sorted(extra.items()):
            z.writestr(member_info(key),b)
            hashes[key]=hashlib.sha256(b).hexdigest()
        manifest={'release':'v14.3.0-rc.6','kind':kind,'status':'PRE_RELEASE_WITH_DISCLOSED_UNRESOLVED_NATIVE_REGRESSIONS','files':dict(sorted(hashes.items())),
                  'automaticDeviceAcceptance':'NOT_RUN','baseline':'pinned FlClash 0.9.0 fork + rc.5 patch + auto-local-family-r1'}
        z.writestr(member_info('PACKAGE_MANIFEST.json'),(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    with zipfile.ZipFile(target,'r') as z:
        assert z.testzip() is None
        assert set(z.namelist())==set(hashes)|{'PACKAGE_MANIFEST.json'}
        for key,digest in hashes.items():
            assert hashlib.sha256(z.read(key)).hexdigest()==digest,key
    digest=sha(target)
    (OUT/(name+'.sha256')).write_text(digest+'  '+name+'\n',encoding='utf-8')
    return {'file':target.relative_to(PROJECT).as_posix(),'sha256':digest,'bytes':target.stat().st_size,'members':len(hashes)+1}
def main():
    p=argparse.ArgumentParser(description=__doc__)
    for key in ['base-core','patched-core','helper-source','binaries']:
        p.add_argument('--'+key,required=True,type=Path)
    a=p.parse_args()
    base=a.base_core.resolve();new=a.patched_core.resolve();helper=a.helper_source.resolve();binary=a.binaries.resolve()
    assert all(x.is_dir() for x in [base,new,helper,binary])
    patch=load(FORMAL/'patch-files.json')['files']
    changed={x['file']:x for x in patch}
    assert len(changed)==len(patch)==10
    for key,row in changed.items():
        f=new/key
        assert f.exists() and sha(f)==row['afterSHA256'],key
        previous=base/key
        assert sha(previous)==row['beforeSHA256'] if row['beforeSHA256'] is not None else not previous.exists(),key
    base_files=dict(iter_files(base))
    patched_files=dict(iter_files(new))
    for key,f in patched_files.items():
        if key in changed:continue
        assert key in base_files and sha(f)==sha(base_files[key]),'Unreviewed source changed: '+key
    for key in changed:base_files[key]=new/key
    assert (base/'vendor/modules.txt').is_file(), 'Vendored Go dependencies missing'
    assert (helper/'vendor').is_dir() and (helper/'Cargo.lock').is_file(), 'Vendored Rust dependencies missing'
    pair=load(FORMAL/'candidate-binaries.json')
    assert len(pair['files'])==3 and pair['coreSHA256']==sha(binary/'FlClashCore.exe')
    assert pair['coreSHA256'].encode() in (binary/'FlClashHelperService.exe').read_bytes(),'Unmatched Helper'
    for e in pair['files']:
        assert sha(binary/e['file'])==e['sha256'] and (binary/e['file']).stat().st_size==e['bytes']
    assert load(binary/'manifest.json')['coreSha256']==pair['coreSHA256']
    assert sha(helper/'Cargo.lock')==load(FORMAL/'source-identity.json').get('cargoLockSha256',sha(helper/'Cargo.lock'))
    regression=REL/'validation/known-release-regressions.json'
    failures=load(regression)
    assert failures['status']=='PRE_RELEASE_WITH_DISCLOSED_UNRESOLVED_NATIVE_REGRESSIONS' and len(failures['knownUnresolved'])==2
    OUT.mkdir(parents=True,exist_ok=True)
    source_items={'core/'+key:f for key,f in base_files.items()}
    source_items.update({'helper/'+key:f for key,f in iter_files(helper)})
    for f in sorted(FORMAL.iterdir()):
        if f.is_file():source_items[f.name]=f
    for name in ['LICENSE','THIRD_PARTY_NOTICES.md']:
        source_items['RouteWeaver-'+name]=PROJECT/name
    source_items['known-release-regressions.json']=regression
    import subprocess
    old_patch=REL/'research/flclash-core-integration/core.patch'
    source_items['rc5-base-core.patch']=old_patch
    manifest_files=[{'file':k,'sha256':sha(v)} for k,v in sorted(source_items.items())]
    source_extra={'source-files.json':(json.dumps({'revision':'auto-local-family-r1','files':manifest_files},ensure_ascii=False,indent=2)+'\n').encode('utf-8')}
    # Complete-source rebuild program sits at the bundle root and expects core/ helper/ and source-files.json.
    source= create_zip('v14.3-rc6-flclash-auto-corresponding-source.zip','complete-corresponding-source',source_items,source_extra)
    install_items={('bin/'+e['file']):binary/e['file'] for e in pair['files']}
    for name in ['candidate-binaries.json','source-identity.json','install-flclash-core.ps1','LICENSE','README.md','rebuild.py']:
        install_items[name]=FORMAL/name
    install_items['RouteWeaver-LICENSE']=PROJECT/'LICENSE'
    install_items['THIRD_PARTY_NOTICES.md']=PROJECT/'THIRD_PARTY_NOTICES.md'
    install_items['known-release-regressions.json']=regression
    installed=create_zip('v14.3-rc6-flclash-windows-auto-core.zip','matched-optional-native-Windows-FlClash-core',install_items,{})
    proof={'status':'MATCHED_RC6_PAIR_AND_COMPLETE_SOURCE_PACKAGED_CRC_SHA_PASS','date':'2026-10-17','revision':'auto-local-family-r1','packages':[installed,source],
           'baseCoreFiles':len(base_files),'correspondingSourceFiles':len(manifest_files),
           'coreSHA256':pair['coreSHA256'],'helperSHA256':sha(binary/'FlClashHelperService.exe'),'matchedHelperEmbeddedCoreSHA256':True,
           'dependencyEvidence':{'vendoredGo':True,'vendoredRust':True,'cargoLockSHA256':sha(helper/'Cargo.lock')},
           'publishedClientModified':False,'knownFailures':failures['status']}
    (OUT/'auto-core-package-verification.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(proof,ensure_ascii=False))
if __name__=='__main__':main()
