"""Keep controller failure-path regressions in both platform CI jobs."""
from pathlib import Path
import subprocess
import unittest


class NativeControllerTransport(unittest.TestCase):
    def test_owned_loopback_failure_paths(self):
        root = Path(__file__).resolve().parents[2]
        result = subprocess.run(
            ['node', '--test', 'releases/v14.3/tests/native-controller.test.cjs'],
            cwd=root, text=True, encoding='utf-8', capture_output=True, timeout=30,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
