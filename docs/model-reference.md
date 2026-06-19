# FootyForecast Model Reference

This document describes every model, formula, parameter, and data source used to produce predictions. It covers the Elo rating system, the Bayesian goals model, how predictions are generated from the posterior, and the anytime scorer model.

---

## 1. Data sources

### Historical match results (training backbone)

Source: Kaggle "International football results from 1872 to present" (CSV loaded into `historical_matches`).

The model uses matches from 2018-01-01 onward. The hard cut-off at 2018 is a judgment call: earlier data adds noise because squad generations turn over completely every 8-10 years, and the game's physical demands and tactical standards have shifted materially since the mid-2000s. Everything from 2002 onwards is stored in the database for Elo warm-up, but only 2018+ enters the Bayesian model's likelihood.

Only matches where both teams are WC 2026 qualifiers appear as training rows. That means roughly 200 nations in the raw dataset reduce to ~1 024 usable matches once filtered to the 48-team WC 2026 field.

### WC 2026 live fixtures and results

Source: football-data.org API (free tier). Ingested by `footy/ingest/wc2026.py`. Completed WC 2026 matches are appended to the training set with competitive weight 1.0 so the model keeps updating as the tournament progresses.

### Club player stats (scorer model)

Source: Kaggle "football-players-stats 2025-2026" dataset (FBref season stats), file `players_data-2025_2026.csv`. Loaded by `footy/ingest/club_stats.py`. The key column is `npxG` (non-penalty expected goals), which credits a player only for the quality of his shots from open play, not from the penalty spot.

---

## 2. Elo rating system

**File:** `python/footy/ratings/elo.py`

Elo ratings are used as a contextual feature (displayed on match pages and available for analysis) rather than as direct inputs to the Bayesian model's likelihood. They represent each team's overall strength on a shared scale.

### Starting rating

Every team begins at 1500 when first seen. This is the conventional neutral baseline.

### K-factors (how much one result can move a rating)

| Match type | K |
|---|---|
| FIFA World Cup (not qualifiers) | 40 |
| Competitive (qualifiers, continental championships) | 30 |
| Friendly | 20 |

Higher K means a single result has more impact. World Cup results matter most because the teams are maximally motivated.

### Home advantage

For non-neutral venues, the home team gets a 100-point Elo bonus before computing expected win probability. This is subtracted back out after the match so the stored rating is always venue-neutral.

### Expected score formula

```
E_home = 1 / (1 + 10^((R_away - R_home_effective) / 400))

where R_home_effective = R_home + 100   (non-neutral)
                       = R_home         (neutral venue)
```

This is the standard Elo formula. A 400-point gap gives the stronger team roughly a 91% win probability.

### Margin-of-victory multiplier (FiveThirtyEight formula)

A 3-0 win should shift ratings more than a 1-0 win. But a strong team crushing a weak one should not get the same boost as an equal team crushing an equal one. The multiplier handles both:

```
MoV = log(|goal_diff| + 1) * (2.2 / (elo_advantage * 0.001 + 2.2))
```

The logarithm captures diminishing returns (5-0 is not five times more informative than 1-0). The denominator term reduces the multiplier when the stronger team wins by a large margin, because that was the expected outcome.

### Rating update

```
delta = K * MoV * (actual_score - expected_score)
R_home_new = R_home + delta
R_away_new = R_away - delta
```

`actual_score` is 1.0 for a home win, 0.5 for a draw, 0.0 for a home loss.

### Storage

After processing all historical matches and all completed WC 2026 matches, ratings for all 48 WC teams are written to `team_ratings` (append-only) with `rating_type = 'elo'`. The match detail page fetches the rating dated before each match's kickoff via a correlated subquery.

---

## 3. Bayesian hierarchical goals model (v2)

**File:** `python/footy/models/goals.py`

**Version:** `bayesian_goals_v2`

This is the heart of the system. It predicts how many goals each team will score in a match.

### Why a Bayesian model?

A Bayesian approach gives us a full posterior distribution over team strengths, not just point estimates. That means every match prediction carries calibrated uncertainty: when we say there is a 35% chance of an upset, we mean the entire posterior distribution supports that probability, not just the most likely parameters.

It also handles small sample sizes gracefully. Cape Verde has played fewer international matches against WC-level opponents than Germany has. Partial pooling (see section 3.4) prevents Cape Verde's rating from being wildly overfit to those few matches.

### 3.1 Model formula

The model treats goals as Poisson-distributed. Poisson is the natural distribution for count data with a known rate and no upper bound, and it has been standard in football modeling since Maher (1982).

```
log(lambda_home) = mu + att[home] - def[away] + home_adv * (1 - neutral)
                     + rest_coef * home_rest_scaled

log(lambda_away) = mu + att[away] - def[home]
                     + rest_coef * away_rest_scaled

home_goals ~ Poisson(lambda_home)
away_goals ~ Poisson(lambda_away)
```

Lambda is the expected goals rate for each team. Taking its log makes the formula additive: attack and defence effects combine multiplicatively on the original scale, which is the right structure (a strong defence reduces any attack by a percentage, not by a fixed number of goals).

### 3.2 Parameters and priors

**mu (global average log-rate)**
Prior: `Normal(0.3, 0.2)`
The mean log goals rate. exp(0.3) ≈ 1.35 goals per team per match, which is roughly the historical average. The standard deviation of 0.2 allows the posterior to move by roughly 20% in either direction.

**home_adv (home advantage in log-goals)**
Prior: `Normal(0.2, 0.1)`
In log-goal space, 0.2 corresponds to roughly a 22% boost in expected goals for the home team. World Cup matches are played at neutral venues (all marked `neutral=True`) so this parameter has zero weight in every WC 2026 prediction. It exists because the training data includes non-neutral historical matches, and excluding home advantage entirely would contaminate those training rows.

**att[team] (attack strength, log-scale, sum-to-zero)**
Each team has one attack parameter. A value of +0.3 means a team scores about 35% more goals than the average team against average defence. The sum-to-zero constraint removes the identifiability problem that would otherwise arise because you can add a constant to all attacks and subtract it from mu without changing the likelihood.

**def_strength[team] (defensive strength, log-scale, sum-to-zero)**
Each team has one defence parameter. Positive = weaker defence (concedes more), negative = stronger defence. A value of -0.3 means a team concedes about 26% fewer goals than average against an average attack.

**rest_coef (rest-days effect per 4-day unit)**
Prior: `Normal(0.0, 0.1)`
Captures the effect of rest on attacking output. The prior is centred at zero (no assumed direction) with width 0.1, meaning the prior allows effects up to roughly ±10% per 4 days of rest differential. The posterior tells us what the data supports.

### 3.3 Rest days feature

Rest is measured as calendar days between a team's previous match and the current kickoff.

```
home_rest_scaled = (clamp(rest_days, 0, 14) - 4.0) / 4.0
```

The scaling makes the feature centred: 4 days rest maps to 0.0, 8 days to +1.0, 0 days to -1.0. The cap at 14 days reflects diminishing returns; beyond two weeks, additional rest has negligible impact on physical preparation.

Default rest is 7.0 days (neutral) for a team's first match in the tournament when no prior WC match exists.

### 3.4 Partial pooling via confederation hyperpriors

Teams within the same confederation share hyperpriors. Concretely:

```
att[team] ~ Normal(mu_att_c[conf], sigma_att_c[conf])
def[team] ~ Normal(mu_def_c[conf], sigma_def_c[conf])
```

where `conf` is the team's confederation (UEFA, CONMEBOL, CAF, AFC, CONCACAF, OFC).

This means a team with sparse match history (few games against WC-level opponents) "borrows" strength estimates from its confederation peers. Cape Verde gets pulled toward the CAF average; Iceland gets pulled toward the UEFA average. Teams with rich histories (Germany, Brazil) are pulled very weakly by the hyperprior because the data dominates.

### 3.5 Non-centred parameterisation

The attack and defence parameters are defined as:

```
att_z[team]  ~ Normal(0, 1)
att[team]     = mu_att_c[conf] + sigma_att_c[conf] * att_z[team]
```

This is a mathematical reparameterisation that does not change the model; it only changes how the sampler traverses the parameter space. In the standard (centred) form, the hyperprior mean and team-level parameter are correlated, creating a funnel geometry that NUTS struggles to explore efficiently. The non-centred form decouples them, producing 0 divergences in the v2 fit.

### 3.6 Training weights

Each match contributes to the likelihood with a weight that combines two factors:

```
weight = time_decay * competitive_weight
```

**Time decay:** exponential with a half-life of 730 days (2 years).

```
time_decay = exp(-log(2) * days_ago / 730)
```

A match from 2 years ago counts half as much as a match today. A match from 4 years ago counts a quarter. This allows the model to track how team quality evolves across coaching cycles.

**Competitive weight:**

| Match type | Weight |
|---|---|
| FIFA World Cup | 1.00 |
| Qualifying, continental championships | 0.75 |
| Friendly | 0.30 |

Friendlies are down-weighted because motivation, lineup selection, and tactical approach differ significantly from competitive matches. The 0.30 weight (not zero) retains them as useful evidence for teams with few competitive matches, particularly newly-qualified nations.

The combined weight is applied via `pm.Potential` on the Poisson log-likelihood rather than through explicit likelihood reweighting, which keeps the NUTS step-size calculation correct.

### 3.7 Sampling configuration

```
draws          = 1000 per chain
tuning steps   = 500 per chain
chains         = 2
target_accept  = 0.9   (higher than default 0.8, better for hierarchical geometry)
random_seed    = 42
```

Total posterior samples: 2000 (2 chains × 1000 draws). Predictions sample 2000 of these.

v2 fit result: 0 divergences, all R-hat ≤ 1.05, sampling completed in approximately 13 seconds.

---

## 4. Prediction generation

**File:** `python/footy/models/predict.py`

### From posterior to probabilities

For each upcoming fixture, the prediction process:

1. Retrieves home/away team indices from the metadata.
2. Draws the full posterior for all parameters (chains × draws flattened to 1-D arrays).
3. For each of the 2000 posterior samples, computes lambda_home and lambda_away using the formulas in section 3.1.
4. Draws one Poisson sample from each lambda: these are the simulated goals.
5. Counts outcomes across all 2000 simulations to estimate probabilities.

```python
log_lam_h = mu[s] + att[s,home] - def[s,away] + home_adv[s] * (1-neutral)
              + rest_coef[s] * home_rest_scaled

log_lam_a = mu[s] + att[s,away] - def[s,home]
              + rest_coef[s] * away_rest_scaled

lam_h = exp(log_lam_h)
lam_a = exp(log_lam_a)

hg[s] ~ Poisson(lam_h[s])      # simulated home goals
ag[s] ~ Poisson(lam_a[s])      # simulated away goals
```

### Outputs per fixture

| Field | Formula |
|---|---|
| `home_win_prob` | fraction of simulations where hg > ag |
| `draw_prob` | fraction where hg == ag |
| `away_win_prob` | fraction where ag > hg |
| `home_xg` | mean of lam_h across all samples |
| `away_xg` | mean of lam_a across all samples |
| `over_1_5` | fraction where hg + ag > 1.5 |
| `over_2_5` | fraction where hg + ag > 2.5 |
| `over_3_5` | fraction where hg + ag > 3.5 |
| `btts` | fraction where hg > 0 AND ag > 0 |
| `scoreline_probs` | grid of (hg, ag) counts / 2000, capped at 7 goals each |

The three win/draw/loss probabilities always sum to exactly 1.0 because every simulation produces one of the three outcomes.

### Rest days in predictions

For each upcoming fixture, rest days are computed the same way as in training: calendar days since the team's most recent completed WC 2026 match. Teams that have not yet played default to 7.0 days.

---

## 5. Anytime scorer model

**File:** `python/footy/models/scorer.py`

### Motivation

The Bayesian model predicts how many goals a team will score. The scorer model answers a different question: given that France will score approximately 1.8 goals, what is the probability that a specific player (Mbappé, Dembélé, Giroud) gets on the scoresheet?

### Player quality signal: club xG per 90

The model uses each player's 2025/26 club season non-penalty expected goals per 90 minutes (`npxG/90`) as the quality signal. This is preferred over actual goals because:

- xG is less noisy than goals over a half-season (luck in front of goal averages out over multiple seasons but not over 20-30 matches).
- Non-penalty xG removes the noise from penalty allocation, which is a team-level factor, not individual shooting quality.
- Club form is more predictive than national team form because clubs play more frequently with the same system.

Players are filtered to those who appeared in at least 2 full 90-minute equivalents in the 2025/26 season. This excludes squad fillers who would have near-zero xG anyway but avoids dividing by near-zero 90s.

### Computing the scorer probability

For one team in one match:

**Step 1: get each player's xG share of their national team**

```
player_share = player_xg_per90 / sum(xg_per90 for all outfield players)
```

Goalkeepers are excluded from the denominator. The shares sum to 1.0 across all outfield players.

**Step 2: scale by the team's match xG**

```
player_lambda = team_xg * player_share
```

`team_xg` is the posterior mean expected goals from the Bayesian model. If France have `home_xg = 1.8` and Mbappé's club xG/90 represents 38% of the French outfield total, then `player_lambda = 1.8 * 0.38 = 0.684`.

**Step 3: convert to probability via the Poisson CDF**

Goals scored by one player in one match follow a Poisson distribution (approximately) with rate `player_lambda`. The probability of scoring at least once is:

```
P(score >= 1) = 1 - P(score = 0) = 1 - exp(-player_lambda)
```

Continuing the example: `P = 1 - exp(-0.684) = 1 - 0.505 = 49.5%`.

### Travel distance adjustment

The team xG from the Bayesian model is adjusted for travel fatigue before distributing to players.

```
excess_km   = max(distance_km - 500, 0)
penalty     = 0.025 * (excess_km / 1000)
travel_factor = max(1.0 - penalty, 0.70)
adjusted_team_xg = team_xg * travel_factor
```

The 500 km threshold ignores local moves within the same region. The 2.5% reduction per 1 000 km above the threshold comes from sports-science literature on air-travel fatigue in elite athletes. The 30% floor (travel_factor ≥ 0.70) prevents implausible discounts for extreme cases.

This is a prior-based adjustment rather than a fitted coefficient. There are only ~25 completed WC 2026 fixtures with venue data, far too few to reliably estimate a travel effect against the variation in team quality.

The distance between venues is computed using the Haversine formula (great-circle distance on a spherical Earth; error less than 0.5% for distances up to 20 000 km).

### Venue data

WC 2026 host venue coordinates are stored in `footy/models/venues.py`:

| Venue | City | Lat | Lon |
|---|---|---|---|
| AT&T Stadium | Arlington (Dallas) | 32.748 | -97.093 |
| Hard Rock Stadium | Miami Gardens | 25.958 | -80.239 |
| MetLife Stadium | East Rutherford (New York) | 40.814 | -74.074 |
| Lincoln Financial Field | Philadelphia | 39.901 | -75.168 |
| Levi's Stadium | Santa Clara (San Francisco) | 37.403 | -121.970 |
| Gillette Stadium | Foxborough (Boston) | 42.091 | -71.264 |
| Arrowhead Stadium | Kansas City | 39.049 | -94.484 |
| Rose Bowl | Pasadena (Los Angeles) | 34.161 | -118.168 |
| NRG Stadium | Houston | 29.685 | -95.411 |
| SoFi Stadium | Inglewood (Los Angeles) | 33.953 | -118.340 |
| Lumen Field | Seattle | 47.595 | -122.332 |
| Mercedes-Benz Stadium | Atlanta | 33.755 | -84.401 |
| BC Place | Vancouver | 49.276 | -123.112 |
| BMO Field | Toronto | 43.633 | -79.419 |
| Estadio Akron | Guadalajara | 20.752 | -103.450 |
| Estadio Azteca | Mexico City | 19.303 | -99.151 |
| Estadio BBVA | Monterrey | 25.670 | -100.246 |

---

## 6. What gets stored and where

| Table | Contents | Written by |
|---|---|---|
| `historical_matches` | Kaggle CSV match results (raw team names, 2002+) | `footy/ingest/historical.py` |
| `fixtures` | WC 2026 schedule with venue, kickoff, stage | `footy/ingest/wc2026.py` + ESPN ingest |
| `match_results` | Final scores for completed WC 2026 matches | `footy/ingest/wc2026.py` |
| `team_ratings` | Elo snapshots per team per date (append-only) | `footy/ratings/elo.py` |
| `team_model_params` | Posterior mean att and def per team per version | `footy/models/goals.py` |
| `model_globals` | Posterior mean mu and home_adv per version | `footy/models/goals.py` |
| `match_predictions` | Per-fixture probabilities and xG from Bayesian model | `footy/models/predict.py` |
| `scoreline_probabilities` | Per-scoreline probabilities (up to 7-7) | `footy/models/predict.py` |
| `player_goal_predictions` | Anytime scorer probs, top 8 per team per fixture | `footy/models/scorer.py` |
| `player_match_stats` | Goals, assists, cards per player per completed match | `footy/ingest/espn.py` |
| `match_statistics` | Team-level stats (shots, possession, etc.) | `footy/ingest/espn.py` |
| `match_events` | Goals, cards, subs (minute-level) | `footy/ingest/espn.py` |

---

## 7. Running the pipeline

```bash
# From the python/ directory

# Step 1: ingest latest WC 2026 results
uv run python -m footy.ingest.wc2026

# Step 2: update Elo ratings
uv run python -m footy.ratings.elo

# Step 3: retrain model + generate predictions + update scorer probabilities
uv run python -m footy.models.goals
uv run python -m footy.models.predict

# Step 4: ingest post-match player stats for completed matches
uv run python -m footy.ingest.espn
```

Steps 3-4 can be run after every match day. `footy.models.predict` automatically calls the scorer model at the end, so no separate scorer run is needed.

---

## 8. What the model does not know

Understanding the limits is as important as understanding the mechanics.

**Injuries and suspensions.** A key player being ruled out the day before a match is not in the training data. The model does not read injury reports. If Mbappé is unavailable, his scorer probability should be ignored; the match-level xG will also be slightly optimistic for France.

**Tactical setup.** A team that switches to a defensive low-block for a must-win match will concede fewer goals than the model expects. Squad rotations for the third group game are not modelled.

**Live in-game conditions.** The model generates pre-match predictions only. It does not update during the match.

**Sparse nations.** Teams that qualified via regional playoffs with little recent history against WC-level opponents (some CONCACAF, OFC, and AFC sides) have wide posterior distributions. Their win probabilities carry more uncertainty than implied by a single number.

**Player club stats recency.** The club xG data is from the 2025/26 season, which ended before the tournament. It does not capture injuries sustained during the season, form peaks and troughs mid-season, or players who might have breakout tournament performances.

---

*Last updated: 2026-06-19. See `docs/build-log.md` for a dated history of model changes.*
