"""Focus mode: which windows are touched, warn / strict / hard, never protected apps."""

import datetime as dt
import json
import unittest

from backend import focus
from tests.helpers import TempApp


class FakeHypr:
    """Pretends to be hyprctl."""

    def __init__(self, windows, active=None):
        self.windows = windows
        self.active = active
        self.closed = []

    def __call__(self, args):
        if args == ["version"]:
            return "Hyprland"
        if args == ["-j", "clients"]:
            return json.dumps(self.windows)
        if args == ["-j", "activewindow"]:
            return json.dumps({"address": self.active} if self.active else {})
        if args[0] == "dispatch" and args[1] == "closewindow":
            addr = args[2].split(":", 1)[1]
            self.closed.append(addr)
            self.windows = [w for w in self.windows if w["address"] != addr]
            return "ok"
        return None


def win(addr, cls, title=""):
    return {"address": addr, "class": cls, "initialClass": cls, "title": title}


class RuleTests(unittest.TestCase):
    def test_match_rules(self):
        rules = focus.DEFAULT_CONFIG["rules"]
        self.assertEqual(focus.match_rule(win("0x1", "steam"), rules)["label"], "Steam")
        self.assertEqual(focus.match_rule(win("0x2", "firefox", "Lo-fi - YouTube"), rules)["label"], "YouTube")
        self.assertIsNone(focus.match_rule(win("0x3", "kitty", "nvim"), rules))
        # Protected windows never match, even if a rule would.
        for cls in ("study-workspace", "quickshell", "Hyprland", "caelestia-shell"):
            self.assertIsNone(focus.match_rule(win("0x4", cls, "YouTube"), [{"type": "title", "pattern": "youtube"}] + rules))

    def test_close_needs_a_real_address(self):
        fake = FakeHypr([])
        self.assertFalse(focus.close_window("0x1; rm -rf ~", fake))
        self.assertFalse(focus.close_window("", fake))
        self.assertTrue(focus.close_window("0xabc", fake))


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.t = TempApp().__enter__()
        self.sent = []
        self.now = [dt.datetime(2026, 10, 26, 16, 0)]

    def tearDown(self):
        self.t.__exit__(None, None, None)

    def engine(self, fake, **cfg):
        def setcfg(data):
            data["config"] = {**focus.DEFAULT_CONFIG, "enabled": True, "auto_plan": False, **cfg}
        self.t.app.storage.update("focus", setcfg)
        return focus.FocusEngine(self.t.app.storage, lambda *a: self.sent.append(a), run=fake, clock=lambda: self.now[0])

    def test_off_does_nothing(self):
        fake = FakeHypr([win("0x1", "steam")])
        e = self.engine(fake, enabled=False)
        e.start(30, "Physics")
        self.assertEqual(e.tick()["state"], "off")
        self.assertEqual(fake.closed, [])

    def test_warn_mode_never_closes(self):
        fake = FakeHypr([win("0x1", "steam")])
        e = self.engine(fake, mode="warn")
        e.start(30, "Physics homework")
        e.tick()
        self.assertEqual(fake.closed, [])
        self.assertEqual(len(self.sent), 1)
        self.assertIn("Physics homework", self.sent[0][1])
        e.tick()  # rate limited: no second warning right away
        self.assertEqual(len(self.sent), 1)

    def test_strict_mode_warns_then_closes(self):
        fake = FakeHypr([win("0x1", "steam"), win("0x2", "kitty")])
        e = self.engine(fake, mode="strict", grace=0)
        e.start(30, "Maths")
        e.tick()
        self.assertEqual(fake.closed, [])        # first a warning
        e.tick()
        self.assertEqual(fake.closed, ["0x1"])   # then closed; kitty untouched
        data = self.t.app.storage.read("focus")
        self.assertEqual(data["active"]["closed"], 1)

    def test_hard_mode_closes_at_once_but_title_rules_only_warn(self):
        fake = FakeHypr([win("0x1", "discord"), win("0x2", "firefox", "Cats - YouTube")], active="0x2")
        e = self.engine(fake, mode="hard")
        e.start(30, "CS project")
        e.tick()
        self.assertEqual(fake.closed, ["0x1"])
        self.assertTrue(any("YouTube" in s[1] for s in self.sent))  # browser warned, not closed

    def test_background_browser_tab_is_ignored(self):
        fake = FakeHypr([win("0x2", "firefox", "Cats - YouTube"), win("0x3", "kitty")], active="0x3")
        e = self.engine(fake, mode="hard")
        e.start(30, "CS")
        e.tick()
        self.assertEqual((fake.closed, self.sent), ([], []))

    def test_session_ends_and_is_logged(self):
        fake = FakeHypr([])
        e = self.engine(fake)
        e.start(25, "Essay")
        self.now[0] += dt.timedelta(minutes=30)
        e.tick()
        data = self.t.app.storage.read("focus")
        self.assertIsNone(data["active"])
        self.assertEqual(data["sessions"][-1]["minutes"], 25)
        self.assertEqual(focus.stats(data, self.now[0].date())["minutes"], 25)

    def test_auto_focus_during_plan_block(self):
        fake = FakeHypr([])
        e = self.engine(fake, auto_plan=True)
        e.plan_now = lambda: {"id": "b1", "kind": "focus", "title": "Kinematics", "end": "16:50"}
        e.tick()
        a = self.t.app.storage.read("focus")["active"]
        self.assertEqual((a["title"], a["auto"]), ("Kinematics", True))
        e.stop()
        e.tick()  # stopped by hand: not restarted for the same block
        self.assertIsNone(self.t.app.storage.read("focus")["active"])

    def test_nag_outside_focus(self):
        fake = FakeHypr([win("0x1", "steam")], active="0x1")
        e = self.engine(fake, nag=True)
        e.overdue = lambda: ["Essay draft"]
        self.assertEqual(e.tick()["state"], "nag")
        self.assertIn("Essay draft", self.sent[-1][1])
        self.assertEqual(fake.closed, [])

    def test_api(self):
        s, d = self.t.req("GET", "/api/focus")
        self.assertEqual(s, 200)
        self.assertFalse(d["config"]["enabled"])
        self.assertEqual(self.t.req("POST", "/api/focus/start", {"minutes": 20, "title": "Read"})[0], 200)
        self.assertEqual(self.t.req("GET", "/api/focus")[1]["active"]["title"], "Read")
        self.assertEqual(self.t.req("POST", "/api/focus/stop", {})[0], 200)
        self.assertIsNone(self.t.req("GET", "/api/focus")[1]["active"])


if __name__ == "__main__":
    unittest.main()
