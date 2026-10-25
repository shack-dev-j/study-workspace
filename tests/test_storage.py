import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backend import migrations
from backend.paths import Paths, data_root, ensure_data, user_data_root
from backend.storage import Conflict, Storage, UnknownModule, atomic_write_json


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.st = Storage(self.tmp / "data", self.tmp / "backups")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_round_trip(self):
        self.st.write("homework", {"items": [1]})
        self.assertEqual(self.st.read("homework")["items"], [1])

    def test_unknown_module(self):
        with self.assertRaises(UnknownModule):
            self.st.read("../etc/passwd")

    def test_conflict(self):
        self.st.write("habits", {"items": []})
        with self.assertRaises(Conflict):
            self.st.write("habits", {"items": []}, expected_rev=0)

    def test_failed_write_keeps_old_file(self):
        self.st.write("habits", {"items": ["old"]})
        with mock.patch("json.dump", side_effect=RuntimeError("disk full")):
            with self.assertRaises(RuntimeError):
                self.st.write("habits", {"items": ["new"]})
        self.assertEqual(self.st.read("habits")["items"], ["old"])
        leftovers = [p for p in (self.tmp / "data").iterdir() if p.name.endswith(".tmp")]
        self.assertEqual(leftovers, [])

    def test_migration_backs_up_first(self):
        atomic_write_json(self.tmp / "data" / "essays.json", {"schema_version": 1, "list": [1]})
        with mock.patch.dict(migrations.CURRENT, {"essays": 2}), \
             mock.patch.dict(migrations.MIGRATIONS, {"essays": {1: lambda d: {"items": d["list"]}}}):
            d = self.st.read("essays")
        self.assertEqual(d["items"], [1])
        self.assertEqual(d["schema_version"], 2)
        backups = list((self.tmp / "backups" / "migrations").glob("essays-*.json"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(json.loads(backups[0].read_text())["list"], [1])


class PathTests(unittest.TestCase):
    def test_portable_vs_installed(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            env = {}
            self.assertEqual(data_root(tmp, env=env), tmp)  # portable
            (tmp / ".installed").write_text("")
            self.assertEqual(data_root(tmp, env=env, platform="linux", home="/home/u"),
                             Path("/home/u/.local/share/study-workspace"))
            self.assertEqual(data_root(tmp, env={"XDG_DATA_HOME": "/x"}, platform="linux"),
                             Path("/x/study-workspace"))
            self.assertEqual(data_root(tmp, env={"STUDY_WORKSPACE_HOME": "/o"}), Path("/o"))
        finally:
            shutil.rmtree(tmp)

    def test_windows_and_mac(self):
        self.assertEqual(user_data_root({"APPDATA": "C:/AD"}, "win32"), Path("C:/AD/StudyWorkspace"))
        self.assertEqual(user_data_root({}, "darwin", "/Users/u"),
                         Path("/Users/u/Library/Application Support/StudyWorkspace"))

    def test_first_run_copies_example_and_never_overwrites(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            app = tmp / "app"
            (app / "data.example").mkdir(parents=True)
            (app / "data.example" / "homework.json").write_text('{"items": ["sample"]}')
            p = Paths(tmp / "root", app_root=app)
            self.assertTrue(ensure_data(p))
            self.assertEqual(json.loads((p.data / "homework.json").read_text())["items"], ["sample"])
            (p.data / "homework.json").write_text('{"items": ["mine"]}')
            (app / "data.example" / "habits.json").write_text('{"items": []}')
            self.assertFalse(ensure_data(p))
            self.assertEqual(json.loads((p.data / "homework.json").read_text())["items"], ["mine"])
            self.assertTrue((p.data / "habits.json").exists())  # new module added
        finally:
            shutil.rmtree(tmp)


if __name__ == "__main__":
    unittest.main()
