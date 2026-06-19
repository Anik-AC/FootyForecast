# FootyForecast: Data Inventory

A single-source reference for every data stream the system ingests, what it stores, and why. Updated as new sources are added.

---

## Data sources

### 1. football-data.org (free tier)

**What it is:** The primary live feed for WC 2026 fixtures and results. Also provides tournament scorers (goals, appearances, penalties) for the player predictions model.

**Authentication:** API key in the `X-Auth-Token` header.

**Free tier limits:** 10 requests/minute. Does not include match statistics, player events, or anything beyond fixture metadata and final scores.

**Endpoints used:**

| Endpoint | Description | Frequency |
|----------|-------------|-----------|
| `GET /competitions/WC/matches` | All WC 2026 fixtures and results | Every 5 minutes (scheduler) |
| `GET /competitions/WC/scorers` | Tournament top scorers with goal/appearance counts | Each pipeline run |

**What gets stored:**

- `fixtures`: match date, home team, away team, kickoff UTC, stage (group/R32/R16/QF/SF/final), group letter, venue
- `match_results`: home goals, away goals, whether the match went to extra time or penalties, and the penalty winner if applicable
- `player_tournament_stats`: player name, team, goals, assists, appearances, penalties scored

**Limitations:** No match statistics, no xG, no player events (yellow/red cards require Tier 2). The `yellow_cards` and `red_cards` columns in `player_tournament_stats` exist in the schema but are not populated from this source.

---

### 2. ESPN unofficial public API

**What it is:** ESPN's publicly accessible soccer data API. No authentication required. Used for all post-match detailed statistics once a match completes.

**Base URL:** `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world`

**Endpoints used:**

| Endpoint | Description | When called |
|----------|-------------|-------------|
| `GET /scoreboard?dates=YYYYMMDD` | All WC 2026 events for a given date | Event ID discovery (once per match) |
| `GET /summary?event={id}` | Full match summary: stats, events, commentary, rosters | Post-match ingestion |

**Event ID discovery:** Our fixture IDs use the football-data.org numbering scheme. ESPN uses its own numeric event IDs. On first ingestion of a completed match, the scheduler queries the scoreboard for the match date, fuzzy-matches both team names, and caches the ESPN event ID in `sofascore_event_map`. Team name aliases handle divergences (e.g., our DB says "Korea Republic" from the football-data.org naming, ESPN says "South Korea"). A ±1 day retry handles cases where our UTC kickoff time places the match on a different calendar date than ESPN uses.

**What gets stored per completed match:**

**Team statistics** (`match_statistics`, one row per team):

| ESPN field | Stored column | Description |
|------------|---------------|-------------|
| possessionPct | possession_pct | Ball possession percentage |
| totalShots | total_shots | All attempts on goal |
| shotsOnTarget | shots_on_target | Shots requiring a save or hitting the frame |
| saves | goalkeeper_saves | Total saves by the keeper |
| wonCorners | corner_kicks | Corners awarded |
| foulsCommitted | fouls | Fouls committed |
| totalPasses | passes_total | Total pass attempts |
| accuratePasses | passes_accurate | Passes completed |
| effectiveTackles | tackles | Successful challenges |
| yellowCards | yellow_cards | Yellow cards received |
| redCards | red_cards | Red cards received |
| offsides | offsides | Offside calls |

Not available from ESPN (remain NULL): `expected_goals`, `big_chances`, `free_kicks`.

**Key events** (`match_events`, one row per incident):

| Incident type | Description |
|---------------|-------------|
| goal | Goalscorer name, assist name, minute |
| own_goal | Own goal, player name, minute |
| yellow_card | Player name, minute |
| red_card | Player name (can be second yellow or straight red), minute |
| substitution | Player coming on, minute |
| drinks_break | Hydration break event (ESPN type: start-delay with "drinks break" text) |
| penalty_missed | Penalty miss in open play |

Added time is stored separately from the base minute (e.g., minute 45, added time 3 for "45+3'").

**Commentary** (`match_commentary`, one row per entry):

Full timestamped match commentary feed, typically 90-130 entries per match. `is_important` is flagged by keyword regex (goal, card, substitution, penalty, half-time, drinks break). Used as input for the LLM post-match analysis.

**Player statistics** (`player_match_stats`, one row per player per match):

ESPN provides stats for all players who appeared (typically 30-35 per match across both squads). Position codes are simplified from ESPN's granular set to G/D/M/F.

| ESPN field | Stored column |
|------------|---------------|
| totalGoals | goals |
| goalAssists | assists |
| yellowCards | yellow_cards |
| redCards | red_cards |
| totalShots | shots |
| shotsOnTarget | shots_on_target |
| saves | saves (goalkeepers only in practice) |
| foulsCommitted | fouls_committed |
| foulsSuffered | fouls_suffered |
| offsides | offsides |

Not available from ESPN (remain NULL): `minutes_played`, `rating`, `big_chances_created`, `dribble_attempts`, `key_passes`, `crosses_total`, `aerial_duels_won`, and other Sofascore-specific fields.

**Not available from ESPN:** Per-minute momentum data. The `match_momentum` table exists in the schema but remains empty until another source provides this.

---

### 3. Kaggle: International football results 1872-present

**What it is:** A static CSV dataset of all international football results from 1872 onwards. Downloaded once and loaded by `footy/ingest/historical.py`. Not re-fetched; the CSV is the source.

**What gets stored** (`historical_matches`):

Match date, home team name (raw text, no FK), away team name, home score, away score, tournament name, neutral venue flag. Rows before 2002-01-01 are excluded at load time (PRD training window decision). The unique constraint `(match_date, home_team, away_team)` makes the loader idempotent.

Team name resolution (raw name → FIFA code) happens at feature-computation time via `team_name_map` and `footy/ingest/team_map.py`, not at load time. This avoids losing data from teams that are not WC 2026 qualifiers but are still useful as opponents in the training set.

---

### 4. OpenRouter / Claude (LLM)

**What it is:** Used for two content generation tasks. Both require `OPENROUTER_API_KEY` in the environment; both steps in the scheduler silently skip if the key is absent.

**Model used:** claude-haiku-4-5 (fast and cheap; these are short, structured prompts).

**Match previews** (`match_previews`):

Generated pre-kickoff for upcoming fixtures. 2-3 sentences covering the tactical context, recent form, and one key storyline. Regenerated each pipeline run for matches not yet previewed.

**Post-match analysis** (`match_analysis`):

Generated after ESPN commentary is ingested. The prompt includes the full commentary feed, key events timeline, and team stats. The model is asked to: describe the match narrative, identify the turning point, note if a hydration/cooling break occurred and roughly when, and flag any unusual tactical patterns. The `has_hydration_break` and `hydration_break_minute` fields are structured extractions from the model output for use in the frontend MomentumChart component.

---

### 5. Prediction markets

**What it is:** Pre-kickoff implied probability snapshots from two platforms, used to benchmark the model against market consensus.

**Sources:**

- Polymarket: decentralized prediction market. Prices expressed as USDC per contract (effectively a probability).
- Kalshi: US-regulated prediction exchange. Note: Kalshi does not allow accounts from Canada; the `KALSHI_API_KEY` environment variable is intentionally left unset for this project.

**What gets stored** (`market_snapshots`):

Raw implied probabilities (before de-vigging) and de-vigged normalized probabilities for home win, draw, and away win. Multiple snapshots per match are retained; the API returns the latest by `sampled_at`. Binary markets (Polymarket) may not quote a draw leg, so `draw_raw` and `draw_dev` are nullable.

**De-vigging formula:** `p_dev_i = p_raw_i / sum(p_raw_all_legs)`. This removes the bookmaker margin and makes the market probabilities directly comparable to the model's output.

---

### 6. Google News RSS (no storage)

**What it is:** News articles fetched at request time and served by the Go API. Not stored in the database; cached in memory for 30 minutes per team/match query.

**Used for:** Team pages and match detail pages. Query format: `"[team name]" FIFA World Cup 2026` or `"[home team]" vs "[away team]" FIFA World Cup 2026`.

---

## Database table reference

### Core match data

| Table | Source | Description |
|-------|--------|-------------|
| `tournaments` | Seeded | One row: WC2026 |
| `teams` | Seeded | 48 qualified teams with FIFA code, name, confederation |
| `fixtures` | football-data.org | All 104 WC 2026 matches with kickoff time and stage |
| `match_results` | football-data.org | Final scores, ET/penalty flags, penalty winner |

### Training and features

| Table | Source | Description |
|-------|--------|-------------|
| `historical_matches` | Kaggle CSV | International results 2002-present (raw team name TEXT) |
| `team_name_map` | team_map.py | Maps raw name strings → FIFA codes |
| `team_ratings` | Computed (Elo) | Append-only temporal Elo ratings, one row per update |
| `match_xg` | Reserved | xG per fixture per team; not yet populated (source TBD) |

### Model outputs

| Table | Source | Description |
|-------|--------|-------------|
| `team_model_params` | Python model | Bayesian att/def posterior means per team |
| `model_globals` | Python model | Global intercept and home advantage mean |
| `match_predictions` | Python model | Win/draw/loss probs + xG + over-under + BTTS |
| `scoreline_probabilities` | Python model | P(home=i, away=j) for each scoreline |
| `team_stage_probabilities` | Go simulator | Stage advancement probabilities from Monte Carlo |
| `simulation_runs` | Go simulator | Metadata per simulation batch |
| `simulation_results` | Go simulator | Per-team per-stage probabilities (primary simulator output) |

### Post-match detail (ESPN)

| Table | Source | Description |
|-------|--------|-------------|
| `sofascore_event_map` | ESPN discovery | Our fixture ID → ESPN numeric event ID cache |
| `match_statistics` | ESPN | 12 team-level stat columns per team per match |
| `match_events` | ESPN | Goals, cards, subs, drinks breaks with exact minute |
| `match_commentary` | ESPN | Full match commentary, ~100 entries per match |
| `match_momentum` | Not yet populated | Per-minute momentum (ESPN does not provide this) |
| `player_match_stats` | ESPN | ~30 player rows per match, 10 stat columns each |
| `match_analysis` | OpenRouter/Claude | LLM post-match narrative with hydration break detection |

### Player predictions

| Table | Source | Description |
|-------|--------|-------------|
| `player_tournament_stats` | football-data.org | Tournament goal/assist/appearance tallies |
| `player_goal_predictions` | Computed | Anytime-scorer probabilities per fixture |

### Content and grading

| Table | Source | Description |
|-------|--------|-------------|
| `match_trivia` | Computed | Pre-match statistical facts from historical data |
| `match_previews` | OpenRouter/Claude | LLM 2-3 sentence pre-match preview |
| `market_snapshots` | Polymarket / Kalshi | Pre-kickoff prediction market odds |
| `match_grading` | Computed | Log-loss and Brier score for model and markets |
| `user_predictions` | User-submitted | Leaderboard participant probability submissions |
| `leaderboard_users` | User-submitted | Leaderboard handles |

---

## What we don't have (and why)

**xG for historical matches.** The `match_xg` table exists but is empty. StatsBomb open data covers mainly top European club matches, not international friendlies or qualifiers. FBref has broader coverage but no stable API. This is the biggest gap for the model: we rely on goals-based Elo rather than shot-quality signals for the feature set.

**Per-minute momentum.** The `match_momentum` table is empty. Sofascore's graphPoints endpoint would provide this but Sofascore is fully blocked at the IP level. ESPN does not offer it.

**Lineup data (pre-kickoff).** No source provides confirmed starting XIs before kickoff without a paid subscription. This means the player predictions model uses only tournament scoring tallies, not lineup-conditioned estimates.

**Kalshi market data.** Kalshi does not allow accounts from Canada, so no key is set and the Kalshi snapshots column in `market_snapshots` has no rows.
