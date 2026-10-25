"""API routes for the v2 features: day plan, backpack, focus, theme, Todoist, AI (Groq or Gemini).

handle() returns the JSON reply, or NOT_HANDLED so handler.py can try its
other routes. Problems are raised as Problem(status, message).

  GET  /api/plan?date=YYYY-MM-DD      plan for the day (built the first time)
  POST /api/plan/rebuild {date}       plan the rest of the day again
  POST /api/plan/block {date,id,state}  state: done | skipped | open
  POST /api/plan/finish {source,id}   finish the task itself (homework, Todoist, cyber, deadline)
  PUT  /api/plan/settings {config, backpack}   planner settings (the server also writes
                                      planner.json, so the page never saves it whole)
  GET  /api/backpack?date=            what to pack (default: the next school day)
  POST /api/backpack {date,text,packed}
  GET  /api/now                       current and next block (for bars / scripts)
  GET  /api/theme                     Caelestia colours, or {"source": "builtin"}
  GET  /api/secrets                   which keys are set (never the keys) + the active AI service
  PUT  /api/secrets {todoist_token, groq_key, gemini_key}   "" removes a key
  POST /api/todoist/sync | /api/todoist/close {id} | /api/todoist/add {content,due,priority,minutes}
  GET  /api/ai/models[?provider=groq|gemini]   models the key can use (default: the active service)
  POST /api/ai/breakdown {title,details,minutes}  |  POST /api/ai/coach {date}
  GET  /api/focus                     config, active session, today's stats, Hyprland found?
  POST /api/focus/start {minutes,title} | POST /api/focus/stop
  POST /api/ai/chat {chat, message} | GET /api/ai/chats[/<id>] | POST /api/ai/undo {id} | POST /api/ai/confirm {id, ok}
  PUT  /api/focus/config {config}
"""

import datetime as dt

from . import ai, assistant, focus, gemini, net, planner, secrets_store, theme, todoist

NOT_HANDLED = object()


class Problem(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def _day(value, default=None):
    if not value:
        return default
    d = planner.parse_date(value)
    if d is None:
        raise Problem(400, "bad date")
    return d


def _key(ctx, name, label):
    k = secrets_store.get(ctx.paths.data, name)
    if not k:
        raise Problem(400, f"Add your {label} in Settings > Connections first.")
    return k


def _online(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except net.NetError as e:
        raise Problem(502, str(e))


def finish_task(ctx, source, item_id):
    """Mark the real task as finished, wherever it lives."""
    item_id = str(item_id)
    found = []
    if source == "homework":
        def change(data):
            for it in data.get("items", []):
                if str(it.get("id")) == item_id:
                    it["status"] = "done"
                    it["done_at"] = dt.date.today().isoformat()
                    found.append(it)
        ctx.storage.update("homework", change)
    elif source == "deadlines":
        def change(data):
            for it in data.get("items", []):
                if str(it.get("id")) == item_id:
                    it["done"] = True
                    found.append(it)
        ctx.storage.update("deadlines", change)
    elif source == "cyber":
        def change(data):
            for w in (data.get("plan") or {}).get("weeks", []):
                for t in w.get("tasks", []):
                    if str(t.get("id")) == item_id:
                        t["done"] = True
                        found.append(t)
        ctx.storage.update("cyber", change)
    elif source == "habit":
        iso = dt.date.today().isoformat()

        def change(data):
            for it in data.get("items", []):
                if str(it.get("id")) == item_id:
                    it.setdefault("days", {})[iso] = True
                    found.append(it)
        ctx.storage.update("habits", change)
    elif source == "todoist":
        token = _key(ctx, "todoist_token", "Todoist API token")
        _online(todoist.close_task, ctx.storage, token, item_id)
        found.append(item_id)
    else:
        raise Problem(400, "this kind of task can't be finished here")
    if not found:
        raise Problem(404, "task not found")
    return {"ok": True}


def _text(v, n=120):
    return str(v or "").strip()[:n]


def save_planner_settings(ctx, body):
    """Validate and store planner config and backpack lists."""
    cfg_in, bag_in = body.get("config"), body.get("backpack")
    out = {}
    if isinstance(cfg_in, dict):
        cfg = {}
        for k in ("wake", "sleep"):
            if k in cfg_in:
                if planner.hm(cfg_in[k]) is None:
                    raise Problem(400, f"{k}: use a time like 07:00")
                cfg[k] = planner.fmt(planner.hm(cfg_in[k]))
        for k, lo, hi in (("focus", 15, 120), ("short_break", 3, 30), ("long_break", 5, 60), ("long_every", 1, 8),
                          ("min_block", 10, 60), ("wind_down", 0, 120), ("max_per_task", 20, 300),
                          ("school_gap", 0, 120), ("after_school", 0, 120)):
            if k in cfg_in and cfg_in[k] not in (None, ""):
                try:
                    cfg[k] = max(lo, min(hi, int(cfg_in[k])))
                except (TypeError, ValueError):
                    raise Problem(400, f"{k} must be a number")
        if "study_before_school" in cfg_in:
            cfg["study_before_school"] = bool(cfg_in["study_before_school"])
        if "routines" in cfg_in:
            routines = []
            for r in cfg_in["routines"] or []:
                a, b = planner.hm(r.get("start")), planner.hm(r.get("end"))
                if not _text(r.get("title")) or a is None or b is None or b <= a:
                    continue
                days = sorted({int(d) for d in (r.get("days") or []) if str(d).isdigit() and 0 <= int(d) <= 6})
                routines.append({"id": _text(r.get("id"), 40) or planner._id(r.get("title"), a), "title": _text(r.get("title")),
                                 "start": planner.fmt(a), "end": planner.fmt(b), "days": days})
            cfg["routines"] = routines[:30]
        out["config"] = cfg
    if isinstance(bag_in, dict):
        always = [_text(x, 80) for x in bag_in.get("always") or [] if _text(x)][:40]
        lessons = {}
        for k, v in (bag_in.get("lessons") or {}).items():
            items = [_text(x, 80) for x in (v or []) if _text(x)][:30]
            if _text(k) and items:
                lessons[_text(k)] = items
        out["backpack"] = {"always": always, "lessons": lessons}

    def change(data):
        if "config" in out:
            data["config"] = {**(data.get("config") or {}), **out["config"]}
        if "backpack" in out:
            data["backpack"] = out["backpack"]
    ctx.storage.update("planner", change)
    d = ctx.storage.read("planner")
    return {"ok": True, "config": planner.config_of(d), "backpack": d.get("backpack") or {}}


def save_focus_config(ctx, cfg_in):
    if not isinstance(cfg_in, dict):
        raise Problem(400, "config is required")
    cfg = {}
    for k in ("enabled", "auto_plan", "nag"):
        if k in cfg_in:
            cfg[k] = bool(cfg_in[k])
    if cfg_in.get("mode") in ("warn", "strict", "hard"):
        cfg["mode"] = cfg_in["mode"]
    if cfg_in.get("tone") in focus.MESSAGES:
        cfg["tone"] = cfg_in["tone"]
    if "grace" in cfg_in:
        try:
            cfg["grace"] = max(5, min(120, int(cfg_in["grace"])))
        except (TypeError, ValueError):
            raise Problem(400, "grace must be a number")
    if "rules" in cfg_in:
        rules = []
        for r in cfg_in["rules"] or []:
            pat = _text(r.get("pattern"), 80)
            if not pat:
                continue
            rules.append({"type": "title" if r.get("type") == "title" else "app", "pattern": pat,
                          "label": _text(r.get("label"), 60) or pat})
        cfg["rules"] = rules[:60]

    def change(data):
        data["config"] = {**(data.get("config") or {}), **cfg}
    ctx.storage.update("focus", change)
    return {"ok": True, "config": focus.config_of(ctx.storage.read("focus"))}


def handle(ctx, method, head, parts, query, read_json):
    q = lambda k, d="": (query.get(k) or [d])[0]  # noqa: E731
    sub = parts[1] if len(parts) > 1 else ""

    if head == "plan":
        if method == "GET" and not sub:
            return planner.get_day(ctx.storage, _day(q("date"), dt.date.today()))
        if method == "POST" and sub == "rebuild":
            body = read_json()
            return planner.get_day(ctx.storage, _day(body.get("date"), dt.date.today()), rebuild=True)
        if method == "POST" and sub == "block":
            body = read_json()
            state = body.get("state")
            if state not in ("done", "skipped", "open"):
                raise Problem(400, "state must be done, skipped or open")
            if not planner.set_block_state(ctx.storage, _day(body.get("date"), dt.date.today()), str(body.get("id")), state):
                raise Problem(404, "block not found")
            return {"ok": True}
        if method == "POST" and sub == "finish":
            body = read_json()
            return finish_task(ctx, body.get("source"), body.get("id"))
        if method == "PUT" and sub == "settings":
            body = read_json()
            return save_planner_settings(ctx, body)

    if head == "backpack":
        if method == "GET":
            return planner.get_backpack(ctx.storage, _day(q("date")))
        if method == "POST":
            body = read_json()
            text = str(body.get("text") or "").strip()[:200]
            if not text:
                raise Problem(400, "text is required")
            planner.set_packed(ctx.storage, _day(body.get("date"), dt.date.today()), text, bool(body.get("packed")))
            return {"ok": True}

    if head == "now" and method == "GET":
        now = dt.datetime.now()
        plan = planner.get_day(ctx.storage, now.date(), now)
        info = plan["now"] or {}
        cur, nxt = info.get("current"), info.get("next")
        text = (f"{cur['title']} · {info.get('left')} min left" if cur else "Free") + (f" → {nxt['start']} {nxt['title']}" if nxt else "")
        return {"text": text, "current": cur, "next": nxt, "left": info.get("left"),
                "focus": focus.stats(ctx.storage.read("focus"))}

    if head == "theme" and method == "GET":
        return theme.read_scheme() or {"source": "builtin"}

    if head == "secrets":
        if method == "GET":
            return ai.status(ctx.storage.read("settings"), ctx.paths.data)
        if method == "PUT":
            body = read_json()
            if not isinstance(body, dict):
                raise Problem(400, "expected a JSON object")
            secrets_store.write(ctx.paths.data, {k: str(v) for k, v in body.items() if k in secrets_store.KEYS})
            return ai.status(ctx.storage.read("settings"), ctx.paths.data)

    if head == "todoist" and method == "POST":
        token = _key(ctx, "todoist_token", "Todoist API token")
        if sub == "sync":
            data = _online(todoist.sync, ctx.storage, token)
            return {"ok": True, "count": len(data.get("tasks", [])), "synced_at": data.get("synced_at")}
        if sub == "close":
            _online(todoist.close_task, ctx.storage, token, str(read_json().get("id")))
            return {"ok": True}
        if sub == "add":
            body = read_json()
            content = str(body.get("content") or "").strip()
            if not content:
                raise Problem(400, "content is required")
            item = _online(todoist.add_task, ctx.storage, token, content, str(body.get("due") or ""),
                           int(body.get("priority") or 1), body.get("minutes"))
            return {"ok": True, "task": item}

    if head == "ai" and sub in ("chats", "undo", "confirm"):
        try:
            if method == "GET" and sub == "chats" and len(parts) == 2:
                return {"chats": assistant.list_chats(ctx.storage)}
            if method == "GET" and sub == "chats" and len(parts) == 3:
                return assistant.get_chat(ctx.storage, parts[2])
            if method == "POST" and sub == "undo":
                return assistant.undo(ctx.storage, str(read_json().get("id") or ""))
            if method == "POST" and sub == "confirm":
                body = read_json()
                return assistant.confirm(ctx.storage, str(body.get("id") or ""), bool(body.get("ok")))
        except assistant.ToolError as e:
            raise Problem(400, str(e))

    if head == "ai":
        settings = ctx.storage.read("settings")
        name = ai.active(settings, ctx.paths.data)
        if method == "GET" and sub == "models" and q("provider") in ai.PROVIDERS:
            name = q("provider")
        mod, secret, label, _ = ai.PROVIDERS[name]
        key = _key(ctx, secret, label)
        model = ai.model_of(name, settings)
        if method == "GET" and sub == "models":
            return {"models": _online(mod.list_models, key), "current": model, "provider": name}
        if method == "POST" and sub == "breakdown":
            body = read_json()
            title = str(body.get("title") or "").strip()[:300]
            if not title:
                raise Problem(400, "title is required")
            return {"steps": _online(gemini.break_down, key, title, str(body.get("details") or "")[:1500],
                                     body.get("minutes"), model, gen=mod.generate)}
        if method == "POST" and sub == "chat":
            body = read_json()
            try:
                return _online(assistant.send, ctx.storage, key, str(body.get("chat") or ""), body.get("message"), model,
                               provider=name)
            except assistant.ToolError as e:
                raise Problem(400, str(e))
        if method == "POST" and sub == "coach":
            body = read_json()
            plan = planner.get_day(ctx.storage, _day(body.get("date"), dt.date.today()))
            tone = ctx.storage.read("focus").get("config", {}).get("tone", "strict")
            return {"text": _online(gemini.coach, key, plan, tone, model, gen=mod.generate)}

    if head == "focus":
        if method == "GET" and not sub:
            data = ctx.storage.read("focus")
            return {"config": focus.config_of(data), "active": ctx.focus.active(data), "stats": focus.stats(data),
                    "hyprland": focus.available(), "sessions": (data.get("sessions") or [])[-20:]}
        if method == "POST" and sub == "start":
            body = read_json()
            return {"ok": True, "active": ctx.focus.start(body.get("minutes") or 50, str(body.get("title") or "Focus")[:120])}
        if method == "POST" and sub == "stop":
            ctx.focus.stop(by_user=True)
            return {"ok": True}
        if method == "PUT" and sub == "config":
            return save_focus_config(ctx, read_json().get("config"))

    return NOT_HANDLED
