"""A new PASS must not erase or merely relabel a published FAIL."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('release_regressions',Path(__file__).parents[1]/'release_regressions.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RegressionEvidence(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='regression-evidence-')
        assert Path(self.temp.name).resolve().is_relative_to(Path(tempfile.gettempdir()).resolve())
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'releases/v14.3'
        self.root.mkdir(parents=True)
        self.sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
        self.read=lambda p:json.loads(p.read_text(encoding='utf-8'))
        self.known={'status':module.LEGACY,'knownUnresolved':[]}
        for name in module.EXPECTED:
            file=f'validation/{name}.json'
            self.write(file,{'status':'FAIL','sourceFiles':[]})
            self.known['knownUnresolved'].append({'test':name,'validationFile':file,
                'validationSHA256':self.sha(self.root/file),'exitCode':1})
        self.save()

    def write(self,name,data):
        p=self.root/name
        p.parent.mkdir(parents=True,exist_ok=True)
        p.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
        return {'file':name,'sha256':self.sha(p)}

    def save(self):
        self.write('validation/known-release-regressions.json',self.known)

    def verify(self):
        return module.verify_regressions(self.root,self.sha,self.read)

    def repair(self):
        self.known['status']=module.REPAIRED
        self.known['resolved']=self.known['knownUnresolved']
        self.known['knownUnresolved']=[]
        self.evidence={'status':module.REPAIRED,'sourceFiles':[],'projectSourceFiles':[],
            'historicalArtifacts':[],'archivedSources':[],'coreSHA256':'owned-fixture','runs':[]}
        for item in self.known['resolved']:
            old=item['validationFile']
            item['validationFile']=f"validation/history/{item['test']}.json"
            artifact=self.write(item['validationFile'],self.read(self.root/old))
            self.evidence['historicalArtifacts'].append(artifact)
            proof=self.write(old,{'status':module.EXPECTED[item['test']],'sourceFiles':[]})
            item['resolution']={'validationFile':old,'validationSHA256':proof['sha256'],
                'status':module.EXPECTED[item['test']]}
        jobs={'controller-unit':'CONTROLLER_UNIT_PASS',
              'full-1':'BALANCED_LOCAL_CORE_PASS','full-2':'BALANCED_LOCAL_CORE_PASS',
              'empty-1':'BALANCED_LOCAL_CORE_PASS','empty-2':'BALANCED_LOCAL_CORE_PASS',
              'cold-1':'BALANCED_COLD_DOWNLOAD_CORE_PASS',
              'macos-1':'MACOS_LOCAL_CORE_PASS_DEVICE_PENDING',
              'verge-1':'CLASH_VERGE_LOCAL_CORE_PASS_DEVICE_PENDING'}
        for name,status in jobs.items():
            run={'name':name,'status':status,'exitCode':0,
                'runLog':self.write(f'validation/runs/{name}-log.json',{'exit':0})}
            if name=='controller-unit':run['cases']=8
            else:run['receipt']=self.write(f'validation/runs/{name}.json',
                {'status':status,'coreSHA256':'owned-fixture','sourceFiles':[]})
            self.evidence['runs'].append(run)
        self.save_repair()

    def save_repair(self):
        self.known['repairEvidence']=self.write('validation/native-api-repair.json',self.evidence)
        self.save()

    def test_legacy_fail_is_explicitly_preserved(self):
        self.assertEqual(len(self.verify()['knownUnresolved']),2)

    def test_legacy_hash_tampering_is_rejected(self):
        self.write('validation/native-core.json',{'status':'PASS'})
        with self.assertRaises(AssertionError):self.verify()

    def test_separate_repair_receipts_are_accepted(self):
        self.repair()
        self.assertEqual(self.verify()['status'],module.REPAIRED)

    def test_current_fail_cannot_be_relabelled_by_a_review_manifest(self):
        self.repair()
        proof=self.write('validation/native-core.json',{'status':'FAIL','sourceFiles':[]})
        self.known['resolved'][0]['resolution']['validationSHA256']=proof['sha256']
        self.save()
        with self.assertRaises(AssertionError):self.verify()

    def test_original_fail_bytes_are_immutable(self):
        self.repair()
        self.write('validation/history/native-core.json',{'status':'PASS'})
        with self.assertRaises(AssertionError):self.verify()

    def test_missing_repeat_is_rejected(self):
        self.repair()
        self.evidence['runs']=[r for r in self.evidence['runs'] if r['name']!='full-2']
        self.save_repair()
        with self.assertRaises(AssertionError):self.verify()

    def test_stale_test_source_invalidates_a_repeat(self):
        self.repair()
        source=self.write('tests/owned-fixture.json',{'version':1})
        run=self.evidence['runs'][1]
        proof=self.read(self.root/run['receipt']['file'])
        proof['sourceFiles']=[source]
        run['receipt']=self.write(run['receipt']['file'],proof)
        self.save_repair()
        self.write(source['file'],{'version':2})
        with self.assertRaises(AssertionError):self.verify()


if __name__=='__main__':unittest.main()
