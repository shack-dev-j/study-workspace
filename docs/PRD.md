# Study Workspace: Product Requirements

## 1. Who it is for

One user: a 10th grade student at a Presidential boarding school in Uzbekistan.

- Cambridge International AS Level: Computer Science (9618), Physics (9702),
  Mathematics (9709: Paper 1 Pure Mathematics 1 + Paper 5 Probability &
  Statistics 1). Maths and Physics need the most work.
- Digital SAT on **5 December 2026**. Now about 1000, long-term target 1500+.
  About 1 hour a day, longer blocks at weekends.
- University applications from autumn 2027 (for 2028 entry, see
  `docs/research/universities.md`): Asia first, then Europe. El-Yurt Umidi
  Foundation (EYUF) scholarship as Plan B.
- International Cybersecurity Olympiad (ICO), Uzbek national selection.
  Uses TryHackMe.
- Uses Arch Linux with Hyprland. Days are packed: the app must be fast and
  simple.

## 2. Goals

1. One place for school work, SAT, applications and cyber training.
2. Show **what to do today** in one glance.
3. Never lose data: local JSON, safe writes, daily backups, one-file export.
4. Feel like a real desktop app on Arch Linux (own window, launcher icon,
   notifications), and still run anywhere with `python server.py`.
5. Fully offline and private. No accounts, no cloud, no CDNs.

Non-goals: multi-user, sync between devices (export/restore covers moving
data), mobile app store builds.

## 3. Constraints

See `CLAUDE.md`. In short: vanilla HTML/CSS/JS, Python standard library,
optional pywebview, vendored third-party code only (PDF.js), JSON files in
`data/`, server on 127.0.0.1, dark mode, responsive, simple English.

## 4. Features and acceptance criteria

Each feature lists "done when". Issue numbers refer to GitHub issues (also in
`docs/ISSUES.md`).

### M1 Core app + Arch desktop app

| Feature | Done when |
| --- | --- |
| Server (#1) | `python server.py` serves the app and a JSON API on 127.0.0.1 with no extra packages. |
| Data location (#2) | Installed: `~/.local/share/study-workspace/data` (XDG). Repo / USB: local `data/`. First run copies `data.example/`; existing data is never touched. |
| Safe storage (#3) | Every write goes to a temp file then is renamed; unknown modules are refused; a crash never leaves a half-written file. |
| Files (#4) | Uploads land only in `data/files/`; bad names (`..`, absolute paths) are refused or cleaned; big PDFs stream with Range requests. |
| Backup (#5) | One zip of all JSON per day in `backups/`; only the last 14 are kept. |
| Export / restore (#6) | One zip holds all JSON and files; restoring it makes a backup first and refuses unsafe zips. |
| App shell (#7) | Sidebar (collapses on phones), dark/light toggle that is remembered, loads offline in under a second. |
| Launcher (#8) | `study-workspace` starts the server if needed and opens its own window (pywebview → Chromium/Brave/Chrome `--app` → default browser). Closing the last window stops the server. |
| Icon + .desktop (#9) | The app shows in the launcher menu with its icon. |
| install / uninstall (#10) | install.sh checks dependencies, prints exact pacman/yay commands, installs to `~/.local`. uninstall.sh keeps data unless I confirm. |
| PKGBUILD (#11) | `makepkg -si` installs a working app. |
| Reminders (#12) | Homework and application deadlines are sent with `notify-send` at start and every hour, never twice for the same step. |
| Tests + ARCH_TEST (#13) | Backend tests pass; `docs/ARCH_TEST.md` lists the manual checks. |

### M2 Study trackers + Library & files

| Feature | Done when |
| --- | --- |
| Subjects (#14) | Maths, Physics, CS (+ more) with syllabus topics, confidence 0–5 and notes; weakest topics shown first. |
| 9618 Hub import (#15) | The Revision Hub's progress export updates CS topic confidence without losing anything. |
| Homework (#16) | Subject, title, description, due date, status, priority; homework and assignments/projects views; overdue in red. |
| Attachments (#17) | Drag-and-drop or picker uploads to any homework item; download and remove. |
| PDF.js (#18) | PDFs render offline from `vendor/pdfjs/`. |
| Previews (#19) | PDFs and images preview inside the app. |
| Library (#20, #21) | Books by upload or from a linked folder (no copying); title, subject, type, file. |
| PDF reader (#22) | Page navigation, zoom, search, dark reading mode, reopens at the last page. |
| Bookmarks (#23) | Bookmarks with notes on any page, linked to a topic or homework. |
| Past papers (#24) | Which papers are done, score, linked mark scheme. |
| Time log (#25) | Timer or manual entry per area (Maths, Physics, CS, SAT, Cyber, Applications, IELTS, Projects). |
| Timetable (#26) | Editable school week. |
| Habits (#27) | Daily checkboxes with streaks. |
| SAT (#28) | Scores over time (chart), weak skills, JSON import. |
| Portfolio (#29) | Projects, competitions, awards with dates, links and files. |

### M3 Applications

| Feature | Done when |
| --- | --- |
| Universities (#30) | All fields from the brief; sort and filter; "verify" fields stand out. |
| Report import (#31) | Data comes only from `docs/research/universities.md`; missing values empty and marked "verify"; source kept. |
| Scholarships (#32) | MEXT, GKS, CSC, Stipendium Hungaricum, EYUF, university scholarships with deadlines and requirements. |
| Documents (#33) | Checklist per university with the actual file attached to each item. |
| Deadlines (#34) | Timeline with warnings at 30, 14 and 7 days, also as notifications. |
| Activities (#35) | Short, application-ready entries from Portfolio with a character counter. |
| Essays (#36) | One draft per prompt, word count, saved versions. |
| Plan A / B (#37) | University scholarships vs El-Yurt Umidi routes side by side. |

### M4 Cyber / ICO

| Feature | Done when |
| --- | --- |
| ICO research (#38) | `docs/research/ico.md` with sources; unknowns marked "unknown — ask me". |
| Topic map (#39) | Networking, Linux, web, crypto, forensics, reversing, OSINT, social engineering (+ more), level 0–5. |
| Study plan (#40) | Weekly plan from today to the selection date within my daily time, linked to TryHackMe rooms. |
| TryHackMe (#41) | Rooms with status, date finished, notes. |
| Challenges (#42) | 10+ original offline challenges with hint, hidden solution and flag check; I can add more. |
| Writeups (#43) | Notebook linked to challenges and rooms. |

### M5 Dashboard & weekly review

| Feature | Done when |
| --- | --- |
| Today (#44) | SAT task, cyber task, homework due soon, habits, next 3 deadlines, continue reading. |
| Weekly review (#45) | Time per area this week vs last week (SVG), finished, overdue. |
| Search (#46) | Ctrl+K finds homework, books, bookmarks, notes, universities and more. |

### M6 Polish & QA

| Feature | Done when |
| --- | --- |
| Responsive / a11y (#47) | Every screen works at phone and laptop width and by keyboard. |
| QA (#48) | All tests pass; export/restore round trip works. |
| Handoff (#49) | README, CLAUDE.md, HANDOFF.md let another agent continue alone. |

## 5. Data safety rules

- Never delete or overwrite user data. Deleted files go to `data/trash/`.
- Format change → backup, then migration (`schema_version` in every file).
- `data/` is never committed.
- Every file path is checked so nothing is written outside `data/files/`.

## 6. Open questions (tracked, not blocking)

- ICO selection dates and format: see `docs/research/ico.md`.
- A separate SAT practice site: the link given was the 9618 Revision Hub. SAT
  import uses a documented JSON format until a SAT site is known.
