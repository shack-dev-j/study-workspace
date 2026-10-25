import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path

from backend import launcher
from backend.paths import APP_ROOT, Paths
from backend.windows import WindowTracker


class BackendChoiceTests(unittest.TestCase):
    def test_prefers_pywebview(self):
        self.assertEqual(launcher.choose_backend(has_webview=True, which=lambda n: None), ("webview", None))

    def test_browser_app_mode_when_no_webview(self):
        which = lambda n: "/usr/bin/brave" if n == "brave" else None
        self.assertEqual(launcher.choose_backend(has_webview=False, which=which), ("app", "/usr/bin/brave"))

    def test_force_browser_skips_webview(self):
        which = lambda n: "/usr/bin/chromium" if n == "chromium" else None
        self.assertEqual(launcher.choose_backend(True, has_webview=True, which=which)[0], "app")

    def test_default_browser_last(self):
        self.assertEqual(launcher.choose_backend(has_webview=False, which=lambda n: None), ("browser", None))

    def test_app_mode_command(self):
        cmd = launcher.app_mode_command("/usr/bin/chromium", "http://127.0.0.1:1/", Path("/tmp/p"))
        self.assertIn("--app=http://127.0.0.1:1/", cmd)
        self.assertIn("--class=study-workspace", cmd)
        self.assertIn("--user-data-dir=/tmp/p", cmd)


class ServerLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="sw-launch-"))
        self.paths = Paths(self.tmp, app_root=APP_ROOT)

    def tearDown(self):
        launcher.stop_server(self.paths)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_stale_state_file_is_ignored(self):
        self.paths.state_file.write_text('{"pid": 999999, "port": 1}')
        self.assertIsNone(launcher.running_url(self.paths))

    def test_start_reuse_stop(self):
        url = launcher.ensure_server(self.paths, port=18765, exit_when_idle=False)
        self.assertTrue(url.startswith("http://127.0.0.1:"))
        self.assertEqual(launcher.ensure_server(self.paths, port=18765), url)  # reused, not a second server
        self.assertTrue(launcher.stop_server(self.paths))
        self.assertIsNone(launcher.running_url(self.paths))

    def test_server_stops_after_last_window_closes(self):
        # Only when "keep running in the background" is off (it is on by default).
        self.paths.data.mkdir(parents=True, exist_ok=True)
        (self.paths.data / "settings.json").write_text('{"schema_version": 1, "keepRunning": false}')
        url = launcher.ensure_server(self.paths, port=18865, exit_when_idle=True)
        launcher.post(url, "/api/window/open", {"id": "a"})
        launcher.post(url, "/api/window/open", {"id": "b"})
        launcher.post(url, "/api/window/close", {"id": "a"})
        time.sleep(3)
        self.assertIsNotNone(launcher.health(url))  # one window still open
        launcher.post(url, "/api/window/close", {"id": "b"})
        for _ in range(80):
            if not launcher.health(url, 0.3):
                break
            time.sleep(0.25)
        self.assertIsNone(launcher.health(url))

    def test_keeps_running_by_default(self):
        url = launcher.ensure_server(self.paths, port=18965, exit_when_idle=True)
        launcher.post(url, "/api/window/open", {"id": "a"})
        launcher.post(url, "/api/window/close", {"id": "a"})
        time.sleep(11)  # longer than the close grace time
        self.assertIsNotNone(launcher.health(url))


class WindowTrackerTests(unittest.TestCase):
    def test_rules(self):
        t = [0.0]
        w = WindowTracker(clock=lambda: t[0])
        self.assertFalse(w.should_exit())
        t[0] = 121
        self.assertTrue(w.should_exit())            # nobody ever opened a window
        w.open("x")
        self.assertFalse(w.should_exit())
        w.close("x")
        t[0] += 3
        self.assertFalse(w.should_exit())           # grace period (page reload)
        t[0] += 10
        self.assertTrue(w.should_exit())
        w.open("y")
        t[0] += 500                                 # no pings: counted as closed
        self.assertEqual(w.active(), 0)


if __name__ == "__main__":
    unittest.main()
