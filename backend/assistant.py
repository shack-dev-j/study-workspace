"""AI assistant (Gemini with function calling) that can read and change app data.

Safety rules:
- The model can only use the tools below. Each tool checks the module, the
  fields and their types; ids are made by the app, not the model.
- Every change is logged with the item before and after, so it can be undone
  from the chat (undo()).
- Before the first change to a data file in a chat turn, that file is copied
  to backups/assistant/.
- The model can never delete: delete_item only creates a "pending" request
  that the user must confirm in the chat (confirm()).
- The key stays on the server (data/secrets.json); only the chat text and the
  data the tools return are sent to Gemini.
"""

import datetime as dt
import json
import re
import shutil
import time
import uuid

from . import gemini, net, planner

MAX_ROUNDS = 8
KEEP_CHATS = 40
KEEP_CHANGES = 600

# Field types: str (one line), text (long), date (YYYY-MM-DD), time (HH:MM),
# int, bool, url, or a list of allowed values.
STATUS_HW = ["todo", "doing", "done"]
PRIORITY = ["low", "normal", "high"]
SCHEMA = {
    "homework": {"title": "str", "subject": "str", "kind": ["homework", "assignment", "project"], "description": "text",
                 "due": "date", "status": STATUS_HW, "priority": PRIORITY, "minutes": "int"},
    "deadlines": {"title": "str", "date": "date", "estimate": "bool", "done": "bool", "notes": "text"},
    "habits": {"name": "str"},
    "pastpapers": {"subject": "str", "session": "str", "paper": "str", "variant": "str", "done": "bool", "date": "date",
                   "score": "int", "max": "int", "notes": "text", "qpUrl": "url", "msUrl": "url"},
    "thm": {"name": "str", "url": "url", "topic": "str", "status": ["todo", "doing", "done"], "notes": "text"},
    "universities": {"name": "str", "country": "str", "city": "str", "program": "str", "deadline": "date",
                     "early_deadline": "date", "status": ["Researching", "Preparing", "Applied", "Offer", "Rejected", "Accepted"],
                     "priority": "str", "notes": "text", "tuition": "str", "scholarships": "text"},
    "scholarships": {"name": "str", "pays": "text", "requirements": "text", "deadline": "date", "link": "url", "status": "str"},
    "essays": {"university": "str", "prompt": "text", "limit": "int", "text": "text"},
    "activities": {"title": "str", "description": "text"},
    "portfolio": {"type": "str", "title": "str", "date": "date", "description": "text", "role": "str", "result": "str"},
    "resources": {"area": ["Study", "SAT", "Cyber", "Applications", "Other"], "subject": "str", "title": "str", "url": "url",
                  "kind": "str", "note": "text"},
    "writeups": {"title": "str", "body": "text"},
    "timetable": {"day": "int", "start": "time", "end": "time", "title": "str", "room": "str"},
    "library": {"title": "str", "subject": "str", "type": ["textbook", "workbook", "past paper", "mark scheme", "notes"]},
}
LIST_KEY = {"timetable": "slots"}
# The library needs a real file, so the assistant can edit books but not add them.
NO_ADD = {"library"}
LABEL = {"homework": "homework", "deadlines": "deadline", "habits": "habit", "pastpapers": "past paper",
         "thm": "TryHackMe room", "universities": "university", "scholarships": "scholarship", "essays": "essay",
         "activities": "activity", "portfolio": "portfolio item", "resources": "resource", "writeups": "writeup",
         "timetable": "lesson", "library": "book"}
ROUTE = {"homework": "homework", "deadlines": "deadlines", "habits": "habits", "pastpapers": "pastpapers", "thm": "thm",
         "universities": "universities", "scholarships": "scholarships", "essays": "essays", "activities": "activities",
         "portfolio": "portfolio", "resources": "resources", "writeups": "writeups", "timetable": "timetable", "library": "library"}


class ToolError(Exception):
    pass


def title_of(item):
    return str(item.get("title") or item.get("name") or item.get("university") or item.get("subject") or item.get("id") or "")[:120]


# ---------- validation ----------
def clean_fields(module, fields, partial=False):
    if module not in SCHEMA:
        raise ToolError(f"unknown module {module!r}; use one of: {', '.join(sorted(SCHEMA))}")
    if not isinstance(fields, dict):
        raise ToolError("fields must be a JSON object")
    schema = SCHEMA[module]
    out = {}
    for k, v in fields.items():
        t = schema.get(k)
        if t is None:
            raise ToolError(f"{module} has no field {k!r}; fields: {', '.join(schema)}")
        if v is None or v == "":
            out[k] = None if t in ("int",) else ""
            continue
        if isinstance(t, list):
            if v not in t:
                raise ToolError(f"{k} must be one of {t}")
            out[k] = v
        elif t in ("str", "url"):
            v = str(v).strip()
            if t == "url" and not re.match(r"^https?://", v):
                raise ToolError(f"{k} must start with http:// or https://")
            out[k] = v[:300] if t == "str" else v[:500]
        elif t == "text":
            out[k] = str(v)[:20000]
        elif t == "date":
            try:
                out[k] = dt.date.fromisoformat(str(v)[:10]).isoformat()
            except ValueError:
                raise ToolError(f"{k} must be a date like 2026-11-03")
        elif t == "time":
            if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", str(v)):
                raise ToolError(f"{k} must be a time like 08:30")
            out[k] = str(v)
        elif t == "int":
            try:
                out[k] = int(v)
            except (TypeError, ValueError):
                raise ToolError(f"{k} must be a whole number")
        elif t == "bool":
            out[k] = bool(v) if not isinstance(v, str) else v.lower() in ("true", "yes", "1")
    if module == "timetable" and "day" in out and not (0 <= (out["day"] or 0) <= 6):
        raise ToolError("day must be 0 (Monday) to 6 (Sunday)")
    if not partial:
        need = {"homework": "title", "deadlines": "title", "habits": "name", "thm": "name", "universities": "name",
                "scholarships": "name", "activities": "title", "portfolio": "title", "resources": "title",
                "writeups": "title", "timetable": "title", "essays": "university", "pastpapers": "subject"}.get(module)
        if need and not out.get(need):
            raise ToolError(f"{need} is required")
    return out


def defaults(module):
    today = dt.date.today().isoformat()
    return {
        "homework": {"kind": "homework", "status": "todo", "priority": "normal", "files": [], "subject": "", "description": "", "due": ""},
        "deadlines": {"done": False, "estimate": False, "notes": ""},
        "habits": {"days": {}},
        "pastpapers": {"done": False, "date": "", "score": None, "max": None, "notes": ""},
        "thm": {"status": "todo", "finished": "", "notes": ""},
        "universities": {"status": "Researching", "notes": "", "docs": [], "sources": [], "verify": []},
        "scholarships": {"status": "Researching"},
        "essays": {"text": "", "versions": []},
        "portfolio": {"links": [], "files": [], "date": today},
        "writeups": {"linkType": "", "linkId": "", "files": []},
        "timetable": {"room": ""},
    }.get(module, {})


# ---------- the engine ----------
class Assistant:
    def __init__(self, storage, key, model=None, opener=None, today=None):
        self.storage = storage
        self.key = key
        self.model = model or gemini.DEFAULT_MODEL
        self.opener = opener
        self.today = today or dt.date.today()
        self.backed_up = set()
        self.changes = []   # change records made in this turn
        self.pending = []   # delete requests made in this turn
        self.chat_id = None

    # ----- storage helpers -----
    def _items(self, module):
        return self.storage.read(module).get(LIST_KEY.get(module, "items"), [])

    def _backup(self, module):
        if module in self.backed_up:
            return
        src = self.storage.path(module)
        if src.exists():
            d = self.storage.backups / "assistant"
            d.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, d / f"{module}-{time.strftime('%Y%m%d-%H%M%S')}.json")
            for p in sorted(d.glob("*.json"))[:-100]:
                p.unlink(missing_ok=True)
        self.backed_up.add(module)

    def _record(self, module, action, item_id, before, after):
        ch = {"id": uuid.uuid4().hex[:10], "at": dt.datetime.now().isoformat(timespec="seconds"), "chat": self.chat_id,
              "module": module, "action": action, "item_id": item_id, "title": title_of(after or before or {}),
              "before": before, "after": after, "undone": False}
        self.changes.append(ch)
        return ch

    # ----- tools -----
    def t_get_today(self, args):
        day = self.today
        plan = planner.get_day(self.storage, day)
        blocks = [{"id": b.get("id"), "start": b["start"], "end": b["end"], "kind": b["kind"], "title": b["title"],
                   "state": b.get("state", "")} for b in plan.get("blocks", [])]
        hw = [i for i in self._items("homework") if i.get("status") != "done"]
        settings = self.storage.read("settings")
        soon = (day + dt.timedelta(days=21)).isoformat()
        dls = [{"title": d.get("title"), "date": d.get("date")} for d in self._items("deadlines")
               if not d.get("done") and d.get("date") and d["date"] <= soon]
        return {"today": day.isoformat(), "weekday": day.strftime("%A"), "plan": blocks,
                "must_do": [{"title": m["title"], "why": m.get("why")} for m in plan.get("must_do", [])],
                "open_homework": [{"id": i["id"], "title": i.get("title"), "subject": i.get("subject"), "due": i.get("due"),
                                   "priority": i.get("priority"), "minutes": i.get("minutes")} for i in hw][:40],
                "deadlines_next_3_weeks": dls[:20], "sat_date": settings.get("satDate"), "ico_date": settings.get("icoDate")}

    def t_list_items(self, args):
        module = args.get("module")
        if module not in SCHEMA:
            raise ToolError(f"unknown module; use one of: {', '.join(sorted(SCHEMA))}")
        q = str(args.get("query") or "").lower().strip()
        limit = max(1, min(int(args.get("limit") or 30), 80))
        rows = []
        for it in self._items(module):
            text = json.dumps({k: it.get(k) for k in SCHEMA[module]}, ensure_ascii=False).lower()
            if q and not all(w in text for w in q.split()):
                continue
            rows.append({"id": it.get("id"), **{k: it.get(k) for k in SCHEMA[module] if it.get(k) not in (None, "", [], {})
                                                and SCHEMA[module][k] != "text"}})
        return {"module": module, "count": len(rows), "items": rows[:limit]}

    def t_get_item(self, args):
        module, item_id = args.get("module"), str(args.get("id") or "")
        if module not in SCHEMA:
            raise ToolError("unknown module")
        for it in self._items(module):
            if str(it.get("id")) == item_id:
                return {k: v for k, v in it.items() if k not in ("files", "versions", "_rev")}
        raise ToolError("no item with that id")

    def _fields(self, args):
        f = args.get("fields")
        if isinstance(f, str):
            try:
                f = json.loads(f or "{}")
            except ValueError:
                raise ToolError("fields_json is not valid JSON")
        if f is None:
            f = args.get("fields_json")
            if isinstance(f, str):
                try:
                    f = json.loads(f or "{}")
                except ValueError:
                    raise ToolError("fields_json is not valid JSON")
        return f or {}

    def t_add_item(self, args):
        module = args.get("module")
        if module in NO_ADD:
            raise ToolError("books need a real file: ask the user to add it in the Library page")
        fields = clean_fields(module, self._fields(args))
        item = {"id": uuid.uuid4().hex[:10], **defaults(module), **fields}
        key = LIST_KEY.get(module, "items")
        self._backup(module)
        self.storage.update(module, lambda d: d.setdefault(key, []).append(item))
        ch = self._record(module, "add", item["id"], None, item)
        return {"ok": True, "id": item["id"], "change": ch["id"]}

    def t_update_item(self, args):
        module, item_id = args.get("module"), str(args.get("id") or "")
        fields = clean_fields(module, self._fields(args), partial=True)
        if not fields:
            raise ToolError("nothing to change")
        key = LIST_KEY.get(module, "items")
        box = {}

        def change(d):
            for it in d.get(key, []):
                if str(it.get("id")) == item_id:
                    box["before"] = json.loads(json.dumps(it))
                    it.update(fields)
                    if module == "homework" and fields.get("status") == "done" and not it.get("done_at"):
                        it["done_at"] = self.today.isoformat()
                    box["after"] = json.loads(json.dumps(it))
        self._backup(module)
        self.storage.update(module, change)
        if "before" not in box:
            raise ToolError("no item with that id (use list_items first)")
        ch = self._record(module, "update", item_id, box["before"], box["after"])
        return {"ok": True, "change": ch["id"]}

    def t_delete_item(self, args):
        module, item_id = args.get("module"), str(args.get("id") or "")
        if module not in SCHEMA:
            raise ToolError("unknown module")
        it = next((i for i in self._items(module) if str(i.get("id")) == item_id), None)
        if not it:
            raise ToolError("no item with that id")
        p = {"id": uuid.uuid4().hex[:10], "chat": self.chat_id, "module": module, "item_id": item_id,
             "title": title_of(it), "reason": str(args.get("reason") or "")[:200], "at": dt.datetime.now().isoformat(timespec="seconds")}
        self.pending.append(p)
        return {"ok": True, "status": "waiting for the user to confirm in the chat. Nothing is deleted yet."}

    def t_set_topic_level(self, args):
        subj = str(args.get("subject") or "").lower()
        topic = str(args.get("topic") or "").lower()
        try:
            level = int(args.get("level"))
        except (TypeError, ValueError):
            raise ToolError("level must be 0-5")
        if not 0 <= level <= 5:
            raise ToolError("level must be 0-5")
        box = {}

        def change(d):
            for s in d.get("items", []):
                if subj in (str(s.get("id")).lower(), str(s.get("name")).lower()):
                    for t in s.get("topics", []):
                        if topic and topic in str(t.get("name", "")).lower():
                            box["before"] = json.loads(json.dumps(s))
                            t["confidence"] = level
                            t["reviewed"] = self.today.isoformat()
                            if args.get("note"):
                                t["notes"] = (str(t.get("notes") or "") + "\n" + str(args["note"])[:500]).strip()
                            box["after"] = json.loads(json.dumps(s))
                            box["topic"] = t.get("name")
                            return
        self._backup("subjects")
        self.storage.update("subjects", change)
        if "before" not in box:
            raise ToolError("subject or topic not found (subjects: maths, physics, cs)")
        ch = self._record("subjects", "update", box["after"]["id"], box["before"], box["after"])
        ch["title"] = f"{box['after'].get('name')}: {box['topic']} → level {level}"
        return {"ok": True, "topic": box["topic"], "change": ch["id"]}

    def t_replan_day(self, args):
        try:
            day = dt.date.fromisoformat(str(args.get("date") or self.today.isoformat())[:10])
        except ValueError:
            raise ToolError("date must look like 2026-11-03")
        plan = planner.get_day(self.storage, day, rebuild=True)
        return {"ok": True, "date": day.isoformat(),
                "plan": [{"start": b["start"], "end": b["end"], "kind": b["kind"], "title": b["title"]} for b in plan["blocks"]]}

    def t_set_block_state(self, args):
        try:
            day = dt.date.fromisoformat(str(args.get("date") or self.today.isoformat())[:10])
        except ValueError:
            raise ToolError("bad date")
        state = args.get("state")
        if state not in ("done", "skipped", "open"):
            raise ToolError("state must be done, skipped or open")
        if not planner.set_block_state(self.storage, day, str(args.get("id")), state):
            raise ToolError("block not found (use get_today for ids)")
        return {"ok": True}

    TOOLS = {
        "get_today": (t_get_today, "Today's date, day plan (time blocks), must-do list, open homework, deadlines in the next 3 weeks, SAT and ICO dates.", {}),
        "list_items": (t_list_items, "List items in one area of the app, optionally filtered by words.", {
            "module": ("string", "one of: " + ", ".join(sorted(SCHEMA)), True),
            "query": ("string", "words to filter by (optional)", False),
            "limit": ("integer", "max items, default 30", False)}),
        "get_item": (t_get_item, "Read one item with all its fields.", {
            "module": ("string", "area", True), "id": ("string", "item id", True)}),
        "add_item": (t_add_item, "Add a new item. To schedule a task, add homework with due and minutes, then call replan_day.", {
            "module": ("string", "area", True),
            "fields_json": ("string", "JSON object with the fields, e.g. {\"title\":\"Physics P2 s23\",\"subject\":\"Physics\",\"due\":\"2026-11-02\",\"minutes\":60}", True)}),
        "update_item": (t_update_item, "Change fields of an existing item (only the fields given).", {
            "module": ("string", "area", True), "id": ("string", "item id", True),
            "fields_json": ("string", "JSON object with the fields to change", True)}),
        "delete_item": (t_delete_item, "Ask to delete an item. The user must confirm in the chat; nothing is deleted until then.", {
            "module": ("string", "area", True), "id": ("string", "item id", True), "reason": ("string", "why", False)}),
        "set_topic_level": (t_set_topic_level, "Set the confidence level (0-5) of a syllabus topic.", {
            "subject": ("string", "maths, physics or cs", True), "topic": ("string", "part of the topic name", True),
            "level": ("integer", "0 = not started, 5 = mastered", True), "note": ("string", "optional note", False)}),
        "replan_day": (t_replan_day, "Rebuild the time-block plan for a day (keeps done blocks). Use after adding or changing tasks.", {
            "date": ("string", "YYYY-MM-DD, default today", False)}),
        "set_block_state": (t_set_block_state, "Mark a block of the day plan done, skipped or open.", {
            "date": ("string", "YYYY-MM-DD", False), "id": ("string", "block id", True), "state": ("string", "done, skipped or open", True)}),
    }

    def declarations(self):
        out = []
        for name, (_, desc, params) in self.TOOLS.items():
            d = {"name": name, "description": desc}
            if params:
                d["parameters"] = {"type": "OBJECT", "properties": {k: {"type": t.upper(), "description": ds} for k, (t, ds, _) in params.items()},
                                   "required": [k for k, (_, _, req) in params.items() if req]}
            out.append(d)
        return [{"functionDeclarations": out}]

    def run_tool(self, name, args):
        spec = self.TOOLS.get(name)
        if not spec:
            return {"error": f"unknown tool {name}"}
        try:
            return spec[0](self, args or {})
        except ToolError as e:
            return {"error": str(e)}

    def system(self):
        fields = "\n".join(f"- {m}: " + ", ".join(f"{k} ({t if isinstance(t, str) else '/'.join(t)})" for k, t in s.items())
                           for m, s in SCHEMA.items())
        return (
            "You are the assistant inside Study Workspace, a personal study app of a 10th grade student in Uzbekistan "
            "(Cambridge AS Level: Maths 9709 P1+P5, Physics 9702, Computer Science 9618; Digital SAT; university "
            "applications for 2028 entry; cybersecurity olympiad ICO). Be short, friendly and direct; use simple English. "
            f"Today is {self.today.isoformat()} ({self.today.strftime('%A')}).\n"
            "You can read and change the app with the tools. Rules:\n"
            "- Look things up with tools before answering questions about the user's data. Never invent ids.\n"
            "- When the user asks you to add, change, plan or schedule something, do it with the tools, then say in one or two "
            "lines what you changed. Ask only if something essential is missing (e.g. no date given for a deadline).\n"
            "- To schedule work: add or update homework with due date and minutes, then call replan_day.\n"
            "- You cannot delete directly: delete_item asks the user to confirm.\n"
            "- Do not invent facts like university rankings or exam dates; say you are not sure.\n"
            "- Dates are YYYY-MM-DD. Timetable day: 0 = Monday ... 6 = Sunday.\n"
            "Areas and their fields:\n" + fields)

    # ----- conversation -----
    def chat(self, history, message):
        """history: [{role, text}] of earlier turns. Returns reply text."""
        contents = [{"role": "user" if h["role"] == "user" else "model", "parts": [{"text": h["text"]}]}
                    for h in history[-20:] if h.get("text")]
        contents.append({"role": "user", "parts": [{"text": message}]})
        for _ in range(MAX_ROUNDS):
            r = gemini.call(self.key, contents, model=self.model, tools=self.declarations(), system=self.system(), opener=self.opener)
            try:
                cand = r["candidates"][0]
                parts = cand.get("content", {}).get("parts", []) or []
            except (KeyError, IndexError, TypeError):
                reason = (r.get("promptFeedback") or {}).get("blockReason") if isinstance(r, dict) else None
                raise net.NetError("Gemini gave no answer" + (f" ({reason})" if reason else ""))
            calls = [p["functionCall"] for p in parts if "functionCall" in p]
            if not calls:
                text = "".join(p.get("text", "") for p in parts).strip()
                return text or ("Done." if self.changes else "I have no answer to that.")
            contents.append({"role": "model", "parts": parts})
            responses = []
            for c in calls:
                result = self.run_tool(c.get("name"), c.get("args") or {})
                responses.append({"functionResponse": {"name": c.get("name"), "response": {"result": result}}})
            contents.append({"role": "user", "parts": responses})
        return "I stopped after several steps. Here is what I changed so far." if self.changes else "That took too many steps. Try a simpler request."


# ---------- chat log, undo, confirm ----------
def _strip_change(ch):
    return {k: ch[k] for k in ("id", "at", "module", "action", "item_id", "title", "undone")} | {"route": ROUTE.get(ch["module"], ch["module"]),
                                                                                                 "label": LABEL.get(ch["module"], ch["module"])}


def public_chat(data, chat):
    changes = {c["id"]: c for c in data.get("changes", [])}
    pending = {p["id"]: p for p in data.get("pending", [])}
    msgs = []
    for m in chat.get("messages", []):
        msgs.append({**{k: m[k] for k in ("role", "text", "at") if k in m},
                     "changes": [_strip_change(changes[c]) for c in m.get("changes", []) if c in changes],
                     "pending": [{**pending[p], "label": LABEL.get(pending[p]["module"], pending[p]["module"])} for p in m.get("pending", []) if p in pending],
                     "resolved": [r for r in m.get("resolved", [])]})
    return {"id": chat["id"], "title": chat.get("title", ""), "created": chat.get("created"), "messages": msgs}


def send(storage, key, chat_id, message, model=None, opener=None, today=None):
    message = str(message or "").strip()[:4000]
    if not message:
        raise ToolError("message is empty")
    data = storage.read("assistant")
    chat = next((c for c in data.get("chats", []) if c["id"] == chat_id), None)
    history = [{"role": m["role"], "text": m.get("text", "")} for m in (chat or {}).get("messages", [])]
    a = Assistant(storage, key, model=model, opener=opener, today=today)
    a.chat_id = chat_id if chat else uuid.uuid4().hex[:10]
    try:
        reply = a.chat(history, message)
    except net.NetError as e:
        if not a.changes and not a.pending:
            raise
        reply = f"Gemini stopped with an error ({e}). The changes below were already made; undo them if you like."
    now = dt.datetime.now().isoformat(timespec="seconds")

    def save(d):
        chats = d.setdefault("chats", [])
        c = next((x for x in chats if x["id"] == a.chat_id), None)
        if c is None:
            c = {"id": a.chat_id, "title": message[:60], "created": now, "messages": []}
            chats.append(c)
        c["messages"].append({"role": "user", "text": message, "at": now})
        c["messages"].append({"role": "model", "text": reply, "at": now, "changes": [x["id"] for x in a.changes],
                              "pending": [p["id"] for p in a.pending]})
        c["updated"] = now
        d.setdefault("changes", []).extend(a.changes)
        d.setdefault("pending", []).extend(a.pending)
        chats.sort(key=lambda x: x.get("updated") or x.get("created") or "")
        del chats[:-KEEP_CHATS]
        del d["changes"][:-KEEP_CHANGES]
    storage.update("assistant", save)
    data = storage.read("assistant")
    chat = next(c for c in data["chats"] if c["id"] == a.chat_id)
    return public_chat(data, chat)


def _put_back(storage, module, item_id, item):
    """Restore one item (item=None removes it)."""
    key = LIST_KEY.get(module, "items")
    box = {}

    def change(d):
        lst = d.setdefault(key, [])
        for i, it in enumerate(lst):
            if str(it.get("id")) == str(item_id):
                box["current"] = it
                if item is None:
                    lst.pop(i)
                else:
                    lst[i] = item
                return
        if item is not None:
            lst.append(item)
    storage.update(module, change)
    return box.get("current")


def undo(storage, change_id):
    data = storage.read("assistant")
    ch = next((c for c in data.get("changes", []) if c["id"] == change_id), None)
    if not ch:
        raise ToolError("change not found")
    if ch.get("undone"):
        raise ToolError("already undone")
    a = Assistant(storage, None)
    a._backup(ch["module"])
    if ch["action"] == "add":
        _put_back(storage, ch["module"], ch["item_id"], None)
    else:  # update or delete: put the old item back
        _put_back(storage, ch["module"], ch["item_id"], ch["before"])

    def mark(d):
        for c in d.get("changes", []):
            if c["id"] == change_id:
                c["undone"] = True
    storage.update("assistant", mark)
    return {"ok": True}


def confirm(storage, pending_id, ok):
    data = storage.read("assistant")
    p = next((x for x in data.get("pending", []) if x["id"] == pending_id), None)
    if not p:
        raise ToolError("request not found (maybe already answered)")
    record = None
    if ok:
        a = Assistant(storage, None)
        a.chat_id = p.get("chat")
        a._backup(p["module"])
        before = _put_back(storage, p["module"], p["item_id"], None)
        if before is not None:
            record = a._record(p["module"], "delete", p["item_id"], before, None)

    def save(d):
        d["pending"] = [x for x in d.get("pending", []) if x["id"] != pending_id]
        if record:
            d.setdefault("changes", []).append(record)
        for c in d.get("chats", []):
            for m in c.get("messages", []):
                if pending_id in m.get("pending", []):
                    m["pending"].remove(pending_id)
                    m.setdefault("resolved", []).append({"title": p["title"], "label": LABEL.get(p["module"], p["module"]),
                                                         "deleted": bool(ok), "change": record["id"] if record else None})
                    if record:
                        m.setdefault("changes", []).append(record["id"])
    storage.update("assistant", save)
    return {"ok": True, "deleted": bool(record)}


def list_chats(storage):
    data = storage.read("assistant")
    return [{"id": c["id"], "title": c.get("title", ""), "updated": c.get("updated") or c.get("created")}
            for c in reversed(data.get("chats", []))]


def get_chat(storage, chat_id):
    data = storage.read("assistant")
    chat = next((c for c in data.get("chats", []) if c["id"] == chat_id), None)
    if not chat:
        raise ToolError("chat not found")
    return public_chat(data, chat)
