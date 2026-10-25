#!/usr/bin/env bash
# Remove Study Workspace. Your data is KEPT unless you type DELETE.
#
#   ./uninstall.sh            remove the app, ask about data (default: keep)
#   ./uninstall.sh --keep-data  remove the app, don't ask
set -euo pipefail

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
ROOT="$DATA_HOME/study-workspace"
BIN="$HOME/.local/bin"
APPS="$DATA_HOME/applications"
ICONS="$DATA_HOME/icons/hicolor"
KEEP=0
if [ "${1:-}" = "--keep-data" ]; then KEEP=1; fi

# Stop a running server first.
if [ -x "$BIN/study-workspace" ]; then "$BIN/study-workspace" --stop >/dev/null 2>&1 || true; fi

rm -rf "$ROOT/app" "$ROOT/browser-profile"
rm -f "$BIN/study-workspace" "$APPS/study-workspace.desktop" "$ROOT/server.json" "$ROOT/.launcher.lock"
rm -f "$ICONS/scalable/apps/study-workspace.svg"
rm -f "$ICONS"/*/apps/study-workspace.png
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1 || true
echo "Study Workspace was removed."

if [ -d "$ROOT/data" ]; then
  echo "Your data is still in: $ROOT/data (backups in $ROOT/backups)"
  if [ "$KEEP" = 0 ] && [ -t 0 ]; then
    echo "Tip: export it first from the app (Settings → Export all data) if you might want it later."
    read -r -p "Delete your data and backups too? This cannot be undone. Type DELETE to confirm: " ans || true
    if [ "${ans:-}" = "DELETE" ]; then
      rm -rf "$ROOT/data" "$ROOT/backups"
      rmdir "$ROOT" 2>/dev/null || true
      echo "Data deleted."
    else
      echo "Data kept."
    fi
  fi
fi
