"""Deadline reminders, shown in the app and sent with notify-send.

Homework: due tomorrow, due today, overdue.
Applications (universities, scholarships, custom deadlines): 30, 14, 7 days,
1 day and the day itself.
What was sent is remembered in data/reminders.json, so each step is sent
only once.
"""

import datetime as dt
import shutil
import subprocess
import time

HOMEWORK_STEPS = (1, 0, -1)
APP_STEPS = (30, 14, 7, 1, 0)
DONE_APP_STATUS = {"Applied", "Offer", "Rejected", "Accepted"}


def _date(s):
    try:
        return dt.date.fromisoformat(str(s)[:10])
    except (TypeError, ValueError):
        return None


def _app_step(days):
    """Smallest application step that applies, or None."""
    if days < 0:
        return None
    hits = [s for s in APP_STEPS if days <= s]
    return min(hits) if hits else None


def _hw_step(days):
    if days < 0:
        return -1
    if days in (0, 1):
        return days
    return None


def _when(days):
    if days < 0:
        return f"overdue by {-days} day{'s' if days != -1 else ''}"
    if days == 0:
        return "due today"
    if days == 1:
        return "due tomorrow"
    return f"in {days} days"


def collect(storage, today=None):
    """Return the list of reminders that apply today."""
    today = today or dt.date.today()
    out = []

    hw = storage.read("homework").get("items", [])
    for it in hw:
        if it.get("status") == "done":
            continue
        d = _date(it.get("due"))
        if not d:
            continue
        days = (d - today).days
        step = _hw_step(days)
        if step is None:
            continue
        kind = "Assignment" if it.get("kind") in ("assignment", "project") else "Homework"
        out.append({"key": f"hw:{it.get('id')}:{d}:{step}", "kind": "homework", "id": it.get("id"),
                    "days": days, "date": d.isoformat(), "urgent": days <= 0,
                    "title": f"{kind}: {it.get('title', '')}",
                    "body": f"{it.get('subject') or 'No subject'}, {_when(days)}"})

    def app_items():
        for it in storage.read("universities").get("items", []):
            if it.get("status") in DONE_APP_STATUS:
                continue
            for field, label in (("deadline", "deadline"), ("early_deadline", "early round")):
                if it.get(field):
                    yield ("uni", it.get("id"), it.get(field), f"{it.get('name', '')} {label}",
                           bool(it.get("deadline_estimate")))
        for it in storage.read("scholarships").get("items", []):
            if it.get("status") in DONE_APP_STATUS or not it.get("deadline"):
                continue
            yield ("sch", it.get("id"), it.get("deadline"), f"{it.get('name', '')} deadline",
                   bool(it.get("deadline_estimate")))
        for it in storage.read("deadlines").get("items", []):
            if it.get("done") or not it.get("date"):
                continue
            yield ("dl", it.get("id"), it.get("date"), it.get("title", "Deadline"), bool(it.get("estimate")))

    for kind, iid, date, title, est in app_items():
        d = _date(date)
        if not d:
            continue
        days = (d - today).days
        step = _app_step(days)
        if step is None:
            continue
        out.append({"key": f"{kind}:{iid}:{d}:{step}", "kind": kind, "id": iid, "days": days,
                    "date": d.isoformat(), "urgent": days <= 7,
                    "title": title + (" (estimated date)" if est else ""),
                    "body": f"{_when(days)} ({d.strftime('%d %b %Y')})"})
    out.sort(key=lambda r: r["days"])
    return out


def notifier_available():
    return shutil.which("notify-send") is not None


def send_desktop(title, body, icon=None, urgency=None, timeout_ms=None):
    """Send one desktop notification. Returns True if notify-send ran.

    urgency: None, "low", "normal" or "critical" (critical stays on screen).
    """
    exe = shutil.which("notify-send")
    if not exe:
        return False
    cmd = [exe, "-a", "Study Workspace"]
    if urgency in ("low", "normal", "critical"):
        cmd += ["-u", urgency]
    if timeout_ms:
        cmd += ["-t", str(int(timeout_ms))]
    if icon:
        cmd += ["-i", str(icon)]
    cmd += [title, body]
    try:
        subprocess.run(cmd, timeout=5, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except (OSError, subprocess.SubprocessError):
        return False


def check_and_send(storage, today=None, send=send_desktop, icon=None):
    """Send each new reminder once. Returns the list that was sent."""
    settings = storage.read("settings")
    if settings.get("reminders", True) is False:
        return []
    items = collect(storage, today)
    sent = []

    def mark(data):
        log = data.setdefault("sent", {})
        for r in items:
            if r["key"] in log:
                continue
            if send(r["title"], r["body"], icon) is not False:
                log[r["key"]] = time.strftime("%Y-%m-%dT%H:%M:%S")
                sent.append(r)
        # Forget entries older than 400 days so the file stays small.
        cutoff = (dt.date.today() - dt.timedelta(days=400)).isoformat()
        for k in [k for k, v in log.items() if v[:10] < cutoff]:
            del log[k]

    if items:
        storage.update("reminders", mark)
    return sent
