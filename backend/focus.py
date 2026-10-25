"""Focus mode for Hyprland (optional, opt-in in Settings > Focus).

While a focus session runs (started by hand, or automatically during a focus
block of the day plan), the app looks at the open windows every few seconds
with `hyprctl -j clients` and compares them with YOUR block list:

  rule type "app"   matches the window class (e.g. steam, discord)
  rule type "title" matches the window title (e.g. YouTube in a browser)

What happens depends on the mode:
  warn    a desktop notification (an "angry" nudge), nothing is closed
  strict  a warning first; if the app is still open 20 s later it is closed
  hard    the window is closed at once, with a notification

Safety:
- Only windows that match a rule in the block list are touched.
- Windows are closed with `hyprctl dispatch closewindow` (like clicking X:
  the app can still ask to save). Processes are never killed.
- Title rules only ever warn: closing a browser window would also close the
  tabs you study with.
- The app itself and shell parts (Hyprland, Quickshell / Caelestia, bars,
  notification daemons, portals) are never closed.
"""

import datetime as dt
import glob
import json
import os
import re
import shutil
import subprocess
import time
import uuid

PROTECTED = re.compile(
    r"^(study-workspace|hyprland|quickshell|org\.quickshell|caelestia.*|waybar|swaync.*|mako|dunst|fnott|"
    r"xdg-desktop-portal.*|polkit.*|hyprpolkitagent|hyprlock|hypridle|wlogout)$", re.I)

DEFAULT_CONFIG = {
    "enabled": False,
    "mode": "strict",          # warn | strict | hard
    "tone": "angry",           # calm | strict | angry
    "auto_plan": True,         # focus automatically during focus blocks of the day plan
    "nag": True,               # outside focus: nudge if must-do work is overdue and you open a blocked app
    "grace": 20,               # strict mode: seconds between the warning and closing
    "rules": [
        {"type": "app", "pattern": "steam", "label": "Steam"},
        {"type": "app", "pattern": "discord", "label": "Discord"},
        {"type": "app", "pattern": "telegram", "label": "Telegram"},
        {"type": "title", "pattern": "YouTube", "label": "YouTube"},
        {"type": "title", "pattern": "Instagram", "label": "Instagram"},
        {"type": "title", "pattern": "TikTok", "label": "TikTok"},
        {"type": "title", "pattern": "Netflix", "label": "Netflix"},
    ],
}

MESSAGES = {
    "calm": [
        "{app} is open. Your focus block is {task}. Maybe close it?",
        "{app} again. {left} min left on {task}. You can do it.",
        "Third time with {app}. Let's finish {task} first.",
    ],
    "strict": [
        "{app} is not {task}. Close it.",
        "{app} again. {left} min left on {task}. Focus.",
        "That's {n} times. {app} can wait until your break.",
    ],
    "angry": [
        "Hey. {app}? You are supposed to be doing {task}. Close it. Now.",
        "{app} AGAIN?! {left} minutes left on {task}. Stop wasting them.",
        "{n} distractions in one block. Seriously? {app} will still be there after {task}.",
        "I'm not impressed. {n} times. Your deadlines are not waiting for you.",
    ],
}
CLOSE_MSG = {
    "calm": "I closed {app} so you can focus on {task}.",
    "strict": "Closed {app}. Back to {task}.",
    "angry": "I closed {app}. You had your warning. Back to {task}.",
}
NAG_MSG = {
    "calm": "You have {n} overdue thing(s), like {first}. Maybe start with that?",
    "strict": "{n} overdue: {first}. {app} can wait.",
    "angry": "{app}? You have {n} OVERDUE task(s). Start with {first}. Now.",
}


def config_of(data):
    cfg = dict(DEFAULT_CONFIG)
    cfg.update({k: v for k, v in (data.get("config") or {}).items() if v is not None})
    if cfg.get("mode") not in ("warn", "strict", "hard"):
        cfg["mode"] = "strict"
    if cfg.get("tone") not in MESSAGES:
        cfg["tone"] = "angry"
    return cfg


# ---------- Hyprland ----------
def hypr_env(env=None):
    """Environment for hyprctl. Finds the Hyprland instance if the variable is missing
    (e.g. when the server was started by systemd)."""
    env = dict(os.environ if env is None else env)
    if not env.get("HYPRLAND_INSTANCE_SIGNATURE"):
        run_dir = env.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}"
        socks = sorted(glob.glob(os.path.join(run_dir, "hypr", "*", ".socket.sock")), key=os.path.getmtime)
        if socks:
            env["HYPRLAND_INSTANCE_SIGNATURE"] = os.path.basename(os.path.dirname(socks[-1]))
    return env


def run_hyprctl(args, timeout=3):
    """Run hyprctl and return stdout, or None if it is missing or fails."""
    exe = shutil.which("hyprctl")
    if not exe:
        return None
    try:
        r = subprocess.run([exe] + args, capture_output=True, text=True, timeout=timeout, env=hypr_env())
        return r.stdout if r.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


def available(run=run_hyprctl):
    return run(["version"]) is not None


def clients(run=run_hyprctl):
    out = run(["-j", "clients"])
    try:
        data = json.loads(out) if out else []
        return [c for c in data if isinstance(c, dict)]
    except ValueError:
        return []


def active_address(run=run_hyprctl):
    out = run(["-j", "activewindow"])
    try:
        return (json.loads(out) or {}).get("address") if out else None
    except ValueError:
        return None


def close_window(address, run=run_hyprctl):
    if not re.fullmatch(r"0x[0-9a-fA-F]+", str(address or "")):
        return False
    return run(["dispatch", "closewindow", f"address:{address}"]) is not None


def match_rule(client, rules):
    """The first rule that matches this window, or None. Protected windows never match."""
    cls = str(client.get("class") or client.get("initialClass") or "")
    if PROTECTED.match(cls) or PROTECTED.match(str(client.get("initialClass") or "")):
        return None
    title = str(client.get("title") or "")
    for r in rules or []:
        pat = str(r.get("pattern") or "").strip().lower()
        if not pat:
            continue
        if r.get("type") == "title":
            if pat in title.lower():
                return r
        elif pat in cls.lower() or pat in str(client.get("initialClass") or "").lower():
            return r
    return None


# ---------- engine ----------
class FocusEngine:
    """Called by the server every few seconds (tick)."""

    def __init__(self, storage, notify, run=run_hyprctl, clock=dt.datetime.now, plan_now=None, overdue=None):
        self.storage = storage
        self.notify = notify          # notify(title, body, urgency) -> bool
        self.run = run
        self.clock = clock
        self.plan_now = plan_now      # () -> current plan block or None
        self.overdue = overdue        # () -> list of overdue must-do titles
        self.seen = {}                # window address -> {"first": t, "warned": t}
        self.last_warn = {}           # rule label -> time of the last warning
        self.last_nag = 0.0
        self.auto_block = None        # id of the plan block we auto-focused on

    # ----- sessions -----
    def state(self):
        data = self.storage.read("focus")
        return data, config_of(data)

    def active(self, data=None):
        data = data if data is not None else self.storage.read("focus")
        a = data.get("active")
        if not a:
            return None
        try:
            if dt.datetime.fromisoformat(a["until"]) <= self.clock():
                return None
        except (KeyError, ValueError):
            return None
        return a

    def start(self, minutes=None, title="Focus", block_id=None, until=None, auto=False):
        now = self.clock()
        if until is None:
            until = now + dt.timedelta(minutes=max(5, min(int(minutes or 50), 240)))
        sess = {"id": uuid.uuid4().hex[:10], "start": now.isoformat(timespec="seconds"),
                "until": until.isoformat(timespec="seconds"), "title": title or "Focus",
                "block_id": block_id, "auto": auto, "distractions": 0, "closed": 0}

        def save(data):
            self._finish(data, now)
            data["active"] = sess
        self.storage.update("focus", save)
        self.seen.clear()
        return sess

    def stop(self, by_user=False):
        now = self.clock()
        self.storage.update("focus", lambda data: self._finish(data, now))
        self.seen.clear()
        if by_user:
            self._skip_current_block()

    def _skip_current_block(self):
        """The user stopped on purpose: do not auto-start again in this plan block."""
        try:
            blk = self.plan_now() if self.plan_now else None
        except Exception:
            blk = None
        if blk and blk.get("id"):
            self.auto_block = blk.get("id")

    def _finish(self, data, now):
        a = data.get("active")
        if not a:
            return
        try:
            end = min(now, dt.datetime.fromisoformat(a["until"]))
            minutes = max(0, int((end - dt.datetime.fromisoformat(a["start"])).total_seconds() // 60))
        except (KeyError, ValueError):
            end, minutes = now, 0
        log = data.setdefault("sessions", [])
        log.append({"id": a.get("id"), "date": a.get("start", "")[:10], "start": a.get("start"), "end": end.isoformat(timespec="seconds"),
                    "title": a.get("title"), "minutes": minutes, "distractions": a.get("distractions", 0),
                    "closed": a.get("closed", 0), "auto": a.get("auto", False)})
        del log[:-300]
        data["active"] = None

    # ----- main loop -----
    def tick(self):
        data, cfg = self.state()
        if not cfg["enabled"]:
            if data.get("active"):
                self.stop()
            return {"state": "off"}
        a = data.get("active")
        if a and not self.active(data):
            self.stop()          # time is up: log it
            data, a = self.storage.read("focus"), None
        if not a and cfg.get("auto_plan") and self.plan_now:
            blk = self.plan_now()
            if blk and blk.get("kind") == "focus" and blk.get("state") != "done" and blk.get("id") != self.auto_block:
                end = dt.datetime.combine(self.clock().date(), dt.time.fromisoformat(blk["end"]))
                a = self.start(title=blk.get("title"), block_id=blk.get("id"), until=end, auto=True)
                self.auto_block = blk.get("id")
        if not a:
            return self._nag(cfg)
        return self._police(a, cfg)

    def _left(self, a):
        try:
            return max(0, int((dt.datetime.fromisoformat(a["until"]) - self.clock()).total_seconds() // 60))
        except (KeyError, ValueError):
            return 0

    def _count(self, field):
        def inc(data):
            if data.get("active"):
                data["active"][field] = int(data["active"].get(field, 0)) + 1
        self.storage.update("focus", inc)
        return int((self.storage.read("focus").get("active") or {}).get("distractions", 0))

    def _message(self, cfg, a, app, n):
        msgs = MESSAGES[cfg["tone"]]
        text = msgs[min(n, len(msgs)) - 1] if n >= 1 else msgs[0]
        return text.format(app=app, task=a.get("title") or "your work", left=self._left(a), n=n)

    def _police(self, a, cfg):
        now = time.time()
        found = []
        active_addr = active_address(self.run)
        for c in clients(self.run):
            rule = match_rule(c, cfg["rules"])
            if not rule:
                continue
            addr = c.get("address")
            label = rule.get("label") or rule.get("pattern")
            is_title = rule.get("type") == "title"
            if is_title and addr != active_addr:
                continue  # a background browser tab is fine; only the one you look at counts
            found.append(label)
            st = self.seen.setdefault(addr, {"first": now, "warned": 0.0})
            can_close = not is_title and cfg["mode"] in ("strict", "hard")
            if can_close and (cfg["mode"] == "hard" or (st["warned"] and now - st["warned"] >= int(cfg["grace"]))):
                if close_window(addr, self.run):
                    self._count("closed")
                    if cfg["mode"] == "hard":
                        self._count("distractions")
                    self.notify("Focus: app closed", CLOSE_MSG[cfg["tone"]].format(app=label, task=a.get("title") or "your work"), "critical")
                    self.seen.pop(addr, None)
                continue
            if now - self.last_warn.get(label, 0) >= 45 and (not st["warned"] or now - st["warned"] >= 45):
                n = self._count("distractions")
                extra = f" I will close it in {int(cfg['grace'])} s." if can_close else ""
                self.notify("Focus mode", self._message(cfg, a, label, n) + extra, "critical")
                st["warned"] = now
                self.last_warn[label] = now
        return {"state": "focus", "found": found}

    def _nag(self, cfg):
        if not cfg.get("nag") or not self.overdue or time.time() - self.last_nag < 20 * 60:
            return {"state": "idle"}
        addr = active_address(self.run)
        if not addr:
            return {"state": "idle"}
        cur = next((c for c in clients(self.run) if c.get("address") == addr), None)
        rule = match_rule(cur or {}, cfg["rules"])
        if not rule:
            return {"state": "idle"}
        late = self.overdue()
        if not late:
            return {"state": "idle"}
        self.last_nag = time.time()
        label = rule.get("label") or rule.get("pattern")
        self.notify("Not now", NAG_MSG[cfg["tone"]].format(app=label, n=len(late), first=late[0]), "critical")
        return {"state": "nag", "app": label}


def stats(data, day=None):
    """Focus minutes and distractions for a day (default today)."""
    day = (day or dt.date.today()).isoformat()
    s = [x for x in data.get("sessions", []) if x.get("date") == day]
    a = data.get("active")
    return {"sessions": len(s), "minutes": sum(int(x.get("minutes") or 0) for x in s),
            "distractions": sum(int(x.get("distractions") or 0) for x in s) + (int(a.get("distractions", 0)) if a else 0),
            "closed": sum(int(x.get("closed") or 0) for x in s) + (int(a.get("closed", 0)) if a else 0)}
