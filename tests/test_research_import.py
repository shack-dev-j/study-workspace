"""Tests for importing universities from the research report (#31)."""

import tempfile
import unittest
from pathlib import Path

from backend import research_import as ri
from backend.paths import APP_ROOT, Paths
from backend.storage import Storage
from tests.helpers import TempApp

MD = (APP_ROOT / "docs" / "research" / "universities.md").read_text(encoding="utf-8")


class ParseTests(unittest.TestCase):
    def test_table_rows(self):
        rows = ri.parse_table(MD)
        names = [r["University"] for r in rows]
        self.assertIn("KAIST (Korea)", names)
        self.assertIn("NUS (Singapore)", names)
        self.assertGreaterEqual(len(rows), 15)

    def test_every_rank_is_text_from_the_report(self):
        section = MD[MD.index(ri.SECTION):MD.index("### Singapore")]
        for row in ri.parse_table(MD):
            item = ri.row_to_item(row)
            for key in ("qs_rank", "the_rank", "qs_cs_rank"):
                v = item[key]
                self.assertIsInstance(v, str)
                if v:
                    self.assertIn(v, section, f"{item['name']} {key}={v!r} is not in the report")
                else:
                    self.assertIn(key, item["verify"])

    def test_values(self):
        items = {i["name"]: i for i in map(ri.row_to_item, ri.parse_table(MD))}
        nus = items["NUS"]
        self.assertEqual((nus["country"], nus["qs_rank"], nus["the_rank"], nus["qs_cs_rank"], nus["eyuf"]),
                         ("Singapore", "10", "15", "=4", "yes"))
        self.assertEqual(items["HKU"]["qs_cs_rank"], "")
        hu = items["Hungarian universities (Stipendium Hungaricum)"]
        self.assertEqual(hu["eyuf"], "no")
        self.assertIn("country", hu["verify"])
        self.assertEqual(items["Politecnico di Milano"]["eyuf"], "check")
        for i in items.values():
            self.assertEqual(i["deadline"], "")
            self.assertIn("deadline", i["verify"])
            self.assertEqual(i["sources"], [ri.SOURCE])


class MergeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.paths = Paths(self.tmp, app_root=APP_ROOT)
        self.storage = Storage(self.tmp / "data")
        (self.tmp / "data").mkdir()

    def test_dry_run_writes_nothing(self):
        r = ri.import_into(self.storage, self.paths, dry_run=True)
        self.assertGreater(r["added"], 10)
        self.assertEqual(self.storage.read("universities").get("items", []), [])

    def test_merge_keeps_user_edits(self):
        self.storage.write("universities", {"items": [{"id": "u1", "name": "KAIST", "qs_rank": "my own", "deadline": "2028-01-14", "notes": "mine"}]})
        r = ri.import_into(self.storage, self.paths)
        items = self.storage.read("universities")["items"]
        kaist = [i for i in items if i["name"] == "KAIST"]
        self.assertEqual(len(kaist), 1)
        k = kaist[0]
        self.assertEqual((k["qs_rank"], k["deadline"], k["notes"]), ("my own", "2028-01-14", "mine"))
        self.assertEqual(k["the_rank"], "64")
        self.assertNotIn("deadline", k["verify"])
        self.assertIn("city", k["verify"])
        self.assertEqual(r["updated"], 1)
        # Running again changes nothing.
        r2 = ri.import_into(self.storage, self.paths)
        self.assertEqual((r2["added"], r2["updated"]), (0, 0))

    def test_api_route(self):
        with TempApp() as t:
            s, r = t.req("POST", "/api/import/universities", {"dryRun": True})
            self.assertEqual(s, 200)
            self.assertGreater(r["added"], 10)
            s, d = t.req("GET", "/api/data/universities")
            self.assertEqual(len(d.get("items", [])), 0)
            s, r = t.req("POST", "/api/import/universities", {})
            s, d = t.req("GET", "/api/data/universities")
            self.assertEqual(len(d["items"]), r["added"])


if __name__ == "__main__":
    unittest.main()
