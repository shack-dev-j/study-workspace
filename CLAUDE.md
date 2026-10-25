# CLAUDE.md: rules for AI sessions working on Study Workspace

Study Workspace is a personal, offline study and life-tracking app for one
user: a 10th grade student (Cambridge AS Level CS, Physics, Maths; Digital SAT;
university applications for fall 2027; ICO cybersecurity olympiad). The main
target is an **Arch Linux desktop app**. The user's days are packed: the app
must be fast and simple.

Read `HANDOFF.md` for current status, then `docs/PRD.md`,
`docs/ROADMAP.md`, and `docs/ISSUES.md` / GitHub issues.

## Stack (do not change without asking the user)

- Frontend: vanilla HTML, CSS, JavaScript (ES modules loaded directly by the
  browser). **No build step, no frameworks, no npm, no external CDNs.**
- Backend: Python **standard library only** (`http.server`, `json`,
  `zipfile`, ...). Python 3.10+.
- Only optional Python package: `pywebview` (desktop window). The app must
  still work without it.
- Third-party frontend code only if vendored into `vendor/<name>/` with its
  LICENSE file (e.g. PDF.js). Nothing is downloaded at runtime.
- Must work fully offline.

## Data rules

- All data is JSON files in `data/`; uploaded files in `data/files/`.
- `data/`, `backups/`, `exports/` are git-ignored. **Never commit personal
  data, secrets or passwords.**
- `data.example/` holds fake sample data and is committed. On first run, if
  `data/` does not exist, copy it from `data.example/`.
- Data location: on Linux installs use `~/.local/share/study-workspace/data`
  (XDG, respect `$XDG_DATA_HOME`). When run from the repo or a USB drive
  (portable mode), use the local `data/` folder.
- Safe writes: write to a temp file in the same folder, then `os.replace`.
- Daily backup of `data/` JSON files to `backups/`, keep the last 14.
- **Never delete or overwrite user data.** If a data format changes: back up
  first, then write a migration (keep a `schema_version` in each file).
- Validate every uploaded file name and path. Nothing may be written outside
  `data/files/` (reject `..`, absolute paths, symlink escapes).
- Server binds to `127.0.0.1` by default.

## UI rules

- Clean, calm design. Dark mode default, light mode toggle.
- Responsive: phone and laptop. Sidebar collapses on small screens.
- UI text in simple English.
- Charts drawn with plain JS/SVG.

## Code rules

- Keep code simple, organised by module, and commented.
- One backend module and one frontend module per feature area where possible.
- Add simple Python tests (`unittest`) for backend features, including file
  upload and backup. Run: `python -m unittest discover tests`.
- The GUI cannot be tested from the cloud: test server and launcher logic
  headless, and keep `docs/ARCH_TEST.md` up to date for manual checks.
- Before pushing UI changes run `scripts/smoke.js` and `scripts/e2e.js`
  (`NODE_PATH=$(npm root -g) node scripts/...`). They use Playwright and are
  developer tools only: the app itself never needs Node or npm.
- v2: `planner`, `focus` and `todoist` data are written by the server; change
  them only through their API routes (see `HANDOFF.md` §4). API keys live in
  `data/secrets.json` (mode 600) and must never be exported, backed up,
  returned by the API or committed.
- v3: built-in content lives in `content/` (build it with `scripts/build_content.py`)
  and is merged by `backend/seed.py`, which may only ADD items. Link to past
  papers, never bundle them. Every link needs a source in `docs/research/sources.md`.
- v3: the assistant may only change data through the tools in
  `backend/assistant.py` (validated, logged, undoable); it must never delete
  without the user's confirmation or touch settings or secrets.
- Focus mode may only close windows with `hyprctl dispatch closewindow`;
  never kill processes or close the shell, terminals or this app.
- List pages use `frontend/js/core/crud.js`; keep the data shapes in
  `HANDOFF.md` §4 so search, reminders and the Today page keep working.

## Folder structure

```
server.py            entry point (python server.py)
backend/             Python backend modules
frontend/            index.html, css/, js/core/, js/modules/, assets/
vendor/              vendored third-party code + licenses
desktop/             launcher script, .desktop file, icons/
packaging/arch/      PKGBUILD
install.sh / uninstall.sh   (M1) Arch install helpers
data.example/        fake sample data (committed)
content/             built-in study content merged into data (v3)
data/                real user data (git-ignored, created on first run)
backups/             daily JSON backups (git-ignored)
docs/                PRD, ROADMAP, ISSUES, BOARD, research/, ARCH_TEST
tests/               Python unittest tests
scripts/             helper scripts
```

## How to run

```bash
python server.py              # starts on http://127.0.0.1:8765
python -m unittest discover tests
```

## Workflow for every issue

1. Mark the issue In Progress (GitHub board or `docs/BOARD.md`).
2. Build it following the rules above.
3. Test: run the server, check the feature, check older features still work.
4. Commit like `feat(#3): add homework attachments`, with `Closes #3` when
   GitHub issues are used. Push.
5. Mark the issue Done.
6. Tell the user in 2–3 lines what was finished.

After each milestone: push, and send the user a zip of the whole project.

If unsure, ask the user instead of guessing. Do not invent data (e.g.
university rankings): leave it empty, mark "verify", keep the source link.
