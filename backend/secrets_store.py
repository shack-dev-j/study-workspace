"""API keys for the optional online features (Todoist, Groq, Gemini).

Stored in data/secrets.json with file mode 600 (only you can read it).
- Never sent back to the browser: the API only says whether a key is set.
- Not a storage module, so /api/data cannot read it, and it is not part of
  exports. Daily backups skip it too.
- data/ is git-ignored, so it is never committed.
"""

import json
import os
import tempfile
from pathlib import Path

FILE = "secrets.json"
KEYS = ("todoist_token", "groq_key", "gemini_key")


def _path(data_dir):
    return Path(data_dir) / FILE


def read(data_dir):
    try:
        with open(_path(data_dir), encoding="utf-8") as f:
            data = json.load(f)
        return {k: str(v) for k, v in data.items() if k in KEYS and v}
    except (OSError, ValueError):
        return {}


def get(data_dir, key):
    return read(data_dir).get(key, "")


def write(data_dir, updates):
    """Merge updates into the file. An empty value removes the key."""
    data = read(data_dir)
    for k, v in updates.items():
        if k not in KEYS:
            continue
        v = (v or "").strip()
        if v:
            data[k] = v
        else:
            data.pop(k, None)
    p = _path(data_dir)
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".secrets.", suffix=".tmp", dir=p.parent)
    try:
        os.chmod(tmp, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, p)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return status(data_dir)


def status(data_dir):
    s = read(data_dir)
    return {"todoist": bool(s.get("todoist_token")), "groq": bool(s.get("groq_key")), "gemini": bool(s.get("gemini_key"))}
