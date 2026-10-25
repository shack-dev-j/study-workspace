# GEMINI.md

Notes for any other AI agent (Gemini, Codex, …) working on **Study Workspace**.

The project is complete: all 49 issues are built (see `HANDOFF.md` §1–§2).
For any change, read **HANDOFF.md** first (architecture, API, data shapes, how to
add or change a page), then follow **CLAUDE.md** (stack and data rules apply to
every agent).

- Never commit anything in `data/`, `backups/` or `exports/`.
- Keep the data shapes in HANDOFF.md §4; if a format must change, back up first and add a migration.
- Run `python -m unittest discover tests` and the browser checks in `scripts/` before pushing.
