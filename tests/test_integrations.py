"""Todoist, Gemini, API keys and Caelestia colours. No real network: a fake opener answers."""

import io
import json
import os
import stat
import tempfile
import unittest
import urllib.error
import zipfile
from pathlib import Path

from backend import backup, exporter, gemini, net, secrets_store, theme, todoist
from tests.helpers import TempApp


class FakeOpener:
    """Records requests and answers from a dict: (method, url-prefix) -> JSON or exception."""

    def __init__(self, routes):
        self.routes = routes
        self.calls = []

    def __call__(self, req, timeout=None):
        self.calls.append((req.get_method(), req.full_url, dict(req.header_items()), req.data))
        for (method, prefix), reply in self.routes.items():
            if req.get_method() == method and req.full_url.startswith(prefix):
                if isinstance(reply, Exception):
                    raise reply
                return _Resp(json.dumps(reply).encode())
        raise urllib.error.URLError("no route")


class _Resp:
    def __init__(self, body):
        self.body = body

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


API = todoist.API


class TodoistTests(unittest.TestCase):
    def test_sync_pages_and_normalizes(self):
        op = FakeOpener({
            ("GET", f"{API}/projects"): {"results": [{"id": "p1", "name": "School"}], "next_cursor": None},
            ("GET", f"{API}/tasks?limit=200&cursor=c2"): {"results": [
                {"id": "2", "content": "Buy calculator", "priority": 1, "project_id": "p1", "due": None}], "next_cursor": None},
            ("GET", f"{API}/tasks"): {"results": [
                {"id": "1", "content": "Physics revision", "priority": 4, "project_id": "p1",
                 "due": {"date": "2026-10-26T15:30:00", "is_recurring": False}, "duration": {"amount": 45, "unit": "minute"}}],
                "next_cursor": "c2"},
        })
        with TempApp() as t:
            data = todoist.sync(t.app.storage, "tok", opener=op)
            tasks = {x["id"]: x for x in data["tasks"]}
            self.assertEqual(tasks["1"]["due"], "2026-10-26")
            self.assertEqual(tasks["1"]["time"], "15:30")
            self.assertEqual(tasks["1"]["minutes"], 45)
            self.assertEqual(tasks["1"]["priority"], 4)
            self.assertEqual(tasks["1"]["project"], "School")
            self.assertEqual(tasks["2"]["due"], "")
            self.assertTrue(all(c[2].get("Authorization") == "Bearer tok" for c in op.calls))

    def test_errors_are_saved_and_raised(self):
        op = FakeOpener({("GET", API): urllib.error.HTTPError(API, 401, "no", {}, io.BytesIO(b""))})
        with TempApp() as t:
            with self.assertRaises(net.NetError) as e:
                todoist.sync(t.app.storage, "bad", opener=op)
            self.assertIn("401", str(e.exception))
            self.assertIn("401", t.app.storage.read("todoist")["error"])

    def test_close_and_add(self):
        op = FakeOpener({("POST", f"{API}/tasks/1/close"): {},
                         ("POST", f"{API}/tasks"): {"id": "9", "content": "New", "priority": 2, "due": {"date": "2026-10-27"}}})
        with TempApp() as t:
            t.app.storage.update("todoist", lambda d: d.update(tasks=[{"id": "1", "content": "Old"}]))
            todoist.close_task(t.app.storage, "tok", "1", opener=op)
            item = todoist.add_task(t.app.storage, "tok", "New", "2026-10-27", 2, 30, opener=op)
            self.assertEqual(item["due"], "2026-10-27")
            body = json.loads(op.calls[-1][3])
            self.assertEqual(body, {"content": "New", "due_date": "2026-10-27", "priority": 2, "duration": 30, "duration_unit": "minute"})
            self.assertEqual([x["id"] for x in t.app.storage.read("todoist")["tasks"]], ["9"])

    def test_api_needs_a_token(self):
        with TempApp() as t:
            s, d = t.req("POST", "/api/todoist/sync", {})
            self.assertEqual(s, 400)
            self.assertIn("Settings", d["error"])


class GeminiTests(unittest.TestCase):
    def reply(self, text):
        return {"candidates": [{"content": {"parts": [{"text": text}]}}]}

    def test_break_down(self):
        op = FakeOpener({("POST", gemini.BASE): self.reply('```json\n{"steps": [{"step": "Read notes", "minutes": 10}, {"step": "Do Q1-5", "minutes": 25}]}\n```')})
        steps = gemini.break_down("key", "Kinematics worksheet", minutes=50, opener=op)
        self.assertEqual(steps, [{"step": "Read notes", "minutes": 10}, {"step": "Do Q1-5", "minutes": 25}])
        method, url, headers, _ = op.calls[0]
        self.assertIn("models/gemini-2.5-flash:generateContent", url)
        self.assertEqual(headers.get("X-goog-api-key"), "key")
        self.assertNotIn("key=", url)  # the key is never put in the URL

    def test_coach_and_bad_model(self):
        op = FakeOpener({("POST", gemini.BASE): self.reply("Do the essay first.")})
        self.assertEqual(gemini.coach("k", {"blocks": [], "must_do": []}, opener=op), "Do the essay first.")
        with self.assertRaises(net.NetError):
            gemini.generate("k", "hi", model="../../evil", opener=op)

    def test_no_answer(self):
        op = FakeOpener({("POST", gemini.BASE): {"promptFeedback": {"blockReason": "SAFETY"}}})
        with self.assertRaises(net.NetError) as e:
            gemini.generate("k", "hi", opener=op)
        self.assertIn("SAFETY", str(e.exception))


class SecretsTests(unittest.TestCase):
    def test_keys_are_private(self):
        with TempApp() as t:
            s, st = t.req("PUT", "/api/secrets", {"todoist_token": "  abc123 ", "gemini_key": "g-key", "evil": "x"})
            self.assertEqual((s, st), (200, {"todoist": True, "gemini": True}))
            p = t.paths.data / "secrets.json"
            self.assertEqual(stat.S_IMODE(os.stat(p).st_mode), 0o600)
            self.assertEqual(json.loads(p.read_text()), {"todoist_token": "abc123", "gemini_key": "g-key"})
            # Never readable through the API.
            self.assertEqual(t.req("GET", "/api/secrets")[1], {"todoist": True, "gemini": True})
            self.assertEqual(t.req("GET", "/api/data/secrets")[0], 404)
            # Not in backups or exports.
            b = backup.make_backup(t.paths.data, t.paths.backups, force=True)
            self.assertNotIn("data/secrets.json", zipfile.ZipFile(b).namelist())
            out = Path(tempfile.mkdtemp()) / "e.zip"
            exporter.write_export(t.paths, out)
            names = zipfile.ZipFile(out).namelist()
            self.assertNotIn("data/secrets.json", names)
            self.assertTrue(all("abc123" not in zipfile.ZipFile(out).read(n).decode("utf-8", "ignore") for n in names if n.endswith(".json")))
            # Empty value removes a key.
            self.assertEqual(t.req("PUT", "/api/secrets", {"todoist_token": ""})[1], {"todoist": False, "gemini": True})
            self.assertEqual(t.req("PUT", "/api/secrets", {"todoist_token": "x"}, csrf=False)[0], 403)


class ThemeTests(unittest.TestCase):
    def test_read_scheme(self):
        d = Path(tempfile.mkdtemp())
        p = d / "scheme.json"
        p.write_text(json.dumps({"name": "dynamic", "flavour": "default", "mode": "dark", "variant": "tonalspot",
                                 "colours": {"primary": "c2c1ff", "surface": "131317", "onSurface": "#e5e1e7",
                                             "evil": "red;}", "outline": "nothex"}}))
        s = theme.read_scheme(p)
        self.assertEqual(s["colours"]["primary"], "#c2c1ff")
        self.assertEqual(s["colours"]["onSurface"], "#e5e1e7")
        self.assertNotIn("evil", s["colours"])
        self.assertNotIn("outline", s["colours"])
        self.assertEqual(s["mode"], "dark")
        p.write_text("not json")
        self.assertIsNone(theme.read_scheme(p))
        self.assertIsNone(theme.read_scheme(d / "missing.json"))

    def test_scheme_path_follows_xdg(self):
        self.assertEqual(theme.scheme_path({"XDG_STATE_HOME": "/x/state", "HOME": "/h"}), Path("/x/state/caelestia/scheme.json"))
        self.assertEqual(theme.scheme_path({"HOME": "/h"}), Path("/h/.local/state/caelestia/scheme.json"))

    def test_api_builtin_without_caelestia(self):
        old = os.environ.get("XDG_STATE_HOME")
        os.environ["XDG_STATE_HOME"] = tempfile.mkdtemp()
        try:
            with TempApp() as t:
                self.assertEqual(t.req("GET", "/api/theme")[1], {"source": "builtin"})
        finally:
            if old is None:
                os.environ.pop("XDG_STATE_HOME", None)
            else:
                os.environ["XDG_STATE_HOME"] = old


if __name__ == "__main__":
    unittest.main()
