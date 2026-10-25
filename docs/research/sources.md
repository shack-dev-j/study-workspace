# Sources for the built-in content (v3)

Checked on 2026-10-25 from the cloud session (web search + page fetch). Content is
**linked, not copied**: past papers and notes stay on the sites that publish them.

## Past papers (content/pastpapers.json)

- Host: pastpapers.co (free archive of Cambridge papers). Folder pattern seen on the site:
  `https://pastpapers.co/caie/a-level/<subject-slug>/<YEAR>-<session>/<code>_<s|w|m><yy>_<qp|ms>_<paper><variant>.pdf`
  - sessions: `YEAR-may-june` (s), `YEAR-oct-nov` (w), `YEAR-march` (m; 2022 is `2022-feb-march`)
  - March has variant 2 only; June and November have variants 1–3.
- Checked folders: mathematics-9709/2024-oct-nov, mathematics-9709/2022-feb-march,
  physics-9702/2024-may-june, physics-9702/2025-march, the physics-9702 folder list (2018–2026).
- 9618 slug `computer-science-(for-first-examination-in-2021)-(9618)` comes from search results;
  the page could not be fetched from the cloud (brackets in the URL). Verify on first use.
- Components: 9709 Paper 1 (Pure 1) and Paper 5 (Probability & Statistics 1); 9702 Papers 1 and 2;
  9618 Papers 1 and 2. Years 2021–2025.

## Links (content/resources.json)

| Area | Link | Checked how |
| --- | --- | --- |
| Maths | cambridgeinternational.org 9709 page, 2026–2027 syllabus PDF | search result on the official site |
| Physics | cambridgeinternational.org 9702 page, 2025–2027 syllabus PDF, June 2025 grade thresholds | search result on the official site |
| CS | 9618 2026 syllabus PDF, 2027–2029 update PDF | search result on the official site |
| All | savemyexams.com past paper pages (P1, S1, AS Physics, AS CS P1/P2, CS notes) | search results |
| Maths, CS | physicsandmathstutor.com CAIE P1 maths, CS paper 1 and 2 pages | search results |
| SAT | bluebook.collegeboard.org practice, satsuite.collegeboard.org practice + practice tests | search results on collegeboard.org |
| SAT | en.khanacademy.org/digital-sat/start, khanacademy.org/get-ready-for-sat-prep-math | search results on khanacademy.org |
| SAT | desmos.com/calculator | well-known official site |
| Cyber | tryhackme.com rooms and modules (23 rooms, 6 modules) | each URL appeared in tryhackme.com search results |
| Cyber | play.picoctf.org/practice, overthewire.org/wargames/bandit, gchq.github.io/CyberChef | well-known official sites |

Universities and scholarships come from `docs/research/universities.md` (the user's research report).
Nothing was invented: no rankings or dates were added beyond that report.
