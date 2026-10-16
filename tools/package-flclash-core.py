"""Package a verified optional FlClash pair and complete corresponding source."""
from pathlib import Path
import argparse,hashlib,json,shutil,zipfile

project=Path(__file__).resolve().parents[1]
formal=project/'releases/v14.3/research/flclash-core-integration'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--source',type=Path,required=True);p.add_argument('--binaries',type=Path,required=True)
a=p.parse_args();source=a.source.resolve();binary=a.binaries.resolve()
pair=json.loads((formal/'candidate-binaries.json').read_text(encoding='utf8'))
for e in pair['files']:assert sha(binary/e['file'])==e['sha256'],e['file']
assert pair['coreSHA256'].encode() in (binary/'FlClashHelperService.exe').read_bytes()
assert json.loads((binary/'manifest.json').read_text(encoding='utf8'))['coreSha256']==pair['coreSHA256']
for file in formal.iterdir():
    if file.is_file():shutil.copyfile(file,source/file.name)
manifest=source/'source-files.json'
prior=json.loads(manifest.read_text(encoding='utf8'))
records={e['file']:e['sha256'] for e in prior['files']}
for file in formal.iterdir():
    if file.is_file():records[file.name]=sha(file)
manifest.write_text(json.dumps({'files':[{'file':name,'sha256':records[name]} for name in sorted(records)]},indent=2)+'\n',encoding='utf8')
dist=project/'dist/v14.3';dist.mkdir(parents=True,exist_ok=True)

def archive(name,kind,members,expected=None):
    target=dist/name;hashes={}
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9,strict_timestamps=True) as z:
        for name,file in sorted(members.items()):
            assert not Path(name).is_absolute() and '..' not in Path(name).parts
            info=zipfile.ZipInfo(name,(2026,10,16,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
            digest=hashlib.sha256()
            with file.open('rb') as inp,z.open(info,'w') as out:
                for block in iter(lambda:inp.read(1024*1024),b''):digest.update(block);out.write(block)
            hashes[name]=digest.hexdigest()
            if expected and name in expected:assert hashes[name]==expected[name],name
        record={'kind':kind,'revision':'client-integration-r1','files':hashes,'license':'GPL-3.0 with individual upstream dependency terms','scope':'Optional Windows FlClash 0.9.0 original-hash-only integration; no subscription, user config or automatic update'}
        info=zipfile.ZipInfo('PACKAGE_MANIFEST.json',(2026,10,16,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
        z.writestr(info,json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        for name,digest in hashes.items():assert hashlib.sha256(z.read(name)).hexdigest()==digest,name
    digest=sha(target);target.with_name(target.name+'.sha256').write_text(digest+'  '+target.name+'\n',encoding='utf8')
    return {'file':target.relative_to(project).as_posix(),'sha256':digest,'bytes':target.stat().st_size,'members':len(hashes)+1}

source_files={file.relative_to(source).as_posix():file for file in source.rglob('*') if file.is_file()}
assert set(source_files)==set(records)|{'source-files.json'}
src=archive('v14.3-flclash-corresponding-source.zip','complete-corresponding-source',source_files,records)
members={'bin/'+e['file']:binary/e['file'] for e in pair['files']}
for name in ['README.md','LICENSE','install-flclash-core.ps1','candidate-binaries.json','source-identity.json','rust-toolchain.json']:members[name]=formal/name
members['LICENSE-RouteWeaver-MIT']=project/'LICENSE'
members['THIRD_PARTY_NOTICES.md']=project/'THIRD_PARTY_NOTICES.md'
for tree in ['core/vendor','helper/vendor']:
    for file in (source/tree).rglob('*'):
        if file.is_file() and file.name.upper().startswith(('LICENSE','COPYING','NOTICE','COPYRIGHT','AUTHORS')):
            members['dependency-notices/'+file.relative_to(source).as_posix()]=file
bin_package=archive('v14.3-flclash-windows-core.zip','optional-matched-windows-core',members)
proof={'status':'CORE_PAIR_CORRESPONDING_SOURCE_CRC_SHA_PASS','date':'2026-10-16','packages':[bin_package,src],
    'productionCoreSHA256':pair['coreSHA256'],'correspondingSourceFiles':len(source_files),'matchingHelperVerified':True,
    'installerScope':'Exact original Windows core hash, three files only, backup/rollback and owner SID preserved',
    'sourceManifestSHA256':sha(source/'source-files.json'),'sourcePackageContainsLockedVendorDependencies':True,
    'packageToolSHA256':sha(Path(__file__)),'reproducibility':'Fixed source/dependencies and verified member hashes; binary identity across dependency layouts is not promised'}
(dist/'core-package-verification.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
(project/'releases/v14.3/validation/core-package.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
print(json.dumps(proof))
