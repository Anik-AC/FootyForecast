# FootyForecast — Project Review

A prioritized, actionable review across the PRD, model reference, data inventory, frontend reference, and build log. Items are ordered by how much they affect the project's core thesis (calibrated, leakage-free probabilistic forecasting benchmarked against markets). Check items off as they land.

**Priority key:** 🔴 Critical (threatens the central claim) · 🟠 High (modeling/correctness) · 🟡 Medium (coherence/engineering) · 🟢 Polish

---

## A. Methodology and correctness

### 🔴 1. Retroactive predictions are leaking into the calibration dashboard
- [ ] **Problem.** `predict_all_retroactive` (`python/footy/models/predict.py`) backfills `match_predictions` for the ~19 completed matches that had no pre-match row. These are produced by the *current* model — retrained on those same matches at competitive weight 1.0 — using current Elo and rest days. They flow through `match_grading` into `/calibration`. The headline metric silently shifted from "5 honestly out-of-sample matches" to "26 matches, 19 in-sample."
- [ ] **Why it matters.** The project's entire pitch is *calibration over accuracy, prove no leakage*. In-sample predictions in the headline calibration number is the first thing a sharp reviewer will probe.
- [ ] **Fix.** Add an `is_out_of_sample` flag on each prediction row (true only when `model_as_of` predates the model's training cutoff for that match). Compute headline calibration from out-of-sample rows only; show in-sample separately or not at all.

### 🔴 2. The point-in-time Elo machinery isn't being exercised
- [ ] **Problem.** `team_ratings` is append-only and designed for `WHERE as_of < kickoff ORDER BY as_of DESC LIMIT 1`, but `footy/ratings/elo.py` writes all 48 teams at a single `as_of` per run. The "pre-match Elo" shown on an early-match page isn't the rating as it stood at that date.
- [ ] **Severity note.** Elo is display-only (not in the Bayesian likelihood), so this is cosmetic rather than predictive — but it contradicts the point-in-time claim that is a selling point.
- [ ] **Fix.** Replay match-by-match and snapshot Elo after each match date, or stop describing the Elo display as point-in-time.

### 🔴 3. Verify the simulator implements FIFA's official R32 slotting (not index pairing)
- [ ] **Problem.** The frontend bracket "assumes index-based pairing… approximates the official draw." If `internal/tournament/bracket.go` propagates teams the same naive way, every stage-advancement probability beyond the group stage is systematically wrong, because a team's knockout path depends on its exact slot — and the best-thirds → R32 slot assignment depends on *which set* of four third-place groups qualifies.
- [ ] **Why it matters.** This is the "fiddliest correctness-critical piece" the PRD itself names. The 13 tiebreaker tests cover ranking but not the slot-assignment matrix.
- [ ] **Fix.** Implement and unit-test the official best-thirds combination matrix against FIFA's published mapping (golden test). Highest-value correctness check in the project.

### 🟠 4. Knockout ties resolved 50/50 discards the model where it matters most
- [ ] **Problem.** `bracket.go` resolves drawn knockout matches with a coin flip, throwing away strength information exactly when it's most decisive.
- [ ] **Why it matters.** Biases champion probabilities toward weaker teams; will show as a measurable gap vs market outright odds (a stated sanity metric). The "markets bake in 50/50" justification is not accurate.
- [ ] **Fix.** Resolve ties by relative lambdas: `P(A advances) = λ_A / (λ_A + λ_B)`, or simulate a short extra-time Poisson then penalties.

### 🟠 5. Host-nation home advantage is zeroed out, contradicting the PRD
- [ ] **Problem.** `home_adv` has zero weight in every WC prediction because all WC matches are marked `neutral=True`. USA, Canada, and Mexico play at home in front of home crowds; the PRD explicitly called out a home-advantage term "relevant with three hosts."
- [ ] **Fix.** Give host nations a partial home-advantage term for matches played in their own country.

---

## B. Modeling improvements

### 🟠 6. The club-to-international transfer "first-class component" is currently a no-op
- [ ] The scorer model (`footy/models/scorer.py`) uses raw club npxG/90 directly as the within-national-team share — a straight 1:1 transfer. The PRD frames this mapping as a headline problem.
- [ ] **Fix.** Build at least a crude shrinkage/regression toward international output, or update the PRD to state v1 assumes direct transfer as a known limitation.

### 🟠 7. The two scorer signals (form vs club xG) don't clearly combine
- [ ] `PlayerScorers` shows a "form" badge when `tournament_goals > 0`, implying form feeds the probability, but model-reference §5 says the probability is *purely* club npxG/90 share. If the badge says "form" while the number is pure club xG, it's misleading.
- [ ] **Fix.** Decide whether tournament goals update the club-xG prior (a natural Bayesian move) and make the badge honest.

### 🟠 8. Travel adjustment is applied inconsistently and asymmetrically
- [ ] Travel discount is applied inside the scorer model only, so summed player scoring probabilities imply a different team xG than the match prediction shows. It also reduces only the traveling team's *attack* (fatigue also weakens defence and raises opponent xG; both teams travel).
- [ ] **Fix.** Apply travel in both the match and scorer paths or neither; note the attack-only asymmetry if kept as a rough prior.

### 🟡 9. OFC partial pooling is near-degenerate
- [ ] With one or two OFC teams, `sigma_att_c[OFC]` is estimated almost entirely from that team itself. Non-centred parameterisation fixes sampling geometry, not identifiability.
- [ ] **Fix.** Add a global fallback hyperprior for confederations below a team-count threshold; spot-check small-confederation posteriors for pathology.

### 🟠 10. The backtest is thin and the baseline is undefined
- [ ] Currently 46 WC-2022 matches at 200 draws, "indicative only," with a tail bucket showing actual 40% vs predicted 16%. "+8.9% Brier over naive" is uninformative without defining naive.
- [ ] **Fix.** Run the full 1000-draw backtest; report calibration with confidence bands; benchmark against de-vigged market and a simple Elo-logistic, which are the baselines that matter per the PRD.

### 🟡 11. Knockout W/D/L coherence
- [ ] A knockout fixture can't end in a draw, yet its prediction shows a draw leg that can never resolve.
- [ ] **Fix.** For knockout matches, fold the draw into the advancement probability or label the bars explicitly as the 90-minute distribution.

---

## C. Data and documentation coherence

### 🟡 12. The live-data source story is contradictory
- [ ] data-inventory (newest) says football-data.org is primary; the 2026-06-17 ingestion entry says `wc2026.py` uses API-Football; the fixture-ID scheme embeds "the API-Football fixture ID"; a later entry says API-Football's free tier doesn't cover post-2024.
- [ ] **Fix.** Pin down what `wc2026.py` actually calls today; reconcile all docs; clarify whether fixture IDs are still API-Football IDs.

### 🟡 13. Numbers drift across documents
- [ ] Training matches appear as 1,017 and 1,024; posterior samples as 2,000 and 10,000; draws as 400 (quick) and 1,000 (production).
- [ ] **Fix.** Make model-reference the single source of truth and align the build-log summary figures.

### 🟡 14. Sofascore naming survives in ESPN-populated objects
- [ ] `sofascore_event_map` and migration `..._sofascore_schema.sql` are now filled by ESPN after Sofascore was abandoned.
- [ ] **Fix.** Rename to `espn_event_map` (or a neutral `external_event_map`) in a migration.

### 🟡 15. The xG centerpiece is empty; the PRD overclaims relative to delivery
- [ ] `match_xg` is unpopulated; the team model is pure goals-Poisson; the scorer model uses club npxG only. The PRD still frames xG and club→international transfer as central.
- [ ] **Fix.** Update the PRD to state v1 is goals-based with xG as future work, so code matches the spec a reviewer reads first.

---

## D. Engineering, testing, infrastructure

### 🟡 16. Add a Python↔Go seam golden test
- [ ] Fixed-seed test: known `team_model_params` → known stage probabilities. Catches regressions at the cleanest but currently untested integration point.

### 🟡 17. Confirm CI actually runs
- [ ] The PRD promises GitHub Actions but no build-log entry stands it up. Add green badges for `pytest -m "not integration"`, `go test ./... && go vet`, and `tsc --noEmit`. (The integration-test `TRUNCATE` incident is a strong argument for CI gating.)

### 🟡 18. Pin the LLM provider
- [ ] Entries variously use the Anthropic SDK, then OpenRouter with `openai/gpt-oss-120b:free`, then `claude-haiku-4-5` via OpenRouter. Pick one path, delete the dead dependency, document once.

### 🟡 19. Concurrency guard on the pipeline
- [ ] The scheduler (5-min poll) and manual `run_update.ps1` share the same 9-step pipeline and both overwrite the same tables. Add a `pg_advisory_lock` or lockfile to prevent interleaved model writes.

---

## E. Frontend and UX

### 🟢 20. Surface the Elo gap
- [ ] Show the Elo delta (e.g. "+87" in emerald next to the stronger side, with a one-line tooltip) instead of just two raw ratings. It's the most predictive single number and your own frontend-reference flags this as the next fix.

### 🟢 21. Collapse the duplicate route trees
- [ ] The route map lists `/groups`, `/knockout`, `/standings/groups`, `/standings/knockout`, and `/bracket` as live after a consolidation overhaul. Settle on one canonical IA and delete the redundant/dead routes.

### 🟢 22. Cold-start handling
- [ ] Cloud Run scales to zero and server components fetch at render time; the first request after idle eats a cold start. Add Suspense/streaming or a short cached fallback.

### 🟠 23. Be explicit about market coverage on the headline panel
- [ ] Kalshi is intentionally empty (Canada); Polymarket may lack draw legs and thin per-match markets. The central model-vs-market comparison and the calibration-vs-market metric may rest on very few matches.
- [ ] **Fix.** Show the matched-match count on the dashboard; consider a bookmaker odds API as a backup market so the benchmark isn't fragile.

---

---

## Suggested order of attack

1. **#1** — out-of-sample tagging in calibration (undercuts the one claim the project is built to make).
2. **#3** — official bracket slotting + golden test.
3. **#4** — lambda-based knockout resolution.
4. **#5** — host-nation home advantage.
5. Everything else as capacity allows; the 🟡/🟢 items are mostly low-effort coherence and polish.
