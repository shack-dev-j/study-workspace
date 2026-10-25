#!/usr/bin/env bash
# Build ONE self-contained installer file from the current git commit:
#   scripts/make_installer.sh [out-dir]      -> study-workspace-install.sh
# The user runs:  bash study-workspace-install.sh
# It unpacks the app to a temp folder and runs install.sh (same options).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/exports}"
mkdir -p "$OUT"
VERSION="$(python3 -c "import sys; sys.path.insert(0, '$ROOT'); from backend import VERSION; print(VERSION)")"
FILE="$OUT/study-workspace-install.sh"
TMP="$(mktemp)"
git -C "$ROOT" archive --format=tar.gz --prefix=study-workspace/ HEAD > "$TMP"
{
cat <<HEAD
#!/usr/bin/env bash
# Study Workspace $VERSION: one-file installer for Arch Linux (and most Linux).
#   bash study-workspace-install.sh             install or update (keeps your data)
#   bash study-workspace-install.sh --check     only check what is needed
#   bash study-workspace-install.sh --no-service   no background service
# Your data in ~/.local/share/study-workspace/data is never touched.
set -euo pipefail
command -v tar >/dev/null && command -v base64 >/dev/null || { echo "Needs tar and base64 (coreutils)."; exit 1; }
DIR="\$(mktemp -d)"
trap 'rm -rf "\$DIR"' EXIT
sed '1,/^__PAYLOAD__\$/d' "\$0" | base64 -d | tar -xz -C "\$DIR"
bash "\$DIR/study-workspace/install.sh" "\$@"
exit 0
__PAYLOAD__
HEAD
base64 -w 76 "$TMP"
} > "$FILE"
rm -f "$TMP"
chmod +x "$FILE"
echo "$FILE ($(du -h "$FILE" | cut -f1))"
