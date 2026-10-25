# Study Workspace

A personal study and life-tracking app: school subjects (Cambridge AS Level),
homework, textbooks with a built-in PDF reader, SAT prep, university
applications, and cybersecurity olympiad (ICO) training. Everything in one
fast, calm, offline app.

> Status: version 3.0: AI assistant, built-in past papers and resources, day planner, focus mode, Todoist. Developer notes: `HANDOFF.md`.

## What is inside

| Area | Pages |
| --- | --- |
| **Assistant** | Chat with Gemini about your studies. It can add and change homework, deadlines, past papers, lessons, topic levels and plan your day. Every change has an Undo button, and it never deletes without asking |
| **Ready on day one** | 210 Cambridge past papers (9709, 9702, 9618, 2021–2025) with links to the paper and mark scheme, 38 checked resource links (syllabuses, SAT practice, cyber training), 23 TryHackMe rooms, universities from your research report and default habits. New content is added on updates without touching your own data |
| **My day** | Your day in time blocks: what to do now, when to take a break, what is next, a must-do list, what to pack in your backpack for tomorrow's lessons. Plans itself from homework, deadlines, Todoist, SAT and cyber plans, your timetable and routines |
| **Focus** | Focus mode for Hyprland: warns about, then closes distracting apps (your list) during study blocks, and nags when work is overdue. Off until you turn it on |
| **Overview** | One screen for the day: homework due soon, SAT and cyber task, habits, lessons, deadlines, the book you were reading, reminders |
| **Study** | Subjects (syllabus topics rated 0–5, 9618 Hub import) · Homework and projects with files · Library with a built-in PDF reader and bookmarks · Past papers · Time log with timers · Timetable · Habits · SAT (scores chart, skills, weekly plan) |
| **Applications** | Universities (imported from your research report, "verify" marks) · Scholarships · Deadlines timeline · Documents checklists · Activities list · Essays with versions · Plan A / Plan B |
| **Cyber / ICO** | Topics and a weekly plan to the selection date · TryHackMe tracker · 12 offline practice challenges · Writeups |
| **Me** | Portfolio · Weekly review with charts · Settings (backups, export/restore, linked folders) |

Press **Ctrl+K** anywhere to search everything.

## Install (one file)

```bash
bash study-workspace-install.sh
```

That checks what is missing (and prints the exact `pacman` commands), installs the app for your
user (no sudo), adds it to your app launcher, and starts it in the background after login.
Running it again updates the app and never touches your data. Options: `--check`, `--no-service`.
Build the file yourself with `scripts/make_installer.sh` (or use `./install.sh` from the repo).

## Connect Todoist and Gemini (optional)

Open **Settings → Connections**:

- **Todoist**: in Todoist open Settings → Integrations → Developer, copy the API token, paste it, Save.
  Tasks sync every 15 minutes and go into your day plan; finishing them in the app closes them in Todoist.
- **Gemini**: get a free key at https://aistudio.google.com/apikey, paste it, Save, then **Check key**.
  It powers the **Assistant** page (chat that can add, change and plan things, with Undo).
  It adds "Split into steps" to study blocks and a "Coach" button on My day.

Keys are saved only in `data/secrets.json` on your computer (only you can read it). They are never in
backups, exports or git. Without keys everything else still works offline.

## First steps

1. **Settings → Day planner**: set wake-up and sleep times, routines, and what goes in your backpack for each lesson. Fill in **Timetable** so lessons appear in your day.
2. **Focus**: turn focus mode on and edit the block list (Hyprland only).
3. Open **Settings**: check the SAT date and target, set the ICO selection date if you know it, and link your folder of textbooks.
4. **Settings → Remove sample items** deletes the few fake examples (your syllabus topics, SAT skills, scholarships and challenges stay).
5. **Universities → Import from research report** adds the universities from `docs/research/universities.md`.
6. **Subjects**: rate each topic 0–5. **Cyber**: rate topics, then press Generate plan.

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
- Launcher: `~/.local/bin/study-workspace` (`--status`, `--stop`, `--browser`, `--no-window`, `--now`)
- Window: pywebview if installed, otherwise Chromium/Brave in app mode, otherwise your browser.
- Background: a systemd user service (`systemctl --user status study-workspace`) keeps reminders,
  plan notifications and focus mode running when the window is closed. Turn it off with
  `systemctl --user disable --now study-workspace`, or Settings → General → keep running.
- `study-workspace --now` prints what to do now (handy for a bar widget).
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
