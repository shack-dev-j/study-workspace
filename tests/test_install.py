"""Run install.sh and uninstall.sh in a temporary HOME (Linux only)."""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from backend.paths import APP_ROOT


@unittest.skipUnless(sys.platform.startswith("linux") and shutil.which("bash"), "Linux only")
class InstallTests(unittest.TestCase):
    def test_install_then_uninstall_keeps_data(self):
        home = Path(tempfile.mkdtemp(prefix="sw-home-"))
        try:
            env = {"HOME": str(home), "PATH": os.environ["PATH"]}
            r = subprocess.run(["bash", str(APP_ROOT / "install.sh"), "--yes"], env=env, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            share = home / ".local/share"
            app = share / "study-workspace/app"
            self.assertTrue((app / ".installed").exists())
            self.assertTrue((app / "server.py").exists())
            launcher = home / ".local/bin/study-workspace"
            self.assertIn(str(app), launcher.read_text())
            self.assertTrue(os.access(launcher, os.X_OK))
            desktop = (share / "applications/study-workspace.desktop").read_text()
            self.assertIn(f"Exec={launcher}", desktop)
            self.assertTrue((share / "icons/hicolor/48x48/apps/study-workspace.png").exists())
            # Pretend the user has data, then re-install: data untouched.
            data = share / "study-workspace/data"
            data.mkdir(parents=True)
            (data / "homework.json").write_text('{"items": ["mine"]}')
            r = subprocess.run(["bash", str(APP_ROOT / "install.sh"), "--yes"], env=env, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0)
            self.assertEqual((data / "homework.json").read_text(), '{"items": ["mine"]}')
            # Uninstall without a terminal: never deletes data.
            r = subprocess.run(["bash", str(APP_ROOT / "uninstall.sh")], env=env, capture_output=True, text=True,
                               stdin=subprocess.DEVNULL)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertFalse(app.exists())
            self.assertFalse(launcher.exists())
            self.assertTrue((data / "homework.json").exists())
        finally:
            shutil.rmtree(home, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
