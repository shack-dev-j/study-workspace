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
            self.assertTrue((app / "vendor/rubik/OFL.txt").exists())
            self.assertTrue((app / "vendor/inter/InterVariable.woff2").exists())
            # No systemd user bus here, so it falls back to an autostart entry.
            auto = home / ".config/autostart/study-workspace-background.desktop"
            self.assertIn(f"Exec={launcher} --no-window", auto.read_text())
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
            self.assertFalse(auto.exists())
        finally:
            shutil.rmtree(home, ignore_errors=True)


    @unittest.skipUnless((APP_ROOT / ".git").exists() and shutil.which("git"), "needs the git repo")
    def test_one_file_installer(self):
        tmp = Path(tempfile.mkdtemp(prefix="sw-one-"))
        try:
            r = subprocess.run(["bash", str(APP_ROOT / "scripts/make_installer.sh"), str(tmp)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            inst = tmp / "study-workspace-install.sh"
            home = tmp / "home"
            home.mkdir()
            env = {"HOME": str(home), "PATH": os.environ["PATH"]}
            r = subprocess.run(["bash", str(inst), "--yes"], env=env, capture_output=True, text=True, stdin=subprocess.DEVNULL)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertTrue((home / ".local/share/study-workspace/app/server.py").exists())
            self.assertTrue(os.access(home / ".local/bin/study-workspace", os.X_OK))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_service_unit_template(self):
        unit = (APP_ROOT / "desktop/study-workspace.service").read_text()
        self.assertIn("ExecStart=@EXEC@ --serve", unit)
        self.assertIn("WantedBy=default.target", unit)
        self.assertNotIn("ExecStartPre", unit)


if __name__ == "__main__":
    unittest.main()
