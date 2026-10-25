# Study Workspace

A personal study and life-tracking app: school subjects (Cambridge AS Level),
homework, textbooks with a built-in PDF reader, SAT prep, university
applications, and cybersecurity olympiad (ICO) training. Everything in one
fast, calm, offline app.

> Status: core system, design system and the Arch desktop app are built.
> Feature pages are being added (see `HANDOFF.md` and `docs/BOARD.md`).

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
```
