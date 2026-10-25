"""Day planner: time blocks, breaks, must-do list, backpack."""

import datetime as dt
import unittest

from backend import planner
from tests.helpers import TempApp

MON = dt.date(2026, 10, 26)  # a Monday


def sources(**over):
    src = {m: {} for m in planner.SOURCE_MODULES}
    src["planner"] = {"config": {"routines": []}}
    src["timetable"] = {"slots": [
        {"id": "l1", "day": 0, "start": "08:30", "end": "09:15", "title": "Maths", "room": "12"},
        {"id": "l2", "day": 0, "start": "09:25", "end": "10:10", "title": "Physics", "room": "Lab"},
        {"id": "l3", "day": 0, "start": "10:20", "end": "14:00", "title": "Computer Science"},
    ]}
    src["homework"] = {"items": [
        {"id": "h1", "title": "Kinematics worksheet", "subject": "Physics", "due": "2026-10-27", "status": "todo", "priority": "normal"},
        {"id": "h2", "title": "Essay draft", "subject": "English", "due": "2026-10-25", "status": "todo", "priority": "high", "minutes": 60},
        {"id": "h3", "title": "Done one", "due": "2026-10-26", "status": "done"},
    ]}
    src.update(over)
    src["config"] = planner.config_of(src["planner"])
    return src


def mins(b):
    return planner.hm(b["end"]) - planner.hm(b["start"])


class PlannerTests(unittest.TestCase):
    def test_time_helpers(self):
        self.assertEqual(planner.hm("07:30"), 450)
        self.assertIsNone(planner.hm("7.30"))
        self.assertEqual(planner.fmt(450), "07:30")
        self.assertEqual(planner.gaps([{"start": 60, "end": 120}], 0, 200), [(0, 60), (120, 200)])

    def test_day_has_lessons_breaks_and_focus_blocks(self):
        plan = planner.build_day(sources(), MON)
        kinds = [b["kind"] for b in plan["blocks"]]
        self.assertEqual([b["title"] for b in plan["blocks"] if b["kind"] == "lesson"], ["Maths", "Physics", "Computer Science"])
        # 10 min gap between lessons is a school break, not study time.
        self.assertIn("Break between lessons", [b["title"] for b in plan["blocks"]])
        self.assertIn("focus", kinds)
        self.assertEqual(kinds[-1], "sleep")
        # Blocks never overlap and are sorted.
        prev = 0
        for b in plan["blocks"]:
            self.assertGreaterEqual(planner.hm(b["start"]), prev, b)
            prev = planner.hm(b["end"])
        # Overdue + high priority essay comes first; done homework is never planned.
        focus = [b for b in plan["blocks"] if b["kind"] == "focus"]
        self.assertEqual(focus[0]["title"], "Essay draft")
        self.assertNotIn("Done one", [b["title"] for b in focus])
        # Focus blocks are 50 minutes (up to 65 to finish a task instead of leaving a tiny piece).
        self.assertTrue(all(mins(b) <= 65 for b in focus))

    def test_breaks_between_focus_blocks(self):
        src = sources(timetable={"slots": []})
        src["homework"]["items"].append({"id": "p", "kind": "project", "title": "Big project", "due": "2026-10-30", "status": "todo"})
        plan = planner.build_day(src, MON)
        seq = [b for b in plan["blocks"] if b["kind"] in ("focus", "break")]
        for a, b in zip(seq, seq[1:]):
            self.assertFalse(a["kind"] == "focus" and b["kind"] == "focus" and a["end"] == b["start"],
                             f"two focus blocks without a break: {a['title']} / {b['title']}")
        self.assertIn("Long break", [b["title"] for b in seq])

    def test_today_starts_from_now_and_winds_down(self):
        now = dt.datetime(2026, 10, 26, 16, 2)
        plan = planner.build_day(sources(), MON, now)
        self.assertTrue(all(planner.hm(b["end"]) > 16 * 60 for b in plan["blocks"]))
        study = [b for b in plan["blocks"] if b["kind"] == "focus"]
        self.assertGreaterEqual(planner.hm(study[0]["start"]), 16 * 60 + 5)
        self.assertTrue(all(planner.hm(b["end"]) <= 22 * 60 for b in study))  # 22:30 sleep - 30 min wind down
        self.assertIn("Wind down: no screens", [b["title"] for b in plan["blocks"]])

    def test_routines_and_timed_todoist_tasks_are_fixed(self):
        src = sources(timetable={"slots": []}, todoist={"tasks": [
            {"id": "t1", "content": "Call grandma", "due": "2026-10-26", "time": "18:00", "minutes": 20, "priority": 1},
            {"id": "t2", "content": "Buy notebook", "due": "2026-10-26", "time": "", "priority": 4},
        ]})
        src["planner"]["config"]["routines"] = [{"id": "r", "title": "Dinner", "start": "19:00", "end": "19:40", "days": [0]}]
        src["config"] = planner.config_of(src["planner"])
        plan = planner.build_day(src, MON)
        by_title = {b["title"]: b for b in plan["blocks"]}
        self.assertEqual(by_title["Call grandma"]["kind"], "event")
        self.assertEqual((by_title["Call grandma"]["start"], by_title["Call grandma"]["end"]), ("18:00", "18:20"))
        self.assertEqual(by_title["Dinner"]["kind"], "routine")
        self.assertEqual(by_title["Buy notebook"]["kind"], "focus")  # untimed task goes into the pool

    def test_must_do_and_upcoming(self):
        src = sources(habits={"items": [{"id": "x", "name": "Read 20 pages", "days": {"2026-10-26": True}}]})
        must = planner.must_do(src, MON)
        titles = [m["title"] for m in must]
        self.assertIn("Essay draft", titles)            # overdue
        self.assertIn("Kinematics worksheet", titles)   # due tomorrow
        self.assertTrue(next(m for m in must if m["title"] == "Essay draft")["overdue"])
        self.assertTrue(next(m for m in must if m["source"] == "habit")["done"])
        up = planner.upcoming(src, MON)
        self.assertEqual(up[0]["title"], "Kinematics worksheet")

    def test_backpack(self):
        src = sources(planner={"config": {}, "backpack": {
            "always": ["Laptop"], "lessons": {"physics": ["Calculator", "Lab coat"], "Maths": ["Calculator"]}}})
        bag = planner.backpack(src, MON, packed={"Laptop": True})
        texts = [i["text"] for i in bag["items"]]
        self.assertEqual(texts.count("Calculator"), 1)       # no duplicates
        self.assertIn("Lab coat", texts)
        self.assertTrue(next(i for i in bag["items"] if i["text"] == "Laptop")["packed"])
        # Homework due that day is in the bag.
        src["homework"]["items"].append({"id": "h4", "title": "Lab report", "subject": "Physics", "due": "2026-10-26", "status": "todo"})
        self.assertIn("Hand in: Lab report", [i["text"] for i in planner.backpack(src, MON)["items"]])
        # Before the first lesson: today's bag. After school: the next school day.
        self.assertEqual(planner.backpack_day(src, dt.datetime(2026, 10, 26, 7, 0)), MON)
        self.assertEqual(planner.backpack_day(src, dt.datetime(2026, 10, 26, 18, 0)), MON + dt.timedelta(days=7))

    def test_now_info(self):
        blocks = [{"id": "a", "start": "10:00", "end": "10:50", "title": "A"}, {"id": "b", "start": "10:50", "end": "11:00", "title": "B"}]
        info = planner.now_info(blocks, dt.datetime(2026, 10, 26, 10, 30))
        self.assertEqual(info["current"]["id"], "a")
        self.assertEqual(info["next"]["id"], "b")
        self.assertEqual(info["left"], 20)


class PlannerStorageTests(unittest.TestCase):
    def test_plan_is_stored_and_rebuild_keeps_the_past(self):
        with TempApp() as t:
            st = t.app.storage
            morning = dt.datetime(2026, 10, 26, 6, 0)
            p1 = planner.get_day(st, MON, morning)
            again = planner.get_day(st, MON, morning)
            self.assertEqual([b["id"] for b in p1["blocks"]], [b["id"] for b in again["blocks"]])
            first = next(b for b in p1["blocks"] if b["kind"] == "focus")
            self.assertTrue(planner.set_block_state(st, MON, first["id"], "done"))
            later = dt.datetime(2026, 10, 26, 15, 0)
            p2 = planner.get_day(st, MON, later, rebuild=True)
            ids = [b["id"] for b in p2["blocks"]]
            self.assertIn(first["id"], ids)  # done block kept
            self.assertTrue(all(planner.hm(b["end"]) <= 15 * 60 or planner.hm(b["start"]) >= 15 * 60 or b.get("state") == "done"
                                for b in p2["blocks"]))

    def test_api_routes(self):
        with TempApp() as t:
            s, plan = t.req("GET", "/api/plan?date=2026-10-26")
            self.assertEqual(s, 200)
            self.assertTrue(plan["blocks"])
            b = plan["blocks"][0]
            self.assertEqual(t.req("POST", "/api/plan/block", {"date": "2026-10-26", "id": b["id"], "state": "skipped"})[0], 200)
            self.assertEqual(t.req("POST", "/api/plan/block", {"date": "2026-10-26", "id": "nope", "state": "done"})[0], 404)
            self.assertEqual(t.req("POST", "/api/plan/block", {"date": "2026-10-26", "id": b["id"], "state": "weird"})[0], 400)
            self.assertEqual(t.req("GET", "/api/plan?date=not-a-date")[0], 400)
            self.assertEqual(t.req("POST", "/api/plan/block", ["not", "an", "object"])[0], 400)
            s, bag = t.req("GET", "/api/backpack?date=2026-10-26")
            self.assertEqual(s, 200)
            self.assertEqual(t.req("POST", "/api/backpack", {"date": "2026-10-26", "text": "Calculator", "packed": True})[0], 200)
            s, bag = t.req("GET", "/api/backpack?date=2026-10-26")
            self.assertTrue(any(i["packed"] for i in bag["items"] if i["text"] == "Calculator"))
            s, now = t.req("GET", "/api/now")
            self.assertEqual(s, 200)
            self.assertIn("text", now)

    def test_settings_are_validated(self):
        with TempApp() as t:
            s, r = t.req("PUT", "/api/plan/settings", {"config": {"wake": "7:05", "focus": 999, "routines": [
                {"title": "Gym", "start": "18:00", "end": "19:00", "days": [1, 3, "9", "x"]},
                {"title": "Broken", "start": "19:00", "end": "18:00"}]},
                "backpack": {"always": ["Laptop", ""], "lessons": {"Physics": ["Calculator"], "Empty": []}}})
            self.assertEqual(s, 200)
            self.assertEqual(r["config"]["wake"], "07:05")
            self.assertEqual(r["config"]["focus"], 120)
            self.assertEqual([x["title"] for x in r["config"]["routines"]], ["Gym"])
            self.assertEqual(r["config"]["routines"][0]["days"], [1, 3])
            self.assertEqual(r["backpack"], {"always": ["Laptop"], "lessons": {"Physics": ["Calculator"]}})
            self.assertEqual(t.req("PUT", "/api/plan/settings", {"config": {"sleep": "late"}})[0], 400)
            # Planned days are kept when settings change.
            t.req("GET", "/api/plan?date=2026-10-26")
            t.req("PUT", "/api/plan/settings", {"config": {"focus": 40}})
            self.assertIn("2026-10-26", t.app.storage.read("planner")["days"])
            s, r = t.req("PUT", "/api/focus/config", {"config": {"enabled": True, "mode": "nuke", "tone": "calm",
                                                                 "rules": [{"type": "app", "pattern": "steam"}, {"pattern": ""}]}})
            self.assertEqual(s, 200)
            self.assertEqual((r["config"]["enabled"], r["config"]["mode"], r["config"]["tone"]), (True, "strict", "calm"))
            self.assertEqual(r["config"]["rules"], [{"type": "app", "pattern": "steam", "label": "steam"}])

    def test_finish_homework_from_plan(self):
        with TempApp() as t:
            s, _ = t.req("POST", "/api/plan/finish", {"source": "homework", "id": "s1"})
            self.assertEqual(s, 200)
            hw = t.app.storage.read("homework")["items"]
            self.assertEqual(next(i for i in hw if i["id"] == "s1")["status"], "done")
            self.assertEqual(t.req("POST", "/api/plan/finish", {"source": "homework", "id": "missing"})[0], 404)
            self.assertEqual(t.req("POST", "/api/plan/finish", {"source": "evil", "id": "x"})[0], 400)


if __name__ == "__main__":
    unittest.main()
