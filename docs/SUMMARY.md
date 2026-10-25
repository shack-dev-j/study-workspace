# Study Workspace 1.0: final summary

Built 25 October 2026. All 49 GitHub issues (M1–M6) are done.

## What you have

A fast, offline study and life-tracking app that runs as its own window on Arch Linux (Hyprland), or in any browser with `python server.py`. All data stays on your computer as JSON in `~/.local/share/study-workspace/data` (or `data/` in portable mode), with a daily backup (last 14 kept) and one-click export / restore.

- **Today**: everything for the day on one screen.
- **Study**: subjects with real syllabus topics (9709 P1+P5, 9702 AS, 9618 AS) rated 0–5, the 9618 Hub import, homework with files, a library with a built-in PDF reader that remembers your page, bookmarks, past papers, timers, timetable, habits, and the SAT tracker.
- **Applications**: universities imported from your research report (ranks copied exactly, missing facts marked "verify"), 7 scholarships from the report, deadlines timeline with desktop reminders, documents checklists, activities, essays with versions, Plan A / Plan B.
- **Cyber / ICO**: topics from the ICO syllabus, a weekly plan up to the selection date, TryHackMe tracker, 12 offline practice challenges, writeups.
- **Me**: portfolio and a weekly review with charts.

## Safety

- The server only listens on 127.0.0.1, checks the Host header, and every write needs a special header (other websites can't change your data).
- Saves are atomic (temp file + rename), with a revision check between windows.
- Uploads can't escape `data/files/`; deleting a file moves it to `data/trash/`.
- `uninstall.sh` keeps your data unless you type DELETE.
- Nothing personal is in the repo; `data/`, `backups/` and `exports/` are git-ignored.

## Tested

- 55 backend unit tests (`python -m unittest discover tests`).
- Every page at laptop and phone width, dark and light, with no console errors (`scripts/smoke.js`).
- 9 end-to-end flows in a real headless browser (`scripts/e2e.js`): uploads, PDF reader, bookmarks, timers, imports, flags, essays, Today.

## For you to do

1. Merge the pull requests in order: #55, #56, #57, #58, then the M6 PR.
2. Run the checklist in `docs/ARCH_TEST.md` on your laptop (window, notifications, a big linked PDF).
3. Answer the open question in `docs/research/ico.md`: is the Uzbek 2027 selection for the ICO (CTF) or the ICOA (AI, Sydney)?
4. Check every "verify" fact and "estimate" date on the official university pages before you rely on it.
