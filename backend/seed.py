"""Built-in study content (content/*.json) merged into the user's data.

Runs when the app starts. Rules (data safety):
- Only ADDS items whose id the user does not have yet.
- Never changes or removes anything the user has.
- Remembers which ids were added (data/content.json), so an item the user
  deleted is never added again.
- Copies each data file it is about to change to backups/content/ first.
- Items get "seed": true (they are real content, so "Remove sample items"
  keeps them).
Universities come from docs/research/universities.md the first time the
universities list is empty.
"""

import json
import shutil
import time
from pathlib import Path

from . import research_import

LIST_KEY = {"timetable": "slots"}


def content_dir(paths):
    return Path(paths.app) / "content"


def load_packs(paths):
    packs = {}
    d = content_dir(paths)
    if not d.is_dir():
        return packs
    for p in sorted(d.glob("*.json")):
        try:
            packs[p.stem] = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
    return packs


def _backup(storage, module):
    src = storage.path(module)
    if not src.exists():
        return
    d = storage.backups / "content"
    d.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, d / f"{module}-{time.strftime('%Y%m%d-%H%M%S')}.json")
    old = sorted(d.glob("*.json"))
    for p in old[:-60]:
        p.unlink(missing_ok=True)


def apply(storage, paths, log=None):
    """Merge content packs. Returns {module: number added}."""
    from .storage import MODULES
    packs = load_packs(paths)
    state = storage.read("content")
    applied = state.get("applied") or {}
    added = {}
    for module, pack in packs.items():
        if module not in MODULES or module == "content":
            continue
        key = LIST_KEY.get(module, "items")
        incoming = [i for i in pack.get(key, []) if isinstance(i, dict) and i.get("id")]
        done = set(applied.get(module, []))
        have = {str(i.get("id")) for i in storage.read(module).get(key, []) if isinstance(i, dict)}
        new = [i for i in incoming if i["id"] not in done and i["id"] not in have]
        # Ids the user already has count as applied too.
        done |= {i["id"] for i in incoming if i["id"] in have}
        if new:
            _backup(storage, module)

            def add(data, new=new, key=key):
                lst = data.setdefault(key, [])
                ids = {str(i.get("id")) for i in lst if isinstance(i, dict)}
                for item in new:
                    if item["id"] not in ids:
                        lst.append({**item, "seed": True})
            storage.update(module, add)
            added[module] = len(new)
            done |= {i["id"] for i in new}
        applied[module] = sorted(done)

    # Universities from the research report, only into an empty list, once.
    if not state.get("universities_imported"):
        try:
            if not storage.read("universities").get("items"):
                r = research_import.import_into(storage, paths)
                if r.get("added"):
                    added["universities"] = r["added"]
            state["universities_imported"] = True
        except (OSError, ValueError) as e:
            if log:
                log(f"content: universities import skipped: {e}")

    def save(data):
        data["applied"] = applied
        data["universities_imported"] = state.get("universities_imported", False)
        data["updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
    storage.update("content", save)
    if added and log:
        log("content added: " + ", ".join(f"{m} {n}" for m, n in added.items()))
    return added
