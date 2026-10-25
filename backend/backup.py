"""Daily backup of the JSON data (not uploaded files) into backups/.

backups/backup-YYYY-MM-DD.zip, one per day, the last KEEP are kept.
Only files that match that exact name pattern are ever removed.
"""

import datetime as dt
import re
import zipfile
from pathlib import Path

KEEP = 14
NAME_RE = re.compile(r"^backup-\d{4}-\d{2}-\d{2}\.zip$")


def backup_name(day):
    return f"backup-{day.isoformat()}.zip"


def make_backup(data_dir, backups_dir, day=None, force=False):
    """Zip data/*.json. Returns the Path, or None if today's backup exists."""
    day = day or dt.date.today()
    backups_dir = Path(backups_dir)
    backups_dir.mkdir(parents=True, exist_ok=True)
    target = backups_dir / backup_name(day)
    if target.exists() and not force:
        return None
    tmp = target.with_suffix(".zip.tmp")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(Path(data_dir).glob("*.json")):
            z.write(p, "data/" + p.name)
    tmp.replace(target)
    prune(backups_dir)
    return target


def list_backups(backups_dir):
    d = Path(backups_dir)
    if not d.is_dir():
        return []
    return sorted(p for p in d.iterdir() if p.is_file() and NAME_RE.match(p.name))


def prune(backups_dir, keep=KEEP):
    items = list_backups(backups_dir)
    removed = []
    for p in items[:-keep] if len(items) > keep else []:
        p.unlink()
        removed.append(p.name)
    return removed
