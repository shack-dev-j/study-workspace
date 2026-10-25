# HANDOFF: Study Workspace

Last update: 2026-10-25. **v2.0: day planner, focus mode, Todoist, Gemini, Caelestia design.** v1 (all 49 issues) is on `main`. Read this file alone and you can continue the project.
Rules: `CLAUDE.md`. Product spec: `docs/PRD.md`. Issues: GitHub #1–#49 (copy in `docs/ISSUES.md`), status in `docs/BOARD.md`.
Original per-feature specs (now built, kept as reference): `docs/specs/FEATURES.md`.

## 1. Status

- M1 core + Arch desktop app: merged (#50–#54).
- M2–M6 (all feature pages, polish, docs): pull requests #55 (M2), #56 (M3), #57 (M4), #58 (M5), and the M6 PR.
  Each PR is branched from the one before it and targets `main`: merge them in order.
- Tests: `python -m unittest discover tests` (backend, 97 tests). Browser checks: `NODE_PATH=$(npm root -g) node scripts/smoke.js` (30 pages at 5 sizes, dark/light: console errors, sideways scroll, unnamed controls, design audit) and `node scripts/e2e.js` (12 flows). Both use a temporary data folder.
- Still to do by the user on the real machine: `docs/ARCH_TEST.md` (window, Hyprland, notifications, big linked PDFs).

### v2.0 (branch `build/v2-planner`)

The user asked for: Todoist sync, a daily schedule with time blocks (now / next / breaks / what to prepare),
a must-do list, a backpack list per lesson, OS integration that blocks or closes apps and gets
"angry", optional Gemini, a design matching the Caelestia shell, and one file to install.

- **My day** (`day.js`, new home page): now card (ring, what to do, next), timeline of the day, must-do
  checklist, backpack for the next school day, coming up, focus card. Built by `backend/planner.py`.
- **Focus** (`focus.js`): Hyprland focus mode (`backend/focus.py`). Off by default. Warn / strict / hard;
  calm / strict / angry messages; user block list. Closes windows with `hyprctl dispatch closewindow`
  only (never kills processes, never touches the shell, the terminal or this app). Starts by itself in
  focus blocks; nags when work is overdue.
- **Connections** (Settings): Todoist token and Gemini key. Stored only in `data/secrets.json` (mode 600),
  never in backups, exports, the API or git. Both are optional; everything works offline.
- **Design**: Material 3 colour roles from Caelestia (`~/.local/state/caelestia/scheme.json`, read by
  `GET /api/theme`, polled every 30 s), Rubik font (vendored), every control styled. `scripts/smoke.js`
  fails on any default-looking control, tiny text or low contrast.
- **Background**: install.sh adds a systemd user service (`--serve`) so reminders, plan notifications and
  focus mode run with the window closed. Closing the window keeps the server (`keepRunning`).
- **One-file installer**: `scripts/make_installer.sh` → `study-workspace-install.sh` (self-extracting).

## 2. Pages

| Route | File | Issue(s) | What it does |
| --- | --- | --- | --- |
| `day/<date>` (home) | day.js | v2 | now card, timeline, must-do, backpack, coming up |
| `focus` | focus.js | v2 | focus mode switch, strictness, block list, sessions |
| `today` (Overview) | today.js | #44 | homework due ≤3 days, SAT + cyber task, habits, lessons, deadlines, continue reading, reminders |
| `subjects/<id>` | subjects.js | #14 #15 | topics 0–5, weakest first, notes, bookmark count; 9618 Hub JSON import |
| `homework/<id>` | homework.js | #16 #17 #19 | homework / assignments / projects, quick add, filters, overdue, attachments |
| `library`, `library/<id>/<page>` | library.js | #20–#23 | uploads + linked folders, PDF reader (last page, dark mode), bookmarks |
| `pastpapers/<id>` | pastpapers.js | #24 | papers, scores, links to paper / mark scheme |
| `time` | time.js | #25 | one-click timers per area, top bar chip, totals |
| `timetable` | timetable.js | #26 | week grid; one day per screen on phones |
| `habits` | habits.js | #27 | streaks, 30-day strip |
| `sat` | sat.js | #28 | scores chart, skills, weakest 5, weekly plan, JSON import |
| `portfolio/<id>` | portfolio.js | #29 | projects, competitions, awards, files |
| `universities/<id>` | universities.js | #30 #31 #33 | table, report import, detail page with documents checklist |
| `scholarships/<id>` | scholarships.js | #32 | report facts, verify badges |
| `deadlines` | deadlines.js | #34 | timeline from universities, scholarships and own deadlines |
| `documents` | documents.js | #33 | shared documents + checklist overview |
| `activities` | activities.js | #35 | title/description with character limits |
| `essays/<id>` | essays.js | #36 | editor, word count, versions, restore |
| `plans` | plans.js | #37 | Plan A / Plan B (EYUF routes by QS rank) |
| `cyber` | cyber.js | #39 #40 | ICO topics, weekly plan to the selection date |
| `thm/<id>` | thm.js | #41 | TryHackMe rooms, progress per topic |
| `challenges/<id>` | challenges.js | #42 | 12 offline CTF challenges, SHA-256 flag check |
| `writeups/<id>` | writeups.js | #43 | markdown notes linked to challenges / rooms |
| `review/<date>` | review.js | #45 | minutes per area vs last week, finished, overdue, notes |
| `settings/<tab>` | settings.js | #5 #21 v2 | tabs: general, planner (times, routines, backpack), connections (Todoist, Gemini), appearance, data |
| `components` (hidden) | components.js | — | live demo of shared components |

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
backend/research_import.py   import universities from docs/research/universities.md (#31)
backend/planner.py           v2: builds the day plan (blocks), must-do, backpack
backend/day_api.py           v2: /api/plan, backpack, now, theme, secrets, todoist, ai, focus routes
backend/focus.py             v2: Hyprland focus engine (hyprctl), sessions, nag
backend/notifier.py          v2: plan notifications (lesson in 5 min, block starts, wind down)
backend/todoist.py           v2: Todoist API v1 sync / close / add (stdlib urllib)
backend/gemini.py            v2: Gemini generateContent (steps for a task, coach)
backend/net.py               v2: small JSON-over-HTTPS helper
backend/secrets_store.py     v2: data/secrets.json (600), never exported
backend/theme.py             v2: reads Caelestia scheme.json
frontend/js/core/theme.js    v2: applies shell colours, dark/light
frontend/index.html          shell
frontend/css/base.css        theme tokens + layout
frontend/css/components.css  buttons, cards, forms, tables, modal, toasts, tabs, badges, levels, charts, palette, prose
frontend/css/modules.css     page-specific styles (one section per page)
frontend/js/main.js          nav, router, theme, heartbeat
frontend/js/core/*.js        shared helpers (see §5)
frontend/js/modules/*.js     one file per page (route = file name, see the table in §2)
scripts/smoke.js, e2e.js     headless browser checks (developer tools, need Playwright)
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
| `POST /api/import/universities {dryRun}` | import from docs/research/universities.md (`dryRun: true` = preview only) |
| `GET /api/example/<module>` | built-in content from `data.example/` (used to add new practice challenges) |
| `POST /api/samples` | remove sample items |
| `POST /api/shutdown` | stop the server |
| `GET /api/plan?date=` | `{date, blocks[], now, next, must_do[], backpack, upcoming[], config}` (built on first read) |
| `POST /api/plan/rebuild {date}` | plan again (keeps past and done blocks) |
| `POST /api/plan/block {date, id, state: done\|skipped\|open}` | block state |
| `POST /api/plan/finish {source, id}` | finish the task behind a block (homework, deadline, cyber, habit, todoist) |
| `PUT /api/plan/settings {config, backpack}` | validated planner settings |
| `GET/POST /api/backpack {date, text, packed}` | backpack list / tick |
| `GET /api/now` | one line of text for bars (`study-workspace --now`) |
| `GET /api/theme` | Caelestia colours or `{available: false}` |
| `GET/PUT /api/secrets` | GET → `{todoist: bool, gemini: bool}` only; PUT `{todoist_token\|gemini_key: "..."}` ("" removes) |
| `POST /api/todoist/sync\|close\|add` | sync now / close a task / add a task |
| `GET /api/ai/models`, `POST /api/ai/breakdown\|coach` | Gemini |
| `GET /api/focus`, `POST /api/focus/start {minutes, title}\|stop`, `PUT /api/focus/config {config}` | focus mode |

The server writes `planner`, `focus` and `todoist` itself, so the frontend changes them only through
the routes above (never `PUT /api/data/...`), to avoid 409 conflicts.

Modules allowed (`backend/storage.py` MODULES): settings, subjects, homework,
library, bookmarks, pastpapers, timelog, timetable, habits, sat, portfolio,
universities, scholarships, documents, deadlines, essays, activities, cyber,
thm, challenges, writeups, review, reminders, planner, focus, todoist. Add a new one there (and a
file in `data.example/`) if you need it.

### Data shapes (keep to these so reminders, search and Today work)

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
- deadlines: `items[{id, title, date, estimate, done, notes}]`
- documents: `{shared[{id, name, status, files[]}]}` · activities: `items[{id, title, description, portfolioId}]`, `titleLimit`, `descLimit` · review: `weeks{"2026-W44": {notes}}`
- homework items get `done_at` (date) when ticked; library items get `lastPage`, `opened`, `missing` (linked file gone); challenges get `solved`, `attempts`
- essays: `items[{id, university, prompt, limit, text, versions[{at, text}]}]`
- cyber: `{topics[{id, name, level, notes}], plan{selectionDate, minutesPerDay, weeks[{start, focus[], tasks[{id, text, done}]}]}}`, thm `items[{id, name, url, topic, status, finished, notes}]`, challenges `items[{id, title, topic, difficulty, story, files, hint, solution, flag_sha256}]`, writeups `items[{id, title, linkType, linkId, body, files}]`

- planner: `{config{wake, sleep, focus, short_break, long_break, long_every, min_block, wind_down, max_per_task, school_gap, after_school, study_before_school, routines[{id, title, start, end, days[0-6]}]}, backpack{always[], lessons{"<lesson title>": [items]}}, days{"YYYY-MM-DD": {blocks[{id, kind: lesson|break|routine|event|focus|free|sleep, start, end, title, sub, why, ref{source, id}, state}], packed{"item": true}}}}` (last 60 days kept)
- focus: `{config{enabled, mode: warn|strict|hard, tone: calm|strict|angry, auto_plan, nag, grace, rules[{type: app|title, pattern, label}]}, active: null|{id, start, until, title, block_id, auto, distractions, closed}, sessions[]}`
- todoist: `{tasks[{id, content, description, project, priority 1-4 (4 = p1), due, time, recurring, minutes, labels[], url}], projects[], synced_at, error}`
- homework items may have `minutes` (time needed; the planner uses it)
- settings (v2): `matchShell`, `followShellMode`, `planNotify`, `keepRunning`, `geminiModel`

## 5. How to add or change a page

1. Create `frontend/js/modules/<route>.js` exporting `default { async render(el, args) { ... } }` (it may return a cleanup function).
2. Add the route to `NAV` and `BUILT` in `frontend/js/main.js`.
3. `const data = await load('<module>'); const items = list(data);` and after every change `save('<module>')`.
4. For list pages use `core/crud.js`: `table()` (sortable, cards on phones), `editItem()` (add/edit/delete dialog, optional attachments), `searchBox`, `filterSelect`, `stat`.
5. Use `fill(el, ...)` from `core/dom.js` to redraw (it skips null children).
6. Page CSS goes in `frontend/css/modules.css` under a header. Colours only via the CSS variables.
7. Run the unit tests, `scripts/smoke.js` and `scripts/e2e.js`.

### Core helpers

- `core/dom.js`: `h(tag, attrs, ...children)`, `$`, `$$`, `clear`, `esc`, `uid`, `debounce`, `highlight`, `plural`, `fmtSize`, `fill`, `safeHref`
- `core/crud.js`: `table`, `cmp`, `editItem`, `searchBox`, `filterSelect`, `matches`, `stat`
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

- Colours only via CSS variables in `base.css`. Material 3 roles `--c-<role>`
  (Caelestia names: primary, primaryContainer, surfaceContainer, ...) are
  overridden live by `core/theme.js`; app tokens (`--bg --panel --panel-2
  --panel-3 --border --text --muted --faint --accent --tonal --ok --warn
  --danger` and `-soft`) are derived from them. Never hard-code colours.
- Font: Rubik (vendored). Pill buttons, filled inputs (radius 12), custom
  checkbox / radio / switch (`input.switch`) / select. Run the smoke audit.
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
  "verify" otherwise; dates for 2028 marked as estimates. Scholarships were
  seeded the same way (7 items, `data.example/scholarships.json`).
- ICO: two different olympiads exist (ICO, Tunisia 2026; ICOA, Sydney 2026).
  The Uzbek selection site points to Sydney. Open question for the user, see
  `docs/research/ico.md`. Cyber topics follow the ICO syllabus.
- Practice challenges store only the SHA-256 of the flag.
- v2: Todoist API v1 (`api.todoist.com/api/v1`, the REST v2 API is retired) and Gemini
  `generativelanguage.googleapis.com/v1beta` (default model `gemini-2.5-flash`), stdlib urllib only.
- v2: focus mode is opt-in and never kills processes; title rules only warn. Protected windows:
  this app, the Caelestia shell, terminals.
- v2: the planner never plans study before school unless `study_before_school` is on, adds rest
  after school, keeps a break between focus blocks, and stops `wind_down` minutes before sleep.
- Milestone PRs #55–#58 were each branched from the previous one but target
  `main`, so they can be merged in order (#55, #56, #57, #58, then M6).

## 7. How to run / test

```bash
python server.py                      # app at http://127.0.0.1:8765
python -m unittest discover tests     # backend tests
NODE_PATH=$(npm root -g) node scripts/smoke.js   # every page, headless
NODE_PATH=$(npm root -g) node scripts/e2e.js     # main flows, headless
```

## 8. Known issues / open questions

- v2 on the real machine: check focus mode, plan notifications, Caelestia colours and the
  background service with `docs/ARCH_TEST.md` §v2.

- The GUI window, Hyprland app id and notifications can't be tested from the cloud: the user runs `docs/ARCH_TEST.md`.
- ICO vs ICOA (which olympiad the Uzbek 2027 selection is for) is unknown: ask the user.
- University facts marked "verify" and 2028 dates marked "estimate" need checking on official pages.
- EPUB / DOCX library files open outside the app (download); PDFs and images open inside.
