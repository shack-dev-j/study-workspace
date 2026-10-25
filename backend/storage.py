"""JSON storage: one file per module in data/.

- Only modules in MODULES can be read or written.
- Writes are atomic: write a temp file in the same folder, fsync, rename.
- Each file has "_rev" (a counter). A client may send the rev it loaded;
  if the file changed meanwhile, the write is refused (Conflict) so two
  windows can't silently overwrite each other.
"""

import json
import os
import shutil
import tempfile
import threading
import time
from pathlib import Path

from . import migrations

MODULES = {
    "settings", "subjects", "homework", "library", "bookmarks", "pastpapers",
    "timelog", "timetable", "habits", "sat", "portfolio", "universities",
    "scholarships", "documents", "deadlines", "essays", "activities", "cyber",
    "thm", "challenges", "writeups", "review", "reminders",
}

MAX_JSON_BYTES = 20 * 1024 * 1024


class Conflict(Exception):
    """The file changed since the client loaded it."""


class UnknownModule(KeyError):
    pass


def atomic_write_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="." + path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


class Storage:
    def __init__(self, data_dir, backups_dir=None):
        self.dir = Path(data_dir)
        self.backups = Path(backups_dir) if backups_dir else self.dir.parent / "backups"
        self._locks = {m: threading.RLock() for m in MODULES}

    def check(self, module):
        if module not in MODULES:
            raise UnknownModule(module)

    def path(self, module):
        self.check(module)
        return self.dir / f"{module}.json"

    def lock(self, module):
        self.check(module)
        return self._locks[module]

    def read(self, module):
        """Return the module's data (a dict). Missing file -> empty data."""
        p = self.path(module)
        with self.lock(module):
            if not p.exists():
                return {"schema_version": migrations.current_version(module), "_rev": 0}
            with open(p, encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                raise ValueError(f"{module}.json is not an object")
            data, changed = migrations.migrate(module, data)
            if changed:
                self._backup_before_migration(module, p)
                atomic_write_json(p, data)
            data.setdefault("_rev", 0)
            return data

    def write(self, module, data, expected_rev=None):
        """Save data. Returns the new rev. Raises Conflict on a stale rev."""
        if not isinstance(data, dict):
            raise ValueError("data must be a JSON object")
        with self.lock(module):
            current = self.read(module)
            rev = int(current.get("_rev", 0))
            if expected_rev is not None and int(expected_rev) != rev:
                raise Conflict(rev)
            data = dict(data)
            data["_rev"] = rev + 1
            data.setdefault("schema_version", migrations.current_version(module))
            atomic_write_json(self.path(module), data)
            return data["_rev"]

    def update(self, module, fn):
        """Read-modify-write under the module lock. fn(data) changes data in place."""
        with self.lock(module):
            data = self.read(module)
            fn(data)
            return self.write(module, data)

    def _backup_before_migration(self, module, path):
        d = self.backups / "migrations"
        d.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        shutil.copy2(path, d / f"{module}-{stamp}.json")
