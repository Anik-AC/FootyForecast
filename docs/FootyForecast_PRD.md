# Product Requirements Document: FootyForecast

**Project:** FootyForecast (FIFA World Cup 2026 match prediction engine)
**Owner:** Anik Chakraborti
**Status:** Draft v1
**Last updated:** 16 June 2026

---

## 1. Overview

A web application that produces calibrated probabilistic predictions for every match of the FIFA World Cup 2026, benchmarks those predictions against prediction markets (Polymarket, Kalshi), and presents predictions, post-match grading, and auto-generated statistical trivia through an interactive frontend. The tournament is already underway (11 June to 19 July 2026), so the system updates after each completed match.

The core deliverable is not a winner pick. It is a calibrated probability distribution per match (P(team A win), P(draw), P(team B win), scoreline distribution, over/under, and player-level event probabilities), plus a tournament-level Monte Carlo simulation that gives each team's probability of reaching each stage.

---

## 2. Goals and non-goals

### Goals
- Produce calibrated per-match probabilities (win/draw/loss, full scoreline distribution, over/under, both-teams-to-score).
- Produce player-level predictions (anytime scorer probability, expected best performers) conditioned on lineups.
- Simulate the full 2026 bracket (Monte Carlo) and report each team's probability to reach each stage and win the cup, updated after every match.
- Benchmark calibration against Polymarket and Kalshi over the tournament.
- Auto-generate statistical trivia and post-match prediction grading.

### Non-goals (explicitly out of scope for v1)
- Beating the market for profit. The target is matching market calibration, not generating betting alpha.
- Live in-game (minute-by-minute) win probability. Pre-match only for v1.
- Tactical or formation-level simulation.
- Real-money betting integration of any kind.

---

## 3. Success metrics

Primary evaluation is calibration and probabilistic accuracy, not pick accuracy.

- **Log loss** and **Brier score** on match outcomes, tracked across the tournament.
- **Reliability / calibration curve**: when the model says X percent, the event happens about X percent of the time.
- **Benchmark**: model log loss and Brier score versus de-vigged Polymarket and Kalshi implied probabilities. Success for v1 is being competitive with (close to) market calibration. Consistently beating liquid markets is explicitly not an expectation.
- **Simulation sanity**: simulated stage-advancement probabilities should track market outright odds within a reasonable band.

Pick accuracy may be displayed for user interest but is not an optimization target.

---

## 4. Users

- **Primary:** the project owner, as a portfolio and learning project (Go, Bayesian modeling, full-stack delivery).
- **Secondary:** football fans and recruiters viewing the live site during the tournament.
- **Engagement feature:** users can submit their own pre-match probabilities and be scored (log loss) on a leaderboard against the model.

---

## 5. Tournament format (2026, locked)

- 48 teams, 12 groups of 4. Each team plays 3 group matches.
- Top 2 from each group advance, plus the 8 best third-placed teams, to a Round of 32.
- Knockout: Round of 32, Round of 16, quarter-finals, semi-finals, final. 104 matches total.
- Group tiebreakers in order: points, goal difference, goals scored, head-to-head (points, goal difference, goals scored among tied teams), fair play (fewer cards), drawing of lots.
- Best-third-placed ranking: points, then goal difference, then goals scored, then fair play, then lots.

The simulator must implement this tiebreaker chain and the best-thirds selection exactly. This is the fiddliest correctness-critical piece of the system.

---

## 6. Data

### Sources (to confirm and lock)
- International match results: open results dataset (Kaggle "International football results 1872 to present" or equivalent).
- xG and event data: StatsBomb open data (some international coverage), plus a club-league source (FBref / Understat) for player form. Lock the exact source before building features.
- Squads, lineups, injuries, suspensions: a fixtures/lineups feed. Lineups land roughly one hour before kickoff and are required for player-level predictions.
- Market data: Polymarket and Kalshi APIs for implied probabilities (de-vig before comparison).

### Data windows
- Match results: from 2002, exponential time decay (initial half-life around 2 years, tuned in backtest).
- xG / event features: from the earliest reliable coverage of the chosen source, realistically 2018 onward. Features must be marked as unavailable for matches/eras the source does not cover.
- Player form: rolling 24 month windows plus an age curve.

### Data integrity (critical)
- **Point-in-time correctness.** Every feature must reflect only information available before kickoff. Each row stores the as-of timestamp for every feature.
- **No leakage.** xG models and aggregates must never be fit on data from after the match being predicted. Validation is strict walk-forward: train on everything before date D, predict D, never peek forward.
- **Club-to-international transfer.** Club xG does not transfer directly to international context (different teammates, system, opposition). An explicit mapping from club output to expected international contribution is required and is treated as a first-class modeling component, not an afterthought.

---

## 7. Modeling

Two loosely coupled tracks.

### Track A: match and scoreline model (team level)
An ensemble, stacked with weights tuned on a held-out walk-forward period:

1. **Elo / ratings.** Recency-weighted, margin-of-victory multiplier, home-advantage term (relevant with three hosts). Fed into the other models as a feature rather than treated only as a standalone predictor.
2. **Bayesian hierarchical goals model (centerpiece).** Implemented in PyMC. Team attack and defense strengths with partial pooling (shrinkage handles sparse international samples), home advantage, confederation effects, and time decay as structured priors. Produces full posterior predictive distributions over scorelines, which directly yields win/draw/loss, over/under, and BTTS probabilities with proper uncertainty.
3. **Gradient-boosted model.** LightGBM or XGBoost on engineered features (form, rest days, travel, ratings, recent xG), predicting goals or outcome, to capture nonlinear interactions the Poisson family misses.

Dixon-Coles (bivariate Poisson with low-score correction and time weighting) is retained as a baseline and sanity check.

### Track B: player-event model
Conditioned on predicted or actual lineups. Given the team's expected goals from Track A, model each player's share to produce anytime-scorer probabilities and expected best performers. Heavily dependent on lineup and availability data.

### Tournament simulation
Monte Carlo over the full 2026 bracket. Track A supplies per-pair scoring rates (lambdas); the simulator samples thousands of full tournaments, resolves group tiebreakers and best-thirds selection, propagates teams through the knockout bracket, and aggregates stage-advancement and title probabilities. Re-run after every completed match.

---

## 8. Architecture and tech stack

Polyglot, with each language used where it is strongest.

- **Python**: data ingestion ETL, feature engineering, the Bayesian model (PyMC), the gradient-boosted model, ensemble blending. Runs as scheduled batch jobs, not a live service.
- **Go**: the Monte Carlo simulator (concurrency-heavy, embarrassingly parallel, a good Go learning vehicle) and the JSON API that serves precomputed predictions.
- **TypeScript / React (Next.js)**: frontend, with server-side rendering for heavier dashboard pages.
- **PostgreSQL**: system of record, chosen for the relational structure and point-in-time queries.

Interface contract between Python and Go: Python writes team parameters and per-pair scoring rates to Postgres; Go reads them, simulates, and writes results back. Clean, serializable seam.

Note: the simulation could alternatively live in Python (vectorized numpy) to remove the cross-language seam. Go is chosen deliberately for concurrency practice and an independently deployable simulator, accepting the extra integration work.

---

## 9. Deployment

Split into a private compute side and a public serving side. The web app reads precomputed predictions and never computes them on request.

### Private compute (Kolkata PC, behind Tailscale)
- Scheduled batch jobs (cron): ingestion, model retraining/updating, simulation runs. Writes predictions and probabilities to Postgres.
- Never publicly reachable, which avoids residential-uplink reliability issues.

### Public serving
- **Database**: Supabase (managed Postgres, free tier) as the public system of record. Optionally keep a heavier analytics copy on the Kolkata box.
- **Go API**: containerized (Docker), deployed to Google Cloud Run (free tier, scales to zero, 2M requests/month). Koyeb is the no-credit-card always-on fallback; self-hosting on Kolkata via Cloudflare Tunnel is the zero-cost fallback with a reliability caveat.
- **Frontend**: Next.js on Vercel.
- **CI/CD**: GitHub Actions for build, test, and deploy of the Go service and Python jobs. Worth doing because the repo doubles as a job-hunt portfolio piece.

---

## 10. Post-match update loop

After each completed World Cup match:
1. Ingest the final result and match stats.
2. Update ratings (Elo) and refit/update the goals model as scheduled.
3. Re-run the Monte Carlo simulation over the remaining bracket.
4. Overwrite the predictions and probabilities tables.
5. Grade the just-completed match's prior predictions and store the scorecard.
6. Refresh auto-generated trivia for upcoming fixtures.

The fixture schedule is stored locally and drives which match triggers the job (cron or manual trigger).

---

## 11. Frontend features

- **Model vs market panel (headline).** Model implied probabilities next to de-vigged Polymarket and Kalshi, plus a running calibration tracker (reliability diagram, Brier/log loss over time). Doubles as the evaluation dashboard.
- **Scoreline heatmap.** Grid of P(each scoreline) per match, with over/under and BTTS marginals, instead of a single predicted scoreline.
- **Live Monte Carlo bracket.** Each team's probability to reach each stage and win the cup, updated after every match, with a diff showing how numbers moved after the latest result and "path to the final" views.
- **Upset / disagreement feed.** Matches ranked by how much the model disagrees with the market.
- **Post-match scorecard.** Predicted vs actual, biggest miss, what the model got right, how cup probabilities shifted. Honest grading, not just highlighting hits.
- **Auto-trivia engine.** A library of stat templates (active streaks, droughts, first-time-ever, records broken, head-to-head history) run against the historical database per fixture to surface notable facts automatically. Scales without manual curation.
- **LLM-generated previews and recaps.** Feed model numbers and mined trivia into the Claude API to produce readable match previews and recaps (the narrative layer).
- **User prediction leaderboard.** Users submit pre-match probabilities, scored by log loss against the model and each other. Drives repeat visits during the tournament.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Data leakage inflating backtest | Strict walk-forward validation; as-of timestamps on every feature; prove no leakage before trusting any backtest. |
| Club-to-international transfer error | Treat the transfer mapping as a first-class component; validate against international-only holdouts. |
| Lineup/availability gaps breaking player predictions | Source injury/suspension and predicted-lineup data; degrade gracefully when lineups are unknown. |
| xG data not available for chosen window | Lock the source early; mark unavailable features explicitly; do not promise features the data lacks. |
| Tiebreaker / best-thirds simulation bugs | Unit-test the tiebreaker chain hard against known scenarios before trusting any bracket output. |
| Cross-language seam (Python/Go) overhead | Keep the contract minimal (parameters in, results out via Postgres); fall back to numpy simulation if the seam costs more than it teaches. |
| Overconfidence vs efficient markets | Frame success as matching calibration, not beating the market. |

---

## 13. Milestones (incremental build order)

1. **Schema first.** Postgres schema with point-in-time fields and as-of timestamps baked in.
2. **Ingestion.** Results, then xG/event data, then fixtures and lineups.
3. **Ratings + goals model (Python).** Elo plus the Bayesian hierarchical model, with a strict walk-forward backtest. Goal: one honest, calibrated number on screen before anything else.
4. **Simulator (Go).** 2026 bracket with correct tiebreakers and best-thirds logic, unit-tested.
5. **API (Go).** Serve predictions and simulation outputs.
6. **Frontend core (Next.js).** Scoreline heatmap and bracket first.
7. **Market comparison + calibration tracking.**
8. **Player-event track, auto-trivia, LLM previews, user leaderboard.**

---

## 14. Open questions

- Exact xG/event data source and its earliest reliable coverage year.
- Lineup/injury data source and refresh cadence relative to the one-hour-before-kickoff window.
- Polymarket/Kalshi market coverage per match type (outright vs individual match scorelines) and liquidity.
- Ensemble blend method (simple weights vs stacked meta-learner) and the held-out period used to tune it.
- Public branding and domain for FootyForecast.
