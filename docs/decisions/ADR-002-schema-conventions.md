# ADR-002: Temporal append-only ratings and denormalized kickoff timestamps

**Date:** 2026-06-16
**Status:** accepted

## Context

Two schema-level decisions needed to be made to enforce the point-in-time correctness guardrail from CLAUDE.md at the database level rather than relying on application code alone.

**Decision 1: How to store team ratings over time.**

Two options:

- Snapshot table: one row per team, updated in place as new ratings are computed. Simple to query (just `WHERE team_id = $1`), but makes it impossible to ask "what was this team's rating before match X?" without additional audit logging.
- Temporal (append-only) table: one row per team per rating update, never updated. The `as_of` column records which match triggered the update. The query `WHERE team_id = $1 AND as_of < $kickoff ORDER BY as_of DESC LIMIT 1` returns exactly the rating that was available before the match. A backtest can reproduce the exact feature state for any historical match.

The snapshot approach violates the point-in-time correctness requirement because it discards the history needed to prove a backtest used only pre-kickoff information.

**Decision 2: How to enforce `model_as_of < kickoff_utc` on `match_predictions`.**

A Postgres `CHECK` constraint cannot reference another table. The natural check would be `model_as_of < (SELECT kickoff_utc FROM fixtures WHERE id = fixture_id)`, but this is not valid in a column constraint. Two options:

- Trigger: enforce the constraint via a `BEFORE INSERT OR UPDATE` trigger that queries `fixtures`. Works, but adds operational complexity and is invisible to tools that only read table definitions.
- Denormalization: copy `kickoff_utc` from `fixtures` into `match_predictions`. Allows a plain `CHECK (model_as_of < kickoff_utc)`. `kickoff_utc` is immutable once a fixture is scheduled, so there are no update anomalies. The denormalization is explicit and visible in the schema.

The same pattern applies to `user_predictions.submitted_at < kickoff_utc`.

## Decision

Use temporal (append-only) tables for `team_ratings`. Never update existing rows; only insert.

Denormalize `kickoff_utc` into `match_predictions` and `user_predictions` to enable a plain `CHECK` constraint without a trigger. The application layer (Python ingestion job) is responsible for populating `kickoff_utc` from `fixtures.kickoff_utc` when writing predictions.

## Consequences

Temporal ratings: the `team_ratings` table will grow with every model update. For a 48-team tournament with Elo recomputed after each of 104 matches, this is at most 48 * 104 = 4,992 rows total, well within any practical storage limit. No archiving strategy is needed for v1.

Denormalized kickoff: if a fixture's kickoff time is rescheduled (rare but possible), the `kickoff_utc` in `match_predictions` becomes stale. The ingestion job must update both `fixtures.kickoff_utc` and `match_predictions.kickoff_utc` in a single transaction when a reschedule is detected.
