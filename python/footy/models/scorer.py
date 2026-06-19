"""
Anytime scorer probability model.

Distributes each team's expected goals (from the Bayesian goals model) across
individual players according to their club-season xG share from the 2025/26
FBref dataset.

Formula:
    player_lambda  = team_xg * (player_xg_per90 / team_total_xg_per90)
    P(anytime)     = 1 - exp(-player_lambda)

Travel adjustment (optional): if the team travelled > TRAVEL_THRESHOLD_KM from
their previous WC 2026 venue, team_xg is discounted by TRAVEL_PENALTY_PER_1000KM
per 1 000 km of extra travel. This uses a fixed prior rather than a fitted
coefficient because we only have 25 training observations with venue data.

Usage (from python/ directory):
    uv run python -m footy.models.scorer
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import psycopg
from dotenv import load_dotenv

from footy.ingest.club_stats import load_club_xg
from footy.models.venues import geodesic_km

logger = logging.getLogger(__name__)

# Number of top scorers shown per team in the frontend
_TOP_N = 8

# Travel: reduce team xG by this fraction per 1 000 km above the threshold.
# Prior from sports-science literature (roughly 2-4% per 1000 km for air travel
# fatigue in elite athletes). We use 2.5% as a conservative estimate since
# WC squads have professional logistics.
TRAVEL_PENALTY_PER_1000KM = 0.025
TRAVEL_THRESHOLD_KM = 500.0  # ignore travel below this (local moves, same city)

# Method tag written to player_goal_predictions.method
_METHOD = "club_xg_25_26"


# ---------------------------------------------------------------------------
# Travel distance helpers
# ---------------------------------------------------------------------------

def _team_last_venue(conn: psycopg.Connection) -> dict[str, str]:
    """
    Return the most recent WC 2026 venue per team from completed fixtures.
    Only includes fixtures where venue is populated.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (team_id)
                team_id, venue, kickoff_utc
            FROM (
                SELECT home_team_id AS team_id, venue, kickoff_utc
                FROM fixtures
                WHERE tournament_id = 'WC2026' AND venue IS NOT NULL
                UNION ALL
                SELECT away_team_id AS team_id, venue, kickoff_utc
                FROM fixtures
                WHERE tournament_id = 'WC2026' AND venue IS NOT NULL
            ) sub
            JOIN match_results r ON r.fixture_id = (
                SELECT id FROM fixtures
                WHERE kickoff_utc = sub.kickoff_utc
                LIMIT 1
            )
            ORDER BY team_id, kickoff_utc DESC
            """
        )
        return {row[0]: row[1] for row in cur.fetchall()}


def _travel_xg_factor(
    last_venue: str | None,
    next_venue: str | None,
) -> float:
    """
    Return the multiplicative xG factor for travel fatigue (0 < factor <= 1.0).
    1.0 = no adjustment (same venue or unknown venues).
    """
    if last_venue is None or next_venue is None:
        return 1.0
    if last_venue == next_venue:
        return 1.0
    km = geodesic_km(last_venue, next_venue)
    if km is None or km < TRAVEL_THRESHOLD_KM:
        return 1.0
    excess_km = km - TRAVEL_THRESHOLD_KM
    penalty = TRAVEL_PENALTY_PER_1000KM * (excess_km / 1000.0)
    return max(1.0 - penalty, 0.70)  # never reduce by more than 30%


# ---------------------------------------------------------------------------
# Tournament goal tallies (for display)
# ---------------------------------------------------------------------------

def _tournament_goals(conn: psycopg.Connection, team_id: str) -> dict[str, int]:
    """WC 2026 goals per player for a team, from player_match_stats."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT pms.player_name, COALESCE(SUM(pms.goals), 0)
            FROM player_match_stats pms
            JOIN fixtures f ON f.id = pms.fixture_id
            WHERE f.tournament_id = 'WC2026'
              AND pms.goals > 0
              AND (
                  (pms.is_home  AND f.home_team_id = %s)
                  OR (NOT pms.is_home AND f.away_team_id = %s)
              )
            GROUP BY pms.player_name
            ORDER BY SUM(pms.goals) DESC
            """,
            (team_id, team_id),
        )
        return {row[0]: int(row[1]) for row in cur.fetchall()}


# ---------------------------------------------------------------------------
# Per-team probability computation
# ---------------------------------------------------------------------------

def _team_probs(
    team_id: str,
    team_xg: float,
    club_df: pd.DataFrame,
) -> list[dict]:
    """
    Compute anytime-scorer probabilities for players of one national team.

    Returns a list of dicts with keys: player_name, prob, xg_per90, pos_group.
    Sorted by prob descending; limited to _TOP_N entries.
    """
    players = club_df[club_df["nation_code"] == team_id].copy()
    if players.empty:
        return []

    # Use non-GK players only for probability distribution
    # (keepers essentially never score)
    outfield = players[players["pos_group"] != "GK"]
    if outfield.empty:
        outfield = players

    total_xg_per90 = outfield["xg_per90"].sum()
    if total_xg_per90 <= 0:
        # Fall back to goal share when xG is zero for everyone
        total_goals = outfield["goals"].sum()
        if total_goals <= 0:
            return []
        outfield = outfield.copy()
        outfield["share"] = outfield["goals"] / total_goals
    else:
        outfield = outfield.copy()
        outfield["share"] = outfield["xg_per90"] / total_xg_per90

    outfield["player_lambda"] = team_xg * outfield["share"]
    outfield["prob"] = 1.0 - np.exp(-outfield["player_lambda"])

    top = outfield.nlargest(_TOP_N, "prob")
    return top[["player_name", "prob", "xg_per90", "pos_group"]].to_dict("records")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def compute_all_scorer_predictions(conn: psycopg.Connection) -> int:
    """
    Compute anytime-scorer predictions for all upcoming WC 2026 fixtures.

    For each fixture:
    1. Reads team xG from the latest match_predictions row.
    2. Applies a travel-distance penalty if venue data is available.
    3. Distributes team xG across players using their 2025/26 club xG share.
    4. Upserts top _TOP_N per team into player_goal_predictions.

    Returns the number of fixtures processed.
    """
    club_df = load_club_xg()
    logger.info(
        "Club stats loaded: %d players, %d WC nations",
        len(club_df), club_df["nation_code"].nunique(),
    )

    # Upcoming fixtures with Bayesian xG predictions
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                f.id, f.home_team_id, f.away_team_id,
                f.venue,
                mp.home_xg, mp.away_xg
            FROM fixtures f
            JOIN LATERAL (
                SELECT home_xg, away_xg
                FROM match_predictions
                WHERE fixture_id = f.id
                ORDER BY computed_at DESC
                LIMIT 1
            ) mp ON TRUE
            LEFT JOIN match_results mr ON mr.fixture_id = f.id
            WHERE f.tournament_id = 'WC2026'
              AND mr.fixture_id IS NULL
              AND f.home_team_id IS NOT NULL
              AND f.away_team_id IS NOT NULL
              AND mp.home_xg IS NOT NULL
            ORDER BY f.kickoff_utc ASC
            """
        )
        fixtures = cur.fetchall()

    logger.info("Computing scorer predictions for %d upcoming fixtures", len(fixtures))

    last_venue = _team_last_venue(conn)
    now = datetime.now(tz=timezone.utc)
    n_written = 0

    for fixture_id, home_id, away_id, venue, raw_home_xg, raw_away_xg in fixtures:
        # Travel adjustment per team
        home_factor = _travel_xg_factor(last_venue.get(home_id), venue)
        away_factor = _travel_xg_factor(last_venue.get(away_id), venue)
        home_xg = raw_home_xg * home_factor
        away_xg = raw_away_xg * away_factor

        if home_factor < 1.0 or away_factor < 1.0:
            logger.debug(
                "%s: travel adj home=%.2f away=%.2f",
                fixture_id, home_factor, away_factor,
            )

        # Tournament goals for display
        home_tourn = _tournament_goals(conn, home_id)
        away_tourn = _tournament_goals(conn, away_id)

        home_rows = _team_probs(home_id, home_xg, club_df)
        away_rows = _team_probs(away_id, away_xg, club_df)

        if not home_rows and not away_rows:
            logger.debug("No club xG data for %s vs %s; skipping", home_id, away_id)
            continue

        rows: list[tuple] = []
        for p in home_rows:
            rows.append((
                fixture_id,
                p["player_name"],
                home_id,
                float(p["prob"]),
                home_tourn.get(p["player_name"], 0),
                _METHOD,
                now,
            ))
        for p in away_rows:
            rows.append((
                fixture_id,
                p["player_name"],
                away_id,
                float(p["prob"]),
                away_tourn.get(p["player_name"], 0),
                _METHOD,
                now,
            ))

        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO player_goal_predictions
                    (fixture_id, player_name, team_id, anytime_scorer_prob,
                     tournament_goals, method, computed_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (fixture_id, player_name, team_id) DO UPDATE SET
                    anytime_scorer_prob = EXCLUDED.anytime_scorer_prob,
                    tournament_goals    = EXCLUDED.tournament_goals,
                    method              = EXCLUDED.method,
                    computed_at         = EXCLUDED.computed_at
                """,
                rows,
            )
        conn.commit()
        n_written += 1
        logger.info(
            "%s: %d home players, %d away players  (home_xg=%.2f×%.2f away_xg=%.2f×%.2f)",
            fixture_id,
            len(home_rows), len(away_rows),
            raw_home_xg, home_factor,
            raw_away_xg, away_factor,
        )

    return n_written


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from footy.db import get_conn

    with get_conn() as conn:
        n = compute_all_scorer_predictions(conn)

    print(f"Wrote scorer predictions for {n} upcoming WC 2026 fixtures.")


if __name__ == "__main__":
    main()
