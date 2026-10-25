"""Todoist integration (optional, needs internet and your API token).

Uses the Todoist API v1 (https://api.todoist.com/api/v1):
  GET  /tasks           active tasks, paged with next_cursor
  GET  /projects        project names
  POST /tasks           add a task
  POST /tasks/<id>/close   complete a task

Tasks are cached in data/todoist.json so the planner works offline with the
last synced list. The token lives in data/secrets.json (see secrets_store).
Find your token in Todoist: Settings > Integrations > Developer > API token.
"""

import datetime as dt
import time

from . import net

API = "https://api.todoist.com/api/v1"
MAX_PAGES = 20


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def _paged(token, path, opener=None):
    out, cursor = [], None
    for _ in range(MAX_PAGES):
        params = {"limit": 200}
        if cursor:
            params["cursor"] = cursor
        page = net.request("GET", f"{API}/{path}", headers=_headers(token), params=params, opener=opener)
        if isinstance(page, list):  # be tolerant of a plain list
            return out + page
        out += page.get("results") or []
        cursor = page.get("next_cursor")
        if not cursor:
            break
    return out


def _due(task):
    """-> (date 'YYYY-MM-DD' or '', time 'HH:MM' or '')."""
    due = task.get("due") or {}
    raw = str(due.get("datetime") or due.get("date") or "")
    if not raw:
        return "", ""
    if "T" not in raw:
        return raw[:10], ""
    try:
        if raw.endswith("Z"):  # UTC -> this computer's local time
            d = dt.datetime.fromisoformat(raw[:-1]).replace(tzinfo=dt.timezone.utc).astimezone()
        else:
            d = dt.datetime.fromisoformat(raw[:19])
        return d.date().isoformat(), d.strftime("%H:%M")
    except ValueError:
        return raw[:10], ""


def _minutes(task):
    d = task.get("duration") or {}
    try:
        amount = int(d.get("amount") or 0)
    except (TypeError, ValueError):
        return None
    if not amount:
        return None
    return amount * (24 * 60 if d.get("unit") == "day" else 1)


def normalize(task, projects):
    date, tm = _due(task)
    return {
        "id": str(task.get("id")),
        "content": task.get("content") or "",
        "description": (task.get("description") or "")[:500],
        "project": projects.get(str(task.get("project_id")), ""),
        "priority": int(task.get("priority") or 1),
        "due": date,
        "time": tm,
        "recurring": bool((task.get("due") or {}).get("is_recurring")),
        "minutes": _minutes(task),
        "labels": task.get("labels") or [],
        "checked": bool(task.get("checked") or task.get("completed_at")),
        "url": f"https://app.todoist.com/app/task/{task.get('id')}",
    }


def fetch(token, opener=None):
    projects = {str(p.get("id")): p.get("name") or "" for p in _paged(token, "projects", opener)}
    tasks = [normalize(t, projects) for t in _paged(token, "tasks", opener)]
    return {"tasks": [t for t in tasks if not t["checked"]], "projects": sorted(set(projects.values()))}


def sync(storage, token, opener=None):
    """Download tasks into data/todoist.json. Returns the saved data."""
    result = {}
    try:
        got = fetch(token, opener)
        result = {"tasks": got["tasks"], "projects": got["projects"], "synced_at": time.strftime("%Y-%m-%dT%H:%M"), "error": ""}
    except net.NetError as e:
        result = {"error": str(e), "error_at": time.strftime("%Y-%m-%dT%H:%M")}

    def merge(data):
        data.update(result)
    storage.update("todoist", merge)
    if result.get("error"):
        raise net.NetError(result["error"])
    return storage.read("todoist")


def close_task(storage, token, task_id, opener=None):
    net.request("POST", f"{API}/tasks/{task_id}/close", headers=_headers(token), opener=opener)

    def drop(data):
        data["tasks"] = [t for t in data.get("tasks", []) if str(t.get("id")) != str(task_id)]
    storage.update("todoist", drop)


def add_task(storage, token, content, due_date="", priority=1, minutes=None, opener=None):
    body = {"content": content[:500]}
    if due_date:
        body["due_date"] = due_date
    if priority and int(priority) in (1, 2, 3, 4):
        body["priority"] = int(priority)
    if minutes:
        body["duration"] = int(minutes)
        body["duration_unit"] = "minute"
    task = net.request("POST", f"{API}/tasks", headers=_headers(token), body=body, opener=opener)
    item = normalize(task, {})

    def add(data):
        data.setdefault("tasks", []).append(item)
    storage.update("todoist", add)
    return item
