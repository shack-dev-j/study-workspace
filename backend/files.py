"""Uploaded files: stored as data/files/<id>/<safe name>.

Safety rules:
- The client-given name is cleaned (no folders, no "..", no control chars).
- The id is generated here (hex) and checked on every access.
- The final path is resolved and must be inside data/files/.
- "Delete" moves the file to data/trash/ (nothing is destroyed).
"""

import json
import mimetypes
import os
import re
import secrets
import shutil
import time
import unicodedata
from pathlib import Path

ID_RE = re.compile(r"^[0-9a-f]{16}$")
MAX_NAME = 120
DEFAULT_MAX_UPLOAD = 200 * 1024 * 1024

mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/markdown", ".md")
mimetypes.add_type("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx")


class BadName(ValueError):
    pass


def safe_name(name):
    """Clean an uploaded file name. Raises BadName if nothing usable is left."""
    if not isinstance(name, str):
        raise BadName("no name")
    name = unicodedata.normalize("NFC", name)
    name = name.replace("\\", "/").split("/")[-1]          # drop any folder part
    name = "".join(c for c in name if unicodedata.category(c)[0] != "C")  # control chars
    name = re.sub(r'[<>:"|?*]', "_", name).strip().strip(".")
    if name in ("", ".", ".."):
        raise BadName("empty name")
    if len(name) > MAX_NAME:
        stem, ext = os.path.splitext(name)
        ext = ext[:16]
        name = stem[: MAX_NAME - len(ext)] + ext
    return name


def inside(base, target):
    """True if target (after resolving symlinks) is inside base."""
    base = Path(base).resolve()
    try:
        Path(target).resolve().relative_to(base)
        return True
    except ValueError:
        return False


def guess_type(name):
    return mimetypes.guess_type(name)[0] or "application/octet-stream"


class FileStore:
    def __init__(self, files_dir, trash_dir, max_upload=DEFAULT_MAX_UPLOAD):
        self.dir = Path(files_dir)
        self.trash = Path(trash_dir)
        self.max_upload = max_upload
        self.dir.mkdir(parents=True, exist_ok=True)

    def save(self, stream, length, name):
        """Read `length` bytes from stream and store them. Returns metadata."""
        name = safe_name(name)
        if length < 0:
            raise ValueError("missing length")
        if length > self.max_upload:
            raise ValueError("file too large")
        fid = secrets.token_hex(8)
        folder = self.dir / fid
        target = folder / name
        if not inside(self.dir, target):
            raise BadName("path outside files folder")
        folder.mkdir()
        tmp = folder / (".upload-" + secrets.token_hex(4))
        remaining = length
        try:
            with open(tmp, "wb") as f:
                while remaining > 0:
                    chunk = stream.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ValueError("upload ended early")
                    f.write(chunk)
                    remaining -= len(chunk)
            os.replace(tmp, target)
        except BaseException:
            shutil.rmtree(folder, ignore_errors=True)
            raise
        return self.meta(fid)

    def find(self, fid):
        """Return the Path of a stored file, or None."""
        if not isinstance(fid, str) or not ID_RE.match(fid):
            return None
        folder = self.dir / fid
        if not folder.is_dir() or not inside(self.dir, folder):
            return None
        for p in folder.iterdir():
            if p.is_file() and not p.name.startswith(".") and inside(self.dir, p):
                return p
        return None

    def meta(self, fid):
        p = self.find(fid)
        if not p:
            return None
        st = p.stat()
        return {"id": fid, "name": p.name, "size": st.st_size, "type": guess_type(p.name),
                "uploaded": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(st.st_mtime))}

    def to_trash(self, fid):
        p = self.find(fid)
        if not p:
            return False
        self.trash.mkdir(parents=True, exist_ok=True)
        dest = self.trash / f"{fid}-{time.strftime('%Y%m%d-%H%M%S')}"
        shutil.move(str(p.parent), str(dest))
        (dest / "deleted.json").write_text(json.dumps({"name": p.name, "deleted": time.time()}))
        return True
