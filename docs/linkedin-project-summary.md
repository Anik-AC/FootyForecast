# FootyForecast: LinkedIn Project Summary

A reference document for writing about the project. Pull from any section.

---

## What the project is

FootyForecast is a full-stack probabilistic prediction engine for the FIFA World Cup 2026, built end-to-end as a solo portfolio project. It produces calibrated probability distributions for every match (not just a winner pick), simulates the full 104-match tournament bracket using Monte Carlo methods, and benchmarks those predictions against prediction markets like Polymarket.

The site is live and updates automatically after each completed match. It covers the full tournament from the group stage through to the final on 19 July 2026.

The core idea: the model does not say "France will win." It says "France has a 49% chance of winning, a 27% chance of a draw, and a 24% chance of losing." Every prediction is graded after the match using log-loss and Brier score, the same metrics used by professional forecasters.

---

## Tech stack

The project uses four languages/technologies, each chosen for where it is strongest:

**Python** handles everything computationally heavy: data ingestion from three external APIs, feature engineering, and the statistical models themselves. Libraries: PyMC (Bayesian inference), pandas, NumPy, psycopg3, python-dotenv, uv (package manager).

**Go** runs the Monte Carlo tournament simulator and serves the JSON API. Go was chosen specifically for the concurrency model (goroutines make parallelising 100,000 simulations clean) and as a deliberate learning vehicle. Libraries: chi router, pgx (Postgres driver).

**TypeScript / Next.js** is the frontend. Server components fetch from the Go API; heavier pages use ISR (incremental static regeneration). No Tailwind, fully custom dark design system in inline styles.

**PostgreSQL (Supabase)** is the system of record. The Python jobs write predictions and model parameters; the Go API reads them. The two sides never share code, only data through a clean DB interface.

---

## Data sources and training window

**Historical international results**: Kaggle "International Football Results 1872 to Present" dataset, filtered to matches from 1 January 2018 onwards. Earlier data adds noise; the model sees no meaningful signal from 1990s football for predicting 2026 squads.

**WC 2026 live fixtures and results**: football-data.org API, polled after every match. Covers all 104 fixtures with kickoff times, venues, scores, extra time and penalties.

**Match events, statistics, momentum**: ESPN API (via Sofascore's underlying data). Per-match: goals, red cards, substitutions, hydration breaks, possession, shots on target, xG, commentary, per-minute momentum. Per-player: goals, assists, ratings, key passes, dribbles, tackles.

**Point-in-time correctness** is enforced strictly: every feature row carries an `as_of` timestamp, and no feature is allowed to use information that postdates the match being predicted. This is a non-negotiable guardrail baked into the schema.

---

## Feature engineering

For each match in the training set, the model receives:

- **Attack and defence strength** for each team, estimated from their historical scoring and conceding rates (these are inferred by the Bayesian model, not hand-computed)
- **Elo ratings** for both teams at match time, computed from the full historical dataset with a margin-of-victory multiplier
- **Rest days**: days since each team's previous match, scaled and centred at 4 days (the neutral point), capped at 21 days
- **Match weight**: a combined score of time decay and competitive importance (see below)
- **Neutral venue flag**: whether the match was played at a neutral venue, which suppresses the home-advantage term
- **Confederation membership**: which regional federation each team belongs to (UEFA, CONMEBOL, CONCACAF, CAF, AFC, OFC)

**Match weighting formula:**

```
weight = time_decay_weight × competitive_weight × wc2026_boost
```

- `time_decay_weight = exp(-ln(2) × days_ago / half_life)` with half-life = 365 days (1 year). A match from 1 year ago carries half the weight of one from today.
- `competitive_weight`: World Cup matches = 1.0, other competitive = 0.75, friendlies = 0.30.
- `wc2026_boost`: WC 2026 matches (group stage through R16) get an extra 3× multiplier. The rationale: how these exact squads perform in this specific tournament, in these conditions, against this opposition level, is the strongest predictive signal for their remaining matches.

Net effect: a WC 2026 group stage match from three weeks ago carries roughly 16× the effective weight of a friendly from two years ago.

---

## The primary model: Bayesian hierarchical goals model

Implemented in Python with PyMC. This is the centerpiece of the system.

**Model family**: log-linear Poisson regression. Each team's expected goals per match (lambda, λ) is modelled on the log scale:

```
log(λ_home) = μ + att[home] - def[away] + home_adv × (1 - neutral) + rest_coef × home_rest_scaled
log(λ_away) = μ + att[away] - def[home]                              + rest_coef × away_rest_scaled

home_goals ~ Poisson(λ_home)
away_goals ~ Poisson(λ_away)
```

Where:
- `μ` is the global average log-goals (baseline scoring rate)
- `att[team]` is each team's attacking strength parameter
- `def[team]` is each team's defensive strength parameter (higher = concedes more)
- `home_adv` is the log-scale boost for the home team (applied only to the three host nations USA, Canada, Mexico, at 50% of club-football home advantage)
- `rest_coef` captures the effect of extra rest on attacking rate (per 4-day unit above the 4-day baseline)

**Hierarchical structure (partial pooling)**: team attack and defence parameters are drawn from confederation-level hyperpriors. This means a team like Curaçao with very few matches "borrows strength" from the CONCACAF confederation average rather than producing a highly uncertain estimate from sparse data alone. The math:

```
att[team] = μ_att[conf] + σ_att[conf] × att_z[team]    (non-centred parameterisation)
```

Non-centred parameterisation is used throughout so the NUTS sampler can navigate the funnel geometry of hierarchical models efficiently.

**Sum-to-zero constraint**: a Deterministic transformation subtracts the mean from all attack and defence vectors, removing the identifiability problem that would otherwise let the model trade attack strength for defence strength arbitrarily.

**Time weighting**: implemented via `pm.Potential`, which adds a weighted log-likelihood term. This is the correct way to do it in PyMC because it modifies the sampler's energy function directly rather than resampling rows (which would create a biased dataset).

**Output**: the model produces full posterior distributions over every team's attack and defence strength. The `predict_match` function draws 2,000 posterior samples, computes λ_home and λ_away for each, and returns:
- P(home win), P(draw), P(away win)
- Expected goals (xG): the posterior mean of λ_home and λ_away
- Full scoreline probability grid (all combinations from 0-0 to 5-5)
- Derived probabilities: over/under 1.5, 2.5, 3.5; both teams to score

**Sampling**: 1,000 draws, 500 tuning steps, 2 MCMC chains using the NUTS sampler. R-hat diagnostic checked to confirm convergence. Runs in approximately 20-40 minutes on CPU.

---

## The three deployed model versions

All three models coexist in the database simultaneously via a `model_version` column. The site can compare them on the same set of graded matches.

**bayesian_goals_v3 (Recency)**

The primary model. Half-life = 365 days, WC 2026 boost = 3×. Emphasises how teams are performing right now in this tournament. This model has the best track record so far.

**bayesian_goals_historical (Historical)**

Same Bayesian architecture as v3 but half-life = 730 days, no WC 2026 boost. Weights long-run pedigree (how good has France historically been?) over current tournament form. Trained in 11 seconds because the same PyMC code just sees differently-weighted data.

**elo_v1 (Elo)**

Simple baseline. Converts Elo rating differences to 3-way probabilities using:
```
E = 1 / (1 + 10^(-Δ/400))
P(draw) = 0.25 × exp(-Δ² / (2 × 400²))
P(home) = max(0.01, E - 0.5 × P(draw))
P(away) = max(0.01, 1 - E - 0.5 × P(draw))
```
No MCMC, no goals model, no training time. Runs in under 1 second. Serves as the "dumb baseline" to compare against.

**Current performance on 96 in-sample completed matches:**

| Model | Accuracy | Log-loss | Notes |
| --- | --- | --- | --- |
| Recency (v3) | 70.8% | 0.745 | Best performer |
| Elo (v1) | 66.7% | 0.814 | Simple baseline beats Historical |
| Historical | 64.6% | 0.870 | Long-run pedigree less useful here |

Key insight: how teams play inside this specific tournament is the dominant signal. Historical pedigree underperforms even the Elo baseline, which has no training at all.

---

## The Monte Carlo simulator (Go)

After each match, the simulator runs 100,000 full tournament simulations to produce each remaining team's probability of winning the cup.

**What it does:**
- Reads team attack/defence parameters from Postgres (written by the Python model)
- For each simulation: samples expected goals for every remaining fixture using the Bayesian model parameters, draws a scoreline, propagates the winner through the bracket
- Resolves group tiebreakers in the correct order: points → goal difference → goals scored → head-to-head (among tied teams) → fair play (yellow/red cards) → drawing of lots
- Handles best-third-placed team selection for the Round of 32 (the most complex part: 12 groups, 8 best third-placed teams advance based on points then GD then GF then fair play)
- Aggregates: what fraction of 100,000 simulations does each team win?

**Performance:** The full QF-to-Final conditional simulation (8 teams, 7 matches) completes in approximately 83ms on a single machine.

**Current QF predictions (bayesian_goals_v3, 100k simulations):**
Spain 29.0%, France 24.6%, Argentina 16.1%, England 9.7%, Switzerland 6.4%, Belgium 6.1%, Morocco 5.1%, Norway 3.1%

The Historical model gives a different read: Argentina 21.2%, France 20.7%, Spain 17.8% — ranking changes significantly depending on how much you weight WC 2026 form.

---

## Post-match grading pipeline

After every match:
1. `footy.ingest.wc2026` pulls results from football-data.org
2. `footy.grading` computes log-loss and Brier score for every model's prediction on that match
3. `go/simulator` re-runs 100k simulations with updated team parameters
4. The frontend picks up updated probabilities automatically (ISR revalidation every 60 seconds)

**Log-loss** = -log(probability assigned to the correct outcome). Lower is better. A model that assigns 100% to every correct outcome would score 0. A random 33/33/33 model scores ~1.1.

**Brier score** = mean squared error of the probability vector. Lower is better. It punishes confident wrong predictions more harshly than log-loss.

---

## Frontend pages

The Next.js frontend has 15+ pages and the same visual design system throughout (dark theme, JetBrains Mono for numbers, inline CSS, no Tailwind).

**Home** — featured upcoming match with a gradient spotlight in the two teams' brand colors, upcoming fixtures for the next 7 days, recent results.

**Matches / Results** — match cards with goal scorers, red cards, AET/PENS badges, in-tournament form strips.

**Match detail** — scoreline probability heatmap, xG expectations, "The Forecast" card (most likely result + scoreline + goals call + top scorer), model vs market comparison, post-match analysis (LLM-generated via Claude API), match momentum chart (per-minute pressure bars), events timeline, player stats, head-to-head history, team form.

**Predictions bracket** — visual knockout bracket showing actual scores where played and projected matchups with probabilities where not yet played. Predicted champion banner at the top.

**Model Predictions** — side-by-side comparison of all three models per knockout match, with probability bars and pick badges. Highlights when all models agree.

**Stats page** — model calibration metrics, upset/disagreement feed (where model most disagrees with markets), top scorers/assisters, tournament trivia, hydration break analysis.

**Model Comparison** — leaderboard of all model versions by log-loss, Brier score, and accuracy with metric explainer.

**Standings** — live group tables and knockout bracket standings.

**Teams** — all 48 WC 2026 teams with Elo ratings, group, and form. Team detail pages with fixture history and player stats.

**Leaderboard** — users submit their own probability estimates for each match and are scored by log-loss against the models and each other.

---

## What makes this interesting technically

**Calibration over accuracy.** Most football prediction projects report accuracy (did you pick the right winner?). This project tracks log-loss and Brier score, which measure how well-calibrated the probability estimates are, not just which way they pointed.

**Proper uncertainty quantification.** The Bayesian model does not produce a single lambda for each team; it produces a posterior distribution. The scoreline grid and win probabilities integrate across that full posterior, so the model knows when it is uncertain and reflects that in the probabilities.

**Partial pooling.** Teams with very little data (new qualifiers, small confederations) are regularised toward their confederation's average performance instead of producing wild estimates. This is a meaningful advantage over Elo or simple frequency-based models.

**No data leakage by construction.** Point-in-time timestamps are a schema-level constraint, not a documentation promise. Walk-forward validation and the `is_retroactive` flag ensure calibration metrics are never silently contaminated by in-sample retroactive predictions.

**Multi-language architecture with a clean seam.** Python writes to Postgres; Go reads from it. The two halves of the system never call each other directly. This makes each independently deployable and independently testable.

**Live tournament, live grading.** The site is not a pre-tournament exercise. Predictions were generated for every completed group stage and knockout match and graded immediately after. The error numbers are real.

---

## Numbers to highlight

- 104 matches total in the tournament; predictions generated for all of them
- 96 completed matches graded as of the quarter-finals
- 100,000 simulations per run, completing in ~83ms for the QF bracket
- Training data: ~5,000+ international matches from 2018 to present, weighted by recency and competitive importance
- 70.8% accuracy and 0.745 log-loss for the primary model (in-sample)
- 3 simultaneous model versions with per-match comparison
- 15+ frontend pages, ~30 API endpoints
- Full pipeline: ingest → feature engineering → MCMC training → prediction → simulation → grading → frontend, all automated
