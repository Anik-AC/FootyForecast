# Build log

Dated, append-only record of what changed and why. Newest entries at the top.

## 2026-07-09: Prediction comparison frontend page

Added `/predictions/compare`, a new page showing every knockout-round fixture with side-by-side predictions from all three models, plus a visual champion probability comparison between the Recency and Historical QF simulations.

**New endpoint:** `GET /v1/predictions/compare` returns a single JSON object with two keys: `matches` (all QF/SF/Final fixtures with a `models` array per fixture, one entry per model version) and `champion_probs` (map from simulation model version to list of teams with champion probability, sorted descending). The endpoint uses `DISTINCT ON (fixture_id, model_version)` to take the latest prediction per pair, keeping the query a single pass with no subqueries.

**Files changed:**

- `go/api/internal/models/prediction.go`: Added `ChampionTeamProb` and `PredictionComparison` response structs.
- `go/api/internal/store/store.go`: Added `GetPredictionComparison` to Store interface.
- `go/api/internal/store/postgres.go`: Implemented `GetPredictionComparison` with two queries (fixture predictions + champion probs CTE).
- `go/api/internal/handlers/calibration.go`: Added `GetPredictionComparison` handler.
- `go/api/cmd/api/main.go`: Registered route `GET /v1/predictions/compare`.
- `web/lib/types.ts`: Added `ModelPick`, `FixtureComparison`, `ChampionTeamProb`, `PredictionComparison` interfaces.
- `web/lib/api.ts`: Added `getPredictionComparison()` fetch function.
- `web/app/predictions/compare/page.tsx`: New page. Shows QF/SF/Final matches grouped by stage, each with 3 model columns (home %, draw %, away %, pick badge, xG where available). "ALL MODELS AGREE" badge when all three picks match. Champion probability section shows horizontal bar chart per team comparing Recency vs Historical simulation.
- `web/app/stats/models/page.tsx`: Added "See match predictions" link to the header.

**Verified:** API returns 4 QF fixtures (no SF/Final yet), all three models present per fixture, champion probs for both simulation versions. TypeScript and Go compile clean.

## 2026-07-09: Multi-model comparison

Added three models to compare against each other over the remaining QF-Final matches. Goal: see which prediction strategy was closest to truth by the time the tournament ends.

**Models added:**

- `bayesian_goals_historical`: Same Bayesian Poisson architecture as v3 but with 2-year half-life (HALF_LIFE=730) and no WC 2026 boost (WC2026_BOOST=1.0). Represents a "long-run pedigree" view that ignores recency. Trained in 11 seconds (same data, different weights). Trace saved to `data/traces/goals_model_historical.nc`.
- `elo_v1`: Simple Elo-rating to 3-way probability conversion. Formula: E=1/(1+10^(-Δ/400)), P(draw)=0.25*exp(-Δ²/(2*400²)). No MCMC. Runs in under 1 second. New file: `python/footy/models/elo_predict.py`.

**Infrastructure changes:**

- `python/footy/features/training_data.py`: Added `half_life_days` and `wc2026_boost` parameters to `prepare_training_data()`. Existing callers unaffected (defaults to module constants).
- `python/footy/models/goals.py`: Added `--preset [recency|historical]` CLI flag and `_PRESETS` dict. Fixed `save()`/`load()` to derive meta path from trace path, enabling multiple trace files. Added `version` parameter to `export_params()`.
- `python/footy/models/predict.py`: Added `model_version` parameter to `_write_prediction()`, `predict_all_upcoming()`, `predict_all_retroactive()`. Added `--model-version` and `--trace-path` CLI flags so predict can run against any trained trace.
- `go/api`: Added `GET /v1/stats/models` endpoint. New `GetModelComparison` store method, handler, and route. Returns per-model accuracy, log-loss, Brier score grouped by model_version.
- `web/app/stats/models/page.tsx`: New model comparison leaderboard page. Shows each model's accuracy, log-loss, and Brier score with ranked cards and metric explainer. Linked from the Stats page "MODEL PERFORMANCE" section.

**Pipeline run:** `footy.models.goals --preset historical` (1000 draws, converged) → `footy.models.predict --retroactive --model-version bayesian_goals_historical --trace-path ...` (96 retroactive + 4 upcoming) → `footy.models.elo_predict --retroactive` (96 + 4) → `footy.grading` (192 new rows).

**Early results (all retroactive, in-sample on 96 completed matches):**

| Model | Accuracy | Log-loss |
| --- | --- | --- |
| bayesian_goals_v3 | 70.8% | 0.745 |
| elo_v1 | 66.7% | 0.814 |
| bayesian_goals_historical | 64.6% | 0.870 |

Takeaway: the recency model leads clearly. The historical model underperforms even Elo, confirming that how teams play inside this specific tournament is the dominant signal. These are in-sample results (retroactive predictions); out-of-sample QF-Final performance will be the real test.

## 2026-07-09: QF-conditional bracket prediction

Added a QF-conditional simulation mode and updated the Predictions Bracket page to focus exclusively on the 8 confirmed Quarter-Final teams.

**Go simulator (`go/simulator`):** Added `--from-qf` flag. When set, loads the 4 actual QF fixtures from DB (`quarter_final` stage, sorted by kickoff), simulates only QF→SF→Final using the confirmed bracket, and writes results with model_version `bayesian_goals_v3_qf`. New functions: `tournament.SimulateFromQF`, `montecarlo.RunFromQF`, `db.LoadQFFixtures`. 100k simulations complete in ~83ms (no group-stage overhead).

**Go API (`go/api`):** Added `GET /v1/simulation/qf` endpoint returning QF-conditional probabilities for the 8 remaining teams. Modified `GetLatestSimulation` SQL to exclude `_qf` model versions so other pages (Stats, Teams, Bracket) are unaffected. Added `GetQFSimulation` to Store interface and PostgresStore.

**Frontend (`web/app/predictions/page.tsx`):** Switched from `getLatestSimulation()` to `getQFSimulation()`. The page now shows QF-conditional champion percentages (probabilities given the team is already in QF, summing to 100% across all 8 teams). Description updated. Champion banner shows "X% to lift the trophy."

**QF-conditional results (100k simulations, bayesian_goals_v3):** ESP 29.0%, FRA 24.6%, ARG 16.1%, ENG 9.7%, SUI 6.4%, BEL 6.1%, MAR 5.1%, NOR 3.1%.

Predicted bracket: FRA beats MAR (QF1), ESP beats BEL (QF2), ENG beats NOR (QF3), ARG beats SUI (QF4) → SF1: ESP over FRA, SF2: ARG over ENG → Final: ESP over ARG.

## 2026-07-09: Model v3 retrain with tournament recency boost

Retrained the Bayesian goals model (now `bayesian_goals_v3`) with two changes designed to make predictions reflect current tournament form more accurately:

1. **Half-life reduced 730 → 365 days**: historical matches from 2 years ago now carry half the weight they did before, making the model more responsive to recent form.
2. **WC 2026 tournament boost (3x)**: every match played in this specific tournament gets `comp_weight = 1.0 * 3.0 = 3.0` instead of `1.0`. Rationale: how teams perform in WC 2026 conditions (schedule, pressure, opposition level) is the strongest signal for their remaining matches. Net effect: WC 2026 matches outweigh historical background data by ~16x.

Changes in `python/footy/features/training_data.py`: `HALF_LIFE_DAYS = 365.0`, added `WC2026_BOOST = 3.0` constant applied to WC 2026 comp_weight.
Changes in `python/footy/models/goals.py`: `MODEL_VERSION = "bayesian_goals_v3"`.

Pipeline run: `footy.ingest.wc2026` (96 completed results through R16) → `footy.models.goals` (1000 draws, 500 tune, 2 chains, R-hat OK) → exported params to `team_model_params`/`model_globals` → `footy.models.predict --retroactive` (96 retroactive + 4 upcoming QF) → `footy.grading` (96 matches graded).

Go simulator rebuilt and re-run (100k simulations, `bayesian_goals_v3`). Updated default version flag from `bayesian_goals_v1` to `bayesian_goals_v3` in `go/simulator/cmd/simulator/main.go`. New champion probs: ESP 23.6%, FRA 18.8%, ARG 8.9%, POR 7.6%. The bracket `/predictions` page picks these up automatically from `simulation_results`.

## 2026-07-08: Predictions Bracket page

Added `/predictions` page (`web/app/predictions/page.tsx`) - a visual knockout bracket that cascades model predictions from QF through SF to Final.

Logic: QF cards use actual scores when played, otherwise prediction home/away win probabilities (normalized to 100%). SF and Final cards use actual fixtures from the API when available; otherwise projected matchups are built from QF predicted winners and compared by simulation champion probability to pick the predicted winner. The "PROJECTED" badge distinguishes inferred matchups from real fixtures. The predicted champion is displayed in a gold banner at the top.

Connector lines are drawn with CSS borders using absolute positioning within fixed-height flex columns, ensuring QF/SF vertical midpoints align precisely. Added "Bracket" nav item (linking to `/predictions`) to both the desktop nav in `layout.tsx` and the mobile drawer in `MobileNav.tsx`.

## 2026-07-08: Round of 16 data update, home page hero, stats grading

### Data pipeline

Ingested all available R16 results from football-data.org (95 results total in DB, 7 of 8 R16 matches confirmed; SUI vs COL was still "TIMED" in the API at time of writing and will be pulled on next ingest run). Ran `footy.models.predict --retroactive` to generate retroactive predictions for 7 completed R16 fixtures and live predictions for 4 upcoming fixtures (WC2026-R16-537382 and 3 QF matches). Ran `footy.grading` to compute log loss and Brier scores for all 148 predicted+completed matches, up from 6 rows that existed before. The calibration endpoint (`GET /v1/calibration`) and stats page now reflect accurate out-of-sample stats: **63.5% accuracy** (87 correct of 137 OOS predictions). The 11 retroactive predictions (all R16 + some R32) are correctly excluded from OOS headline numbers.

### Home page hero (page.tsx)

Fixed two issues: the hero spotlight gradient was hardcoded to generic green/blue, and the upcoming match window was limited to 48 hours so QF fixtures (4-7 days out) never appeared.

Imported `teamColor` and `hexToRgba` from `web/lib/teamColors.ts`. The featured match spotlight now computes `homeHex` and `awayHex` from the actual team colors and builds a `linear-gradient(105deg, homeColor, dark, dark, awayColor)` background. Probability % numbers and the probability bar also use team colors instead of hardcoded accent colors. Added `stageLabel(id)` helper to derive the spotlight badge text ("QUARTER-FINAL" etc.) from the match ID instead of a hardcoded string. Upcoming window extended from 48 hours to 7 days.

### Go API: ET/pens fields in match list

`GetMatches` was missing `went_to_et`, `went_to_pens`, `pen_winner_id` from its SELECT statement. The bracket page and `MatchCard` ResultCard use these to determine the correct match winner and show AET/PENS badges, but they were always getting false/null because the list endpoint did not fetch them. Added the three fields to the SELECT (with COALESCE for the booleans) and to the scan/struct construction, which now populates `MatchResultSummary.WentToET`, `WentToPens`, `PenWinnerID` correctly for all completed knockout matches.

### ESPN ingest: transaction rollback fix

`ingest_all_completed` used a single connection for all fixtures in the loop. If any fixture's ingest threw (e.g., a Supabase statement timeout on `match_momentum` DELETE during `--force-all`), the aborted transaction blocked every subsequent fixture in the same session. Added `conn.rollback()` in the except block so a single failure is isolated and the loop continues with the next fixture.

## 2026-06-19: Full frontend redesign (dark theme, design system)

Complete visual overhaul of every page and component in `web/`. The site previously used Tailwind utility classes with a light/mixed theme; it now has a consistent dark design system matching the design files in `Design/`.

**Design tokens.** Background `#0B0A12`, surface `#15131F`, inset `#120F1E`, track `#1D1A2A`. Accent palette: green `#2BE38A`, gold `#FFC23D`, blue `#5B8CFF`, teal `#1FD0C0`, purple `#A35CFF`, red `#FF5D6A`. Typography: Archivo for headings and body, JetBrains Mono for numbers, labels, and metadata. All specific non-standard CSS values are written as inline styles; hover states that cannot be expressed inline use named CSS classes in `globals.css`.

**Rainbow streamer.** A 4px gradient bar (`#2BE38A` through `#FFC23D` and `#A35CFF` to `#FF5D6A`) runs at the top of every page via the root layout.

**Flag rendering.** Country flags use `flagcdn.com/w{size}/{iso2}.png` CDN via a new `web/lib/flags.ts` helper that maps FIFA three-letter codes to ISO-2 codes. Emoji flags are not used because they do not render on Windows.

**Section headers.** Every content section uses a consistent pattern: a 4px colored left-bar, an uppercase JetBrains Mono label, and a hairline separator `div`. The accent color varies by section type (green for results, blue for upcoming, purple for model stats, gold for upsets, teal for hydration/analysis).

**Assets.** Logos and images from the `Design/` folder (which is gitignored) were copied to `web/public/assets/` so they are tracked in git and served by Next.js.

**Pages rewritten** (all using inline styles, no Tailwind rewrite needed for page-level layout): home (`app/page.tsx`), upcoming matches, results, match detail, standings groups, standings knockout, teams list, team detail, stats, hydration analysis, bracket, calibration.

**Components rewritten**: `MatchCard`, `ProbabilityBar`, `ForecastCard`, `PostMatchScorecard`, `MatchStatBars`, `HeadToHead`, `TeamForm`, `OverUnderBars`, `TopScorelines`, `TriviaFacts`, `PlayerScorers`, `MatchPreviewCard`, `BracketTable`, `StandingsNav` (new, client component for tab active state).

**TypeScript.** `npx tsc --noEmit` passes with zero errors after fixing a reference to `prediction.stage` and `prediction.group_letter` that do not exist on the `MatchPrediction` type (only on `MatchSummary`). The match detail hero now renders the static string "FIFA World Cup 2026" for the stage label instead.

## 2026-06-19: Match detail page: events, facts, momentum chart, section cleanup

**MatchEventsCard component.** Replaced the previous ad-hoc events rendering with a proper inline `MatchEventsCard` component. Key improvements: deduplicates events that appear twice in the stream (hydration breaks are emitted once with detail text and once without; the component keeps the more informative entry per minute+type pair); adds a `💧` icon and "Hydration break" label for `drinks_break` events so the incident type string is never rendered raw; adds `🟨🟥` for yellow-red cards; fixes layout with fixed-width minute (`w-10`) and icon (`w-5`) columns so player names never overflow into adjacent columns.

**MatchFacts component.** Replaces the empty LLM trivia section (the `match_trivia` table is not populated) with computed facts derived inline from the already-fetched events array. No extra API call. Derives: first goal scorer and minute, total goals count, own goals, clean sheets, yellow and red card summaries (red cards list the players by name), substitution count, and hydration break minutes. Returns null if no facts can be derived (e.g., no events data).

**Match Momentum chart redesign.** Switched from a smooth area chart to a discrete bar chart using `BarChart` + `Bar` + `Cell` from recharts. Each bar is individually colored: green when home side has pressure, blue when away side has pressure. Opacity scales with magnitude. X axis shows only notable ticks (HT at 45, hydration break minutes in amber, goal minutes in slate) rather than every minute. Reference lines mark HT (dashed slate), hydration breaks (dashed amber), and goals (dashed team color). TypeScript: `CustomTick` now accepts `[key: string]: unknown` to accommodate recharts passing the full XAxis prop set.

**Commentary and Player Stats hidden.** Both sections removed from the match detail page for now (data quality insufficient to be shown to users).

**Probable Goalscorers renamed.** Section header changed from "⚡ Anytime Scorers" to "Probable Goalscorers".

## 2026-06-19: Tournament Trivia backend + full Hydration Analysis page

**Tournament Trivia endpoint (`GET /v1/stats/trivia`).** Computes seven tournament-wide records on the fly from `match_results` and `match_events`: total goals and average per match, biggest win by margin, highest-scoring match (skipped if same game as biggest win), hat-tricks (3+ goals by one player, own goals excluded), fastest goal of the tournament, match with the most red cards (surfaced only when >= 2), and clean sheet count. Each stat is queried independently; any that return no data (e.g., no hat-tricks yet) are simply omitted from the response. This design means the endpoint always returns valid JSON even before any matches have been played. New model types `TournamentTriviaFact` and `TournamentTriviaResponse` added to `models/trivia.go`. Handler added to `handlers/trivia.go`. Mock stub added to `matches_test.go` to keep the test suite compiling.

**Stats page trivia section.** The stats page now fetches `/v1/stats/trivia` and renders a "Tournament Records & Trivia" grid between the upsets section and the player leaderboards. Each fact is a card with an emoji icon, headline, optional detail, and an optional link to the specific match. The section is hidden entirely when the facts array is empty (e.g., early in the tournament).

**Hydration break section improved.** The compact hydration section on the stats page now shows all impacted breaks (those with a momentum shift or a goal within 5 minutes), not just the top 3. Each card shows both before-and-after momentum labels inline, making it easier to read the impact at a glance without clicking through to the full page.

**Full Hydration Analysis page (`/stats/hydration/page.tsx`).** New dedicated page with: six summary stat cards (total breaks, shifts, goals after, home/away benefited, AC venue count); a "How we measure it" methodology callout explaining the commentary-based momentum model and the 10-minute window approach; per-break detail cards for all impacted breaks showing before/after momentum panels with goal counts in each window, momentum shift and goal badges, and venue climate badge; a compact list of non-impacted breaks for completeness; and the full break table with all columns. The table was previously only partially shown on the stats page.

## 2026-06-19: Frontend: navbar, results cards, stats page, form/H2H for upcoming matches

Multiple frontend changes across the site plus new Go API endpoints.

**Navbar.** Collapsed the separate Groups, Knockout, and Bracket links into a single "Standings" dropdown (`NavDropdown.tsx`, client component with hover delay). Bracket removed from nav (accessible via teams page and simulation).

**Results cards (MatchCard.tsx + Go GetMatches).** ESPN-style result cards now show goal scorer names with minutes and red card indicators. Implemented by adding a `key_events` JSON aggregate subquery (LATERAL join on `match_events`) to `GetMatches`. The subquery filters to goals, own goals, and red cards only, keeping the list payload small. `KeyEvent` type added to Go model and TypeScript types.

**Stats page (stats/page.tsx).** Three changes: (1) top scorers limited to 5; (2) Google News RSS section removed (not relevant to the model-focused purpose of the page); (3) top assists added as a paired leaderboard using new `/v1/stats/assists` endpoint. Hydration break section compressed to show only the top 3 momentum-shifted matches with a "Full analysis" link to a dedicated `/stats/hydration` page (full table remains for when that page is built).

**Recent form on upcoming matches (TeamForm.tsx + Go GetTeamForm).** New `GET /v1/teams/{teamID}/form` endpoint returns the last 5 completed WC 2026 matches for a team. Displayed as W/D/L badge strips on the match detail page for upcoming fixtures. Color-coded: emerald for wins, slate for draws, red for losses.

**Head-to-head on upcoming matches (HeadToHead.tsx + Go GetMatchH2H).** New `GET /v1/matches/{id}/h2h` endpoint returns: WC 2026 meetings between the two teams (excluding the current fixture), an all-time summary (played/wins/draws), and up to 5 recent historical meetings from `historical_matches` (via `team_name_map`). The historical lookup is wrapped in graceful error handling so the endpoint works before the ingestion pipeline has been run. Displayed as a W/D/L proportion bar with a recent meetings list.

**New Go API endpoints.**

- `GET /v1/teams/{teamID}/form` (GetTeamForm)
- `GET /v1/matches/{matchID}/h2h` (GetMatchH2H)
- `GET /v1/stats/assists?limit=N` (GetTopAssists)

All three methods added to `Store` interface, implemented in `postgres.go`, routed in `main.go`, and stubbed in `matches_test.go`. `go test ./...` and `next build` pass clean.

## 2026-06-19: Review fixes (correctness, calibration, frontend)

Applied five fixes from the project review.

**#4 Lambda-based knockout resolution (bracket.go).** The `knockoutWinner` function previously resolved drawn knockout matches with a coin flip, discarding all model strength information at the moment it matters most. Replaced with `P(home advances) = λ_home / (λ_home + λ_away)`, which preserves the Poisson rate signal through extra time and penalties. Degenerate case (both rates zero) falls back to coin flip.

**#7 Honest scorer badge (PlayerScorers.tsx).** The "form" badge appeared when a player had scored in the tournament, implying the model used that as an input. The `anytime_scorer_prob` is always derived from 2025/26 club xG only — tournament goals are stored for display but never feed into the probability. Changed: badge is now always "xG" (the correct source), and tournament goals are surfaced as a "⚽ N" annotation inline with the player name instead.

**#20 Elo gap on match detail pages (matches/[id]/page.tsx).** The raw Elo for each team was shown in small text but the gap — the single most predictive number — was not highlighted. Added an `eloDelta` computation and a centered line showing e.g. "FRA +87 Elo advantage" in emerald (home favoured) or blue (away favoured) between the two team names. Shown for both upcoming and completed matches. Suppressed when the gap is 5 Elo points or less (effectively even).

**#1 Calibration out-of-sample tagging (predict.py, postgres.go, calibration page).** Retroactive predictions (generated after match results were known) were silently flowing into the headline calibration metrics, making in-sample predictions appear out-of-sample. Fix: added `is_retroactive BOOLEAN NOT NULL DEFAULT FALSE` column to `match_predictions` (migration `20260619000002_retroactive_flag.sql`). `predict_all_retroactive` now sets this to `true`. The Go `GetCalibration` query fetches `is_retroactive`, accumulates OOS and total figures separately, and exposes `oos_mean_log_loss`, `oos_mean_brier`, and `out_of_sample_matches` in the API response. The calibration page now shows OOS metrics as the headline and marks retroactive rows with an "in-sample" badge.

**#5 Host-nation home advantage (predict.py, bracket.go).** All WC 2026 predictions previously used `neutral=True`, zeroing out `home_adv` even for USA/CAN/MEX who play in front of home crowds. Fix: added `_HOST_NATIONS = {"USA", "CAN", "MEX"}` and `_HOST_ADV_FACTOR = 0.5` in Python. When the listed home team is a host nation, `home_adv_factor=0.5` is passed to `predict_match` (half the fitted club-football home advantage). The Go simulator's `lambdas()` function applies the same logic via a `hostNations` map and `hostAdvFactor = 0.5` constant applied to `TeamParams.HomeAdv`.

---

## 2026-06-19: Local timezone display for all times on the frontend

All times shown on the website were previously rendered in UTC. Because Next.js server components render before they know the user's timezone, a naive client-side swap causes a React hydration mismatch warning.

**Solution: `LocalTime` client component (`web/components/LocalTime.tsx`).** The component uses `useState` initialised to the UTC representation (matching exactly what the server renders, using `en-GB` locale with `timeZone: "UTC"`), then a `useEffect` fires after mount and replaces the text with the browser's own locale and timezone via `toLocaleString(undefined, opts)`. React's hydration check passes because initial client state matches server output; the swap is invisible to the user.

To avoid React hook dep-array churn from passing inline `Intl.DateTimeFormatOptions` objects (which create a new reference each render), all supported formats are defined as a module-level `FORMATS` constant keyed by a `TimeVariant` string. Callers pass `variant="kickoff"` etc. rather than raw options.

**Four variants:**

- `kickoff` — "16 Jun, 10:00 PM BST" (date + time + timezone abbreviation)
- `datetime` — "16 June 2026, 10:00 PM BST" (long form used on match detail pages)
- `dayheading` — "Tuesday, 16 June" (date-group headings on match/results lists)
- `dateonly` — "16 Jun" (compact date used in bracket and calibration tables)

**Pages updated:** Home, Matches, Results, Match detail, Bracket, Disagreements, Calibration, Stats, Standings/Knockout. All previous `formatKickoff()`, `formatDate()`, `fmtDate()`, and inline `toLocaleDateString` calls were removed and replaced with `<LocalTime>`.

---

## 2026-06-19: Retroactive predictions for completed matches (404 fix)

19 completed WC 2026 matches (including France 3-1 Senegal and others from matchday 1) had no row in `match_predictions` and therefore returned 404 on their match detail pages. This happened because `predict_all_upcoming` filters `r.fixture_id IS NULL AND f.kickoff_utc > model_as_of`, which correctly avoids predicting completed matches during normal operation but left the earliest fixtures unpredicted.

**Fix (`python/footy/models/predict.py`, `predict_all_retroactive`):** Queries completed fixtures (present in `match_results`) with no prediction row. For each, sets `model_as_of = kickoff_utc - timedelta(hours=2)` so the DB check constraint (`model_as_of < kickoff_utc`) is satisfied. Calls `predict_match` with the current Elo and rest days, upserts the prediction row. Returns the count of fixtures filled.

**Point-in-time caveat (documented in function docstring):** These retroactive predictions use current Elo ratings and rest day values, not the values that were true at kickoff time. They are accurate enough for display and calibration purposes but should not be used for backtesting accuracy metrics. A proper historical backtest would require snapshotting Elo at each match date.

CLI: `uv run python -m footy.models.predict --retroactive`. All 26 completed matches were predicted on the first run after the kwarg bug (`home_rest=` / `away_rest=` vs the correct `home_rest_days=` / `away_rest_days=`) was fixed.

---

## 2026-06-19: "The Forecast" card on upcoming match pages

Inspired by ESPN's "Top Bins Verdict" widget. Shows four machine-computed predictions in a compact card at the top of the upcoming match detail page.

**Component: `web/components/ForecastCard.tsx`.** Pure computation from existing `MatchPrediction` and `MatchScorerPredictions` data, no LLM or external call needed.

Four rows:

1. **Most Likely Result** — highest probability across home win, draw, away win (from `outcome_probabilities`)
2. **Most Likely Scoreline** — top entry from `scoreline_grid` sorted by `probability`
3. **Goals Call** — highest confidence across 8 over/under/btts options: over/under 1.5, 2.5, 3.5 goals, both teams to score, and clean sheet likely (inverted btts). Picks whichever option the model is most confident about.
4. **Most Likely Scorer** — top player by `anytime_scorer_prob` across both teams combined

Design: `bg-slate-950` card with `border-slate-700/60`, header "The Forecast" (slate-200/emerald-400), rows show the verdict in large white text and the probability in large emerald text. Only shown on upcoming (not completed) match pages.

---

## 2026-06-19: PlayerScorers component redesign (ESPN "Anytime Scorers" style)

Redesigned `web/components/PlayerScorers.tsx` to match the two-column stacked layout from ESPN's "Anytime Scorers" card.

Changes:

- **Top 5 per team** (previously showed all players): `team.players.slice(0, TOP_N)` where `TOP_N = 5`
- **Stacked player rows:** each player now renders in two visual rows. Row 1: player name (left) and probability percentage (right). Row 2: source badge (left) and gradient progress bar (right). Previously was a single-row horizontal layout.
- **Source badge:** shows "form" (emerald) when the player has scored at least once in the tournament (`tournament_goals > 0`), otherwise shows "xG" (teal). Signals whether the probability is driven by real tournament evidence or club xG prior.
- **Bar cap changed from `/0.6` to `/0.5`**: bar fills to 100% at 50% probability, giving more visual spread for the realistic range of WC scorer probabilities (most top players are 20-40%).
- **Header:** lightning bolt emoji + "Anytime Scorers" in two lines, with a "form-adjusted · 2025/26 xG" pill badge top-right.
- **Gradient bar:** blue to green to amber to red (`#3b82f6 → #22c55e → #f59e0b → #ef4444`), clipped to the filled width.

---

## 2026-06-19: Per-match momentum chart populated from commentary feed

The `match_momentum` table, `GetMatchMomentum` API handler, and `MomentumChart` component were already built in an earlier session but the table was always empty. ESPN's match timeline chart is powered by Stats Perform's proprietary "Attacking Momentum" metric, which is not available in ESPN's public API. This entry populates the table using a commentary-derived proxy.

**Algorithm (`python/footy/ingest/espn.py`, `compute_match_momentum`):**
Each `match_commentary` row is scored by detecting whether the home or away team name appears in the text. Entries that mention the home team but not the away team score +1 (or +3 if `is_important = true`). Entries mentioning only the away team score -1 (or -3). Neutral entries (both or neither mentioned) are skipped. Raw per-minute scores are accumulated, then smoothed with a 5-minute centred rolling window (±2 minutes). The result is written to `match_momentum` as `(fixture_id, minute, value)`.

Team name matching uses `_canonical()` plus all known aliases (e.g., "south korea" and "korea republic" both match the same team) and the `_normalize()` helper to strip diacritics before comparison.

**New functions:**

- `compute_match_momentum(fixture_id, home_team, away_team, conn)`: single-match computation, called automatically at end of `ingest_match()`
- `compute_all_momentum(conn)`: recomputes for all fixtures with stored commentary
- CLI: `uv run python -m footy.ingest.espn --momentum-all` to retroactively populate for all matches

**Frontend (`web/components/MomentumChart.tsx`):**

- Prop `hydrationBreakMinute?: number` replaced by `breakMinutes?: number[]` to support multiple breaks per match
- Added `goalEvents?: Array<{ minute: number; isHome: boolean }>` prop: goal minutes shown as thin vertical lines (emerald for home, blue for away) with a soccer ball label
- Added legend entry for hydration breaks and a disclaimer note clarifying the chart is commentary-derived, not Stats Perform
- Match page now derives these from the already-fetched `events` array and passes them to the chart

**Limitations:** Commentary attribution works best for broadcast-style text explicitly naming both teams. For matches where the commentary is sparse or uses shorthand team references that don't match the canonical name, some minutes will be neutral (value = 0) rather than missing momentum data.

## 2026-06-19: Hydration break momentum analysis on Stats page

Added a full pipeline for analyzing whether FIFA-mandated drinks breaks are disrupting match momentum, motivated by the observation that most WC 2026 venues are enclosed/air-conditioned (AT&T Stadium, NRG, SoFi, Mercedes-Benz, BC Place) and breaks may be unnecessary disruptions.

Data source: `match_events` table (`incident_type = 'drinks_break'`) and `match_commentary` (important event counts). ESPN captures these as "start-delay" events in the key events feed.

**Analysis method:** For each drinks break, the system computes 10-minute event windows on each side of the break minute. "Momentum" for each window is determined by which team scored more goals in that window (or "level" if equal, including 0-0). A shift is recorded when momentum_before != momentum_after. An additional flag marks whether any goal was scored within 5 minutes of the break ending (potential "re-energising" effect).

**Go:** New `models/hydration.go` with `HydrationBreak` and `HydrationAnalysis` types. New `GetHydrationAnalysis` method on `PostgresStore` using four LATERAL subqueries per break row (one per window/table combination) to avoid cartesian product issues. New handler at `GET /v1/stats/hydration-breaks`. Venue climate classification map (enclosed vs open) baked into the store layer.

**Frontend:** `HydrationSection` component added to the stats page. Shows four summary cards (total breaks, shifts count, goal-after-break count, breaks in AC venues), a benefit breakdown (home vs away team gained momentum), and a per-break table with date, match, venue climate badge, break minute, before/after momentum, shift indicator, and goal-within-5min flag. Shifted rows are highlighted in amber.

## 2026-06-19: Anytime scorer model (club xG + travel distance)

### footy/ingest/club_stats.py

Loads the 2025/26 FBref player stats Kaggle CSV (`data/dataset/players_data-2025_2026.csv`). Extracts per-player `npxG` (non-penalty expected goals) from the 2025/26 club season, aggregated across clubs for players who transferred mid-season. Filters to players from the 48 WC 2026 qualifying nations using a 3-letter FIFA code extracted from FBref's "fr FRA" format. Minimum threshold of 2 appearances (90s played) to exclude fringe squad members. Returns `xg_per90` as the key feature: a player's goal-scoring quality signal at club level.

### footy/models/venues.py

Coordinates (lat/lon) for all 17 WC 2026 host venues and a Haversine distance function. Also provides `ESPN_VENUE_ALIASES` to normalize raw venue strings from ESPN or football-data.org to canonical names. Used for travel distance calculations.

### footy/models/scorer.py

Anytime scorer probability model. For each upcoming fixture:

1. Reads team xG from the latest `match_predictions` row (Bayesian model output).
2. Computes travel distance from the team's previous WC 2026 venue to the next. If the team has moved more than 500 km, team xG is discounted at 2.5% per 1000 km above the threshold (capped at 30% total reduction). This is a fixed prior from sports-science literature rather than a fitted parameter, since we only have ~25 completed fixtures with venue data.
3. Distributes the adjusted team xG across individual players proportional to their 2025/26 club xG/90 share. GKs are excluded from the distribution (they essentially never score).
4. Converts player xG into anytime-scorer probability: `P = 1 - exp(-player_lambda)`.
5. Upserts the top 8 players per team into `player_goal_predictions` with method `club_xg_25_26`.

The scorer model is now called automatically from `footy/models/predict.py` after match predictions are written, so a single run of `uv run python -m footy.models.predict` updates both match-level and player-level predictions.

### ESPN venue extraction

`footy/ingest/espn.py` now extracts the venue from the ESPN `gameInfo.venue.fullName` field on every completed-match ingest and updates `fixtures.venue` with the canonical name. This ensures the travel distance calculation has reliable venue data for completed matches.

### Frontend: gradient scorer bars

`PlayerScorers.tsx` updated from solid emerald bars to a blue-green-amber gradient bar matching the target design. The "xG" source label is now shown beside each player's percentage. Tournament goals are only shown when non-zero to reduce clutter.

---

## 2026-06-19: Model v2 (rest days + competitive weighting) and Elo on match pages

### Bayesian goals model v2

Model version bumped from `bayesian_goals_v1` to `bayesian_goals_v2`. Two new features added to the training pipeline and prediction pipeline:

**Rest days.** Each team's days since their previous match is computed during training data preparation (`footy/features/training_data.py`). The raw day count is capped at 21 and then scaled to a centred feature for the model: `(clipped_days - 4) / 4`, so 4 days rest is neutral (0.0), 8 days is +1.0, 0 days is -1.0. A `rest_coef` parameter (`Normal(0, 0.1)`) multiplies this scaled feature in both the home and away log-rate equations.

**Competitive weighting.** Each match's contribution to the Poisson log-likelihood is down-weighted by match type: friendlies at 0.30, competitive internationals at 0.75, World Cup matches at 1.00. Combined weight = time_decay (half-life 730 days) times competitive_weight. Implemented via `pm.Potential` on the weighted log-likelihood sum.

Retrain result: 1024 training matches (48 teams), 0 divergences, all R-hat <= 1.05, sampling took 13 seconds. Top attack strengths: GER, ESP, FRA, POR, NED. All 46 upcoming group-stage fixtures predicted and written to `match_predictions` with `feature_snapshot` carrying `home_rest_days`, `away_rest_days`, and `model_version`.

### Elo ratings on match detail pages

The `GetMatchPrediction` query in `go/api/internal/store/postgres.go` now fetches the pre-match Elo for each team (most recent `team_ratings` row with `as_of <= kickoff_utc`). Added `HomeElo` and `AwayElo` optional fields to the `MatchPrediction` Go model and TypeScript type. The match detail page (`web/app/matches/[id]/page.tsx`) shows the rounded Elo rating below each team's FIFA code in the match header.

---

## 2026-06-19: ESPN post-match ingestion replaces Sofascore

Sofascore was fully blocked at the IP level (403 on every endpoint, both `api.sofascore.com` and `www.sofascore.com`, including with the cloudscraper library). API-Football's free tier does not cover seasons after 2024. ESPN's unofficial public API (`site.api.espn.com/apis/site/v2/sports/soccer/fifa.world`) requires no authentication and returns all needed data.

### New module: `footy/ingest/espn.py`

Replaces the Sofascore scraper and populates the same tables. Event ID discovery searches the ESPN scoreboard by match date (`?dates=YYYYMMDD`) with fuzzy team-name matching. Two robustness layers were needed: a name-alias map (our DB uses FIFA standard names like "Korea Republic", "Czech Republic", "Turkey" while ESPN uses "South Korea", "Czechia", "Türkiye") and a ±1 day date retry (many matches kick off in the evening US time; our `kickoff_utc` converts to the next calendar day but ESPN indexes by local kickoff date).

Data populated per match: team statistics (12 stat categories — possession, shots, saves, corners, fouls, passes, tackles, cards, offsides), key events (goals with assist, yellow/red cards, substitutions, hydration breaks), full commentary feed (important entries flagged by keyword regex rather than arbitrary sequence numbers), and player stats (goals, assists, cards, shots, saves, fouls, offsides). xG and per-minute momentum data are not available from ESPN so `expected_goals` and `match_momentum` remain empty.

ESPN provides 30-35 player stat rows per match (players who appeared). Position codes are simplified from ESPN's extended set (CB, LB, RB, CM, DM, AM, CF, etc.) to our schema's G/D/M/F.

### Scheduler update

Step 10 updated to `from footy.ingest.espn import ingest_all_completed`. The Sofascore module remains in place but is no longer called.

### Temp files removed

`apply_migration.py`, `check_tables.py`, `test_sofascore_headers.py`, `test_apifootball.py` deleted from `python/`.

---

## 2026-06-19: Sofascore post-match pipeline, LLM match analysis, match detail UI

This entry covers the full Sofascore integration: scraping, schema, Go API endpoints, and frontend components.

### Schema

Migration `20260619000001_sofascore_schema.sql` adds 7 tables:

`sofascore_event_map` caches our fixture ID to Sofascore's numeric event ID. `match_events` stores every in-match incident (goals with assist, yellow/red cards, substitutions, VAR) with exact minute. `match_statistics` holds team-level aggregates for both sides (possession, xG, big chances, shots, saves, corners, fouls, passes, tackles, cards, offsides). `match_momentum` stores per-minute momentum values from Sofascore's graphPoints endpoint (positive = home dominating, negative = away). `match_commentary` holds the full timestamped commentary feed. `player_match_stats` is a wide typed table with a column per stat category (general, attack, defense, passing, goalkeeping) covering ~35 stats per player, designed for both frontend display and as model training features. `match_analysis` stores LLM-generated post-match narratives including whether a hydration/cooling break was detected and at which minute.

### Python ingestion: `footy/ingest/sofascore.py`

Scrapes Sofascore's unofficial JSON API (`api.sofascore.com/api/v1`) with browser-like headers and a 1.5-second delay between calls to avoid rate limiting. The module does event ID discovery (fuzzy team name matching on the daily schedule endpoint), then calls five sub-ingesters in sequence: events, statistics, momentum, commentary, and player stats via the lineups endpoint. All ingestion is idempotent (DELETE + INSERT for events/commentary, upsert for stats). `ingest_all_completed()` finds completed fixtures without player stats and processes them in bulk. The CLI supports `--fixture` for a single match and `--force` to re-ingest.

Point-in-time correctness is maintained: data is only scraped after matches complete, and the `player_match_stats` table is keyed on `(fixture_id, sofascore_player_id)` rather than being a rolling aggregate.

### Python analysis: `footy/analysis/match_analyzer.py`

Calls OpenRouter (claude-haiku-4-5) after Sofascore data is available. Detects hydration/cooling break commentary via regex, samples momentum in 10-minute windows around each break, builds a structured prompt, and stores the result in `match_analysis`. Requires `OPENROUTER_API_KEY`.

### Scheduler

Steps 10 (Sofascore ingestion via httpx) and 11 (LLM match analysis for matches with commentary but no analysis yet) added to `run_pipeline()`. Both steps are gated on their dependencies (httpx availability and OPENROUTER_API_KEY respectively) and fail silently with an error log if the dependency is absent.

### Go API: 6 new endpoints

Models added in `models/match_detail.go`: `MatchEvent`, `MatchStats`, `MomentumPoint`, `CommentaryEntry`, `MatchPlayerStat`, `MatchAnalysis`. Store interface extended with 6 methods; `PostgresStore` implementations in `postgres.go`. Handlers in `handlers/match_detail.go`. Routes registered in `main.go`:

- `GET /v1/matches/{id}/events`
- `GET /v1/matches/{id}/match-stats`
- `GET /v1/matches/{id}/momentum`
- `GET /v1/matches/{id}/commentary`
- `GET /v1/matches/{id}/player-stats`
- `GET /v1/matches/{id}/analysis` (404 if not yet generated)

Mock store updated for all 6 to keep tests compiling.

### Frontend components

`recharts` installed. Four new components created:

`MomentumChart`: diverging area chart using recharts ComposedChart. Two overlapping Area series: one clips at zero for home (emerald fill), one for away (blue fill). Half-time reference line at minute 45. Amber dashed reference line at hydration break minute if detected.

`MatchStatBars`: bi-directional horizontal stat bars mimicking the Sofascore UI. Each row shows both teams' value on either side of the stat label, with bar width proportional to share of combined total. Emerald for home, blue for away.

`PlayerStatsTable` (client component): tabbed table with General, Attack, Defense, Passing, Goalkeeping tabs. Goalkeeping tab is hidden if no goalkeeper data exists. Two sub-tables per tab (home and away). All nullable stats show "-" when absent.

`CommentaryFeed` (client component): shows important events by default with a toggle to expand to full commentary. Hydration break entries highlighted in amber.

Match detail page (`/matches/[id]`) updated: for completed matches, fetches all 6 new endpoints in parallel and renders analysis, momentum chart, stat bars, events timeline, player stats table, and commentary feed in that order above the existing market/scorer/trivia sections.

### TypeScript fix

`web/app/teams/[id]/page.tsx` updated to use Next.js 15 async params pattern (`params: Promise<{ id: string }>`).

**Action required:** Apply migration `20260619000001_sofascore_schema.sql` in Supabase dashboard. Install httpx in the Python environment: `uv add httpx`. Restart the Go API.

---

## 2026-06-19: Standings sub-nav, knockout bracket, teams pages, home news, extended player stats

Delivered six related features in one pass.

### Navigation

Nav item "Groups" and "Knockout" replaced with a single "Standings" item linking to `/standings/groups`. "Teams" added between Standings and Bracket. Old `/groups` and `/knockout` routes now redirect to the new paths.

### /standings route group

`web/app/standings/layout.tsx` provides a shared sub-nav header ("Group Stage" and "Knockout" tabs). The group tables page content moved to `/standings/groups`; the knockout bracket to `/standings/knockout`.

### Knockout bracket visual (`/standings/knockout`)

Horizontally scrollable column layout: R32, R16, QF, SF, Final as separate columns. Within each column, matches are positioned absolutely so that each higher-round match sits vertically centered between its two feeder matches, based on a fixed card height (72px) and gap (8px). Vertical lines on the right side of each column pair adjacent matches to show bracket structure. Match cards link to the individual match page and show goals if the match is played or kickoff date if upcoming.

This bracket assumes index-based pairing (R32[0]+R32[1] feeds R16[0], etc.), which approximates the official draw. Accurate bracket-path tracking would require storing the bracket seeding data from the API.

### Teams pages

`GET /v1/teams` and `GET /v1/teams/{id}` endpoints added to the Go API. Store methods `GetTeams` and `GetTeamDetail` added to `PostgresStore`. `GetTeamDetail` runs three SQL queries: team info + Elo, team fixtures (home and away), and player tournament stats. The team W/D/L record is computed in Go from the fixture results.

`/teams` lists all teams grouped by confederation with Elo rating and group letter. Each team card links to `/teams/{id}`. `/teams/{id}` shows the team header (W/D/L, GF/GA, Elo, group), model accuracy for this team (filtered from calibration data), a player stats table, upcoming and past fixtures, and team-specific news via Google News RSS (query: `"[team name]" FIFA World Cup 2026`, 30-min cache).

### Home page news

Top 5 World Cup news items from Google News RSS added to the bottom of the home page, with a "More" link to `/stats`.

### Extended player stats schema

Migration `20260619000000_player_stats_extended.sql` adds `appearances`, `penalties`, `yellow_cards`, `red_cards` to `player_tournament_stats`. The `appearances` and `penalties` columns are populated by the updated `footy/ingest/scorers.py` from football-data.org's `playedMatches` and `penalties` fields. Yellow/red card columns are present in the schema but remain at default 0 until a Tier 2 data source is available.

The `GetTopScorers` Go query and the Stats page table updated to include appearances and penalties.

**Action required:** Apply migration `20260619000000_player_stats_extended.sql` in Supabase dashboard, then re-run `uv run python -m footy.ingest.scorers` to populate the new columns. Restart the Go API after applying the migration.

---

## 2026-06-18: Frontend navigation overhaul + new pages (Upcoming, Results, Groups, Knockout, Stats)

Completed the second phase of frontend restructuring. The site now has a proper multi-page layout covering the full tournament view rather than a single scrollable home page.

### New pages

`/matches` (Upcoming): all fixtures without results, grouped by date with day headings. Shows how many remain in the subtitle.

`/results` (Results): all completed fixtures newest-first, grouped by date. Shows total played count.

`/groups` (Groups): 2-column grid of all 12 group tables. Columns are Team, P, W, D, L, GD, GF, Pts. Top 2 per group get a green dot and subtle emerald background tint. Goal difference is colored: emerald for positive, red for negative. Standings are computed in Go from existing `fixtures` and `match_results` rows (no new schema). The note at the bottom mentions the 8 best third-placed teams who also advance.

`/knockout` (Knockout): all non-group fixtures organized by stage in order R32, R16, QF, SF, Final. Shows a placeholder message while group stage is still running.

`/stats` (Stats): tournament overview page with four sections. Model Performance shows matches graded, correct pick count/percentage, avg log loss, and avg Brier score sourced from the existing calibration endpoint. Upsets lists matches where the model gave less than 30% to the actual result, sorted by how wrong the model was (lowest probability first). Top Scorers is a table of players sorted by goals from the `/v1/stats/scorers` endpoint. Latest News pulls World Cup news from the Google News RSS feed (server-side fetch with regex XML parser, no npm dependency, caches for 30 minutes via Next.js `revalidate`).

### Home page changes

The home page now shows only the next 48 hours of upcoming matches and the last 48 hours of results. Links to `/matches` and `/results` give access to the full lists. `UserStatsBanner` is included for the single-user prediction score.

### Nav update

Layout nav updated to: Upcoming, Results, Groups, Knockout, Bracket, Stats, Calibration. The "Upsets" link (to `/disagreements`) was removed; upsets are now a section on the Stats page instead.

### Go backend additions

`GET /v1/teams/ratings`: returns latest Elo ratings per team from `team_ratings` (DISTINCT ON, `rating_type='elo'`, sorted by rating desc).
`GET /v1/users/{userID}/stats`: returns total picks, graded count, correct count, and avg log loss for a given user.
`GET /v1/groups`: returns group standings computed in Go (no schema change required).
`GET /v1/stats/scorers`: returns top scorers from `player_tournament_stats`.

All four endpoints are covered by mock implementations in `handlers/matches_test.go` so `go test ./...` continues to pass.

---

## 2026-06-18: Phase 1 frontend features (disagreement feed, bracket diff, post-match scorecard, team spotlight)

Four new surfaces delivered end-to-end, covering the remaining PRD dashboard milestones before modeling work begins.

### Upset/Disagreement Feed (`/disagreements`)

New page listing upcoming fixtures ranked by the disagreement between the model and prediction markets. For each fixture the page shows which outcome the model favors over the market (with exact percentage point gap), a color-coded disagreement score (red for 15pp+, amber for 8pp+, slate otherwise), and a three-column probability grid comparing model vs market for each of home/draw/away.

Go: `models/disagreement.go` defines `DisagreementEntry`. `store.GetDisagreements` uses a LATERAL JOIN to pull the latest prediction and latest market snapshot per upcoming fixture, computes the mean absolute difference across all three outcome probabilities in Go (avoiding SQL floating-point complexity), identifies the outcome where `model_prob - market_prob` is most positive as `ModelFavors`, and sorts descending by disagreement score. Handler in `handlers/disagreements.go`. Route: `GET /v1/matches/disagreements`, registered before parameterized routes to prevent chi routing from treating "disagreements" as a match ID.

Frontend: `app/disagreements/page.tsx` (server component). `FavorsBadge` shows which outcome the model backs with the exact model% and market%. "Upsets" nav link added to layout between Bracket and Calibration.

### Bracket probability diff

The bracket table (`/bracket`) now shows how each team's advancement probabilities changed since the previous simulation run.

Go: `GetLatestSimulation` was rewritten to query the two most recent distinct `run_at` timestamps from `simulation_results`, load stage probabilities for both via a shared helper closure, compute `delta = current - previous` per team per stage, and attach the result to each `TeamSimulationResult`. `PreviousRunAt` is returned in the response for informational display. No schema change: the table is already append-only so the diff comes for free.

Frontend: `BracketTable` is now a `"use client"` component. When `hasDelta` is true (at least one team has a delta), each probability cell shows a small colored superscript badge when `|delta| >= 0.005` (emerald for positive, red for negative). A team spotlight panel (`SpotlightPanel`) appears below the table when a row is clicked, showing visual probability bars per stage with a delta column. This serves as the "Path to the Final" feature: the user clicks a team to see their route through the tournament.

### Post-match scorecard

The match detail page now shows a grading panel for completed matches.

Go: `GetMatchPrediction` was extended to fetch the corresponding `match_grading` row (if any) and include it in the response as `grading`. The grading block contains `actual_outcome`, `model_log_loss`, `model_brier_score`, and `market_log_loss` per source.

Frontend: `PostMatchScorecard` component (`components/PostMatchScorecard.tsx`) shows a verdict (checkmark or cross), the model's pre-match probability for the actual outcome, log loss vs the tournament mean (from the calibration endpoint, fetched in parallel), Brier score, and a per-source market comparison line (model better / market better). The panel is only rendered when `prediction.grading` is present, so upcoming matches are unaffected.

TypeScript types updated: `MatchPrediction.grading`, `TeamSimulationResult.delta`, `TournamentSimulation.previous_run_at`, and `DisagreementEntry` interface all added to `lib/types.ts`. `getDisagreements()` added to `lib/api.ts`.

Go build: `go build ./...` passes with no output.

---

## 2026-06-18: Automatic post-match pipeline scheduler

Added `python/footy/scheduler.py`, a long-running background process that polls football-data.org every 5 minutes (configurable via `SCHEDULER_INTERVAL`) and runs the full update pipeline whenever new match results are detected.

The scheduler replaces the need to run `run_update.ps1` manually after each match. `run_update.ps1` is retained as a manual override for one-shot updates. Both now share the same 9-step pipeline in the same order.

### Pipeline steps (triggered by each new result)

1. Ingest: fetches fresh results from football-data.org (cache bypassed on each poll)
2. Elo: appends a new dated snapshot to `team_ratings` reflecting all completed WC 2026 matches
3. Predictions: re-runs `predict_all_upcoming` to pick up knockout fixtures whose participants are now known (group stage → R32 / R16 slots get teams assigned as groups complete)
4. Grading: grades any newly completed model and user predictions (log loss, Brier)
5. Simulator: re-runs the Go Monte Carlo bracket simulation so team advancement probabilities reflect the latest group standings
6. Scorers: refreshes cumulative WC 2026 goal/assist tallies
7. Player predictions: regenerates anytime-scorer probabilities with updated tournament goal shares
8. Trivia: refreshes pre-match facts for upcoming fixtures
9. Previews: regenerates LLM previews for upcoming fixtures (skipped if `OPENROUTER_API_KEY` absent)

Each step is wrapped in its own try/except so a failure in one step (e.g. OpenRouter outage) does not abort the rest. The pipeline is short-circuits after ingest if no new results are found, so the expensive steps (model load, simulator) only run when something actually changed.

### What was missing from run_update.ps1

The previous manual script was missing steps 2 (Elo) and 3 (predictions). These are now added. The step numbering inconsistency (some steps said /5, others /7) is also fixed.

### How to run the scheduler

Locally (in a second terminal alongside `go run ./cmd/api`):

```sh
cd python
uv run python -m footy.scheduler
```

In deployment: run as a second service or background worker process. Environment variables are the same as the API (`DATABASE_URL`, `FOOTBALLDATA_KEY`, `OPENROUTER_API_KEY`).

---

## 2026-06-18: Player anytime-scorer predictions (PRD Track B, simplified)

Added end-to-end player scorer predictions using tournament goal-share data from the football-data.org free tier.

### Why this approach

The free tier of football-data.org provides `/competitions/WC/scorers` (cumulative tournament goals per player) but not per-match goal events or lineups (those require Tier 2). The goal-share model is the most principled approach given this constraint: `P(anytime scorer) = 1 - exp(-team_xg * player_share)`, where `player_share = player_goals / team_total_WC2026_goals`. This is a Poisson model — the same family as the underlying goals model. Known limitation: only players who have scored in WC 2026 appear; players without tournament goals have no basis for ranking without lineup data.

### DB migration (supabase/migrations/20260618000001_player_predictions.sql)

Two new tables. `player_tournament_stats` stores rolling goal/assist tallies per player per tournament (updated by the scorers ingest job). `player_goal_predictions` stores computed anytime-scorer probabilities per player per fixture. Both index by team and probability to support efficient top-N queries.

### Python: footy/ingest/scorers.py

Fetches from the scorers endpoint, resolves team names to FIFA codes via `team_map.resolve`, and upserts into `player_tournament_stats`. Injectable HTTP callable for testing, same pattern as `previews.py`. 11 unit tests, all pass.

### Python: footy/player_predictions.py

The `compute_team_probabilities` function is pure (no DB) and fully tested. `generate_predictions` loads team xG and player stats from the DB and writes `player_goal_predictions`. `generate_all` iterates all upcoming fixtures with xG data. 28 unit tests (39 total across both new modules), all pass. 62 players ingested, 124 player predictions written across 48 upcoming fixtures on first run.

### Go API: GET /v1/matches/{matchID}/scorers

New store method `GetMatchScorerPredictions` queries `player_goal_predictions` joined to fixture/team info, groups by home/away team, returns `MatchScorerPredictions`. Returns 404 if no predictions exist for the match yet (fixture without model xG data, or match already played). Route wired in `main.go`. Mock store updated.

### Frontend: PlayerScorers component

Two-column layout (home left, away right) with a probability bar per player showing `anytime_scorer_prob` as a percentage, plus the player's tournament goal tally for context. Bar colour scales with probability (emerald for high, slate for low). Added to match detail page above the LLM preview. Fetched in parallel with trivia and preview.

### run_update.ps1 updated

Added steps 4 (scorer ingestion) and 5 (player prediction generation) between the simulator and trivia refresh. Both steps are gated on `FOOTBALLDATA_KEY` being set.

---

## 2026-06-18: Post-match result display, calibration fix, and auto-update pipeline

### Calibration fix

`match_grading` was empty because `python -m footy.grading` had never been run against the live database. Ran it manually; 5 matches graded (the matches that have both a model prediction and a confirmed result). The gap between 24 results and 5 graded is expected: the earlier group stage matches were played before the model predictions were computed, so there is nothing to grade for them. Calibration page now shows data.

### Actual scoreline on match detail page

The match detail page showed pre-match probabilities but nothing once the match was complete. Changed two things. First, `GetMatchPrediction` in the Go API now LEFT JOINs `match_results` and includes `actual_result` (home/away goals) in the response when available. Second, the frontend header replaces the static "vs" text with a large final score and a "Full Time" label, and labels the probability bar "Pre-match model probabilities" to make clear these are not live numbers. TypeScript `MatchPrediction` type extended with optional `actual_result`.

### Post-match auto-update pipeline (run_update.ps1)

New script that chains all five post-match jobs in order. Run it after each confirmed result to keep all outputs current. Steps: (1) ingest latest results via API-Football (skipped if `FOOTBALLDATA_KEY` missing), (2) grade completed predictions into `match_grading`, (3) re-run Monte Carlo simulator (`go run ./cmd/simulator`), (4) refresh trivia for new upcoming fixtures, (5) refresh LLM previews for new upcoming fixtures (skipped if `OPENROUTER_API_KEY` missing). All steps are idempotent, so re-running is safe.

### Previews switched to OpenRouter (correction to previous entry)

Previews use OpenRouter (free tier), not the Anthropic API as previously logged. Default model: `openai/gpt-oss-120b:free`. The Anthropic SDK dependency was removed from `pyproject.toml`.

---

## 2026-06-18: Trivia, LLM previews, and leaderboard (PRD milestone 8A-C)

Three new features delivered end-to-end: auto-generated match facts, Claude-powered previews, and a user prediction leaderboard.

### DB migration (supabase/migrations/20260618000000_trivia_previews_users.sql)

Three new tables: `match_trivia` (JSONB array of statistical facts per fixture), `match_previews` (LLM-generated text, stores model ID for auditability), and `leaderboard_users` (lightweight handle-based identity, no auth). The `user_predictions` table already existed in the initial schema with nullable `log_loss` and `brier_score` columns, which the grading job now fills.

### 8A: Auto-trivia engine (python/footy/trivia.py)

Generates statistical facts from `historical_matches` for each upcoming fixture. All queries filter `match_date < kickoff_date` (point-in-time safe). Name resolution maps FIFA codes to historical spellings via the reverse of `TEAM_NAME_MAP`. Templates: head-to-head record, last 5 meetings, recent form, unbeaten streak (3+ matches), scoring streak (3+ matches). Facts stored as JSONB array in `match_trivia`. 42 unit tests, all pass. Run with `.\run_trivia.ps1`.

### 8B: LLM match previews (python/footy/previews.py)

Calls `claude-haiku-4-5-20251001` with the model probabilities and up to 5 trivia facts to produce a 2-3 sentence pre-match preview. The Anthropic client is dependency-injected so tests run without any network calls. 19 unit tests, all pass. `ANTHROPIC_API_KEY` added to `.env.example`. Run with `.\run_previews.ps1`.

`grading.py` extended with `grade_user_predictions()` which fills `log_loss` and `brier_score` on `user_predictions` rows after match results are confirmed. Now called automatically from `.\run_grading.ps1`.

### 8C: Leaderboard (Go API + frontend)

Go: four new endpoints added to the store interface, implemented in `PostgresStore`, and exposed as HTTP handlers with tests.

- `GET /v1/matches/{matchID}/trivia` (returns `MatchTrivia`)
- `GET /v1/matches/{matchID}/preview` (returns `MatchPreview`)
- `GET /v1/leaderboard` (returns `[]LeaderboardEntry` ranked by avg log loss)
- `POST /v1/matches/{matchID}/predictions` (validates probabilities sum to 1.0, rejects if kicked off, upserts prediction and leaderboard user)

`POST` validation: probabilities in [0,1] and sum within 0.001 of 1.0, required `user_id`. User is upserted into `leaderboard_users` on first prediction. `ON CONFLICT DO UPDATE` on `user_predictions` so users can revise before kick-off.

Frontend: `TriviaFacts` component (icon-prefixed fact list), `MatchPreviewCard`, `PredictionForm` (client component with live sum feedback), and `/leaderboard` page (ranked table with log loss color-coding). Match detail page now fetches trivia and preview in parallel alongside the existing prediction and market data. Leaderboard added to the nav bar.

## 2026-06-18: Market comparison and calibration tracking (PRD milestone 7)

Three components delivered end-to-end.

### Part A: Post-match grading (Python)

`python/footy/grading.py` computes log loss and Brier score for each completed WC 2026 match. The core functions (`log_loss`, `brier_score`, `devigify`) are pure and fully tested (24 unit tests, all pass). `grade_completed_matches` runs against the live DB, joins `match_predictions` to `match_results`, fetches the latest market snapshot per source (if any), and writes to `match_grading` with `ON CONFLICT DO NOTHING` so the job is re-run safe.

Binary market handling: when a market source has no draw leg (Polymarket/Kalshi often use binary contracts), the model's own draw probability is substituted and the home/away legs are rescaled to fill the remaining probability.

Run with: `uv run python -m footy.grading`

### Part B: Market ingestion (Python)

`python/footy/ingest/market_map.py` holds the static FIFA code to display name mapping for all 48 teams, plus alias resolution for variant spellings (Korea Republic, Ivory Coast, DR Congo, etc.) used across market platforms.

`python/footy/ingest/markets.py` fetches from Polymarket (public API, no key) and Kalshi (bearer token via `KALSHI_API_KEY`). Both clients accept an injectable `http_get` callable so they are testable without network access (29 unit tests, all pass). The fetchers handle both binary (Yes/No) and three-way (Home/Draw/Away) market structures. De-vigging normalises the legs to sum to exactly 1.0 regardless of structure.

Run with: `uv run python -m footy.ingest.markets [--fixture-id WC2026-GRP-A-01]`

### Part C: Go API calibration endpoint

`GET /v1/calibration` added. Queries `match_grading` joined to `fixtures`, `teams`, and `match_predictions`, returns per-match scores plus aggregate means. Market means are computed only for sources that have grading data, so the response is sparse-safe. Handler test covers 200 (empty), 200 (two graded matches with market data), Content-Type, and store error (4 tests; all Go tests still pass).

### Part C: Frontend

`MarketPanel` component displays model vs market probabilities in a table. Cells are coloured emerald (model higher by >5pp) or rose (market higher) to highlight meaningful disagreements. A banner flags matches where the average disagreement exceeds 5pp. Post-match grading section (log loss and Brier per source) appears automatically once results are confirmed.

`/calibration` page shows aggregate mean log loss and Brier for the model and each market source, plus a per-match breakdown table with colour-coded scores (emerald <0.5, amber 0.5-1.0, rose >1.0). Empty state shown until first match is graded.

`/matches/[id]` updated to fetch market comparison in parallel with prediction (one extra `Promise.all` call, no latency impact). Market panel appears between the totals grid and scoreline heatmap.

Nav updated: Matches, Bracket, Calibration.

`tsc --noEmit` passes with zero errors.

## 2026-06-17: Match detail page with scoreline heatmap

Added `/matches/[id]` route to the Next.js frontend, surfacing the full prediction detail for a single fixture.

**New files:**

- `web/app/matches/[id]/page.tsx`: server component that fetches `getMatchPrediction(id)`, shows `notFound()` when the API returns null.
- `web/components/ScorelineHeatmap.tsx`: client component rendering a 6x6 grid (0-5 goals each axis). Cells are coloured emerald (home win), amber (draw), or rose (away win) in five intensity steps normalised against the highest-probability cell. Probability is shown as text inside each cell when it exceeds 0.5%.

**MatchCard is now clickable:** wrapped in `<Link href="/matches/{id}">` so every card on the home page navigates to the detail page.

**Detail page layout:** match header (teams, kickoff time), stacked probability bar, Win/Draw/Loss stat boxes, optional xG stat boxes, Over 1.5/2.5/3.5/BTTS grid, scoreline heatmap, model version and data-as-of footer.

## 2026-06-17: Next.js frontend (PRD milestone 6)

Added the `web/` Next.js 15 app (TypeScript, Tailwind CSS, App Router).

**Pages:**

- `/` (home): all WC 2026 fixtures grouped by date. Upcoming matches show a stacked probability bar (green = home win, grey = draw, rose = away win) from the model. Completed matches show the confirmed score with the winning team highlighted in emerald. Empty state guides the user to load fixtures.
- `/bracket`: all 48 teams in a table sorted by P(champion) descending. Each stage column (R32 through Win) is coloured by probability intensity (bright emerald for >50%, fading to slate for <5%). Shows n_simulations and `match_results_as_of` timestamp.

**Architecture:** all pages are React Server Components — data is fetched from the Go API at render time using `next: { revalidate: 60 }` (Incremental Static Regeneration, re-fetches every 60 seconds). No client-side JS required for the base layout.

**API client (`lib/api.ts`):** reads `API_URL` from the server environment (not NEXT_PUBLIC, so never exposed to the browser). Falls back gracefully to null/empty when the API is unreachable, showing a "not available" state instead of crashing.

**TypeScript types (`lib/types.ts`):** derived from `docs/api/openapi.yaml`. Updated in sync with the Go models.

**Go API update:** added `GET /v1/matches` endpoint to serve the fixture list with attached predictions and results. Handler + store method + mock update, all tests still pass.

**Build:** `tsc --noEmit` passes with zero errors.

## 2026-06-17: Go JSON API (PRD milestone 5)

Added `go/api/` — the read-only JSON API that serves precomputed predictions and simulation results to the Next.js frontend.

**Endpoints (all under `/v1`):**

- `GET /matches/{matchID}/prediction` — win/draw/loss probs, full scoreline grid, over/under, BTTS, xG. Reads from `match_predictions` and `scoreline_probabilities`.
- `GET /simulation/latest` — Monte Carlo stage-advancement probabilities for all 48 teams. Reads from `simulation_results`, joins team info and group letters.
- `GET /matches/{matchID}/market-comparison` — model probs vs de-vigged Polymarket/Kalshi snapshots, disagreement score, post-match grading. Returns 200 with empty markets array when no market data exists yet.
- `GET /health` — liveness check, returns `{"status":"ok"}`.

**Design:** `chi` router (lightweight, idiomatic), `pgxpool` for concurrent connection management (5-conn limit for Supabase free tier), `store.Store` interface so handlers are testable without a DB. CORS middleware reads `CORS_ALLOWED_ORIGIN` from env (defaults to `*` for dev).

**Tests:** 8 handler tests in `internal/handlers/` using a mock store; cover 200/404 paths, JSON shape, Content-Type header, and monotone stage probabilities. All pass.

**Build:** `go build ./cmd/api` compiles cleanly, `go vet ./...` reports no issues.

**Usage:** `DATABASE_URL=... ./api` (listens on `PORT`, default 8080).

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
