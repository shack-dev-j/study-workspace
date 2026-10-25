"""Linked library folders: read big PDFs where they already are (no copying).

Folders are listed in settings.json -> "linkedFolders". A linked file is only
served if its real path is inside one of those folders.
"""

import os
from pathlib import Path

from .files import guess_type, inside

BOOK_EXT = {".pdf", ".epub", ".djvu", ".docx", ".doc", ".pptx", ".txt", ".md",
            ".png", ".jpg", ".jpeg", ".webp", ".gif"}
MAX_FILES = 5000


def expand(folder):
    return Path(os.path.expandvars(os.path.expanduser(str(folder)))).resolve()


def scan(folder):
    """List book-like files under folder. Returns list of dicts."""
    root = expand(folder)
    if not root.is_dir():
        raise FileNotFoundError(str(root))
    out = []
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
        for fn in sorted(filenames):
            p = Path(dirpath) / fn
            if fn.startswith(".") or p.suffix.lower() not in BOOK_EXT:
                continue
            if not inside(root, p):
                continue
            try:
                st = p.stat()
            except OSError:
                continue
            rel = p.relative_to(root)
            out.append({"path": str(p), "name": fn, "folder": str(rel.parent) if str(rel.parent) != "." else "",
                        "size": st.st_size, "type": guess_type(fn)})
            if len(out) >= MAX_FILES:
                return out
    return out


def allowed_path(path, folders):
    """Return the resolved Path if it is a file inside a linked folder, else None."""
    if not path:
        return None
    try:
        p = Path(path).resolve()
    except (OSError, RuntimeError):
        return None
    for f in folders or []:
        try:
            base = expand(f)
        except (OSError, RuntimeError):
            continue
        if base.is_dir() and inside(base, p) and p.is_file():
            return p
    return None
