"""Checks on the committed sample data (data.example/) and sample removal."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from backend.paths import APP_ROOT
from backend.samples import remove_samples
from backend.storage import MODULES, Storage

EX = APP_ROOT / "data.example"


class DataExampleTests(unittest.TestCase):
    def test_every_module_has_a_valid_file(self):
        for m in MODULES:
            p = EX / f"{m}.json"
            self.assertTrue(p.is_file(), f"missing data.example/{m}.json")
            d = json.loads(p.read_text(encoding="utf-8"))
            self.assertEqual(d.get("schema_version"), 1, m)
            self.assertNotIn("_rev", d, m)

    def test_ids_are_unique(self):
        for m in MODULES:
            d = json.loads((EX / f"{m}.json").read_text(encoding="utf-8"))
            for key in ("items", "slots", "entries", "tests", "skills", "topics"):
                ids = [x.get("id") for x in d.get(key, []) if isinstance(x, dict)]
                self.assertEqual(len(ids), len(set(ids)), f"{m}.{key} has duplicate ids")

    def test_no_personal_data(self):
        text = "".join(p.read_text(encoding="utf-8") for p in EX.glob("*.json")).lower()
        for word in ('"password"', '"token"', "@gmail.com"):
            self.assertFalse(word in text, f"{word} found in data.example")

    def test_remove_samples_keeps_real_content(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            shutil.copytree(EX, tmp / "data")
            st = Storage(tmp / "data")
            n = remove_samples(st)
            self.assertGreater(n, 0)
            self.assertEqual(st.read("homework")["items"], [])
            self.assertGreaterEqual(len(st.read("challenges")["items"]), 10)
            self.assertEqual(len(st.read("scholarships")["items"]), 7)
            self.assertTrue(all(len(s["topics"]) > 5 for s in st.read("subjects")["items"]))
            self.assertEqual(len(st.read("sat")["skills"]), 25)
            self.assertEqual(remove_samples(st), 0)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
