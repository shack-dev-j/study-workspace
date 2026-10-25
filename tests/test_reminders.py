import datetime as dt
import shutil
import tempfile
import unittest
from pathlib import Path

from backend import reminders
from backend.storage import Storage

TODAY = dt.date(2026, 11, 10)


class ReminderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.st = Storage(self.tmp / "data", self.tmp / "backups")
        self.st.write("homework", {"items": [
            {"id": "h1", "title": "Physics worksheet", "subject": "Physics", "due": "2026-11-11", "status": "todo"},
            {"id": "h2", "title": "Old essay", "due": "2026-11-01", "status": "todo"},
            {"id": "h3", "title": "Done one", "due": "2026-11-10", "status": "done"},
            {"id": "h4", "title": "Far away", "due": "2026-12-20", "status": "todo"},
        ]})
        self.st.write("universities", {"items": [
            {"id": "u1", "name": "KAIST", "deadline": "2026-11-20", "status": "Preparing"},
            {"id": "u2", "name": "Applied Uni", "deadline": "2026-11-12", "status": "Applied"},
            {"id": "u3", "name": "Later", "deadline": "2027-03-01", "status": "Researching"},
        ]})
        self.st.write("deadlines", {"items": [{"id": "d1", "title": "SAT", "date": "2026-12-05"}]})

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_collect(self):
        r = {x["key"].split(":")[1]: x for x in reminders.collect(self.st, TODAY)}
        self.assertIn("h1", r)                      # due tomorrow
        self.assertIn("h2", r)                      # overdue
        self.assertTrue(r["h2"]["urgent"])
        self.assertNotIn("h3", r)                   # done
        self.assertNotIn("h4", r)                   # too far
        self.assertIn("u1", r)                      # 10 days -> 14-day step
        self.assertTrue(r["u1"]["key"].endswith(":14"))
        self.assertNotIn("u2", r)                   # already applied
        self.assertNotIn("u3", r)
        self.assertTrue(r["d1"]["key"].endswith(":30"))  # 25 days -> 30-day step

    def test_each_step_sent_once(self):
        sent = []
        fake = lambda t, b, i=None: sent.append(t) or True
        first = reminders.check_and_send(self.st, TODAY, send=fake)
        self.assertEqual(len(first), len(sent))
        self.assertGreater(len(first), 0)
        again = reminders.check_and_send(self.st, TODAY, send=fake)
        self.assertEqual(again, [])
        # 3 days later KAIST reaches the 7-day step: sent again, once.
        later = reminders.check_and_send(self.st, TODAY + dt.timedelta(days=3), send=fake)
        self.assertTrue(any("KAIST" in r["title"] for r in later))

    def test_disabled(self):
        self.st.write("settings", {"reminders": False})
        self.assertEqual(reminders.check_and_send(self.st, TODAY, send=lambda *a: True), [])

    def test_failed_send_is_retried(self):
        self.assertEqual(reminders.check_and_send(self.st, TODAY, send=lambda *a: False), [])
        self.assertGreater(len(reminders.check_and_send(self.st, TODAY, send=lambda *a: True)), 0)


if __name__ == "__main__":
    unittest.main()
