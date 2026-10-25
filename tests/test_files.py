import io
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from backend.files import BadName, FileStore, safe_name
from tests.helpers import TempApp


class SafeNameTests(unittest.TestCase):
    def test_cleaning(self):
        self.assertEqual(safe_name("report.pdf"), "report.pdf")
        self.assertEqual(safe_name("../../etc/passwd"), "passwd")
        self.assertEqual(safe_name("/abs/path/x.png"), "x.png")
        self.assertEqual(safe_name("C:\\Users\\me\\hw.docx"), "hw.docx")
        self.assertEqual(safe_name("a\x00b\n.txt"), "ab.txt")
        self.assertEqual(safe_name("..hidden"), "hidden")
        self.assertEqual(safe_name("Физика дз.pdf"), "Физика дз.pdf")
        long = safe_name("x" * 500 + ".pdf")
        self.assertTrue(long.endswith(".pdf") and len(long) <= 120)
        for bad in ("", "..", "/", "....", "\x00"):
            with self.assertRaises(BadName):
                safe_name(bad)


class FileStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.fs = FileStore(self.tmp / "files", self.tmp / "trash")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_save_find_trash(self):
        m = self.fs.save(io.BytesIO(b"hello"), 5, "../../x.txt")
        p = self.fs.find(m["id"])
        self.assertEqual(p.read_bytes(), b"hello")
        self.assertTrue(str(p.resolve()).startswith(str((self.tmp / "files").resolve())))
        self.assertTrue(self.fs.to_trash(m["id"]))
        self.assertIsNone(self.fs.find(m["id"]))
        self.assertEqual(len(list((self.tmp / "trash").iterdir())), 1)

    def test_bad_ids(self):
        for fid in ("../x", "abc", "0" * 15 + "/", None, "ZZZZZZZZZZZZZZZZ"):
            self.assertIsNone(self.fs.find(fid))

    def test_symlink_escape(self):
        outside = self.tmp / "secret.txt"
        outside.write_text("secret")
        d = self.tmp / "files" / ("a" * 16)
        d.mkdir(parents=True)
        os.symlink(outside, d / "link.txt")
        self.assertIsNone(self.fs.find("a" * 16))

    def test_short_upload_cleans_up(self):
        with self.assertRaises(ValueError):
            self.fs.save(io.BytesIO(b"abc"), 10, "x.txt")
        self.assertEqual(list((self.tmp / "files").iterdir()), [])


class UploadApiTests(unittest.TestCase):
    def test_upload_download_range_delete(self):
        with TempApp() as t:
            data = bytes(range(256)) * 40
            s, meta = t.req("POST", "/api/files", data, headers={"X-Filename": "notes%20ch1.pdf",
                                                                  "Content-Type": "application/octet-stream"})
            self.assertEqual(s, 201)
            self.assertEqual(meta["name"], "notes ch1.pdf")
            self.assertEqual(meta["type"], "application/pdf")
            s, body, h = t.req("GET", f"/api/files/{meta['id']}", raw=True)
            self.assertEqual(body, data)
            s, body, h = t.req("GET", f"/api/files/{meta['id']}", raw=True, headers={"Range": "bytes=10-19"})
            self.assertEqual(s, 206)
            self.assertEqual(body, data[10:20])
            self.assertEqual(h["Content-Range"], f"bytes 10-19/{len(data)}")
            s, body, h = t.req("GET", f"/api/files/{meta['id']}?download=1", raw=True)
            self.assertIn("attachment", h["Content-Disposition"])
            s, _ = t.req("DELETE", f"/api/files/{meta['id']}")
            self.assertEqual(s, 200)
            s, _ = t.req("GET", f"/api/files/{meta['id']}")
            self.assertEqual(s, 404)

    def test_evil_names(self):
        with TempApp() as t:
            for name in ("..%2F..%2Fevil.txt", "%2Fetc%2Fpasswd", "..", "%00"):
                s, meta = t.req("POST", "/api/files", b"x", headers={"X-Filename": name})
                if s == 201:
                    p = t.app.files.find(meta["id"])
                    self.assertTrue(str(p.resolve()).startswith(str(t.paths.files.resolve())))
                    self.assertNotIn("/", meta["name"])
                else:
                    self.assertEqual(s, 400)
            # nothing was written outside data/files
            self.assertFalse((t.paths.root / "evil.txt").exists())
            self.assertFalse((t.paths.data / "evil.txt").exists())

    def test_upload_needs_csrf_header(self):
        with TempApp() as t:
            s, _ = t.req("POST", "/api/files", b"x", headers={"X-Filename": "a.txt"}, csrf=False)
            self.assertEqual(s, 403)


if __name__ == "__main__":
    unittest.main()
