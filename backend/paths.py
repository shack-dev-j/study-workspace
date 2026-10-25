"""Where the app's files live.

Two modes:
- Portable (default): running from the repo folder or a USB drive. Data lives
  next to the app in ./data, backups in ./backups.
- Installed: install.sh / PKGBUILD put a ".installed" marker file in the app
  folder. Data then follows the OS convention:
    Linux:   $XDG_DATA_HOME/study-workspace (default ~/.local/share/study-workspace)
    Windows: %APPDATA%/StudyWorkspace
    macOS:   ~/Library/Application Support/StudyWorkspace
The STUDY_WORKSPACE_HOME environment variable overrides both (used by tests).
"""

import os
import shutil
import sys
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
INSTALLED_MARKER = ".installed"


def is_installed(app_root=APP_ROOT):
    return (Path(app_root) / INSTALLED_MARKER).exists()


def user_data_root(env=None, platform=None, home=None):
    """The per-user data folder used by an installed app."""
    env = os.environ if env is None else env
    platform = platform or sys.platform
    home = Path(home) if home else Path.home()
    if platform.startswith("win"):
        base = env.get("APPDATA") or str(home / "AppData" / "Roaming")
        return Path(base) / "StudyWorkspace"
    if platform == "darwin":
        return home / "Library" / "Application Support" / "StudyWorkspace"
    xdg = env.get("XDG_DATA_HOME")
    base = Path(xdg) if xdg and os.path.isabs(xdg) else home / ".local" / "share"
    return base / "study-workspace"


def data_root(app_root=APP_ROOT, env=None, platform=None, home=None):
    """Folder that holds data/, backups/ and the server state file."""
    env = os.environ if env is None else env
    override = env.get("STUDY_WORKSPACE_HOME")
    if override:
        return Path(override).expanduser()
    if is_installed(app_root):
        return user_data_root(env, platform, home)
    return Path(app_root)


class Paths:
    """All important paths, computed once."""

    def __init__(self, root=None, app_root=APP_ROOT):
        self.app = Path(app_root)
        self.root = Path(root) if root else data_root(app_root)
        self.data = self.root / "data"
        self.files = self.data / "files"
        self.trash = self.data / "trash"
        self.backups = self.root / "backups"
        self.state_file = self.root / "server.json"
        self.log_file = self.root / "server.log"
        self.frontend = self.app / "frontend"
        self.vendor = self.app / "vendor"
        self.example = self.app / "data.example"
        self.docs = self.app / "docs"
        self.icon = self.app / "desktop" / "icons" / "study-workspace.svg"

    @property
    def portable(self):
        return self.root.resolve() == self.app.resolve()


def ensure_data(paths):
    """Create the data folder on first run. Never overwrites anything.

    - data/ missing: copy the whole data.example/ folder.
    - data/ exists: only copy example JSON files that are missing (new
      modules added in an update). Existing files are left alone.
    """
    created = False
    if not paths.data.exists():
        paths.root.mkdir(parents=True, exist_ok=True)
        if paths.example.is_dir():
            shutil.copytree(paths.example, paths.data)
        else:
            paths.data.mkdir(parents=True)
        created = True
    elif paths.example.is_dir():
        for src in paths.example.glob("*.json"):
            dst = paths.data / src.name
            if not dst.exists():
                shutil.copy2(src, dst)
    for d in (paths.files, paths.trash, paths.backups):
        d.mkdir(parents=True, exist_ok=True)
    # Remove a copied placeholder, if any.
    keep = paths.files / ".gitkeep"
    if keep.exists():
        keep.unlink()
    return created
