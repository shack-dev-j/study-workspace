# Arch Linux test checklist

Run this on your Arch machine (Hyprland) after each milestone. It takes
about 10 minutes. Tick each box; if something fails, note what you saw.

## 0. Get the code

```bash
git clone https://github.com/shack-dev-j/study-workspace.git   # or unzip the project zip
cd study-workspace
python -m unittest discover tests        # expect: OK
```

## 1. Dependencies

```bash
./install.sh --check
```
- [ ] Python is found.
- [ ] Run the commands it prints for anything missing. Recommended:
      `sudo pacman -S python-gobject webkit2gtk-4.1 libnotify` and
      `sudo pacman -S python-pywebview` (or `yay -S python-pywebview` if it is
      not in the repos), plus a notification daemon (`mako`, `dunst` or
      `swaync`) started from `hyprland.conf`.
- [ ] Run `./install.sh --check` again: everything shows ✓.

## 2. Portable mode (from the repo folder)

```bash
./desktop/study-workspace
```
- [ ] A window titled "Study Workspace" opens (not a browser tab).
- [ ] A `data/` folder appears in the repo folder.
- [ ] `./desktop/study-workspace --status` says "Window: webview".
- [ ] Close the window. After ~10 s `./desktop/study-workspace --status` says "Not running".

## 3. Install

```bash
./install.sh
```
- [ ] It finishes with "Done". If it offered to copy `data/`, answer as you like.
- [ ] "Study Workspace" appears in your launcher (rofi / wofi / fuzzel) with the book icon.
- [ ] Open it from the launcher: own window, data in `~/.local/share/study-workspace/data`
      (Settings page shows the data folder).
- [ ] Optional Hyprland check: `hyprctl clients | grep -i -A3 study` shows class
      `study-workspace` (for window rules, e.g. `windowrulev2 = float, class:^(study-workspace)$`).
      If it shows something else (for example `python3`), note it here: ______

## 4. Two windows, one server

- [ ] Run `study-workspace` twice: two windows open.
- [ ] `study-workspace --status` shows one server.
- [ ] Close one window: the other still works (click around, change theme).
- [ ] Close the last one: the server keeps running in the background (v2), `study-workspace --status` still shows it.
      With Settings → General → "Keep running" off, it stops within ~10 s instead.

## 5. Fallback windows

- [ ] `study-workspace --browser` opens Chromium/Brave in app mode (no tabs, no address bar).
- [ ] Close it. The server stops within ~3 minutes at most (browser windows report by heartbeat).

## 6. Notifications

```bash
notify-send "Test" "Hello"     # a popup must appear; if not, the daemon isn't running
```
- [ ] With the app open, run:
      `curl -X POST -H 'X-Requested-By: study-workspace' -H 'Content-Length: 0' http://127.0.0.1:8765/api/reminders`
      Any deadline due tomorrow/today/overdue (homework) or 30/14/7/1/0 days away
      (applications) shows a popup titled "Study Workspace". (The pages to add
      homework and deadlines come later; until then this may send 0.)
- [ ] Running it again sends nothing new (each reminder is sent once).

## 7. Data safety

- [ ] Settings → "Export all data": a zip downloads.
- [ ] Settings → "Back up now": a new `backup-YYYY-MM-DD.zip` appears in
      `~/.local/share/study-workspace/backups/`.
- [ ] Settings → "Restore from export…" with the zip: success message; a
      `pre-restore-*.zip` appears in backups.

## 8. Uninstall (data must stay)

```bash
./uninstall.sh          # press Enter at the question (don't type DELETE)
```
- [ ] The launcher entry and `~/.local/bin/study-workspace` are gone.
- [ ] `~/.local/share/study-workspace/data` is still there.
- [ ] Re-run `./install.sh`: your data is back in the app.

## 9. PKGBUILD (optional)

```bash
./uninstall.sh --keep-data      # avoid two copies
cd packaging/arch && makepkg -si
```
- [ ] Package builds and installs; "Study Workspace" in the launcher works.
- [ ] Data is still read from `~/.local/share/study-workspace/data`.
- [ ] `sudo pacman -R study-workspace` removes it; data stays.

## 10. Feature check (10 minutes, in the app window)

Every page was tested headless in the cloud (`scripts/smoke.js`, `scripts/e2e.js`). These are the parts that need your real machine:

- [ ] **Library**: link a real folder of PDFs in Settings → Linked library folders, then Library → Scan linked folders. A big textbook opens fast, text can be selected, search inside the PDF works.
- [ ] Close the book and open it again: it continues at the same page. Dark reading mode is remembered.
- [ ] **Homework**: drag a photo of a worksheet onto a homework item; it previews.
- [ ] **Time log**: start a timer, close the window, open the app again: the timer is still running (top bar chip).
- [ ] **Subjects → Computer Science → Import 9618 Hub progress**: pick the JSON exported from your Revision Hub.
- [ ] **Universities → Import from research report**: about 17 universities appear, missing facts marked "verify".
- [ ] **Challenges**: download a file, solve it, the flag is accepted.
- [ ] Phone-size window (or `Super`+drag the window narrow): the menu collapses and pages stay readable.
- [ ] Light mode looks right on every page you use.

## 11. Version 2 (planner, focus, Caelestia, background)

- [ ] Install with the one file: `bash study-workspace-install.sh`. It ends with "Done" and says
      "background service". `systemctl --user status study-workspace` shows **active (running)**.
- [ ] Log out and in (or reboot): the service is running again without opening the app.
- [ ] **Colours**: with Caelestia, the app uses your shell colours. Change the wallpaper / scheme
      (`caelestia scheme set ...`): within 30 s (or when you focus the window) the app follows.
- [ ] **My day**: the timeline matches your timetable and routines; the now card counts down.
- [ ] **Notifications**: 5 minutes before a lesson and when a block starts you get a notification.
- [ ] **Focus**: turn focus mode on, choose Strict, start a 5-minute session, open Steam or Discord
      (or a window from your block list). You get a warning, then after ~20 s the window closes.
      The terminal, Caelestia shell and Study Workspace are never closed.
- [ ] Open YouTube in the browser during focus: a warning only (title rules never close).
- [ ] Press **Stop session**: no more warnings; it does not start again in the same block.
- [ ] **Todoist**: paste your token in Settings → Connections, Sync now: your tasks show in My day.
      Tick one in the app: it is closed in Todoist.
- [ ] **Gemini**: paste your key, Check key, then on a study block: ⋯ → Split into steps.
- [ ] `study-workspace --now` prints the current block.

## Notes

Write anything odd here (screenshots help).
