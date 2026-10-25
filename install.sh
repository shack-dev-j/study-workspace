#!/usr/bin/env bash
# Study Workspace installer for Arch Linux (works on most Linux distros).
#
#   ./install.sh          check dependencies, then install for this user
#   ./install.sh --check  only check dependencies
#   ./install.sh --yes    don't ask questions (copy existing repo data: no)
#
# Installs:
#   app       -> ~/.local/share/study-workspace/app
#   launcher  -> ~/.local/bin/study-workspace
#   menu item -> ~/.local/share/applications/study-workspace.desktop
#   icons     -> ~/.local/share/icons/hicolor/...
# Your data lives in ~/.local/share/study-workspace/data and is never touched
# by re-installing.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
ROOT="$DATA_HOME/study-workspace"
APP="$ROOT/app"
BIN="$HOME/.local/bin"
APPS="$DATA_HOME/applications"
ICONS="$DATA_HOME/icons/hicolor"

CHECK_ONLY=0; YES=0
for a in "$@"; do
  case "$a" in
    --check) CHECK_ONLY=1 ;;
    --yes|-y) YES=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unknown option: $a"; exit 2 ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
miss() { printf '  \033[33m•\033[0m %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
in_repos() { have pacman && pacman -Si "$1" >/dev/null 2>&1; }

bold "Checking what Study Workspace needs"
TODO=()

# 1. Python 3.9+ (required)
if have python3 && python3 -c 'import sys; sys.exit(sys.version_info < (3, 9))'; then
  ok "Python $(python3 -c 'import platform; print(platform.python_version())')"
else
  miss "Python 3.9 or newer is missing (required)"
  echo; echo "Install it with:  sudo pacman -S python"; exit 1
fi

# 2. Own window: pywebview (best), or Chromium/Brave in app mode
if python3 -c 'import webview' 2>/dev/null; then
  ok "pywebview (the app opens in its own window)"
else
  miss "pywebview not installed (optional, gives the best window)"
  if in_repos python-pywebview; then TODO+=("sudo pacman -S python-pywebview python-gobject webkit2gtk-4.1")
  else TODO+=("sudo pacman -S python-gobject webkit2gtk-4.1 && yay -S python-pywebview"); fi
fi
BROWSER=""
for b in chromium brave brave-browser google-chrome-stable google-chrome vivaldi-stable; do
  if have "$b"; then BROWSER="$b"; break; fi
done
if [ -n "$BROWSER" ]; then ok "$BROWSER (fallback window in app mode)"
else miss "No Chromium-based browser found (optional fallback)"; TODO+=("sudo pacman -S chromium   # optional fallback"); fi

# 3. Desktop notifications
if have notify-send; then ok "notify-send"
else miss "notify-send missing (needed for deadline reminders)"; TODO+=("sudo pacman -S libnotify"); fi
if [ -n "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ]; then
  if pgrep -x mako >/dev/null || pgrep -x dunst >/dev/null || pgrep -x swaync >/dev/null || pgrep -x fnott >/dev/null \
     || pgrep -f xfce4-notifyd >/dev/null || pgrep -x gnome-shell >/dev/null || pgrep -x plasmashell >/dev/null; then
    ok "notification daemon is running"
  else
    miss "no notification daemon found (on Hyprland: mako, dunst or swaync)"
    TODO+=("sudo pacman -S mako   # then add 'exec-once = mako' to ~/.config/hypr/hyprland.conf")
  fi
fi

if [ ${#TODO[@]} -gt 0 ]; then
  echo; bold "Optional: run these to get every feature"
  for t in "${TODO[@]}"; do echo "  $t"; done
fi
if [ "$CHECK_ONLY" = 1 ]; then exit 0; fi

echo; bold "Installing to $APP"
mkdir -p "$ROOT" "$BIN" "$APPS"

# Fresh copy of the app (the app folder never holds your data).
TMP="$ROOT/.app-new"
rm -rf "$TMP"; mkdir -p "$TMP"
for item in server.py backend frontend vendor desktop docs data.example README.md CLAUDE.md HANDOFF.md; do
  if [ -e "$SRC/$item" ]; then cp -r "$SRC/$item" "$TMP/"; fi
done
find "$TMP" -name '__pycache__' -type d -prune -exec rm -rf {} +
touch "$TMP/.installed"          # tells the app to use ~/.local/share/study-workspace/data
rm -rf "$APP.old"; if [ -d "$APP" ]; then mv "$APP" "$APP.old"; fi
mv "$TMP" "$APP"; rm -rf "$APP.old"
ok "app files"

# Launcher with the app path filled in.
sed "s|@APP_DIR@|$APP|" "$SRC/desktop/study-workspace" > "$BIN/study-workspace"
chmod +x "$BIN/study-workspace"
ok "launcher: $BIN/study-workspace"

# Menu entry and icons.
sed "s|@EXEC@|$BIN/study-workspace|" "$SRC/desktop/study-workspace.desktop" > "$APPS/study-workspace.desktop"
mkdir -p "$ICONS/scalable/apps"
cp "$SRC/desktop/icons/study-workspace.svg" "$ICONS/scalable/apps/study-workspace.svg"
for d in "$SRC"/desktop/icons/png/*x*; do
  s="$(basename "$d")"; mkdir -p "$ICONS/$s/apps"; cp "$d/study-workspace.png" "$ICONS/$s/apps/"
done
have update-desktop-database && update-desktop-database "$APPS" >/dev/null 2>&1 || true
have gtk-update-icon-cache && gtk-update-icon-cache -f -t "$ICONS" >/dev/null 2>&1 || true
ok "menu entry and icons"

# Offer to bring data from a portable copy (the repo folder) the first time.
if [ -d "$SRC/data" ] && [ ! -d "$ROOT/data" ]; then
  ans="n"
  if [ "$YES" = 0 ]; then
    read -r -p "Found data in $SRC/data. Copy it to $ROOT/data? [Y/n] " ans || true
    ans="${ans:-y}"
  fi
  case "$ans" in [Yy]*) cp -r "$SRC/data" "$ROOT/data"; ok "copied your data" ;; *) echo "  Data not copied." ;; esac
fi

case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo; miss "$BIN is not in your PATH. Add this to ~/.bashrc or ~/.zshrc:"; echo "    export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
esac

echo; bold "Done. Open \"Study Workspace\" from your app launcher, or run: study-workspace"
echo "Your data: $ROOT/data"
