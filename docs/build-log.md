# Build log

Dated, append-only record of what changed and why. Newest entries at the top.

## 2026-06-17: Go Monte Carlo tournament simulator (PRD milestone 4)

Added the full Go simulator under `go/simulator/`. The simulator reads posterior
mean attack/defence strengths from Postgres (`team_model_params`, `model_globals`),
simulates N full WC 2026 tournaments in parallel, and writes stage-advancement
probabilities to `simulation_results`.

**Package layout:**

- `internal/tournament/types.go`: core value types (TeamParams, Match, Standing, GroupResult, stage constants). All pure data; no DB access.
- `internal/tournament/tiebreaker.go`: full WC 2026 group tiebreaker chain (pts -> GD -> GF -> H2H pts/GD/GF -> lots) and `SelectBestThirds` for picking the 8 best thirds from 12 groups.
- `internal/tournament/bracket.go`: group stage simulation (Poisson sampling via Knuth's algorithm for unplayed matches, standings tracking), knockout simulation (R16 through CHAMPION), 50/50 coin on drawn knockout matches.
- `internal/tournament/tiebreaker_test.go`: 13 unit tests covering the tiebreaker chain — clear points separation, GD tiebreak, GF tiebreak, head-to-head points, three-way circular tie (rock-paper-scissors), symmetric score key lookup, best-thirds selection. All 13 pass.
- `internal/montecarlo/runner.go`: parallel runner using one goroutine per CPU core, each with its own seeded RNG to avoid lock contention. Accumulates counts and converts to cumulative stage probabilities (reaching QF implies counting R32 and R16 too).
- `internal/db/client.go`: pgx/v5 connection with `QueryExecModeSimpleProtocol` to avoid server-side prepared statements (required for Supabase transaction pooler).
- `internal/db/queries.go`: loads team params + model globals, loads group fixtures (with pre-computed xg from `match_predictions` and completed scores from `match_results`), writes simulation results via `pgx.Batch`.
- `cmd/simulator/main.go`: CLI with `--n` (simulations), `--version` (model version), `--dry-run` flags.

**Usage:** `DATABASE_URL=... ./simulator --n 100000`

**Build:** `go build ./cmd/simulator` compiles cleanly. `go vet ./...` reports no issues.

**Key design choices:**

One goroutine per CPU core (not per simulation): spawning 100,000 goroutines would incur unnecessary overhead. The channel buffer is sized to N so goroutines never block on the write, and a separate goroutine closes the channel after all workers finish.

Cumulative stage probabilities: the DB stores P(reach stage X or further), not P(reach exactly X). This matches how prediction markets quote tournament outright odds and is what the frontend will display.

Knockout draws are resolved 50/50 (coin flip once the Poisson scores come out level), which models extra time + penalties without needing a separate ET model. This is consistent with what prediction markets bake into their prices.

**Next:** wire the DB migration (`go run ./cmd/simulator --dry-run` first), then the Go API layer (PRD milestone 5).

## 2026-06-17: Walk-forward backtest (PRD milestone 3, validation)

Added `python/footy/models/backtest.py` to validate the Bayesian goals model
out-of-sample before trusting its WC 2026 predictions.

**Method:** Train on 2014-01-01 to 2022-11-19 (the day before WC 2022 started),
predict all WC 2022 matches where both teams are WC 2026 qualifiers (46 of 64
matches; the other 18 are excluded because opponents like Germany and Cameroon
did not qualify for WC 2026). This is a strict walk-forward evaluation: no
WC 2022 data touches the training set.

**Quick-run results (200 draws, indicative only):**

- Brier score: 0.607 vs naive baseline 0.667 (+8.9% skill)
- Log loss: 1.030 vs naive baseline 1.099 (+6.3% skill)
- Calibration is solid in the 20%-80% range. The 0%-20% bucket shows
  actual=40% vs predicted=16% but contains only 5 matches (likely noise;
  monitor as more WC 2026 results come in).

**Next:** run the full 1000-draw backtest for reliable calibration estimates.
Compare against Polymarket/Kalshi implied probabilities once market comparison
data is wired up (PRD milestone 7).

**Also fixed:** `test_historical.py` integration tests were running by default
and committing a `TRUNCATE historical_matches` before each test, silently wiping
production data. Fix: added `addopts = "-m 'not integration'"` to
`pyproject.toml` so integration tests are excluded unless explicitly opted into
with `uv run pytest -m integration`. Added `prepare_threshold=None` to the
`pg_conn` fixture to fix `DuplicatePreparedStatement` errors when the
integration suite is run deliberately.

## 2026-06-17: Bayesian hierarchical goals model (PRD milestone 3, part 2)

Added `python/footy/models/goals.py`, `python/footy/models/predict.py`, and
`python/footy/features/training_data.py` to complete the core prediction stack.

**Training data:** `prepare_training_data()` runs the EloRater over all
historical matches in memory (point-in-time correctness), emitting a row only
when both teams are WC 2026 qualifiers. Exponential time-decay weights
(half-life 730 days) downweight older matches. Final dataset: 1,017 matches
(2018-2026) involving all 48 qualifiers.

**Model:** Log-linear Poisson regression with:

- Non-centred parameterisation (team-level `att_z, def_z ~ Normal(0,1)`) to
  avoid NUTS funnel geometry.
- Partial pooling through confederation hyperpriors so sparse teams (Curaçao,
  Uzbekistan) borrow statistical strength from their confederation peers.
- Sum-to-zero constraint on attack/defence parameters for identifiability.
- Per-match time-decay weights applied via `pm.Potential` (weighted
  log-posterior rather than a likelihood term).

**Predictions:** `predict_all_upcoming()` samples the posterior predictive
distribution (10,000 samples from the 400-draw quick trace) to produce
win/draw/loss probs, expected goals, over/under (1.5/2.5/3.5), BTTS, and
full scoreline probability grids (0-7 goals per team). 53 WC 2026 upcoming
fixtures written to `match_predictions` and `scoreline_probabilities`.

**ArviZ migration:** Upgraded from ArviZ 0.19 assumptions (InferenceData) to
ArviZ 1.2 (xarray DataTree). `pm.sample()` now returns `xr.DataTree`; saving
uses `trace.to_netcdf()` (requires `netCDF4` package, added to deps).

**Tests:** 16 tests in `tests/test_goals.py` covering weight/date helpers and
all key properties of `predict_match()` (output structure, probability axioms,
direction of strength effects, home advantage).

**Next:** full production run (`--quick` was 200 draws; production uses 1000
draws / 4 chains); walk-forward backtest (`footy/models/backtest.py`, not yet
started); chain Elo re-run + model predict to scheduled ingestion.

## 2026-06-17: Elo ratings module (PRD milestone 3, part 1)

Added `python/footy/ratings/elo.py` — the Elo rating system that produces a
point-in-time team strength signal for all 48 WC 2026 qualifiers.

**Formula:** Standard Elo with three additions: K-factor tiering by tournament
type (WC=40, competitive=30, friendly=20), the FiveThirtyEight margin-of-victory
multiplier (`ln(|goal_diff|+1) * autocorrelation_correction`), and a +100 home
advantage term applied for non-neutral historical matches.

**Name normalisation:** `elo_key()` maps WC 2026 qualifier names to their FIFA
codes so spelling variants ("Czech Republic", "Czechia") share a single rating
entry. Unknown and non-qualifier teams fall back to their raw name.

**Data sources:** 23,270 historical matches (Kaggle CSV, 2002 to 2026-06-10)
plus 18 completed WC 2026 results, giving each active nation 200-350+ matches
to converge from the 1500 prior before the tournament.

**Output:** 48 rows written to `team_ratings` (rating_type='elo') with
`as_of = 2026-06-16`. Top ratings: ARG 2013, ESP 1978, FRA 1955.

**Scheduled ingestion:** also added cache TTL (1 hour) to `wc2026.py` and
registered a Windows Task Scheduler task (`FootyForecast\WC2026Ingest`) that
runs every 30 minutes through 2026-07-20 to keep results current. Elo re-run
should be chained to this (follow-on task, see ADR-004).

Decision recorded in `docs/decisions/ADR-004-elo-design.md`.

## 2026-06-17: Ingestion pipeline (PRD milestone 2, phase 1)

Added the Python ingestion pipeline for match results and WC 2026 fixtures.
xG and event data are deferred to phase 2 once the StatsBomb coverage question
is resolved (documented in ADR-003).

**Schema amendment:** `supabase/migrations/20260617000000_historical_matches.sql`
adds two tables. `historical_matches` stores one row per international match
from the Kaggle CSV with TEXT team names and no FK constraints, because the
dataset covers ~220 nations that cannot all reference the 48-team `teams` table.
`team_name_map` maps raw name strings to FIFA codes for use at feature time.

**Python project:** set up under `python/` using uv (Python 3.12+, hatchling
build backend). Dependencies: psycopg3 (Postgres driver), requests (HTTP),
python-dotenv. Install with `uv sync --extra dev` from the `python/` directory.

**Ingestion scripts:**

`footy/ingest/historical.py`: loads the Kaggle CSV into `historical_matches`.
Filters rows before 2002-01-01, validates scores, inserts in batches of 500
via `executemany` with `ON CONFLICT DO NOTHING` for idempotency. Run with
`uv run python -m footy.ingest.historical data/results.csv`.

`footy/ingest/wc2026.py`: fetches all WC 2026 fixtures from API-Football
(direct endpoint `https://v3.football.api-sports.io`, auth header
`x-apisports-key`). Caches the raw response to `data/wc2026_fixtures_cache.json`
to avoid burning the 100 req/day free-tier quota on re-runs. Upserts fixtures
and inserts results for completed matches (status FT/AET/PEN). Run with
`uv run python -m footy.ingest.wc2026`.

`footy/ingest/team_map.py`: the single source of truth for name normalization.
`resolve(raw)` returns a FIFA three-letter code, None for known non-qualifiers,
or raises `KeyError` for unknown names. The dict covers all 46 seeded WC 2026
teams plus common alternative spellings and ~150 non-qualifier nations.
`seed_name_map(conn)` populates the `team_name_map` database table from the
dict; called automatically by `wc2026.py` main.

**Fixture ID scheme:** `WC2026-GRP-{api_id}` for group stage matches,
`WC2026-{PREFIX}-{api_id}` for knockout rounds (R32/R16/QF/SF/FIN). Embedding
the API-Football fixture ID makes the identifier stable across re-runs and
reschedule events.

**Tests:** 18 tests across two files. Unit tests (no database) cover
`_parse_row`, `build_fixture_id`, `_stage_from_round`, and all `resolve`
variants including the full list of 46 WC 2026 qualifiers. Integration tests
(require Postgres, marked `@pytest.mark.integration`) cover `load_csv`
row count, date filtering, and idempotency. Run unit tests only with
`uv run pytest -m "not integration"`.

Decision recorded in `docs/decisions/ADR-003-ingestion-sources.md`.

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
