"""Prepare explicit, hashed RC6 upload inventory; does not connect to GitHub."""
from pathlib import Path
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/v14.3'
REL=ROOT/'releases/v14.3'
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def main():
    current=read(ROOT/'CURRENT_RELEASE.json')
    assert current['releaseTag']=='v14.3.0-rc.6'
    entries=sorted({ROOT/p for p in current['entries'].values()})
    assert len(entries)==7 and all(p.is_file() for p in entries)
    package=read(OUT/'package-verification.json')
    auto=read(OUT/'auto-core-package-verification.json')
    risk=read(REL/'validation/known-release-regressions.json')
    assert package['status']=='PACKAGE_CRC_SHA_FRESH_STATIC_PASS'
    assert auto['status']=='MATCHED_RC6_PAIR_AND_COMPLETE_SOURCE_PACKAGED_CRC_SHA_PASS'
    assert risk['status']=='PRE_RELEASE_WITH_DISCLOSED_UNRESOLVED_NATIVE_REGRESSIONS'
    assert len(risk['knownUnresolved'])==2
    files={p.name:p for p in entries}
    for e in package['packages']+auto['packages']:
        f=ROOT/e['file']
        assert sha(f)==e['sha256']
        assert f.name not in files, f.name
        with zipfile.ZipFile(f) as z:
            assert z.testzip() is None
            record=read_from_zip(z,'PACKAGE_MANIFEST.json')
            assert len(z.namelist())==len(record['files'])+1
            assert set(z.namelist())==set(record['files'])|{'PACKAGE_MANIFEST.json'}
        files[f.name]=f
        sidecar=Path(str(f)+'.sha256')
        assert sidecar.read_text(encoding='utf-8').strip()==sha(f)+'  '+f.name,sidecar
        files[sidecar.name]=sidecar
    for f in [OUT/'package-verification.json',OUT/'auto-core-package-verification.json',REL/'validation/known-release-regressions.json']:
        assert f.name not in files
        files[f.name]=f
    record={
        'release':'v14.3.0-rc.6',
        'isPrerelease':True,
        'scope':'Release attachment SHA256 and ZIP CRC/SHA256 checks; no device acceptance',
        'knownNativeFailures':[e['test'] for e in risk['knownUnresolved']],
        'automaticDeviceAcceptance':'NOT_VERIFIED',
        'entries': [{'name':name,'file':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'sizeBytes':p.stat().st_size}
                    for name,p in sorted(files.items())],
    }
    manifest=OUT/'release-asset-manifest.json'
    manifest.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    assert manifest.name not in files
    files[manifest.name]=manifest
    sums=OUT/'SHA256SUMS.txt'
    sums.write_text(''.join(f'{sha(p)}  {name}\n' for name,p in sorted(files.items())),encoding='utf-8')
    assert len(files)==len({p.name for p in files.values()})
    print(json.dumps({'status':'RC6_ASSETS_VALIDATED_READY_FOR_UPLOAD','countExcludingSHA256SUMS':len(files),
          'totalAssets':len(files)+1,'knownNativeFailed':record['knownNativeFailures'],
          'totalBytes':sum(p.stat().st_size for p in files.values())+sums.stat().st_size,
          'manifest':manifest.relative_to(ROOT).as_posix(),'sums':sums.relative_to(ROOT).as_posix()},ensure_ascii=False))
def read_from_zip(z,name):return json.loads(z.read(name))
if __name__=='__main__':main()
