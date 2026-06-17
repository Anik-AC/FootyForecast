# ADR-006: Go Monte Carlo tournament simulator

**Date:** 2026-06-17
**Status:** Accepted

## Context

PRD milestone 4 requires a simulator that takes posterior model parameters and runs
100,000+ full WC 2026 tournament simulations to produce stage-advancement probabilities.
The key constraints are speed (100k sims in under a few seconds on a laptop), correctness
(WC 2026 tiebreaker chain must be exact), and isolation (simulator must not import any
Python; it reads from the DB and writes to the DB).

## Decisions

**One goroutine per CPU core, not per simulation.** Spawning 100,000 goroutines would
add scheduler overhead and GC pressure that outweighs the parallelism benefit.
Each worker goroutine owns its own `rand.Rand` seeded from a different constant; no
shared mutable state, no mutexes needed. The results channel is buffered to N so no
worker ever blocks on the write side.

**Knuth's Poisson sampler.** The sequential multiply-until-below-e^{-lambda} algorithm
is exact for all lambda values and simpler than rejection-sampling or PTRS. Knuth
becomes slow for lambda > 30, but WC match lambdas are typically 0.8-2.5 goals per
team, so the expected loop count is 2-3 iterations per call. Acceptable.

**50/50 coin for drawn knockout matches.** A real ET + penalties model would need
team-specific penalty conversion rates and shootout data that is not yet in the DB.
The 50/50 approximation is consistent with how prediction markets price tournament
outrights (they also treat penalties as a coin flip for most teams). This will be
revisited once shootout data is available.

**Cumulative stage probabilities in `simulation_results`.** We store P(reach stage or
further), not P(reach exactly this stage). This is what prediction markets quote,
what the frontend will display, and what makes the monotone CHECK constraint in the
schema meaningful. The alternative (storing exact-stage counts) would require
post-processing on every API read.

**Best-thirds bracket seeding: randomized in v1.** The exact FIFA seeding matrix
for best-thirds slots depends on which groups they came from (a 12x8 lookup table).
Randomizing gives correct expected tournament probabilities but does not capture
path-specific effects (e.g., a third-placed team from group A always faces the
group B winner). This is documented as a follow-on.

**pgx simple protocol for Supabase.** Supabase uses pgbouncer in transaction mode,
which does not support server-side prepared statements. Setting
`DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol` makes the DB layer
compatible without any special logic in query code.

## Alternatives considered

**Python simulator:** Would share the PyMC environment and make parameter access
trivial, but NumPy's random sampling has higher per-call overhead than Go's
`rand.Float64()` for this kind of tight loop. Go is 3-5x faster for pure simulation
loops, which matters when the target is 100k+ full tournaments.

**Pre-computing all xg before simulation:** Loading all 90 group fixtures' xg values
upfront simplifies the hot path. We do this (LoadGroups fetches match_predictions)
but fall back to on-the-fly lambda computation when no prediction exists (pre-tournament
or knockout TBD matches). The fallback is not slower in practice.

## Consequences

The Go simulator is a pure-compute layer with no business logic: it receives a
`TournamentState` struct and returns a probability map. The DB client is tested
implicitly (queries must match the schema). The tiebreaker logic has 13 unit tests
covering all tiebreaker levels and the edge case of a three-way circular H2H tie.
