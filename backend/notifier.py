"""Desktop notifications that follow the day plan.

Checked every few seconds by the server:
- a block starts      -> "Now: Physics homework (50 min). Next: Break"
- a break starts      -> "Break: 10 min. Stand up, drink water, look away."
- 5 min before a lesson -> "Physics in 5 min (Room 12). Bring: calculator"
- wind-down / bedtime -> "Time to wind down" / "Sleep now"

Each message is sent once (remembered per day in memory; after a restart only
blocks that started in the last 90 seconds are announced).
"""

import datetime as dt

from . import planner

BREAK_TIPS = [
    "Stand up, drink water, look out of the window.",
    "Walk around for a minute. No phone.",
    "Stretch your back and neck. Water.",
    "Eyes off the screen. Breathe slowly for a minute.",
]


class PlanNotifier:
    def __init__(self, storage, notify, clock=dt.datetime.now):
        self.storage = storage
        self.notify = notify
        self.clock = clock
        self.sent = set()
        self.day = None

    def tick(self):
        settings = self.storage.read("settings")
        if settings.get("planNotify", True) is False:
            return []
        now = self.clock()
        if self.day != now.date():
            self.day, self.sent = now.date(), set()
        plan = planner.get_day(self.storage, now.date(), now)
        blocks = [b for b in plan["blocks"] if b.get("state") != "skipped"]
        t = now.hour * 60 + now.minute + now.second / 60
        out = []
        for i, b in enumerate(blocks):
            start = planner.hm(b["start"])
            nxt = blocks[i + 1] if i + 1 < len(blocks) else None
            length = planner.hm(b["end"]) - start
            # Heads-up 5 minutes before a lesson.
            if b["kind"] == "lesson" and 0 <= start - t <= 5 and ("pre", b["id"]) not in self.sent:
                self.sent.add(("pre", b["id"]))
                bag = planner.get_backpack(self.storage, now.date(), now)
                bring = [x["text"] for x in bag["items"] if x["for"] == b["title"]][:4]
                body = f"{b['title']} starts at {b['start']}" + (f" ({b['sub']})" if b.get("sub") else "") + "."
                if bring:
                    body += " Bring: " + ", ".join(bring)
                out.append(("Lesson in 5 min", body, "normal"))
            # The block starts now.
            if 0 <= t - start <= 1.5 and ("start", b["id"]) not in self.sent:
                self.sent.add(("start", b["id"]))
                if b["kind"] == "break" and b["title"] == "Break between lessons":
                    pass  # the school bell does this
                elif b["kind"] == "break":
                    tip = BREAK_TIPS[len(self.sent) % len(BREAK_TIPS)]
                    out.append((f"{b['title']}: {length} min", tip + (f" Next: {nxt['title']}." if nxt else ""), "normal"))
                elif b["kind"] == "focus":
                    out.append((f"Now: {b['title']}", f"{length} min focus" + (f" ({b['sub']})" if b.get("sub") else "")
                                + (f". Then: {nxt['title']}" if nxt else ""), "normal"))
                elif b["kind"] == "sleep":
                    out.append(("Sleep now", "Phone away, lights off. " + (b.get("sub") or ""), "critical"))
                elif b["kind"] == "routine" and b["title"].startswith("Wind down"):
                    out.append(("Time to wind down", "Stop studying. Pack your bag for tomorrow and get ready for bed.", "normal"))
        for title, body, urgency in out:
            self.notify(title, body, urgency)
        return out
