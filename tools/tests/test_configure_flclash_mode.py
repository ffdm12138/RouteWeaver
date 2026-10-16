import importlib.util
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('configure_mode', Path(__file__).parents[1] / 'configure-flclash-network-mode.py')
mode_tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mode_tool)
SOURCE = b'// fixture x-v14-generated\r\nconst ROUTEWEAVER_DEFAULT_NETWORK_MODE = "dual-stack";\r\nconst ipv6 = true;\r\n'


class ConfigureMode(unittest.TestCase):
    def test_only_mode_bytes_change_and_line_endings_remain(self):
        fixed = mode_tool.configure_bytes(SOURCE, 'ipv4-local')
        self.assertEqual(fixed, SOURCE.replace(b'"dual-stack"', b'"ipv4-local"'))
        self.assertIn(b'ipv6 = true', fixed)

    def test_idempotent_and_reversible(self):
        fixed = mode_tool.configure_bytes(SOURCE, 'ipv4-local')
        self.assertEqual(mode_tool.configure_bytes(fixed, 'ipv4-local'), fixed)
        self.assertEqual(mode_tool.configure_bytes(fixed, 'dual-stack'), SOURCE)

    def test_ambiguous_unknown_or_missing_source_is_rejected(self):
        for source, mode in [(SOURCE + SOURCE, 'ipv4-local'), (b'const ipv6 = true;', 'ipv4-local'), (SOURCE, 'invalid-mode')]:
            with self.assertRaises(ValueError):
                mode_tool.configure_bytes(source, mode)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'scripts').mkdir()
        (self.root / 'scripts/10.js').write_bytes(SOURCE)
        (self.root / 'scripts/11.js').write_bytes(SOURCE)
        prefs = {'flutter.config': json.dumps({'currentProfileId': 1})}
        (self.root / 'shared_preferences.json').write_text(json.dumps(prefs))
        with closing(sqlite3.connect(self.root / 'database.sqlite')) as db:
            db.execute('CREATE TABLE profiles (id INTEGER, extend_type TEXT, script_id INTEGER)')
            db.execute('CREATE TABLE scripts (id INTEGER, url TEXT)')
            db.execute('INSERT INTO profiles VALUES (1, ?, 10)', ('script',))
            db.execute('INSERT INTO scripts VALUES (10, ?)', ('https://private.invalid/secret-token',))
            db.commit()

    def tearDown(self):
        self.temp.cleanup()

    def test_dry_run_writes_nothing_and_redacts_remote_url(self):
        result = mode_tool.configure(self.root, 'ipv4-local')
        self.assertEqual(result['status'], 'DRY_RUN')
        self.assertEqual((self.root / 'scripts/10.js').read_bytes(), SOURCE)
        self.assertNotIn('secret-token', json.dumps(result))
        self.assertTrue(result['scriptHasRemoteUpdateURL'])

    def test_apply_guards_hash_and_profile_before_writing(self):
        for kw in [{'expected_sha256': '0'*64}, {'expected_sha256': mode_tool.digest(SOURCE), 'expected_profile': 2}]:
            with self.assertRaises(ValueError):
                mode_tool.configure(self.root, 'ipv4-local', apply=True, backup_dir=self.root/'backup', **kw)
        self.assertEqual((self.root / 'scripts/10.js').read_bytes(), SOURCE)
        self.assertFalse((self.root / 'backup').exists())

    def test_apply_requires_backup_and_hash(self):
        with self.assertRaises(ValueError):
            mode_tool.configure(self.root, 'ipv4-local', apply=True)
        self.assertEqual((self.root / 'scripts/10.js').read_bytes(), SOURCE)

    def test_apply_only_current_script_and_saves_receipt(self):
        prefs = (self.root / 'shared_preferences.json').read_bytes()
        db_before = (self.root / 'database.sqlite').read_bytes()
        result = mode_tool.configure(self.root, 'ipv4-local', apply=True, expected_sha256=mode_tool.digest(SOURCE), backup_dir=self.root/'backup')
        self.assertEqual(result['status'], 'SCRIPT_MODE_APPLIED_RELOAD_REQUIRED')
        self.assertEqual((self.root / 'backup/script.before.js').read_bytes(), SOURCE)
        self.assertEqual((self.root / 'scripts/11.js').read_bytes(), SOURCE)
        self.assertEqual((self.root / 'shared_preferences.json').read_bytes(), prefs)
        self.assertEqual((self.root / 'database.sqlite').read_bytes(), db_before)
        self.assertFalse(result['clientReloaded'])

    def test_reused_backup_is_not_overwritten(self):
        backup = self.root / 'backup'
        backup.mkdir()
        with self.assertRaises(FileExistsError):
            mode_tool.configure(self.root, 'ipv4-local', apply=True, expected_sha256=mode_tool.digest(SOURCE), backup_dir=backup)
        self.assertEqual((self.root / 'scripts/10.js').read_bytes(), SOURCE)


if __name__ == '__main__':
    unittest.main()
