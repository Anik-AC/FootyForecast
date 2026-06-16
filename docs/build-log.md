# Build log

Dated, append-only record of what changed and why. Newest entries at the top.

## 2026-06-16: Postgres schema (PRD milestone 1)

Created the initial Postgres schema and Supabase seed data. No application code yet; this milestone establishes the data model that Python and Go will both depend on.

Migration (`supabase/migrations/20260616000000_initial_schema.sql`) defines 11 tables in 6 concern groups: reference tables (tournaments, teams, fixtures), results (match_results), point-in-time feature tables (team_ratings, match_xg), prediction tables (match_predictions, scoreline_probabilities), simulation tables (simulation_runs, team_stage_probabilities), market table (market_snapshots), grading (match_grading), and user predictions (user_predictions).

Two correctness guardrails are enforced at the schema level. First, `model_as_of < kickoff_utc` is a CHECK constraint on `match_predictions` and `user_predictions`: `kickoff_utc` is denormalized from `fixtures` to make this enforceable without a trigger, since Postgres CHECK constraints cannot reference other tables. Second, `team_ratings` is append-only (temporal table pattern): every rating update inserts a new row rather than overwriting, so any backtest can reproduce the exact feature state for any historical match using `WHERE as_of < kickoff ORDER BY as_of DESC LIMIT 1`.

`match_results.outcome` is a GENERATED ALWAYS AS column derived from 90-minute goals. Penalty shootout result is tracked separately via `pen_winner_id` for bracket propagation, while the model is graded on the 90-minute outcome.

Seed data (`supabase/seed.sql`) contains the WC2026 tournament record and 46 of the 48 qualified teams. Two intercontinental playoff winner slots are marked as TODO with an inline template. The team list is best-effort and must be verified against an authoritative source before running predictions. Group stage fixtures are excluded from the seed and will be populated by the ingestion pipeline (milestone 2).

Decision recorded in docs/decisions/ADR-002-schema-conventions.md.

## 2026-06-16: Repository scaffold and API contract

Created the folder skeleton and documented the Go-to-Next.js API contract. Nothing with behavior was built; this session establishes where things go and what the interfaces look like.

Scaffold: added root README, component READMEs for /python, /go, and /web (placeholders describing what each directory will contain and which PRD milestones they cover), docs/decisions/ with an ADR template and ADR-001, docs/learning/ for future walkthroughs, and docs/api/openapi.yaml for the API contract. The existing .gitignore was already complete; no changes were needed.

API contract (docs/api/openapi.yaml): OpenAPI 3.1 spec covering three endpoints and their core response schemas: per-match prediction (outcome probabilities, scoreline grid, over/under and BTTS marginals, point-in-time marker), tournament simulation (per-team stage-advancement probabilities from R32 through champion), and model-versus-market comparison (de-vigged market probabilities alongside model output, post-match log loss and Brier scores in the grading block). Decision to use OpenAPI 3.1 over 3.0 is recorded in ADR-001.

Three flags from the PRD noted here for future sessions:

1. Penalty shootouts in knockout rounds are not specified in the PRD. The simulator will need a model; the minimal assumption is 50/50. This should be made a formal decision when the simulator milestone is reached.
2. The tournament started 2026-06-11, before this session. Ingestion will need a back-fill pass for already-played matches when that milestone is reached.
3. Player-level API endpoints (Track B) are out of scope for this session and will be added as an addendum at milestone 8.

## 2026-06-16: Repository and version control setup

Initialized git and the baseline repository scaffolding so feature work can start clean.

- Moved the PRD from the repo root to `docs/FootyForecast_PRD.md`, matching the source-of-truth path that `CLAUDE.md` already references. The root and the convention were inconsistent before this.
- Added a polyglot `.gitignore` covering Python (including PyMC trace and ArviZ artifacts), Go binaries, Node/Next.js, secrets and `.env` files, raw data dumps, and the generated `graphify-out/` graph. Reason: keep large reproducible data, build outputs, and credentials out of history from commit one.
- Added `.gitattributes` forcing LF line endings. Reason: development is on Windows but deploy targets (Cloud Run, Vercel) are Linux, so normalizing to LF avoids CRLF noise and protects shell scripts.
- Renamed the default branch from `master` to `main` to match the branch named in `CLAUDE.md`.
- Committed `.claude/` project config (graphify skill, hook, enabled plugins) but git-ignored `.claude/settings.local.json`, which holds machine-local permission state.

No application code yet. Directory structure (`/python`, `/go`, `/web`) will be scaffolded in the next step.
