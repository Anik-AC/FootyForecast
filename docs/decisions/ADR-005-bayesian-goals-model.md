# ADR-005: Bayesian hierarchical goals model design

**Date:** 2026-06-17
**Status:** Accepted

## Context

The PRD calls for a calibrated probabilistic model that outputs a full posterior
distribution over scorelines, not just point estimates. The model must handle 48
teams with very different amounts of data (strong European nations have 800+
matches in the training window; Curaçao, Uzbekistan, and Haiti have fewer than
30). It must also use only pre-match information (point-in-time correctness).

## Decision

Use a Bayesian hierarchical Poisson goals model implemented in PyMC, with the
following design choices.

### Log-linear Poisson likelihood

Goals for each team in a match are drawn from independent Poisson distributions
whose log-rate is a linear function of team attack and defence strengths plus a
home advantage term:

    log(λ_home) = μ + att[home] - def[away] + home_adv * (1 - neutral)
    log(λ_away) = μ + att[away] - def[home]

This is the standard Dixon-Coles formulation minus the low-score correlation
correction (deferred: the correction is small in practice and adds complexity).

### Partial pooling via confederation hyperpriors

Rather than estimating each team independently (no pooling) or treating all
teams as exchangeable (complete pooling), attack and defence parameters are
drawn from confederation-level hyperpriors:

    att[i] ~ Normal(μ_att_conf[i], σ_att_conf[i])

This lets Curaçao borrow from CONCACAF's average rather than relying on 20
matches, while still allowing it to diverge if the evidence warrants it.

### Non-centred parameterisation

The hierarchical model is parameterised in non-centred form to avoid the funnel
geometry that causes divergences in centred hierarchical models:

    att_z ~ Normal(0, 1)
    att   = μ_att_conf + σ_att_conf * att_z

Both forms are mathematically equivalent but the non-centred form lets NUTS
explore the posterior efficiently when σ is small (sparse data teams).

### Sum-to-zero constraint

Attack and defence parameters have a sum-to-zero constraint applied after the
hierarchical expansion. This removes the identifiability problem: without it,
the model can trade off the intercept μ against mean attack strength without
bound. Implemented as `att = att_raw - mean(att_raw)` using PyTensor ops.

### Time-decay weighting via pm.Potential

Matches are weighted by an exponential decay with a 2-year half-life (730 days)
per the PRD. Because PyMC's Poisson distribution does not accept observation
weights, the weighted log-likelihood is added to the log-posterior manually via
`pm.Potential`. This is equivalent to a pseudo-likelihood with down-weighted
older observations.

### Training window

Matches from 2018-01-01 onward, restricted to games where both teams are WC
2026 qualifiers. Older matches are processed by the EloRater (for correctness)
but not included as training rows. Rationale: pre-2018 team compositions and
playing styles are substantially different, adding more noise than signal.

## Alternatives considered

**Gradient boosting (LightGBM) only:** Fast, no convergence concerns, and
handles non-linearities well. Rejected as primary model because it outputs a
point prediction, not a posterior distribution, making it harder to produce
calibrated scoreline probabilities. Gradient boosting is retained as a secondary
signal for ensemble use (PRD milestone 4).

**Dixon-Coles low-score correction:** Adjusts joint probabilities for 0-0, 1-0,
0-1, 1-1 outcomes. Adds a correlation parameter ρ that complicates MCMC.
Deferred: the correction is typically small (<2 pp on most scorelines) and this
tournament is early-stage. Can be added before the knockout rounds if calibration
analysis suggests it helps.

**Flat priors per team (no pooling):** Each team gets an independent
Normal(0, 1) prior. Works poorly for teams with few matches; the posterior for
Curaçao spans the full prior range, producing near-uniform predictions. Rejected.

**Single-level pooling (all teams exchangeable):** Loses the confederation
signal entirely. A CONCACAF team and a UEFA team with the same number of matches
should not share the same prior, because the base level of competition differs.
Rejected.

## Consequences

The model takes 9 seconds for a 200-draw quick run and approximately 5-10
minutes for the full 1000-draw/4-chain production run on CPU. This is acceptable
for a batch job that runs after each match day.

Convergence diagnostics (R-hat, ESS) should be checked after every production
run. PyMC will warn if R-hat > 1.01; our code treats R-hat > 1.05 as a
blocking warning. The 200-draw smoke-test is not sufficient for production; the
full run should always be used before generating predictions for the knockout
rounds.

The ArviZ 1.x (xarray DataTree) API is used throughout. The trace is saved as
NetCDF4 via `trace.to_netcdf()` and loaded via `az.from_netcdf()`. The
`netCDF4` Python package is a hard dependency.
