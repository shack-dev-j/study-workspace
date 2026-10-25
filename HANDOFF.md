# HANDOFF: Study Workspace

Last update: 2026-10-25. Everything below is on `main`. Start new work from `main`.
Read this file alone and you can continue the project. **Exact build specs per feature: `docs/specs/FEATURES.md`.** Rules: `CLAUDE.md`.
Product spec: `docs/PRD.md`. Issues: GitHub #1–#49 (copy in `docs/ISSUES.md`),
status in `docs/BOARD.md`.

## 1. Who does what

The work is split between two AI agents:

- **Claude: core system + design.** Server, data layer, API, launcher,
  install, notifications, and the design system (layout, theme, shared
  components, CSS).
- **Gemini: feature pages.** Each page in `frontend/js/modules/`, built on
  the core helpers and the API below.

| Owner | Issues |
| --- | --- |
| Claude (core/design) | #1–#13 done · #18 PDF.js + viewer, shared components for #17/#19/#22/#28/#45, #46 Ctrl+K search, #21 linked-folder backend (done), #31 universities import backend, #47 responsive/a11y pass, #48 QA, #49 docs |
| Gemini (features) | #14–#17, #19, #20, #22–#30, #32–#45 (UI parts of #21 and #31 too). #38 is research (ICO, with sources). |

## 2. What works now

- `python server.py` → http://127.0.0.1:8765 (opens a browser tab;
  `--no-browser`, `--port`, `--data-root`, `--exit-when-idle`, `--help`).
- App shell: sidebar with every section, collapses under 800px, dark/light
  toggle (remembered), hash router, placeholder page per unbuilt section
  linking its issue, **Settings** page (export, restore, back up now,
  remove sample items, list backups).
- Backend (all tested, `python -m unittest discover tests`, 30 tests):
  safe JSON storage with revisions and migrations, file upload/download
  with path checks and Range requests, daily backup (keep 14),
  export/restore zip with zip-slip checks, linked folders, reminders
  logic, window tracking for auto-shutdown.
- PDF.js 4.10.38 vendored in `vendor/pdfjs/` (Apache-2.0).

- Desktop app (#8–#13): `desktop/study-workspace` launcher (`backend/launcher.py`):
  reuses or starts the server, opens pywebview → Chromium/Brave `--app` →
  default browser, server stops after the last window closes. Icons (SVG +
  PNG 16–512), `.desktop` file, `install.sh` / `uninstall.sh` (keeps data),
  `packaging/arch/PKGBUILD`, hourly `notify-send` reminders,
  `docs/ARCH_TEST.md`. 44 tests.

Not built yet: everything listed under "Gemini" above. `backend/research_import.py` (#31) does not
exist yet; the `/api/import/universities` route expects it.

## 3. Architecture

```
server.py                    entry point → backend.app.main()
backend/app.py               App: binds 127.0.0.1, background jobs (daily backup, hourly reminders), window watchdog, server.json state file
backend/handler.py           routes (static + /api/*), Host + CSRF checks, Range file serving
backend/paths.py             portable (./data) vs installed (XDG) data folder; first-run copy of data.example/
backend/storage.py           MODULES allowlist, atomic writes, _rev conflict check
backend/migrations.py        schema_version migrations (backup first)
backend/files.py             uploads in data/files/<id>/<name>, delete → data/trash/
backend/backup.py            backups/backup-YYYY-MM-DD.zip, keep 14
backend/exporter.py          export / restore zip
backend/linked.py            linked library folders (no copying)
backend/reminders.py         deadline reminders + notify-send
backend/windows.py           open-window tracking
backend/samples.py           remove items with "sample": true
frontend/index.html          shell
frontend/css/base.css        theme tokens + layout
frontend/css/components.css  buttons, cards, forms, tables, modal, toasts, tabs, badges, levels, charts, palette, prose
frontend/css/modules.css     page-specific styles (one section per page)
frontend/js/main.js          nav, router, theme, heartbeat
frontend/js/core/*.js        shared helpers (see §5)
frontend/js/modules/*.js     one file per page
```

Data root: portable mode = repo folder (`data/`, `backups/`); installed
mode (a `.installed` marker file in the app folder, written by install.sh /
PKGBUILD) = `~/.local/share/study-workspace/`. `STUDY_WORKSPACE_HOME`
overrides (tests use it).

## 4. API contract

All write requests must send header `X-Requested-By: study-workspace`
(`core/api.js` does this). Errors are `{"error": "..."}` with a status code.

| Method + path | What it does |
| --- | --- |
| `GET /api/health` | `{app, version, pid, data, portable, notify}` |
| `GET /api/data/<module>` | the module's JSON (`{}` with `_rev: 0` if new) |
| `PUT /api/data/<module>` | save the whole object; send the `_rev` you loaded; 409 if someone saved in between. Returns `{ok, _rev}` |
| `POST /api/files` | raw body, header `X-Filename` (URL-encoded) → 201 `{id, name, size, type, uploaded}` |
| `GET /api/files/<id>` | the file (Range supported); `?download=1` for attachment |
| `GET /api/files/<id>/meta` | metadata |
| `DELETE /api/files/<id>` | moves to trash |
| `GET /api/backups` / `POST /api/backups` | list / back up now |
| `GET /api/export` / `POST /api/restore` | zip download / restore (raw zip body) |
| `POST /api/library/scan {folder}` | list files in a folder from `settings.linkedFolders` |
| `GET /api/linked?path=` | serve a file inside a linked folder |
| `GET /api/reminders` / `POST /api/reminders` | current reminders / send desktop notifications now |
| `POST /api/window/open\|ping\|close {id}` | window tracking |
| `POST /api/import/universities {dryRun}` | (#31, not built) import from docs/research/universities.md |
| `POST /api/samples` | remove sample items |
| `POST /api/shutdown` | stop the server |

Modules allowed (`backend/storage.py` MODULES): settings, subjects, homework,
library, bookmarks, pastpapers, timelog, timetable, habits, sat, portfolio,
universities, scholarships, documents, deadlines, essays, activities, cyber,
thm, challenges, writeups, review, reminders. Add a new one there (and a
file in `data.example/`) if you need it.

### Data shapes (planned; keep to these so reminders/search/today work)

Every file: `{schema_version: 1, _rev, ...}`. Lists live in `items` unless noted.
Ids: `uid()` from `core/dom.js`. Dates: `"YYYY-MM-DD"`. Attached files: arrays
of the metadata returned by `POST /api/files`. Sample data: `"sample": true`.

- settings: `{theme, reminders, linkedFolders[], satDate, satTarget, icoDate, areas[]}`
- subjects: `items[{id, name, code, color, topics[{id, name, group, confidence 0-5, notes, reviewed}]}]` (Maths 9709 P1 + P5, Physics 9702 AS, CS 9618 AS)
- homework: `items[{id, kind: homework|assignment|project, subject, title, description, due, status: todo|doing|done, priority: low|normal|high, files[]}]` (reminders read `due`, `status`, `kind`)
- library: `items[{id, title, subject, type: textbook|workbook|past paper|mark scheme|notes, source: upload|linked, file|path, lastPage}]`
- bookmarks: `items[{id, bookId, page, note, topicId, homeworkId}]`
- pastpapers: `items[{id, subject, session, paper, variant, done, date, score, max, paperBookId, schemeBookId}]`
- timelog: `{running: null|{area, start}, entries[{id, area, date, minutes, note}]}`
- timetable: `slots[{id, day 0-6 (Mon=0), start "08:00", end, title, room}]`
- habits: `items[{id, name, days{"YYYY-MM-DD": true}}]`
- sat: `{tests[{id, date, total, math, rw, source}], skills[{id, section, domain, name, level, notes}], weeklyPlan{mon..sun}}`
- portfolio: `items[{id, type, title, date, description, role, result, links[], files[]}]`
- universities: `items[{id, name, country, city, program, qs_rank, the_rank, qs_cs_rank, eyuf: yes|no|check, tuition, living_cost, scholarships, alevel, sat: required|optional|not used, open_date, deadline, early_deadline, deadline_estimate, status: Researching|Preparing|Applied|Offer|Rejected|Accepted, priority, notes, sources[], verify[], docs[{id, name, status, files[]}]}]` (reminders read deadline, early_deadline, status)
- scholarships: `items[{id, name, pays, requirements, deadline, deadline_estimate, obligation, link, status}]`
- deadlines: `items[{id, title, date, estimate, done}]`
- essays: `items[{id, university, prompt, limit, text, versions[{at, text}]}]`
- cyber: `{topics[{id, name, level, notes}], plan{...}}`, thm `items[{id, name, url, topic, status, finished, notes}]`, challenges `items[{id, title, topic, difficulty, story, files, hint, solution, flag_sha256}]`, writeups `items[{id, title, linkType, linkId, body, files}]`

## 5. How to add a page (Gemini)

1. Create `frontend/js/modules/<route>.js`:
   ```js
   import { h } from '../core/dom.js';
   import { load, save, list } from '../core/store.js';
   import { formDialog, toast, button, pageHead, empty } from '../core/ui.js';
   export default {
     async render(el, args) {          // args = parts after #/<route>/
       const data = await load('homework');
       const items = list(data);       // data.items, created if missing
       // ...build DOM with h(); after a change: save('homework');
       // optional: return a cleanup function
     },
   };
   ```
2. In `frontend/js/main.js` add the route to `BUILT`.
3. Page CSS goes in `frontend/css/modules.css` under a comment header.
4. Backend tests if you add backend code; check the page in a browser at
   360px and 1280px width, dark and light.

### Core helpers

- `core/dom.js`: `h(tag, attrs, ...children)`, `$`, `$$`, `clear`, `esc`, `uid`, `debounce`, `highlight`, `plural`, `fmtSize`
- `core/icons.js`: `icon(name)`; names: today subjects homework library papers time calendar habits sat portfolio uni scholarship deadline docs activities essay plan shield flag terminal note chart settings search plus x menu sun moon upload download trash edit link play stop left right bookmark zoomin zoomout file folder eye bell copy key review
- `core/api.js`: `api.get/put/post/del/postRaw`, `uploadFile(file, onProgress)`, `fileUrl(meta, download)`, `linkedUrl(path)`
- `core/store.js`: `load(module)`, `save(module)` (debounced, serialized, handles 409), `list(data, key)`, `on(module, fn)`, `flushAll()`
- `core/ui.js`: `toast(msg, 'ok'|'error')`, `modal({title, body, actions})`, `confirmDialog`, `promptDialog`, `formDialog(title, fields, values, {onDelete, extra})`, `buildForm`, `levelPicker(value, onChange)`, `badge`, `empty`, `pageHead`, `button(label, fn, {kind, icon})`, `tabs`, `copyText`, `markdown(src)` (safe subset)
  - form field types: text, textarea, number, date, time, url, select (options), checkbox, level (0–5), tags, links
- `core/dates.js`: `today`, `iso`, `parse`, `addDays`, `daysUntil`, `weekStart`, `weekKey`, `weekday`, `fmt`, `fmtShort`, `relative`, `minutesText`, `clock`, `DAYS`

Shared components (ready; live demo at `#/components`):

- `core/attachments.js`: `attachmentsBox({files, onChange, accept, readOnly})`: drop zone + picker, upload progress, list with thumbnails, preview, download, remove (to trash). Store the `files` array on your item.
- `core/preview.js`: `previewFile(meta)` or `previewFile({url, name, type})`: images and PDFs in a modal, others as download. `isImage`, `isPdf`.
- `core/pdfviewer.js`: `await createPdfViewer(container, {url, page, dark, onPage(n, total), onDark(on), toolbarExtra})` → `{page, total, goTo(n), setDark(on), destroy()}`. Page nav + keys, zoom, fit width, search with highlights, dark mode, text selection. Call `destroy()` in your page cleanup. For linked library files use `linkedUrl(path)` from `core/api.js`.
- `core/charts.js`: `lineChart({series:[{label, points:[{x:'YYYY-MM-DD', y}]}], target:{y, label}, yMin, yMax, format})`, `barChart({labels, series:[{label, values}], format})`.
- `core/search.js`: Ctrl+K palette is wired in `main.js`. It already searches every module that follows the data shapes in §4 (homework, library, bookmarks, pastpapers, universities, scholarships, deadlines, essays, activities, portfolio, thm, challenges, writeups, subject topics, cyber topics) and links to `#/<route>/<id>`. For anything else: `registerSearch(async q => [{group, title, sub, href}])`.

### Design conventions

- Colours only via CSS variables in `base.css` (`--bg --panel --panel-2
  --border --text --muted --faint --accent --ok --warn --danger` and `-soft`
  variants). Never hard-code colours, so both themes work.
- Layout: `.card`, `.grid.cols-2/3/4`, `.row`, `.toolbar`, `.page-head`,
  `.stat`; lists: `table.list` (turns into cards under 700px; set
  `data-label` on each `td`), `.items > .item`; overdue rows get `.overdue`
  (red), done rows `.is-done`.
- Buttons: `.btn`, `.btn.primary` (one per view), `.btn.ghost`,
  `.btn.danger`, `.btn.small`, `.icon-btn`. Badges: `.badge.ok/warn/danger/accent/verify`.
- Confidence/levels 0–5: `levelPicker` (colours `--level-0..5`).
- Simple English UI text. Short labels. Empty states with `empty()`.

## 6. Decisions made

- Entry year is **2028** (per the research report); applications run
  Sep 2027 – Feb 2028.
- Maths = 9709 Paper 1 (Pure 1) + Paper 5 (Probability & Statistics 1).
- The link given as "SAT site" (https://shack-dev-j.github.io/Claude/) is the
  user's **9618 AS Revision Hub**. It exports progress JSON
  `{app: "9618 AS Revision Hub", summary[{chapter, title, practice_marks, confidence_percent}], data}`.
  #15 imports that into CS topics. SAT import uses its own documented JSON.
- Desktop: Hyprland on Arch. pywebview GTK backend preferred; window class /
  app-id `study-workspace`; notify-send needs a daemon (mako/dunst/swaync).
- Security: localhost only, Host header check, CSRF header on writes.
- No GitHub Projects board: the Projects API needs GraphQL, blocked from the
  cloud session. `docs/BOARD.md` is the board; steps to create the real one
  are in it.
- Work happens on short branches with pull requests into `main`; commits say "Closes #N" so issues close on merge. Don't stack PRs on other unmerged branches (a stacked PR merges into its base branch, not `main`).
- University data: only facts from `docs/research/universities.md`; empty +
  "verify" otherwise; dates for 2028 marked as estimates.

## 7. How to run / test

```bash
python server.py                      # app at http://127.0.0.1:8765
python -m unittest discover tests     # backend tests
```

## 8. Known issues

- The GUI window, Hyprland app-id and notifications can't be tested from the cloud: the user runs `docs/ARCH_TEST.md`.
- `data.example/` only has empty modules; real sample data and syllabus
  topics still to add (#14 etc.).
