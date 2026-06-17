# ADR-004: Elo Rating System Design

**Date:** 2026-06-17
**Status:** Accepted

## Context

The model needs a team-strength signal that is available before every historical match (for training) and before every WC 2026 match (for prediction). The signal must be point-in-time correct: the rating used to predict a match on date D must reflect only results before D.

## Decision

Implement a sequential Elo system with three modifications over vanilla Elo:

**K-factor tiering.** WC final tournament matches use K=40, other competitive internationals K=30, friendlies K=20. This reflects that WC results carry the most signal about true team strength, qualifying matches carry moderate signal, and friendlies are often used for squad rotation and carry less.

**Margin-of-victory multiplier (FiveThirtyEight formula).** `MoV = ln(|goal_diff| + 1) * (2.2 / (winner_elo_advantage * 0.001 + 2.2))`. A 3-0 win updates ratings more than a 1-0 win. The second term is an autocorrelation correction: it reduces the multiplier when the stronger team wins by a lot, since that outcome was already expected. Without the correction, blowouts would cause ratings to overreact and diverge.

**Home advantage: +100 points.** Added to the home team's effective rating when computing expected score for non-neutral venues. Applied to historical qualifying and friendly matches only. Skipped for neutral venues (the WC is hosted at neutral venues for all non-host nations).

**Name normalisation.** WC 2026 qualifiers are keyed by FIFA code in the ratings dict, so spelling variants ("Czech Republic", "Czechia") share a single entry. Non-qualifiers and unknown teams use their raw name. This means the 48 WC teams are correctly identified when writing current ratings to `team_ratings`.

## Alternatives considered

**Dixon-Coles / Poisson model as the rating baseline.** The PRD designates Dixon-Coles as a sanity check, not the primary model. Elo is simpler to implement, has no parameter fitting, and is robust to the sparse international data problem (some WC teams play relatively few competitive matches).

**FIFA Points ranking.** Rejected: opaque methodology, inconsistently updated, and does not produce a numerical strength estimate that can be used directly as a model feature.

**Club-form weighted Elo.** Considered incorporating club xG into the Elo updates. Deferred: requires the xG data source decision (still open), and international-to-club transfer is a first-class modeling problem (Section 6, PRD).

## Consequences

The Elo module produces 48 ratings written to `team_ratings` after every run. The `team_ratings` table is append-only; each run adds a new dated snapshot. The goals model queries it with `WHERE team_id = $1 AND as_of < $kickoff ORDER BY as_of DESC LIMIT 1` to get the correct pre-match rating.

The scheduled ingestion task (every 30 min) updates WC 2026 results. The Elo script should be added to the same schedule (or triggered after each ingestion run) so ratings stay current. This is a follow-on task.

Initial ratings start at 1500. With 24 years of data (2002 to 2026), most active nations have 200+ matches processed before the WC starts, giving ratings time to converge from the 1500 prior.
