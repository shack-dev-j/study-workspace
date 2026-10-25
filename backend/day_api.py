"""API routes for the v2 features: day plan, backpack, focus, theme, Todoist, Gemini.

handle() returns the JSON reply, or NOT_HANDLED so handler.py can try its
other routes. Problems are raised as Problem(status, message).

  GET  /api/plan?date=YYYY-MM-DD      plan for the day (built the first time)
  POST /api/plan/rebuild {date}       plan the rest of the day again
  POST /api/plan/block {date,id,state}  state: done | skipped | open
  POST /api/plan/finish {source,id}   finish the task itself (homework, Todoist, cyber, deadline)
  GET  /api/backpack?date=            what to pack (default: the next school day)
  POST /api/backpack {date,text,packed}
  GET  /api/now                       current and next block (for bars / scripts)
  GET  /api/theme                     Caelestia colours, or {"source": "builtin"}
  GET  /api/secrets                   which keys are set (never the keys)
  PUT  /api/secrets {todoist_token, gemini_key}   "" removes a key
  POST /api/todoist/sync | /api/todoist/close {id} | /api/todoist/add {content,due,priority,minutes}
  GET  /api/ai/models                 Gemini models for the key
  POST /api/ai/breakdown {title,details,minutes}  |  POST /api/ai/coach {date}
  GET  /api/focus                     config, active session, today's stats, Hyprland found?
  POST /api/focus/start {minutes,title} | POST /api/focus/stop
"""

import datetime as dt

from . import focus, gemini, net, planner, secrets_store, theme, todoist

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
            return secrets_store.status(ctx.paths.data)
        if method == "PUT":
            body = read_json()
            if not isinstance(body, dict):
                raise Problem(400, "expected a JSON object")
            return secrets_store.write(ctx.paths.data, {k: str(v) for k, v in body.items() if k in secrets_store.KEYS})

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

    if head == "ai":
        key = _key(ctx, "gemini_key", "Gemini API key")
        model = ctx.storage.read("settings").get("geminiModel") or gemini.DEFAULT_MODEL
        if method == "GET" and sub == "models":
            return {"models": _online(gemini.list_models, key), "current": model}
        if method == "POST" and sub == "breakdown":
            body = read_json()
            title = str(body.get("title") or "").strip()[:300]
            if not title:
                raise Problem(400, "title is required")
            return {"steps": _online(gemini.break_down, key, title, str(body.get("details") or "")[:1500],
                                     body.get("minutes"), model)}
        if method == "POST" and sub == "coach":
            body = read_json()
            plan = planner.get_day(ctx.storage, _day(body.get("date"), dt.date.today()))
            tone = ctx.storage.read("focus").get("config", {}).get("tone", "strict")
            return {"text": _online(gemini.coach, key, plan, tone, model)}

    if head == "focus":
        if method == "GET" and not sub:
            data = ctx.storage.read("focus")
            return {"config": focus.config_of(data), "active": ctx.focus.active(data), "stats": focus.stats(data),
                    "hyprland": focus.available(), "sessions": (data.get("sessions") or [])[-20:]}
        if method == "POST" and sub == "start":
            body = read_json()
            return {"ok": True, "active": ctx.focus.start(body.get("minutes") or 50, str(body.get("title") or "Focus")[:120])}
        if method == "POST" and sub == "stop":
            ctx.focus.stop()
            return {"ok": True}

    return NOT_HANDLED
