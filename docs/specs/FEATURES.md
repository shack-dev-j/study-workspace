# Feature specs (all built)

These were the build specs for #14–#45. Everything here is now built; the file is kept as a reference for how each page is meant to behave. Current details are in HANDOFF.md.

Every page follows the same recipe. Read HANDOFF.md §4 (data shapes) and §5 (helpers) once.

## Recipe for every page

1. Create `frontend/js/modules/<route>.js` exporting `default { async render(el, args) {...} }`.
2. Add `<route>` to `BUILT` in `frontend/js/main.js`.
3. `const data = await load('<module>'); const items = list(data);` After every change call `save('<module>')`, then redraw.
4. Layout: `pageHead(intro, button('Add', onAdd, {kind:'primary', icon:'plus'}))`, then a `.toolbar` (search input + filters), then a `table.list` inside `.table-wrap` (one `td` per column with `data-label`), or `empty('...')` when there are no items.
5. Add and edit go through `formDialog(title, FIELDS, item, {onDelete})`. Delete asks `confirmDialog` and then removes the item from the list.
6. New ids come from `uid()`. Dates are `YYYY-MM-DD`. Item files are `files: []`, shown with `attachmentsBox({files, onChange})`.
7. If `args[0]` is an item id, open that item's dialog straight away (search links use `#/<route>/<id>`).
8. Check the page at 360px and 1280px wide, in dark and light mode, with no console errors.

Sample data for every module is in `data.example/`. Delete `data/` to reload it.

---

### #14 Subjects (`subjects`, route `subjects`)
- Left: list of subjects (name, code, average confidence as a `.bar`). Main: the topics of the chosen subject (`args[0]` = subject id, default the first).
- Each topic row: name, `levelPicker(confidence)`, a notes button, and `reviewed` (set to today when the level changes).
- Sort control: "Weakest first" (default) or "Syllabus order".
- Buttons: Add subject (fields: name, code, color), Add topic (name), Rename and Delete (with confirm).
- Done when: changing a level saves straight away and the weakest topics are at the top.

### #15 9618 Hub import (inside Subjects, CS only)
- Button "Import 9618 Hub progress" with a file picker for `.json`.
- Parse `{app:"9618 AS Revision Hub", summary:[{chapter, title, practice_marks, confidence_percent}]}`.
- For each chapter N, match the CS topic in position N−1. New level = `Math.round(confidence_percent/20)` (null means skip). Add to the topic notes: `Hub: practice <practice_marks>`.
- Show a preview table (topic, old level → new level) before saving. Never delete notes.

### #16 Homework (`homework`, route `homework`)
- `tabs(['Homework','Assignments & projects'])`: the first shows kind=homework, the second shows assignment and project.
- Columns: checkbox (done) | title | subject | due (`relative(due)`) | priority badge | status. Rows with due < today and status not done get class `overdue`; done rows get `is-done`.
- Quick add row: title input + subject select + date, Enter adds with kind set by the current tab.
- FIELDS: title*, kind(select homework/assignment/project), subject(select of subject names), due(date), priority(low/normal/high), status(todo/doing/done), description(textarea, wide).
- Filters: subject, status (default "not done"). Sort by due ascending.

### #17 / #19 Attachments and previews
- In the homework dialog pass `extra: attachmentsBox({files: item.files, onChange: f => { item.files = f; save('homework'); }})`. Previews are already built in.

### #20 Library (`library`, route `library`)
- Card grid (`.grid.cols-4`): title, subject, type badge, "Continue p. N" when `lastPage` is set.
- Add book: `formDialog` with fields title*, subject, type(textbook/workbook/past paper/mark scheme/notes), plus attachmentsBox (one file, saved as `file`, `source:'upload'`).
- Clicking a card goes to `#/library/<id>` (#22 reader).

### #21 Linked folders (inside Library)
- In Settings add a "Linked folders" list: add a path to `settings.linkedFolders`, then `save('settings')`.
- In Library add a "Scan folders" button: for each folder call `api.post('/api/library/scan', {folder})` and get back `{files:[{path,name,folder,size,type}]}`. Add any file whose path is not in the library yet as `{id, title: name without extension, subject: folder, type:'textbook', source:'linked', path}`. Never delete items. When a scan no longer finds a file, show a "not found" badge.

### #22 Reader (route `library/<id>[/<page>]`)
- `createPdfViewer(el, {url: book.source==='linked' ? linkedUrl(book.path) : fileUrl(book.file), page: args[1] || book.lastPage || 1, dark: settings.readerDark, onPage: n => { book.lastPage = n; book.opened = today(); save('library'); }, onDark: v => { settings.readerDark = v; save('settings'); }, toolbarExtra: [button('Bookmark', addBookmark, {icon:'bookmark', small:true})]})`
- Return `() => viewer.destroy()`.

### #23 Bookmarks (`bookmarks`)
- addBookmark fields: note(textarea), topicId (select "Subject: Topic"), homeworkId (select of homework titles). Save `{id, bookId, page, note, topicId, homeworkId, created}`.
- In the reader, a side list of this book's bookmarks; clicking one runs `viewer.goTo(page)`.
- On the Subjects topic row, show a 🔖 count that links to `#/library/<bookId>/<page>`.

### #24 Past papers (`pastpapers`, route `pastpapers`)
- FIELDS: subject*, session (e.g. s24), paper (1/2/5), variant (1/2/3), done(checkbox), date, score(number), max(number), paperBookId and schemeBookId (selects from the library), notes.
- Columns: subject | session | paper+variant | done | score/max and % | links to open the paper and the mark scheme in the reader.
- Stats row (`.stat`): papers done, average % per subject.

### #25 Time log (`timelog`, route `time`)
- Areas come from `settings.areas`, default `['Maths','Physics','CS','SAT','Cyber','Applications','IELTS','Projects']`.
- Big area buttons: clicking one sets `running = {area, start: Date.now()}`. The Stop button adds an entry `{id, area, date: today(), minutes: round((now-start)/60000), note}` and sets `running = null`.
- The topbar `#timerChip` shows the time running (`clock(sec)`), updated every second, and links to `#/time`.
- Manual entry form: area, date, minutes, note. Below it, today's and this week's totals per area, then the entries list.

### #26 Timetable (`timetable`, route `timetable`)
- Grid with columns Mon–Sun and rows for the sorted unique start times. Each cell lists its slots; clicking a slot edits it (day select, start, end, title, room).
- Under 700px show one day with `tabs(DAYS_SHORT)`, defaulting to today.

### #27 Habits (`habits`, route `habits`)
- Row: name | today checkbox (`days[today()]`) | current streak (consecutive days ending today, or yesterday if today isn't ticked) | best streak | a 30-day strip of small squares.

### #28 SAT (`sat`, route `sat`)
- Stats: latest total, best, days until `settings.satDate` (2026-12-05), target `settings.satTarget`.
- `lineChart({series:[{label:'Total', points: tests.map(t=>({x:t.date,y:t.total}))}], target:{y:1500}, yMin:400, yMax:1600})`
- Tests table with add/edit (date, total, math, rw, source, notes).
- Skills grouped by section and domain, each with a `levelPicker` and notes. A "Weakest 5" box.
- Weekly plan editor (7 text inputs) saved to `weeklyPlan.mon…sun`.
- Import JSON: accept `[{date,total,math,rw,source}]` or `{tests:[...]}` and merge by date+total.

### #29 Portfolio (`portfolio`, route `portfolio`)
- FIELDS: type(project/competition/award/certificate)*, title*, date, role, result, description(wide), links(links). Files go in attachmentsBox. Filters: type and year.

### #30 Universities (`universities`, route `universities`)
- Table columns: name | country | QS | THE | QS CS | EYUF badge (yes=ok, no=danger, check=warn) | SAT | deadline (estimate → add badge "estimate") | status | priority. Any field listed in `item.verify` shows `badge('verify','verify')`.
- Filters: country, status, eyuf. Sort by clicking the column headers.
- Detail page `#/universities/<id>`: all fields in a `formDialog`-like grid, sources as links, and the documents checklist (#33).

### #31 Import from report (backend + button)
- Create `backend/research_import.py` with `import_into(storage, paths, dry_run)`. It parses the table under "## 3. University profiles" in `docs/research/universities.md`, one row per university, columns University | QS 2027 | THE 2027 | QS CS 2026 | El-Yurt Umidi?. Store ranks as text ("—" means empty and the field is added to `verify`). eyuf: text starting "✅" means yes, "❌" means no, otherwise check. Fill country from the parentheses in the name. Every other field stays empty and is added to `verify`. `sources: ["docs/research/universities.md"]`.
- Merge by name: only fill fields that are empty. Never overwrite the user's edits. Return `{added, updated, preview}`.
- Add a test that every rank stored is text that appears in the md file.
- Button on the Universities page: "Import from research report" shows the preview, then calls `api.post('/api/import/universities', {})`.

### #32 Scholarships (`scholarships`)
- FIELDS: name*, pays(textarea), requirements(textarea), deadline(date), deadline_estimate(checkbox), obligation, link(url), status(Researching/Preparing/Applied/Offer/Rejected/Accepted).
- Seed from the report: MEXT, GKS (embassy + UIC), Chinese Government Scholarship, Stipendium Hungaricum, El-Yurt Umidi, KAIST Scholarship, Kyoto iUP. Use only facts that are in the report.

### #33 Documents checklist
- Default item names: Transcript, Predicted grades, AS results, IELTS certificate, SAT score report, Recommendation letter 1, Recommendation letter 2, Personal statement / essays, Passport, Photo, School certificate (attestat), Activities list / CV.
- Each university has `docs:[{id,name,status(todo/ready/sent),files:[]}]`, created from the defaults on first open. A row is name | status select | attachmentsBox.
- `documents.shared` holds files used everywhere (passport etc.), shown on the Documents page.

### #34 Deadlines (`deadlines`, route `deadlines`)
- Timeline collected from university deadline/early_deadline, scholarship deadline and `deadlines.items`. Sorted by date, grouped by month, showing `relative(date)`. Colour badge: ≤7 days danger, ≤14 warn, ≤30 accent.
- Add custom deadline: title, date, estimate, notes. Desktop notifications are already handled by the backend.

### #35 Activities (`activities`)
- "Add from Portfolio" select. Each item has a title input with counter (limit 50) and a description textarea with counter (limit 150, editable). The `.counter` gets class `over` when past the limit. Copy button (`copyText`).

### #36 Essays (`essays`, route `essays/<id>`)
- List of prompts (university, prompt, limit). The editor is a big textarea with a live word count, autosaved (`save` is debounced already).
- "Save version" pushes `{at: new Date().toISOString(), text}` to `versions`. The versions list has view and restore (restore saves the current text as a version first).

### #37 Plan A / B (route `plans`)
- Two columns built from the universities and scholarships data.
  - Plan A: KAIST, Kyoto iUP, Stipendium Hungaricum, NUS/NTU/HKU.
  - Plan B: EYUF routes, each listing the universities that fit it: (1) QS ≤ 20 with a 50%+ grant (Presidential School route), (2) QS ≤ 100 with a full grant, (3) QS ≤ 300 open competition.
- Fixed box "Ask EYUF before relying on Plan B": conditional offers accepted? University on the list? Which ranking year?

### #38 ICO research (`docs/research/ico.md`)
- Write what is known, with links. Anything unconfirmed is marked "unknown — ask me".

### #39 / #40 Cyber (`cyber`, route `cyber`)
- Topics: levelPicker rows, the same as subject topics.
- Plan: inputs for selectionDate and minutesPerDay. The Generate button makes `weeks` from today to selectionDate (16 weeks if empty). Week k focuses on the 2 lowest-level topics (rotating), with tasks `["TryHackMe room on <topic>", "1 practice challenge", "Writeup"]`. Today's task = the current week's first task that isn't done.

### #41 TryHackMe (`thm`)
- FIELDS: name*, url, topic(select of cyber topics), status(todo/doing/done), finished(date), notes. Show progress per topic.

### #42 Challenges (`challenges`, route `challenges/<id>`)
- Write ≥10 original offline challenges into `data.example/challenges.json`: `{id,title,topic,difficulty(easy/medium/hard),story,files:[{name,content}],hint,solution,flag_sha256}`.
- Check flags with `crypto.subtle.digest('SHA-256', text)` and compare hex. Hint and solution stay behind "Show" buttons. Files download via Blob.
- Ideas: base64, Caesar, hex+reverse, ls -l permissions to octal, subnet broadcast address, an HTML comment, file magic bytes, auth.log attacker IP, single-byte XOR, Vigenère, reversing a small Python checker.

### #43 Writeups (`writeups`, route `writeups/<id>`)
- List plus editor: title, link (challenge or room select), body textarea with a `markdown()` preview toggle, attachments.

### #44 Today (route `today`, the home page)
- Cards in `.grid.cols-3`:
  1. SAT task: today's `sat.weeklyPlan[day]` plus the weakest skill.
  2. Cyber task.
  3. Homework due in the next 3 days or overdue (overdue in red).
  4. Habits (today checkboxes).
  5. Next 3 application deadlines.
  6. Continue reading: the library item with the latest `opened`, as a link to `#/library/<id>/<lastPage>`.
  7. Today's timetable.
- Reminders banner from `api.get('/api/reminders')`.

### #45 Weekly review (route `review`)
- `barChart` of minutes per area for this week vs last week, from `timelog.entries` grouped by `weekStart(date)`.
- Lists: finished this week (homework done_at, THM finished, past papers by date) and overdue.
- Notes textarea saved in `review.weeks[weekKey()]`.
