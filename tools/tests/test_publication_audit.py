"""Regressions for staged secrets and accidentally tracked local files."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('audit', ROOT / 'tools/audit-publication.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class PublicationAuditTests(unittest.TestCase):
    def test_index_is_scanned_even_after_working_copy_is_cleaned(self):
        with tempfile.TemporaryDirectory(prefix='audit-test-') as directory:
            root = Path(directory)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            path = root / 'example.txt'
            path.write_text('ghp_' + 'A' * 40, encoding='utf-8')
            subprocess.run(['git', 'add', 'example.txt'], cwd=root, check=True)
            path.write_text('redacted', encoding='utf-8')
            name, raw, mode = audit.indexed_files(root)[0]
            self.assertIn('API_OR_GIT_TOKEN', audit.inspect_file(name, raw, mode)[0])

    def test_forced_local_files_and_zip_traversal_are_rejected(self):
        self.assertIn('FORBIDDEN_PUBLIC_PATH', audit.inspect_file('archive/old.conf', b'')[0])
        self.assertIn('FORBIDDEN_PUBLIC_PATH', audit.inspect_file('.work/cache.json', b'')[0])
        self.assertIn('UNSAFE_PATH', audit.inspect_file('../private.conf', b'')[0])
        self.assertIn('NON_REGULAR_FILE', audit.inspect_file('link', b'target', '120000')[0])

    def test_empty_index_is_not_a_success(self):
        with tempfile.TemporaryDirectory(prefix='audit-empty-') as directory:
            root = Path(directory)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            with self.assertRaises(RuntimeError):
                audit.indexed_files(root)



if __name__ == '__main__':
    unittest.main()
