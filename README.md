# Study Workspace

A personal study and life-tracking app: school subjects (Cambridge AS Level),
homework, textbooks with a built-in PDF reader, SAT prep, university
applications, and cybersecurity olympiad (ICO) training. Everything in one
fast, calm, offline app.

> Status: **Phase 0 (setup)**. The folder structure is in place; features are
> being planned in `docs/PRD.md` and `docs/ROADMAP.md`.

## Main ideas

- Runs fully offline. No accounts, no cloud, no CDNs.
- Your data stays on your computer as plain JSON files in `data/`.
- Works as a desktop app on Arch Linux (its own window), and also on
  Windows and macOS with `python server.py`.

## Requirements

- Python 3.10 or newer (standard library only)
- Optional: `python-pywebview` for a native window on Linux

## Run it (development)

The server is built in milestone M1. Once it exists:

```bash
python server.py
```

Then open the address it prints (by default `http://127.0.0.1:8765`).
The server only listens on your own computer, not the network.

On first run, if `data/` does not exist, it is created from `data.example/`.

## Install on Arch Linux

Coming in milestone M1 (`install.sh`, `.desktop` file, launcher, PKGBUILD).

## Folder structure

| Folder | What is inside |
| --- | --- |
| `server.py` | Entry point: starts the local server (added in M1) |
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
