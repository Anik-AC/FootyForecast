# Build log

Dated, append-only record of what changed and why. Newest entries at the top.

## 2026-06-16: Repository and version control setup

Initialized git and the baseline repository scaffolding so feature work can start clean.

- Moved the PRD from the repo root to `docs/FootyForecast_PRD.md`, matching the source-of-truth path that `CLAUDE.md` already references. The root and the convention were inconsistent before this.
- Added a polyglot `.gitignore` covering Python (including PyMC trace and ArviZ artifacts), Go binaries, Node/Next.js, secrets and `.env` files, raw data dumps, and the generated `graphify-out/` graph. Reason: keep large reproducible data, build outputs, and credentials out of history from commit one.
- Added `.gitattributes` forcing LF line endings. Reason: development is on Windows but deploy targets (Cloud Run, Vercel) are Linux, so normalizing to LF avoids CRLF noise and protects shell scripts.
- Renamed the default branch from `master` to `main` to match the branch named in `CLAUDE.md`.
- Committed `.claude/` project config (graphify skill, hook, enabled plugins) but git-ignored `.claude/settings.local.json`, which holds machine-local permission state.

No application code yet. Directory structure (`/python`, `/go`, `/web`) will be scaffolded in the next step.
