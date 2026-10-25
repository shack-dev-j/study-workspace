# Issues

All issues also exist on GitHub with the same numbers, labels and milestones:
https://github.com/shack-dev-j/study-workspace/issues

Status is tracked in [BOARD.md](BOARD.md).

## M1 Core app + Arch desktop app

### #1 Python server skeleton

Milestone: M1 Core app + Arch desktop app · Labels: feature · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/1)

Checklist:
- [x] `server.py` entry point using `http.server` (ThreadingHTTPServer)
- [x] Serve `frontend/` and `vendor/` as static files with correct MIME types
- [x] Bind to 127.0.0.1 by default; `--host`, `--port` flags; default port 8765
- [x] `GET /api/health` returns app name, version, data folder
- [x] Clean shutdown on Ctrl+C and on `POST /api/shutdown` (localhost only)
- [x] Unit test: server starts on a free port and answers /api/health

Done when:
- `python server.py` starts with no extra packages on Linux, Windows and macOS
- It is not reachable from other machines unless `--host` is set
- Tests pass with `python -m unittest discover tests`

### #2 Data folder: XDG vs portable mode, first-run setup

Milestone: M1 Core app + Arch desktop app · Labels: feature, data · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/2)

Checklist:
- [x] `backend/paths.py`: portable mode when run from the repo/USB (a `portable` marker file or `data/` next to the app), otherwise `$XDG_DATA_HOME/study-workspace` (default `~/.local/share/study-workspace`)
- [x] Windows: `%APPDATA%/StudyWorkspace`; macOS: `~/Library/Application Support/StudyWorkspace`
- [x] On first run, copy `data.example/` to the data folder only if it does not exist
- [x] Never overwrite an existing data folder
- [x] Create `data.example/` with fake sample JSON for each module
- [x] Tests for both modes and for 'existing data is left alone'

Done when:
- Fresh start creates data from the example; a second start changes nothing
- Running from the repo uses `./data`; installed copy uses `~/.local/share/study-workspace/data`

### #3 Safe JSON storage and module API

Milestone: M1 Core app + Arch desktop app · Labels: feature, data · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/3)

Checklist:
- [x] `backend/storage.py`: read/write one JSON file per module (`data/<module>.json`)
- [x] Safe write: write temp file in the same folder, fsync, `os.replace`
- [x] File lock (threading lock) so two requests can't corrupt a file
- [x] Every file has `schema_version`; a `migrations.py` hook that backs up before migrating
- [x] `GET /api/data/<module>` and `PUT /api/data/<module>`; module names checked against an allowlist
- [x] Reject bodies over a size limit and invalid JSON with a clear error
- [x] Tests: round trip, invalid module name, crash-safe write leaves old file intact

Done when:
- Saving from the UI updates the JSON file and the old version is never half-written
- Unknown module names return 404

### #4 File upload and download with path safety

Milestone: M1 Core app + Arch desktop app · Labels: feature, data · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/4)

Checklist:
- [x] `POST /api/files` (multipart or raw body with filename header) stores into `data/files/<id>/<safe-name>`
- [x] Sanitize names: strip folders, block `..`, absolute paths, NUL, hidden names; keep extension
- [x] Resolve final path and check it is inside `data/files/` (also blocks symlink escape)
- [x] `GET /api/files/<id>` streams the file with the right Content-Type and supports Range requests (for PDFs)
- [x] `DELETE /api/files/<id>` moves the file to `data/trash/` instead of deleting
- [x] Size limit (configurable, default 200 MB)
- [x] Tests: normal upload, `../evil`, absolute path, very long name, download, range request

Done when:
- Uploaded files land only in `data/files/`; every bad name in the tests is rejected or cleaned
- Large PDFs open quickly because only the needed bytes are sent

### #5 Automatic daily backup

Milestone: M1 Core app + Arch desktop app · Labels: feature, data · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/5)

Checklist:
- [x] On start and once a day while running, zip all `data/*.json` into `backups/YYYY-MM-DD.zip` (JSON only, no files)
- [x] Keep the last 14 backups, remove older ones (only files that match the backup name pattern)
- [x] `GET /api/backups` lists backups; `POST /api/backups` makes one now
- [x] Tests: backup created once per day, 15th backup removes the oldest, other files untouched

Done when:
- After 15 days there are exactly 14 backups and no user file was removed

### #6 Export everything to a zip and restore from it

Milestone: M1 Core app + Arch desktop app · Labels: feature, data · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/6)

Checklist:
- [x] `GET /api/export` streams one zip: all JSON + `files/` + a `manifest.json` (app version, date, schema versions)
- [x] `POST /api/restore` accepts that zip: check manifest, check every entry path (no zip-slip), make a backup first, then replace
- [x] Settings screen buttons: Export all data, Restore from file (with a confirm step)
- [x] Tests: export then restore gives identical data; a zip with `../` entries is refused

Done when:
- I can move all my data to another computer with one file
- A broken or malicious zip never changes my data

### #7 App shell: sidebar, router, themes, API client

Milestone: M1 Core app + Arch desktop app · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/7)

Checklist:
- [x] `frontend/index.html`, `css/base.css` with CSS variables for dark (default) and light themes
- [x] Sidebar with all sections; collapses to a menu button under 800px
- [x] Hash router (`#/homework`), lazy-load each module from `js/modules/`
- [x] `js/core/api.js` (fetch wrapper, error toast), `js/core/store.js` (load/save module data, debounced save)
- [x] Theme toggle saved in settings; follows system theme the first time
- [x] Empty placeholder page for each future module

Done when:
- The app loads offline in under 1 second on a laptop, works on a phone-width screen, and the theme toggle remembers my choice

### #8 Desktop launcher `study-workspace`

Milestone: M1 Core app + Arch desktop app · Labels: feature, desktop · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/8)

Checklist:
- [x] `desktop/study-workspace` (Python script): find a running server via a lock file with port + PID and `/api/health`; start one in the background if none
- [x] Open the window: 1) pywebview (GTK or Qt), 2) chromium / brave / google-chrome in `--app=` mode with its own profile dir, 3) default browser via `xdg-open`
- [x] Window count: each window registers with the server; when the last one closes, the server shuts down cleanly (pywebview: on close event; browser modes: heartbeat timeout)
- [x] Set the window class / app-id `study-workspace` so Hyprland rules and the icon work
- [x] `--browser`, `--no-window`, `--stop` options
- [x] Headless tests for: detect running server, stale lock file, choose window backend by what is installed

Done when:
- Running `study-workspace` twice gives two windows and one server; closing both stops the server
- It works with pywebview missing (falls back to Chromium/Brave app mode)

### #9 App icon and .desktop file

Milestone: M1 Core app + Arch desktop app · Labels: desktop, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/9)

Checklist:
- [x] `desktop/icons/study-workspace.svg` (simple, calm, readable at 16px)
- [x] PNG sizes 16, 32, 48, 64, 128, 256, 512 generated by a stdlib script (or committed)
- [x] `desktop/study-workspace.desktop` with Name, Comment, Exec, Icon, Categories=Education;Office;, StartupWMClass=study-workspace
- [x] `desktop-file-validate` note in ARCH_TEST.md

Done when:
- The app appears in my launcher (rofi/wofi/fuzzel) with its icon

### #10 install.sh and uninstall.sh for Arch

Milestone: M1 Core app + Arch desktop app · Labels: desktop, docs · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/10)

Checklist:
- [x] install.sh: check python, notify-send, pywebview, chromium/brave; print the exact `sudo pacman -S` / `yay -S` commands for missing ones
- [x] Copy the app to `~/.local/share/study-workspace/app`, launcher to `~/.local/bin`, .desktop to `~/.local/share/applications`, icons to `~/.local/share/icons/hicolor/...`
- [x] Warn if `~/.local/bin` is not in PATH; run `update-desktop-database` / `gtk-update-icon-cache` if present
- [x] Re-running install.sh updates the app and never touches `data/`
- [x] uninstall.sh removes app, launcher, .desktop, icons; asks before deleting data, default No, and offers an export first
- [x] Headless test: install into a temp HOME, then uninstall, data still there

Done when:
- Fresh install on Arch works with one command; uninstall keeps my data unless I type yes

### #11 PKGBUILD (optional makepkg install)

Milestone: M1 Core app + Arch desktop app · Labels: desktop · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/11)

Checklist:
- [x] `packaging/arch/PKGBUILD` installing to `/usr/share/study-workspace`, `/usr/bin/study-workspace`, .desktop and icons
- [x] depends=(python), optdepends=(python-pywebview, libnotify, chromium)
- [x] Data still goes to `~/.local/share/study-workspace/data` (never /usr)
- [x] Notes in README on `makepkg -si`

Done when:
- `makepkg -si` builds and installs; the app runs from the menu

### #12 Deadline reminders with notify-send

Milestone: M1 Core app + Arch desktop app · Labels: feature, desktop · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/12)

Checklist:
- [x] `backend/reminders.py`: collect deadlines from homework and applications
- [x] Rules: overdue, due today, due tomorrow; application deadlines at 30, 14 and 7 days
- [x] Run when the server starts and every hour; remember what was already sent (`data/reminders_sent.json`) so nothing repeats
- [x] Use `notify-send -a 'Study Workspace' -i <icon>` if available; skip quietly if not (Windows/macOS fallback: in-app banner only)
- [x] Settings: turn reminders on/off
- [x] Tests with a fake notifier and fixed dates

Done when:
- I get one desktop notification per deadline step, never the same one twice

### #13 M1 tests and docs/ARCH_TEST.md

Milestone: M1 Core app + Arch desktop app · Labels: docs, desktop · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/13)

Checklist:
- [x] Test helpers: start server on a temp data folder and free port
- [x] `docs/ARCH_TEST.md`: checklist for window, icon, Hyprland behaviour, notifications (mako/dunst/swaync), install, uninstall, PKGBUILD
- [x] README: run and install steps
- [x] Make the M1 zip for testing

Done when:
- All tests pass; the checklist takes under 15 minutes on my Arch machine

## M2 Study trackers + Library & files

### #14 Subjects and syllabus topics with confidence

Milestone: M2 Study trackers + Library & files · Labels: feature, data, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/14)

Checklist:
- [ ] Seed subjects: Maths 9709 (Paper 1 Pure Mathematics 1 + Paper 5 Probability & Statistics 1), Physics 9702 AS, CS 9618 AS
- [ ] Syllabus topic lists from the Cambridge syllabus documents (topic names only)
- [ ] Each topic: confidence 0–5 (one click), notes, last reviewed date
- [ ] Add / rename / remove subjects and topics
- [ ] Subject page shows weakest topics first

Done when:
- I can rate every topic in one click and see my weakest Maths and Physics topics at the top

### #15 Import progress from the 9618 Revision Hub

Milestone: M2 Study trackers + Library & files · Labels: feature, data · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/15)

Checklist:
- [ ] Accept the hub's 'Export progress (.json)' file (`app: 9618 AS Revision Hub`)
- [ ] Map chapters 1–8 to CS topics; store confidence % and practice marks
- [ ] Show a preview before saving; never delete existing notes
- [ ] Test with a sample export file

Done when:
- Importing my hub export updates CS topic confidence without losing anything

### #16 Homework and assignments

Milestone: M2 Study trackers + Library & files · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/16)

Checklist:
- [ ] Fields: subject, title, description, due date, status (To do / Doing / Done), priority, type (homework / assignment / project)
- [ ] Two views: Homework, and Assignments & projects
- [ ] Sort by due date; overdue items in red; quick add with Enter
- [ ] Edit, mark done, delete (with undo)

Done when:
- I can add homework in under 10 seconds, and overdue items are red

### #17 File attachments on homework

Milestone: M2 Study trackers + Library & files · Labels: feature, data, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/17)

Checklist:
- [ ] Drag-and-drop zone and file picker on a homework item
- [ ] Shared `js/core/attachments.js` component (reused by portfolio, documents, challenges)
- [ ] Show name, size, type icon; download and remove (to trash)
- [ ] Upload progress for big files

Done when:
- I can attach PDFs, images and Word files to any homework item and download them again

### #18 Vendor PDF.js

Milestone: M2 Study trackers + Library & files · Labels: feature · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/18)

Checklist:
- [x] Copy a pinned PDF.js release (prebuilt `pdf.mjs` + worker) into `vendor/pdfjs/` with its LICENSE
- [x] Note version and source in `vendor/README.md`
- [x] Load it only when a PDF is opened

Done when:
- PDFs render with no internet connection

### #19 Attachment previews (PDF and images)

Milestone: M2 Study trackers + Library & files · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/19)

Checklist:
- [ ] Click an attachment to preview images and PDFs inside the app
- [ ] Other types (Word etc.) show a download button and 'open with system app' hint
- [ ] Preview works on phone width

Done when:
- Images and PDFs open inside the app without downloading

### #20 Library: books and resources (upload)

Milestone: M2 Study trackers + Library & files · Labels: feature, data, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/20)

Checklist:
- [ ] Each item: title, subject, type (textbook, workbook, past paper, mark scheme, notes), file
- [ ] Upload a file to add a book
- [ ] Filter by subject and type; search by title

Done when:
- I can add a textbook by uploading a PDF and find it by subject

### #21 Library: linked folders (no copying)

Milestone: M2 Study trackers + Library & files · Labels: feature, data · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/21)

Checklist:
- [ ] Settings: add a folder path (e.g. `~/Textbooks`); server scans for PDFs and other files
- [ ] Linked files are read in place; files are served only if they are inside a linked folder (path check, no symlink escape)
- [ ] Rescan button; missing files shown as 'not found' instead of deleted
- [ ] Guess subject from folder name; editable
- [ ] Tests: scan, path escape blocked

Done when:
- My big PDFs in ~/Textbooks show in the library without being copied

### #22 PDF reader

Milestone: M2 Study trackers + Library & files · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/22)

Checklist:
- [ ] Page navigation (buttons, keys, go to page), zoom (fit width, +/−)
- [ ] Search inside the PDF with next/previous result
- [ ] Dark reading mode (inverted pages)
- [ ] Remember the last page per book and reopen there

Done when:
- Opening a book returns me to the page I left; search finds words in text PDFs

### #23 Bookmarks with notes

Milestone: M2 Study trackers + Library & files · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/23)

Checklist:
- [ ] Add a bookmark on the current page with a note
- [ ] Link a bookmark to a syllabus topic or a homework task
- [ ] Bookmarks list per book and on the topic / homework pages

Done when:
- From a syllabus topic I can jump to the exact textbook page I bookmarked

### #24 Past papers tracker

Milestone: M2 Study trackers + Library & files · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/24)

Checklist:
- [ ] Paper list: subject, session (e.g. s24), paper/variant, done yes/no, date, score / max, %
- [ ] Link the paper and mark scheme files from the library
- [ ] Average score per paper type

Done when:
- I can see which past papers I've done and my scores

### #25 Time logging

Milestone: M2 Study trackers + Library & files · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/25)

Checklist:
- [ ] Areas: Maths, Physics, CS, SAT, Cyber, Applications, IELTS, Projects (editable)
- [ ] Start/stop timer (keeps running if the page reloads) and manual entry
- [ ] Today and this week totals per area

Done when:
- Starting a timer is one click; totals are correct after a reload

### #26 Weekly timetable

Milestone: M2 Study trackers + Library & files · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/26)

Checklist:
- [ ] Grid Mon–Sun with time slots; click to add/edit a lesson or block
- [ ] Sample school week in data.example
- [ ] Phone view shows one day at a time

Done when:
- I can enter my school week and see today's lessons

### #27 Habits with streaks

Milestone: M2 Study trackers + Library & files · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/27)

Checklist:
- [ ] Add habits; daily checkboxes; current and best streak
- [ ] Last 30 days strip per habit

Done when:
- Ticking a habit updates the streak immediately

### #28 SAT tracker

Milestone: M2 Study trackers + Library & files · Labels: feature, data, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/28)

Checklist:
- [ ] Practice test scores (date, total, Math, R&W, source) with a line chart (SVG)
- [ ] Weak skills list (Digital SAT skill names) with notes
- [ ] Target 1500 and days until the next test (5 Dec 2026)
- [ ] Import scores from a JSON file (format documented; adapter for my SAT site once known)

Done when:
- I can log a practice test and see my progress chart toward 1500

### #29 Portfolio

Milestone: M2 Study trackers + Library & files · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/29)

Checklist:
- [ ] Entries: type (project, competition, award, certificate), title, date, description, links, role, result
- [ ] Attach files (certificates, photos) with the shared attachments component
- [ ] Filter by type and year

Done when:
- All my projects and awards are in one place with their certificates attached

## M3 Applications

### #30 Universities table

Milestone: M3 Applications · Labels: feature, ui, data · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/30)

Checklist:
- [ ] Fields: name, country, city, program, QS World rank, THE rank, QS CS rank, El-Yurt Umidi eligible (yes/no/check), tuition, living cost, scholarships, A Level requirement, SAT (required/optional/not used), open date, deadline, status, priority, notes, source links
- [ ] Status: Researching / Preparing / Applied / Offer / Rejected / Accepted
- [ ] Sort and filter (country, status, El-Yurt Umidi); 'verify' fields highlighted
- [ ] Detail page per university

Done when:
- I can compare all my universities in one table and see which facts still need checking

### #31 Import docs/research/universities.md

Milestone: M3 Applications · Labels: data, research · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/31)

Checklist:
- [ ] Script/import step that reads the report's tables and sections into `universities.json`
- [ ] Only numbers that are in the report; missing values left empty and marked 'verify'
- [ ] Keep the source name for each fact; mark secondary-source facts 'verify'
- [ ] Dates for 2028 entry kept as 'estimate' until confirmed
- [ ] Review screen before saving; never overwrite edits I made

Done when:
- Every number in the app can be found in the report; nothing is invented

### #32 Scholarships list

Milestone: M3 Applications · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/32)

Checklist:
- [ ] MEXT, GKS, Chinese Government Scholarship, Stipendium Hungaricum, El-Yurt Umidi, university scholarships (KAIST, Kyoto iUP, NUS, HKU...)
- [ ] Fields: what it pays, requirements, deadlines, obligation (e.g. EYUF 5-year work), link, status

Done when:
- I can see each scholarship's deadline and requirements in one list

### #33 Documents checklist per university

Milestone: M3 Applications · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/33)

Checklist:
- [ ] Default items: transcript, predicted grades, IELTS, SAT, recommendation letters, essays, passport, EYUF letter... (editable)
- [ ] Status per item and attach the actual file
- [ ] Shared documents (e.g. passport) uploaded once and reused

Done when:
- For each university I can see what is missing and open the attached files

### #34 Deadlines timeline with warnings

Milestone: M3 Applications · Labels: feature, ui, desktop · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/34)

Checklist:
- [ ] Timeline of all application and scholarship deadlines
- [ ] Warnings at 30, 14 and 7 days (colour + desktop notification via reminders module)
- [ ] Estimated dates shown with 'estimate' tag

Done when:
- I see warnings 30, 14 and 7 days before each deadline, in the app and as notifications

### #35 Activities and awards (application form)

Milestone: M3 Applications · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/35)

Checklist:
- [ ] Pull entries from Portfolio; short title + description fields
- [ ] Live character counter with presets (e.g. 50 / 150 characters) and a custom limit
- [ ] Copy button

Done when:
- I can turn a portfolio entry into an application-ready line that fits the character limit

### #36 Essays with versions

Milestone: M3 Applications · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/36)

Checklist:
- [ ] One draft per prompt (university, prompt text, word limit)
- [ ] Word and character count; autosave
- [ ] 'Save version' and view/restore older versions

Done when:
- I never lose an essay draft and can go back to an older version

### #37 Plan A / Plan B view

Milestone: M3 Applications · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/37)

Checklist:
- [ ] Plan A: university / government full scholarships (KAIST, Kyoto iUP, Stipendium Hungaricum, NUS/NTU/HKU)
- [ ] Plan B: El-Yurt Umidi routes (QS top 20 + 50%, QS top 100 + full grant, open competition)
- [ ] Show which universities fit each route from the table, with the open questions to ask EYUF

Done when:
- I can see my plan A and plan B side by side with the next step for each

## M4 Cyber/ICO

### #38 Research the ICO (docs/research/ico.md)

Milestone: M4 Cyber/ICO · Labels: research, docs · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/38)

Checklist:
- [ ] Format, topics, age rules, Uzbek national selection, dates
- [ ] Every fact with a source link; unconfirmed items marked 'unknown — ask me'

Done when:
- ico.md answers what the ICO is and when the selection is, or clearly says what is unknown

### #39 Cyber topic map

Milestone: M4 Cyber/ICO · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/39)

Checklist:
- [ ] Topics: networking, Linux, web security, cryptography, forensics, reverse engineering, OSINT, social engineering (+ add more)
- [ ] Level 0–5 and notes per topic, like the syllabus topics

Done when:
- I can rate each cyber topic and see my weakest ones

### #40 Cyber study plan to the selection date

Milestone: M4 Cyber/ICO · Labels: feature, data · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/40)

Checklist:
- [ ] Generate weekly plan from today to the selection date using my daily time budget
- [ ] Each week: focus topics and TryHackMe rooms (by name/link)
- [ ] Today's cyber task feeds the Today screen

Done when:
- I always know today's cyber task and the plan fits my free time

### #41 TryHackMe tracker

Milestone: M4 Cyber/ICO · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/41)

Checklist:
- [ ] Rooms: name, link, topic, status, date finished, notes
- [ ] Progress per topic

Done when:
- I can log a finished room in a few seconds

### #42 Practice CTF challenges

Milestone: M4 Cyber/ICO · Labels: feature, data · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/42)

Checklist:
- [ ] `challenges.json` with at least 10 original, safe, offline challenges (easy to hard, mixed topics)
- [ ] Each: title, topic, difficulty, story, files, hint (click to reveal), solution (hidden), flag check
- [ ] Challenge files stored in the app; I can add my own challenges
- [ ] Nothing that targets real systems

Done when:
- I can solve 10+ challenges offline, check my flag, and reveal hints and solutions only when I want

### #43 Writeups notebook

Milestone: M4 Cyber/ICO · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/43)

Checklist:
- [ ] Writeups linked to a challenge or a TryHackMe room
- [ ] Simple formatting (headings, code blocks), images attached
- [ ] Search writeups

Done when:
- I can write and find writeups for each room or challenge

## M5 Dashboard & weekly review

### #44 Today screen

Milestone: M5 Dashboard & weekly review · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/44)

Checklist:
- [ ] Today's SAT task, today's cyber task, homework due soon, habits, next 3 application deadlines, continue reading (last book + page)
- [ ] Today's timetable
- [ ] Loads fast: one request for a summary

Done when:
- The home screen shows what to do today in one glance

### #45 Weekly review with charts

Milestone: M5 Dashboard & weekly review · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/45)

Checklist:
- [ ] Time per area this week vs last week (SVG bar chart)
- [ ] Finished this week and overdue lists
- [ ] Short notes field for the week

Done when:
- Every Sunday I can see where my time went and what is overdue

### #46 Global search (Ctrl+K)

Milestone: M5 Dashboard & weekly review · Labels: feature, ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/46)

Checklist:
- [x] Search box opened by Ctrl+K: homework, books, bookmarks, notes, universities, writeups...
- [x] Results grouped by type; Enter opens the item
- [x] Server-side search endpoint or client index, fast on all data

Done when:
- Ctrl+K finds anything I saved within a second

## M6 Polish & QA

### #47 Responsive and accessibility pass

Milestone: M6 Polish & QA · Labels: ui · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/47)

Checklist:
- [ ] Check every screen at 360px and 1440px
- [ ] Keyboard navigation and focus styles; colour contrast in both themes
- [ ] Fix layout bugs found

Done when:
- Every screen works on my phone and laptop, with keyboard only

### #48 Full QA and data safety check

Milestone: M6 Polish & QA · Labels: bug, data · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/48)

Checklist:
- [ ] Run all tests; manual test of every feature
- [ ] Test migrations, backup, export/restore with real-sized data
- [ ] Check no personal data can be committed (`git status` with data present)

Done when:
- All tests pass and a full export/restore round trip works with my real data

### #49 README, CLAUDE.md, HANDOFF.md and final summary

Milestone: M6 Polish & QA · Labels: docs · [GitHub](https://github.com/shack-dev-j/study-workspace/issues/49)

Checklist:
- [ ] README with Arch install steps
- [ ] Update CLAUDE.md
- [ ] HANDOFF.md: done, left (with issue numbers), how to run/install, decisions, known bugs
- [ ] Final summary for me

Done when:
- Another AI agent can continue the project from HANDOFF.md alone
