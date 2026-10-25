import datetime as dt
import io
import json
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path

from backend import backup
from tests.helpers import TempApp


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / "data").mkdir()
        (self.tmp / "data" / "homework.json").write_text('{"items": []}')
        (self.tmp / "data" / "files").mkdir()
        (self.tmp / "data" / "files" / "big.pdf").write_text("not in backup")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_once_per_day_json_only(self):
        b = self.tmp / "backups"
        day = dt.date(2026, 11, 1)
        p = backup.make_backup(self.tmp / "data", b, day)
        self.assertIsNotNone(p)
        self.assertIsNone(backup.make_backup(self.tmp / "data", b, day))
        with zipfile.ZipFile(p) as z:
            self.assertEqual(z.namelist(), ["data/homework.json"])

    def test_keeps_last_14_and_only_backup_files(self):
        b = self.tmp / "backups"
        b.mkdir()
        (b / "my-notes.zip").write_text("keep me")
        (b / "pre-restore-20260101-000000.zip").write_text("keep me")
        start = dt.date(2026, 11, 1)
        for i in range(20):
            backup.make_backup(self.tmp / "data", b, start + dt.timedelta(days=i))
        names = [p.name for p in backup.list_backups(b)]
        self.assertEqual(len(names), 14)
        self.assertEqual(names[0], "backup-2026-11-07.zip")
        self.assertTrue((b / "my-notes.zip").exists())
        self.assertTrue((b / "pre-restore-20260101-000000.zip").exists())


class ExportRestoreTests(unittest.TestCase):
    def test_round_trip(self):
        with TempApp() as t:
            s, meta = t.req("POST", "/api/files", b"PDFDATA", headers={"X-Filename": "a.pdf"})
            d = t.req("GET", "/api/data/homework")[1]
            d["items"] = [{"id": "h1", "title": "Mechanics", "files": [meta]}]
            t.req("PUT", "/api/data/homework", d)
            s, z, h = t.req("GET", "/api/export", raw=True)
            self.assertEqual(s, 200)
            self.assertEqual(h["Content-Type"], "application/zip")
        with TempApp() as t2:
            s, r = t2.req("POST", "/api/restore", z, headers={"Content-Type": "application/zip"})
            self.assertEqual(s, 200, r)
            self.assertEqual(r["files_added"], 1)
            hw = t2.req("GET", "/api/data/homework")[1]
            self.assertEqual(hw["items"][0]["title"], "Mechanics")
            s, body, _ = t2.req("GET", f"/api/files/{meta['id']}", raw=True)
            self.assertEqual(body, b"PDFDATA")
            self.assertTrue(list(t2.paths.backups.glob("pre-restore-*.zip")))

    def _zip(self, entries):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("manifest.json", json.dumps({"app": "Study Workspace"}))
            for name, content in entries.items():
                z.writestr(name, content)
        return buf.getvalue()

    def test_zip_slip_refused(self):
        with TempApp() as t:
            before = t.req("GET", "/api/data/homework")[1]
            for evil in ("../evil.json", "files/aaaaaaaaaaaaaaaa/../../../x", "/etc/x", "data/../../x.json",
                         "data/passwords.json", "files/notanid/x.txt"):
                s, r = t.req("POST", "/api/restore", self._zip({evil: "{}"}))
                self.assertEqual(s, 400, evil)
            s, r = t.req("POST", "/api/restore", self._zip({"data/homework.json": "{broken"}))
            self.assertEqual(s, 400)
            s, r = t.req("POST", "/api/restore", b"not a zip at all")
            self.assertEqual(s, 400)
            after = t.req("GET", "/api/data/homework")[1]
            self.assertEqual(before, after)
            self.assertFalse((t.paths.root.parent / "evil.json").exists())

    def test_wrong_app_refused(self):
        with TempApp() as t:
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w") as z:
                z.writestr("manifest.json", json.dumps({"app": "Other"}))
            s, _ = t.req("POST", "/api/restore", buf.getvalue())
            self.assertEqual(s, 400)


if __name__ == "__main__":
    unittest.main()
