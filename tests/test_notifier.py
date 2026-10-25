"""Plan notifications: block start, breaks, lesson heads-up, sent once."""

import datetime as dt
import unittest

from backend import planner
from backend.notifier import PlanNotifier
from tests.helpers import TempApp

MON = dt.date(2026, 10, 26)


class NotifierTests(unittest.TestCase):
    def test_messages_follow_the_plan(self):
        with TempApp() as t:
            st = t.app.storage
            plan = planner.get_day(st, MON, dt.datetime(2026, 10, 26, 6, 0))
            sent = []
            now = [None]
            n = PlanNotifier(st, lambda *a: sent.append(a), clock=lambda: now[0])
            lesson = next(b for b in plan["blocks"] if b["kind"] == "lesson")
            h, m = map(int, lesson["start"].split(":"))
            now[0] = dt.datetime(2026, 10, 26, h, m) - dt.timedelta(minutes=4)
            n.tick()
            self.assertTrue(any(s[0] == "Lesson in 5 min" and lesson["title"] in s[1] for s in sent))
            count = len(sent)
            n.tick()
            self.assertEqual(len(sent), count)  # sent only once
            focus = next(b for b in plan["blocks"] if b["kind"] == "focus")
            h, m = map(int, focus["start"].split(":"))
            now[0] = dt.datetime(2026, 10, 26, h, m, 20)
            n.tick()
            self.assertTrue(any(s[0] == "Now: " + focus["title"] for s in sent))

    def test_can_be_turned_off(self):
        with TempApp() as t:
            t.app.storage.update("settings", lambda d: d.update(planNotify=False))
            n = PlanNotifier(t.app.storage, lambda *a: None)
            self.assertEqual(n.tick(), [])


if __name__ == "__main__":
    unittest.main()
