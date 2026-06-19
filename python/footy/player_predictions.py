"""
Player anytime-scorer probability generator.

For each upcoming WC 2026 fixture that has a model prediction with xG data,
this module computes the probability each known scorer in the tournament will
score at least once in the match.

Model
-----
Given team expected goals (home_xg or away_xg) from match_predictions and
each player's tournament goal tally from player_tournament_stats:

    player_share = player_goals / team_total_goals_in_tournament
    P(anytime scorer) = 1 - exp(-team_xg * player_share)

This is a Poisson model: if the team is expected to score `xg` goals in a
match, and this player historically accounts for `share` of team goals, their
expected personal goals are `xg * share`, and the probability of scoring at
least one follows from the Poisson CDF.

Limitations (documented in PRD Track B):
- Only players who have already scored in WC 2026 appear. Players without goals
  are excluded because we have no basis to rank them without lineup/xG data.
- No lineup conditioning: if a key player is rested or injured the prediction
  will not reflect that. This improves once lineup data is available.

Usage (from python/ directory):
    uv run python -m footy.player_predictions
    uv run python -m footy.player_predictions WC2026-GRP-537329
"""

from __future__ import annotations

import datetime
import logging
import math
import sys

import psycopg
import psycopg.rows

logger = logging.getLogger(__name__)

# Only include players with at least this many tournament goals.
_MIN_GOALS = 1

# Skip fixtures where the model has no xG data (xg is None or very small).
_MIN_XG = 0.01

# Maximum players shown per team (sorted descending by probability).
_MAX_PLAYERS_PER_TEAM = 10


def _load_team_stats(
    team_id: str,
    conn: psycopg.Connection,
) -> tuple[list[dict], int]:
    """
    Return (player_rows, team_total_goals) for team_id in WC 2026.

    player_rows are sorted by goals DESC. team_total_goals is the sum of all
    goals scored by players in player_tournament_stats for this team — this
    represents all goals we know about from the scorers endpoint.
    """
    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute("""
            SELECT player_name, goals
            FROM player_tournament_stats
            WHERE tournament_id = 'WC2026'
              AND team_id = %s
              AND goals >= %s
            ORDER BY goals DESC
        """, (team_id, _MIN_GOALS))
        players = cur.fetchall()

    team_total = sum(p["goals"] for p in players)
    return list(players), team_total


def compute_team_probabilities(
    players: list[dict],
    team_total_goals: int,
    team_xg: float,
) -> list[dict]:
    """
    Compute anytime-scorer probabilities for one team's players.

    Pure function — no DB access. Exposed for testing.

    Returns a list of dicts with keys: player_name, goals, anytime_scorer_prob.
    Sorted by probability descending.
    """
    if team_total_goals == 0 or team_xg < _MIN_XG:
        return []

    results = []
    for p in players:
        share = p["goals"] / team_total_goals
        prob = 1.0 - math.exp(-team_xg * share)
        results.append({
            "player_name": p["player_name"],
            "goals": p["goals"],
            "anytime_scorer_prob": round(prob, 6),
        })

    results.sort(key=lambda x: x["anytime_scorer_prob"], reverse=True)
    return results[:_MAX_PLAYERS_PER_TEAM]


def generate_predictions(
    fixture_id: str,
    conn: psycopg.Connection,
) -> int:
    """
    Generate and store player scorer predictions for one fixture.

    Loads the fixture's team xG from the latest match_predictions row,
    fetches tournament scoring stats per team, computes probabilities, and
    upserts into player_goal_predictions.

    Returns the number of player prediction rows written (0 if xG data is
    missing or no scorers are found for either team).
    """
    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute("""
            SELECT
                f.home_team_id,
                f.away_team_id,
                mp.home_xg,
                mp.away_xg
            FROM fixtures f
            JOIN match_predictions mp ON mp.fixture_id = f.id
            WHERE f.id = %s
            ORDER BY mp.computed_at DESC
            LIMIT 1
        """, (fixture_id,))
        row = cur.fetchone()

    if row is None:
        logger.warning("No prediction found for fixture %s; skipping", fixture_id)
        return 0

    home_xg = row["home_xg"]
    away_xg = row["away_xg"]

    if home_xg is None or away_xg is None:
        logger.info("xG data missing for %s; skipping player predictions", fixture_id)
        return 0

    count = 0
    for team_id, team_xg in [
        (row["home_team_id"], float(home_xg)),
        (row["away_team_id"], float(away_xg)),
    ]:
        players, team_total = _load_team_stats(team_id, conn)
        predictions = compute_team_probabilities(players, team_total, team_xg)

        for pred in predictions:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO player_goal_predictions
                        (fixture_id, player_name, team_id,
                         anytime_scorer_prob, tournament_goals, method, computed_at)
                    VALUES (%s, %s, %s, %s, %s, 'scoring_share', NOW())
                    ON CONFLICT (fixture_id, player_name, team_id) DO UPDATE
                        SET anytime_scorer_prob = EXCLUDED.anytime_scorer_prob,
                            tournament_goals    = EXCLUDED.tournament_goals,
                            computed_at         = NOW()
                """, (
                    fixture_id,
                    pred["player_name"],
                    team_id,
                    pred["anytime_scorer_prob"],
                    pred["goals"],
                ))
            count += 1

    return count


def generate_all(
    conn: psycopg.Connection,
    fixture_ids: list[str] | None = None,
) -> int:
    """
    Generate player scorer predictions for all upcoming WC 2026 fixtures
    that have xG data in match_predictions.

    Returns the total number of player prediction rows written.
    """
    now = datetime.datetime.now(datetime.timezone.utc)

    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        if fixture_ids:
            cur.execute(
                "SELECT id FROM fixtures WHERE tournament_id = 'WC2026' AND id = ANY(%s)",
                (fixture_ids,),
            )
        else:
            cur.execute("""
                SELECT DISTINCT f.id
                FROM fixtures f
                JOIN match_predictions mp ON mp.fixture_id = f.id
                WHERE f.tournament_id = 'WC2026'
                  AND f.kickoff_utc > %s
                  AND mp.home_xg IS NOT NULL
                  AND mp.away_xg IS NOT NULL
                ORDER BY f.id
            """, (now,))
        ids = [r["id"] for r in cur.fetchall()]

    total = 0
    for fid in ids:
        try:
            n = generate_predictions(fid, conn)
            if n:
                logger.info("Generated %d player predictions for %s", n, fid)
            total += n
        except Exception:
            logger.exception("Failed player predictions for %s", fid)
            conn.rollback()

    conn.commit()
    return total


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate player anytime-scorer predictions for WC 2026."
    )
    parser.add_argument("fixture_ids", nargs="*", help="Specific fixture IDs (optional).")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from dotenv import load_dotenv
    load_dotenv()

    from footy.db import get_conn
    with get_conn() as conn:
        n = generate_all(conn, fixture_ids=args.fixture_ids or None)

    print(f"Generated {n} player scorer prediction(s).")
    sys.exit(0)


if __name__ == "__main__":
    main()
