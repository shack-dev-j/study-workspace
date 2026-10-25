# Study Workspace

A personal study and life-tracking app: school subjects (Cambridge AS Level),
homework, textbooks with a built-in PDF reader, SAT prep, university
applications, and cybersecurity olympiad (ICO) training. Everything in one
fast, calm, offline app.

> Status: version 1.0, every feature is built. Developer notes: `HANDOFF.md`.

## What is inside

| Area | Pages |
| --- | --- |
| **Today** | One screen for the day: homework due soon, SAT and cyber task, habits, lessons, deadlines, the book you were reading, reminders |
| **Study** | Subjects (syllabus topics rated 0–5, 9618 Hub import) · Homework and projects with files · Library with a built-in PDF reader and bookmarks · Past papers · Time log with timers · Timetable · Habits · SAT (scores chart, skills, weekly plan) |
| **Applications** | Universities (imported from your research report, "verify" marks) · Scholarships · Deadlines timeline · Documents checklists · Activities list · Essays with versions · Plan A / Plan B |
| **Cyber / ICO** | Topics and a weekly plan to the selection date · TryHackMe tracker · 12 offline practice challenges · Writeups |
| **Me** | Portfolio · Weekly review with charts · Settings (backups, export/restore, linked folders) |

Press **Ctrl+K** anywhere to search everything.

## First steps

1. Open **Settings**: check the SAT date and target, set the ICO selection date if you know it, and link your folder of textbooks.
2. **Settings → Remove sample items** deletes the few fake examples (your syllabus topics, SAT skills, scholarships and challenges stay).
3. **Universities → Import from research report** adds the universities from `docs/research/universities.md`.
4. **Subjects**: rate each topic 0–5. **Cyber**: rate topics, then press Generate plan.

## Main ideas

- Runs fully offline. No accounts, no cloud, no CDNs.
- Your data stays on your computer as plain JSON files in `data/`.
- Works as a desktop app on Arch Linux (its own window), and also on
  Windows and macOS with `python server.py`.

## Requirements

- Python 3.10 or newer (standard library only)
- Optional: `python-pywebview` for a native window on Linux

## Run it (development)

```bash
python server.py
```

Then open the address it prints (by default `http://127.0.0.1:8765`).
The server only listens on your own computer, not the network.

On first run, if `data/` does not exist, it is created from `data.example/`.

## Install on Arch Linux

```bash
./install.sh --check     # shows the exact pacman / yay commands for anything missing
./install.sh             # installs for your user (no sudo needed)
```

Recommended packages for the best window and notifications:

```bash
sudo pacman -S python python-gobject webkit2gtk-4.1 libnotify
sudo pacman -S python-pywebview      # or: yay -S python-pywebview
sudo pacman -S mako                  # notification daemon for Hyprland (if you have none)
```

Then open **Study Workspace** from your app launcher, or run `study-workspace`.

- App: `~/.local/share/study-workspace/app`
- Your data: `~/.local/share/study-workspace/data` (backups next to it)
- Launcher: `~/.local/bin/study-workspace` (`--status`, `--stop`, `--browser`, `--no-window`)
- Window: pywebview if installed, otherwise Chromium/Brave in app mode, otherwise your browser.
  Closing the last window stops the server.
- Uninstall: `./uninstall.sh` (keeps your data unless you type DELETE).
- Package instead: `cd packaging/arch && makepkg -si`.
- Manual test list: `docs/ARCH_TEST.md`.

Run from the repo folder or a USB drive without installing: `./desktop/study-workspace`
(data stays in the local `data/` folder).

## Folder structure

| Folder | What is inside |
| --- | --- |
| `server.py` | Entry point: starts the local server |
| `backend/` | Python backend: API, storage, backups, files, notifications |
| `frontend/` | The app UI: `index.html`, `css/`, `js/core/`, `js/modules/` |
| `vendor/` | Third-party code copied into the repo (e.g. PDF.js), with licenses |
| `desktop/` | Linux launcher, `.desktop` file, icons |
| `packaging/arch/` | PKGBUILD for `makepkg` |
| `data.example/` | Fake sample data, copied to `data/` on first run |
| `docs/` | PRD, roadmap, research, test checklists |
| `tests/` | Python tests for the backend |
| `scripts/` | Small helper scripts |

`data/`, `backups/` and `exports/` are in `.gitignore`. Personal data is never
committed.

## Running tests

```bash
python -m unittest discover tests
# optional, needs Playwright: every page and the main flows in a headless browser
NODE_PATH=$(npm root -g) node scripts/smoke.js
NODE_PATH=$(npm root -g) node scripts/e2e.js
```
