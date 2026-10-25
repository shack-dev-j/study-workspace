"""Daily planner (v2): turns lessons, routines and tasks into time blocks.

How a day is built (build_day):
1. Fixed blocks: lessons from the timetable, routines (breakfast, dinner, ...)
   and Todoist tasks that have a time. Short gaps between lessons become
   "break" blocks (you are still at school).
2. Free gaps between wake-up time (or "now") and the wind-down before sleep.
3. A task pool: homework, Todoist tasks, application deadlines, today's
   cyber task, today's SAT practice and the weakest subject topic. Each task
   gets a score from how soon it is due and its priority.
4. Gaps are filled with focus blocks (default 50 min) in score order, with a
   short break after each focus block and a long break after every third.

The plan for a day is stored in data/planner.json (days[date]) so it does not
reshuffle every time the page opens. "Rebuild" keeps the blocks that already
ended and plans the rest of the day again.

Everything here is pure Python and has no side effects, except the
functions at the bottom that read and write Storage.
"""

import datetime as dt
import hashlib

WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

DEFAULT_CONFIG = {
    "wake": "06:30",
    "sleep": "22:30",
    "focus": 50,          # minutes of one focus block
    "short_break": 10,
    "long_break": 25,
    "long_every": 3,      # a long break after this many focus blocks
    "min_block": 20,      # gaps shorter than this are left free
    "wind_down": 30,      # no study in the last minutes before sleep
    "max_per_task": 100,  # at most this many minutes of one task per day
    "school_gap": 45,     # gaps between lessons shorter than this are breaks
    "after_school": 30,   # rest after the last lesson before studying again
    "study_before_school": False,
    "routines": [
        {"id": "r-breakfast", "title": "Breakfast", "start": "06:45", "end": "07:10", "days": [0, 1, 2, 3, 4, 5, 6]},
        {"id": "r-school", "title": "Get ready for school", "start": "07:10", "end": "07:50", "days": [0, 1, 2, 3, 4]},
        {"id": "r-lunch", "title": "Lunch", "start": "13:00", "end": "13:40", "days": [0, 1, 2, 3, 4, 5, 6]},
        {"id": "r-dinner", "title": "Dinner", "start": "19:00", "end": "19:40", "days": [0, 1, 2, 3, 4, 5, 6]},
    ],
}

DEFAULT_MINUTES = {"homework": 45, "assignment": 90, "project": 120}
PRIORITY_POINTS = {"high": 25, "normal": 10, "low": 0}
TODOIST_POINTS = {4: 40, 3: 25, 2: 10, 1: 0}   # Todoist: 4 = p1 (very urgent)
MUST_DO_SCORE = 60


# ---------- small helpers ----------
def hm(s, default=None):
    """'07:30' -> 450 (minutes after midnight). Bad input -> default."""
    try:
        h, m = str(s).strip().split(":")[:2]
        v = int(h) * 60 + int(m)
        return v if 0 <= v <= 24 * 60 else default
    except (ValueError, AttributeError):
        return default


def fmt(m):
    m = max(0, min(24 * 60, int(m)))
    return f"{m // 60:02d}:{m % 60:02d}"


def parse_date(s):
    try:
        return dt.date.fromisoformat(str(s)[:10])
    except (TypeError, ValueError):
        return None


def days_until(due, day):
    d = parse_date(due)
    return None if d is None else (d - day).days


def urgency(days):
    """Points for how soon something is due (days from the planned day)."""
    if days is None:
        return 5
    if days < 0:
        return 100
    if days == 0:
        return 80
    if days == 1:
        return 60
    if days <= 3:
        return 40
    if days <= 7:
        return 20
    return 5


def config_of(planner_data):
    cfg = dict(DEFAULT_CONFIG)
    cfg.update({k: v for k, v in (planner_data.get("config") or {}).items() if v not in (None, "")})
    return cfg


def _id(*parts):
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:10]


def when_text(days):
    if days is None:
        return "no due date"
    if days < 0:
        return f"overdue {-days} day{'s' if days != -1 else ''}"
    if days == 0:
        return "due today"
    if days == 1:
        return "due tomorrow"
    return f"due in {days} days"


# ---------- sources ----------
def lessons_for(timetable, day):
    """Timetable slots for this date, sorted by start."""
    wd = day.weekday()
    out = []
    for s in timetable.get("slots", []) or []:
        try:
            if int(s.get("day", -1)) != wd:
                continue
        except (TypeError, ValueError):
            continue
        a, b = hm(s.get("start")), hm(s.get("end"))
        if a is None or b is None or b <= a:
            continue
        out.append({"start": a, "end": b, "title": s.get("title") or "Lesson", "room": s.get("room") or "", "id": s.get("id")})
    return sorted(out, key=lambda x: x["start"])


def todoist_tasks(todoist):
    return [t for t in (todoist.get("tasks") or []) if not t.get("checked")]


def task_pool(sources, day, done_minutes=None):
    """Everything that could be worked on during the day, best first."""
    done_minutes = done_minutes or {}
    pool = []
    cfg = sources["config"]

    def add(key, minutes, **kw):
        left = int(minutes) - int(done_minutes.get(key, 0))
        left = min(left, int(cfg["max_per_task"]))
        if left >= 10:
            pool.append({"key": key, "minutes": left, **kw})

    for it in sources["homework"].get("items", []) or []:
        if it.get("status") == "done" or it.get("sample") and sources.get("skip_samples"):
            continue
        days = days_until(it.get("due"), day)
        kind = it.get("kind") or "homework"
        minutes = it.get("minutes") or DEFAULT_MINUTES.get(kind, 45)
        score = urgency(days) + PRIORITY_POINTS.get(it.get("priority") or "normal", 10) + (5 if kind == "project" else 0)
        add("homework:" + str(it.get("id")), minutes, source="homework", id=it.get("id"),
            title=it.get("title") or "Homework", sub=it.get("subject") or kind.title(),
            due=it.get("due") or "", score=score, why=when_text(days),
            priority=it.get("priority") or "normal")

    for t in todoist_tasks(sources["todoist"]):
        if t.get("time"):  # has a fixed time -> it is an event, not a pool task
            continue
        days = days_until(t.get("due"), day)
        if days is not None and days > 7 and t.get("priority", 1) < 3:
            continue
        score = urgency(days) + TODOIST_POINTS.get(int(t.get("priority") or 1), 0)
        add("todoist:" + str(t.get("id")), t.get("minutes") or 30, source="todoist", id=t.get("id"),
            title=t.get("content") or "Todoist task", sub=t.get("project") or "Todoist",
            due=t.get("due") or "", score=score, why=when_text(days),
            priority={4: "high", 3: "high", 2: "normal"}.get(int(t.get("priority") or 1), "low"))

    # Application deadlines in the next 14 days (universities, scholarships, own).
    for module, items, title_key, label in (
            ("universities", sources["universities"].get("items", []), "name", "Application"),
            ("scholarships", sources["scholarships"].get("items", []), "name", "Scholarship"),
            ("deadlines", sources["deadlines"].get("items", []), "title", "Deadline")):
        for it in items or []:
            if it.get("done") or it.get("status") in ("Applied", "Offer", "Rejected", "Accepted"):
                continue
            due = it.get("early_deadline") or it.get("deadline") or it.get("date")
            days = days_until(due, day)
            if days is None or days < 0 or days > 14:
                continue
            add(f"{module}:{it.get('id')}", 50, source=module, id=it.get("id"),
                title=f"Work on: {it.get(title_key) or label}", sub=label, due=due,
                score=55 - days * 2, why=when_text(days), priority="normal")

    # Today's cyber task (first open task of this week's plan).
    plan = (sources["cyber"].get("plan") or {})
    iso = day.isoformat()
    for w in plan.get("weeks") or []:
        start = parse_date(w.get("start"))
        if start and start <= day <= start + dt.timedelta(days=6):
            task = next((t for t in w.get("tasks") or [] if not t.get("done")), None)
            if task:
                add("cyber:" + str(task.get("id")), plan.get("minutesPerDay") or 45, source="cyber",
                    id=task.get("id"), title=task.get("text") or "Cyber practice", sub="ICO training",
                    due="", score=30, why="this week's cyber plan", priority="normal")
            break

    # SAT practice for this weekday.
    sat_text = ((sources["sat"].get("weeklyPlan") or {}).get(WEEKDAY_KEYS[day.weekday()]) or "").strip()
    if sat_text:
        sat_days = days_until(sources["settings"].get("satDate"), day)
        bonus = 20 if sat_days is not None and 0 <= sat_days <= 60 else 0
        add("sat:" + iso, 40, source="sat", id=iso, title="SAT: " + sat_text, sub="Digital SAT",
            due="", score=30 + bonus, why=(f"SAT in {sat_days} days" if sat_days is not None and sat_days >= 0 else "SAT plan"),
            priority="normal")

    # Weakest subject topic (lowest confidence, not reviewed recently).
    weakest = None
    for subj in sources["subjects"].get("items", []) or []:
        for t in subj.get("topics", []) or []:
            c = int(t.get("confidence") or 0)
            if weakest is None or c < weakest[0]:
                weakest = (c, subj, t)
    if weakest and weakest[0] < 4:
        c, subj, t = weakest
        add("topic:" + str(t.get("id")), 30, source="topic", id=t.get("id"), subject_id=subj.get("id"),
            title=f"Review: {t.get('name')}", sub=subj.get("name") or "Subject", due="", score=15,
            why=f"weakest topic (level {c})", priority="low")

    pool.sort(key=lambda x: (-x["score"], x.get("due") or "9999", x["title"]))
    return pool


def fixed_blocks(sources, day, cfg):
    """Lessons, routines and timed Todoist tasks for the day."""
    wd = day.weekday()
    out = []
    lessons = lessons_for(sources["timetable"], day)
    for l in lessons:
        out.append({"kind": "lesson", "start": l["start"], "end": l["end"], "title": l["title"],
                    "sub": l["room"] and f"Room {l['room']}", "ref": {"source": "timetable", "id": l["id"]}})
    # Gaps between lessons: breaks (you are still at school) or, if long, free gaps.
    for a, b in zip(lessons, lessons[1:]):
        if 0 < b["start"] - a["end"] < int(cfg["school_gap"]):
            out.append({"kind": "break", "start": a["end"], "end": b["start"], "title": "Break between lessons", "sub": ""})
    for r in cfg.get("routines") or []:
        days = r.get("days")
        if days is not None and wd not in [int(x) for x in days]:
            continue
        a, b = hm(r.get("start")), hm(r.get("end"))
        if a is None or b is None or b <= a:
            continue
        out.append({"kind": "routine", "start": a, "end": b, "title": r.get("title") or "Routine", "sub": "",
                    "ref": {"source": "routine", "id": r.get("id")}})
    for t in todoist_tasks(sources["todoist"]):
        if t.get("time") and parse_date(t.get("due")) == day:
            a = hm(t["time"])
            if a is None:
                continue
            out.append({"kind": "event", "start": a, "end": min(a + int(t.get("minutes") or 30), 24 * 60),
                        "title": t.get("content") or "Todoist task", "sub": t.get("project") or "Todoist",
                        "ref": {"source": "todoist", "id": t.get("id")}})
    out.sort(key=lambda b: (b["start"], b["end"]))
    # Remove overlaps: an earlier block wins (lessons were added first at equal start).
    clean = []
    for b in out:
        if clean and b["start"] < clean[-1]["end"]:
            if b["end"] <= clean[-1]["end"]:
                continue
            b = dict(b, start=clean[-1]["end"])
            if b["end"] - b["start"] < 5:
                continue
        clean.append(b)
    return clean


def gaps(fixed, start, end):
    """Free (start, end) intervals between start and end not covered by fixed blocks."""
    out, t = [], start
    for b in fixed:
        if b["end"] <= t:
            continue
        if b["start"] >= end:
            break
        if b["start"] > t:
            out.append((t, min(b["start"], end)))
        t = max(t, b["end"])
    if t < end:
        out.append((t, end))
    return out


def fill(gap_list, pool, cfg):
    """Put focus blocks and breaks into the gaps. Returns (blocks, unplanned)."""
    blocks = []
    pool = [dict(p) for p in pool]
    focus, short_b, long_b = int(cfg["focus"]), int(cfg["short_break"]), int(cfg["long_break"])
    long_every, min_block = max(1, int(cfg["long_every"])), int(cfg["min_block"])
    count = 0
    for a, b in gap_list:
        t = a
        while b - t >= min_block and pool:
            task = pool[0]
            length = min(focus, task["minutes"], b - t)
            if length < min_block and task["minutes"] >= min_block:
                break
            rest = task["minutes"] - length
            if 0 < rest < min_block and length + rest <= min(b - t, focus + 15):
                length += rest  # finish it now instead of leaving a tiny piece
            blocks.append({"kind": "focus", "start": t, "end": t + length, "title": task["title"], "sub": task["sub"],
                           "ref": {"source": task["source"], "id": task["id"]}, "key": task["key"],
                           "why": task.get("why", ""), "priority": task.get("priority", "normal")})
            t += length
            task["minutes"] -= length
            if task["minutes"] < 10:
                pool.pop(0)
            count += 1
            brk = long_b if count % long_every == 0 else short_b
            # A break only if there is room for more work after it in this gap.
            if pool and b - (t + brk) >= min_block:
                blocks.append({"kind": "break", "start": t, "end": t + brk,
                               "title": "Long break" if brk == long_b else "Break", "sub": ""})
                t += brk
        if b - t >= 5:
            blocks.append({"kind": "free", "start": t, "end": b, "title": "Free time", "sub": ""})
    return blocks, pool


def build_day(sources, day, now=None):
    """Build the plan for `day`. `now` (datetime) limits today's plan to the rest of the day."""
    cfg = sources["config"]
    wake, sleep = hm(cfg["wake"], 390), hm(cfg["sleep"], 1350)
    if sleep <= wake:
        sleep = 24 * 60
    study_end = max(wake, sleep - int(cfg["wind_down"]))
    start = wake
    if now is not None and now.date() == day:
        start = max(wake, (now.hour * 60 + now.minute + 4) // 5 * 5)
    all_fixed = fixed_blocks(sources, day, cfg)
    lessons = [b for b in all_fixed if b["kind"] == "lesson"]
    if lessons and cfg.get("after_school"):
        a = lessons[-1]["end"]
        rest = {"kind": "routine", "start": a, "end": min(a + int(cfg["after_school"]), 24 * 60),
                "title": "Rest after school", "sub": "Snack, water, short walk"}
        if not any(b["start"] < rest["end"] and b["end"] > rest["start"] for b in all_fixed):
            all_fixed.append(rest)
            all_fixed.sort(key=lambda b: (b["start"], b["end"]))
    fixed = [b for b in all_fixed if b["end"] > start]
    blocks = [dict(b) for b in fixed]
    pool = task_pool(sources, day, sources.get("done_minutes"))
    study_gaps = gaps(fixed, start, study_end)
    if lessons and not cfg.get("study_before_school"):
        # Mornings before school are for getting ready and travelling.
        study_gaps = [(a, b) for a, b in study_gaps if a >= lessons[0]["start"]]
    focus_blocks, left = fill(study_gaps, pool, cfg)
    blocks += focus_blocks
    if cfg.get("wind_down") and study_end < sleep and study_end >= start:
        blocks.append({"kind": "routine", "start": study_end, "end": sleep, "title": "Wind down: no screens", "sub": "Pack your bag, read, sleep on time"})
    if sleep < 24 * 60:
        blocks.append({"kind": "sleep", "start": sleep, "end": 24 * 60, "title": "Sleep", "sub": f"Wake up {cfg['wake']}"})
    blocks.sort(key=lambda b: (b["start"], b["end"]))
    for b in blocks:
        b["id"] = _id(day, b["kind"], b["start"], b.get("key") or b["title"])
        b["start"], b["end"] = fmt(b["start"]), fmt(b["end"])
    unplanned = [{k: p[k] for k in ("title", "sub", "minutes", "why", "source", "id")} for p in left]
    return {"date": day.isoformat(), "blocks": blocks, "unplanned": unplanned,
            "built_at": (now or dt.datetime.now()).strftime("%Y-%m-%dT%H:%M")}


def must_do(sources, day):
    """Things that really have to happen today."""
    out = []
    for p in task_pool(sources, day):
        if p["score"] >= MUST_DO_SCORE:
            out.append({"title": p["title"], "sub": p["sub"], "why": p["why"], "source": p["source"], "id": p["id"],
                        "key": p["key"], "overdue": p["why"].startswith("overdue")})
    iso = day.isoformat()
    for hb in sources["habits"].get("items", []) or []:
        out.append({"title": hb.get("name") or "Habit", "sub": "Habit", "why": "daily habit", "source": "habit",
                    "id": hb.get("id"), "key": "habit:" + str(hb.get("id")), "done": bool((hb.get("days") or {}).get(iso))})
    return out


# ---------- backpack ----------
def backpack_day(sources, now):
    """The school day the bag is for: today before the first lesson, else the next day with lessons."""
    today = now.date()
    lessons = lessons_for(sources["timetable"], today)
    if lessons and now.hour * 60 + now.minute < lessons[0]["start"]:
        return today
    for k in range(1, 8):
        d = today + dt.timedelta(days=k)
        if lessons_for(sources["timetable"], d):
            return d
    return today + dt.timedelta(days=1)


def _match(lesson_title, key):
    a, b = lesson_title.strip().lower(), key.strip().lower()
    return bool(a and b) and (a == b or b in a or a in b)


def backpack(sources, day, packed=None):
    """What to pack for `day`: every-day items, items per lesson, homework to hand in."""
    bag = sources["planner"].get("backpack") or {}
    packed = packed or {}
    items, seen = [], set()

    def add(text, for_, kind="item"):
        k = text.strip().lower()
        if not k or k in seen:
            return
        seen.add(k)
        items.append({"text": text.strip(), "for": for_, "kind": kind, "packed": bool(packed.get(text.strip()))})

    lessons = lessons_for(sources["timetable"], day)
    if lessons:
        for t in bag.get("always") or []:
            add(t, "Every day")
    titles = []
    for l in lessons:
        if l["title"] not in titles:
            titles.append(l["title"])
    for title in titles:
        for key, things in (bag.get("lessons") or {}).items():
            if _match(title, key):
                for t in things or []:
                    add(t, title)
    for it in sources["homework"].get("items", []) or []:
        if it.get("status") != "done" and parse_date(it.get("due")) == day:
            add(f"Hand in: {it.get('title')}", it.get("subject") or "Homework", "handin")
    return {"date": day.isoformat(), "lessons": [{"title": l["title"], "start": fmt(l["start"]), "end": fmt(l["end"]), "room": l["room"]} for l in lessons],
            "items": items}


def upcoming(sources, day, horizon=10):
    """What is coming in the next `horizon` days (to prepare for)."""
    out = []

    def add(date, title, kind, sub=""):
        d = parse_date(date)
        if d is None:
            return
        n = (d - day).days
        if 0 <= n <= horizon:
            out.append({"date": d.isoformat(), "days": n, "title": title, "kind": kind, "sub": sub})

    for it in sources["homework"].get("items", []) or []:
        if it.get("status") != "done":
            add(it.get("due"), it.get("title") or "Homework", it.get("kind") or "homework", it.get("subject") or "")
    for it in sources["deadlines"].get("items", []) or []:
        if not it.get("done"):
            add(it.get("date"), it.get("title") or "Deadline", "deadline")
    for it in sources["universities"].get("items", []) or []:
        if it.get("status") not in ("Applied", "Offer", "Rejected", "Accepted"):
            add(it.get("early_deadline") or it.get("deadline"), f"{it.get('name')} application", "deadline")
    for it in sources["scholarships"].get("items", []) or []:
        add(it.get("deadline"), f"{it.get('name')} deadline", "deadline")
    for t in todoist_tasks(sources["todoist"]):
        add(t.get("due"), t.get("content") or "Todoist task", "todoist", t.get("project") or "")
    st = sources["settings"]
    add(st.get("satDate"), "SAT test day", "exam")
    add(st.get("icoDate"), "ICO selection", "exam")
    out.sort(key=lambda x: (x["date"], x["title"]))
    return out[:30]


def now_info(blocks, now):
    """Current block, next block and minutes left (blocks from build_day)."""
    t = now.hour * 60 + now.minute + now.second / 60
    cur = nxt = None
    for b in blocks:
        a, e = hm(b["start"]), hm(b["end"])
        if a <= t < e and cur is None and b.get("state") != "skipped":
            cur = b
        elif a > t and nxt is None and b.get("state") != "skipped":
            nxt = b
    left = None
    if cur:
        left = int(hm(cur["end"]) - t + 0.999)
    return {"current": cur, "next": nxt, "left": left}


# ---------- storage glue ----------
SOURCE_MODULES = ["settings", "timetable", "homework", "universities", "scholarships", "deadlines",
                  "cyber", "sat", "subjects", "habits", "todoist", "planner"]


def load_sources(storage):
    src = {m: storage.read(m) for m in SOURCE_MODULES}
    src["config"] = config_of(src["planner"])
    return src


def _done_minutes(day_state):
    out = {}
    for b in day_state.get("blocks", []):
        if b.get("state") == "done" and b.get("key"):
            out[b["key"]] = out.get(b["key"], 0) + hm(b["end"]) - hm(b["start"])
    return out


def get_day(storage, day, now=None, rebuild=False):
    """Return the stored plan for `day` (building it the first time) plus live extras."""
    now = now or dt.datetime.now()
    src = load_sources(storage)
    iso = day.isoformat()
    state = (src["planner"].get("days") or {}).get(iso)
    if state is None or "blocks" not in state or rebuild:
        kept = []
        if state and day == now.date():
            t = now.hour * 60 + now.minute
            kept = [b for b in state.get("blocks", []) if hm(b["end"]) <= t or b.get("state") == "done"]
        src["done_minutes"] = _done_minutes({"blocks": kept})
        built = build_day(src, day, now if day == now.date() else None)
        kept_ids = {b["id"] for b in kept}
        last_kept = max([hm(b["end"]) for b in kept], default=0)
        new_blocks = kept + [b for b in built["blocks"] if b["id"] not in kept_ids and hm(b["start"]) >= last_kept]
        new_state = {"blocks": new_blocks, "unplanned": built["unplanned"], "built_at": built["built_at"],
                     "packed": (state or {}).get("packed", {})}

        def save(data):
            days = data.setdefault("days", {})
            days[iso] = new_state
            # Keep only the last 60 days of plans.
            for k in sorted(days)[:-60]:
                del days[k]
        storage.update("planner", save)
        state = new_state
    return {
        "date": iso,
        "blocks": state.get("blocks", []),
        "unplanned": state.get("unplanned", []),
        "built_at": state.get("built_at"),
        "now": now_info(state.get("blocks", []), now) if day == now.date() else None,
        "must_do": must_do(src, day),
        "upcoming": upcoming(src, day),
        "config": src["config"],
    }


def set_block_state(storage, day, block_id, state):
    """Mark a block done / skipped / back to open. Returns True if found."""
    iso = day.isoformat()
    found = []

    def change(data):
        for b in ((data.get("days") or {}).get(iso) or {}).get("blocks", []):
            if b.get("id") == block_id:
                if state in ("done", "skipped"):
                    b["state"] = state
                else:
                    b.pop("state", None)
                found.append(b)
    storage.update("planner", change)
    return bool(found)


def get_backpack(storage, day=None, now=None):
    now = now or dt.datetime.now()
    src = load_sources(storage)
    day = day or backpack_day(src, now)
    packed = (((src["planner"].get("days") or {}).get(day.isoformat())) or {}).get("packed", {})
    return backpack(src, day, packed)


def set_packed(storage, day, text, value):
    iso = day.isoformat()

    def change(data):
        st = data.setdefault("days", {}).setdefault(iso, {})
        p = st.setdefault("packed", {})
        if value:
            p[text] = True
        else:
            p.pop(text, None)
    storage.update("planner", change)
