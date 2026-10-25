"""Live colours from the Caelestia shell (optional).

Caelestia keeps its current Material 3 colour scheme (made from your
wallpaper, or a named scheme) in $XDG_STATE_HOME/caelestia/scheme.json:

  {"name": "dynamic", "flavour": "default", "mode": "dark", "variant": "tonalspot",
   "colours": {"primary": "c2c1ff", "surface": "131317", ...}}

The app reads that file (read only) and uses the same colours, so it looks
like part of the shell and follows wallpaper changes. Without Caelestia the
app uses its own built-in scheme (the same default colours).
"""

import json
import os
import re
from pathlib import Path

HEX = re.compile(r"^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$")
# The Material 3 roles the app uses.
ROLES = (
    "background", "onBackground", "surface", "surfaceDim", "surfaceBright", "surfaceContainerLowest",
    "surfaceContainerLow", "surfaceContainer", "surfaceContainerHigh", "surfaceContainerHighest",
    "onSurface", "surfaceVariant", "onSurfaceVariant", "outline", "outlineVariant", "inverseSurface",
    "inverseOnSurface", "primary", "onPrimary", "primaryContainer", "onPrimaryContainer", "secondary",
    "onSecondary", "secondaryContainer", "onSecondaryContainer", "tertiary", "onTertiary",
    "tertiaryContainer", "onTertiaryContainer", "error", "onError", "errorContainer", "onErrorContainer",
    "green", "yellow", "peach", "red", "teal", "mauve",
)


def scheme_path(env=None):
    env = os.environ if env is None else env
    base = env.get("XDG_STATE_HOME")
    base = Path(base) if base and os.path.isabs(base) else Path(env.get("HOME") or Path.home()) / ".local" / "state"
    return base / "caelestia" / "scheme.json"


def read_scheme(path=None):
    """Return {source, name, mode, colours{role: '#rrggbb'}, mtime} or None."""
    p = Path(path) if path else scheme_path()
    try:
        st = p.stat()
        if st.st_size > 256 * 1024:
            return None
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("colours"), dict):
        return None
    colours = {}
    for k, v in data["colours"].items():
        v = str(v).lstrip("#")
        if k in ROLES and HEX.match(v):
            colours[k] = "#" + v[:6].lower()
    if "primary" not in colours or "surface" not in colours:
        return None
    mode = data.get("mode") if data.get("mode") in ("dark", "light") else "dark"
    return {"source": "caelestia", "name": str(data.get("name", ""))[:40], "flavour": str(data.get("flavour", ""))[:40],
            "mode": mode, "colours": colours, "mtime": int(st.st_mtime)}
