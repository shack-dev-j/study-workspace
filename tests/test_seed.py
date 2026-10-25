"""Built-in content (content/*.json) is merged without touching user data."""
import json
import unittest

from backend import seed
from tests.helpers import TempApp


class SeedTests(unittest.TestCase):
    def test_fresh_install_is_filled(self):
        with TempApp() as t:
            st = t.app.storage
            pp = st.read("pastpapers")["items"]
            self.assertGreaterEqual(len(pp), 200)
            self.assertTrue(all(p["qpUrl"].startswith("https://") and p["seed"] for p in pp))
            self.assertGreater(len(st.read("resources")["items"]), 30)
            self.assertGreater(len(st.read("thm")["items"]), 15)
            self.assertGreater(len(st.read("universities")["items"]), 10)
            names = [h["name"] for h in st.read("habits")["items"]]
            self.assertIn("In bed by 22:30", names)

    def test_user_data_is_kept_and_deletes_stick(self):
        with TempApp() as t:
            st = t.app.storage
            # The user edits one seeded paper and deletes a room.
            def edit(d):
                d["items"][0]["done"] = True
                d["items"][0]["score"] = 61
            st.update("pastpapers", edit)
            first = st.read("pastpapers")["items"][0]["id"]
            gone = st.read("thm")["items"][0]["id"]
            st.update("thm", lambda d: d["items"].pop(0))
            st.update("homework", lambda d: d["items"].append({"id": "mine", "title": "My own"}))
            added = seed.apply(st, t.paths)
            self.assertEqual(added, {})
            p = next(i for i in st.read("pastpapers")["items"] if i["id"] == first)
            self.assertEqual((p["done"], p["score"]), (True, 61))
            self.assertNotIn(gone, [r["id"] for r in st.read("thm")["items"]])
            self.assertIn("mine", [h["id"] for h in st.read("homework")["items"]])

    def test_new_content_is_added_with_backup(self):
        with TempApp() as t:
            st = t.app.storage
            pack = t.paths.app / "content" / "resources.json"
            data = json.loads(pack.read_text())
            n = len(st.read("resources")["items"])
            extra = {"id": "res-test-new", "area": "Study", "subject": "Maths", "title": "New", "url": "https://example.org", "kind": "notes"}
            orig = seed.load_packs
            try:
                seed.load_packs = lambda paths: {"resources": {"items": data["items"] + [extra]}}
                self.assertEqual(seed.apply(st, t.paths), {"resources": 1})
            finally:
                seed.load_packs = orig
            self.assertEqual(len(st.read("resources")["items"]), n + 1)
            self.assertTrue(list((st.backups / "content").glob("resources-*.json")))

    def test_remove_samples_keeps_seed_content(self):
        with TempApp() as t:
            s, r = t.req("POST", "/api/samples")
            self.assertEqual(s, 200)
            self.assertGreaterEqual(len(t.app.storage.read("pastpapers")["items"]), 200)


if __name__ == "__main__":
    unittest.main()
