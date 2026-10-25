"""Export everything to one zip, and restore from it.

Zip layout:
  manifest.json          {"app": "Study Workspace", "version", "exported", "modules"}
  data/<module>.json     every module file
  files/<id>/<name>      every uploaded file

Restore rules:
- The zip must have our manifest; every entry path is checked (no "..",
  no absolute paths, only data/<known module>.json and files/<id>/<name>).
- Before anything changes, a full export of the current data is saved to
  backups/pre-restore-<time>.zip.
- JSON modules are replaced; files are added (existing files are kept).
"""

import json
import re
import shutil
import tempfile
import time
import zipfile
from pathlib import Path, PurePosixPath

from . import APP_NAME, VERSION
from .files import ID_RE, inside, safe_name
from .storage import MODULES, atomic_write_json

MAX_TOTAL = 8 * 1024 ** 3  # refuse zips that unpack to more than 8 GB


class BadArchive(ValueError):
    pass


def write_export(paths, out_path):
    """Write the export zip to out_path."""
    out_path = Path(out_path)
    modules = []
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as z:
        for p in sorted(paths.data.glob("*.json")):
            if p.stem in MODULES:
                z.write(p, "data/" + p.name)
                modules.append(p.stem)
        if paths.files.is_dir():
            for p in sorted(paths.files.rglob("*")):
                if p.is_file() and not p.name.startswith(".") and inside(paths.files, p):
                    rel = p.relative_to(paths.files).as_posix()
                    z.write(p, "files/" + rel, compress_type=zipfile.ZIP_STORED)
        manifest = {"app": APP_NAME, "version": VERSION,
                    "exported": time.strftime("%Y-%m-%dT%H:%M:%S"), "modules": modules}
        z.writestr("manifest.json", json.dumps(manifest, indent=1))
    return out_path


def _check_entry(name):
    """Return ('data', module) / ('file', id, filename) / ('manifest',) or raise."""
    if "\\" in name or name.startswith("/") or "\x00" in name:
        raise BadArchive(f"unsafe path: {name}")
    parts = PurePosixPath(name).parts
    if any(p in ("..", ".") for p in parts) or re.match(r"^[A-Za-z]:", name):
        raise BadArchive(f"unsafe path: {name}")
    if name == "manifest.json":
        return ("manifest",)
    if len(parts) == 2 and parts[0] == "data" and parts[1].endswith(".json"):
        module = parts[1][:-5]
        if module not in MODULES:
            raise BadArchive(f"unknown module: {module}")
        return ("data", module)
    if len(parts) == 3 and parts[0] == "files" and ID_RE.match(parts[1]):
        if safe_name(parts[2]) != parts[2]:
            raise BadArchive(f"unsafe file name: {name}")
        return ("file", parts[1], parts[2])
    if name.endswith("/"):
        return ("dir",)
    raise BadArchive(f"unexpected entry: {name}")


def restore(paths, storage, zip_path):
    """Restore from an export zip. Returns a summary dict."""
    try:
        z = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile:
        raise BadArchive("not a zip file")
    with z:
        infos = z.infolist()
        kinds = [(i, _check_entry(i.filename)) for i in infos]
        if sum(i.file_size for i in infos) > MAX_TOTAL:
            raise BadArchive("archive too large")
        if not any(k[0] == "manifest" for _, k in kinds):
            raise BadArchive("this is not a Study Workspace export (no manifest)")
        manifest = json.loads(z.read("manifest.json"))
        if manifest.get("app") != APP_NAME:
            raise BadArchive("this is not a Study Workspace export")
        # Parse all JSON first, so a broken file stops the restore before any change.
        modules = {}
        for info, k in kinds:
            if k[0] == "data":
                try:
                    obj = json.loads(z.read(info))
                except ValueError:
                    raise BadArchive(f"broken JSON: {info.filename}")
                if not isinstance(obj, dict):
                    raise BadArchive(f"bad data: {info.filename}")
                modules[k[1]] = obj

        # Safety copy of the current state.
        paths.backups.mkdir(parents=True, exist_ok=True)
        safety = paths.backups / f"pre-restore-{time.strftime('%Y%m%d-%H%M%S')}.zip"
        write_export(paths, safety)

        for module, obj in modules.items():
            with storage.lock(module):
                cur = storage.read(module)
                obj["_rev"] = int(cur.get("_rev", 0)) + 1
                atomic_write_json(storage.path(module), obj)

        added = 0
        for info, k in kinds:
            if k[0] != "file":
                continue
            target = paths.files / k[1] / k[2]
            if not inside(paths.files, target):
                raise BadArchive("unsafe file path")
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as src, tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as dst:
                shutil.copyfileobj(src, dst)
            Path(dst.name).replace(target)
            added += 1
    return {"modules": sorted(modules), "files_added": added, "safety_backup": safety.name}
