"""
Post-match grading: compute log loss and Brier score for model and market predictions.

Usage (from python/ directory):
    uv run python -m footy.grading

Runs idempotently: matches that already have a grading row are skipped.
"""

from __future__ import annotations

import json
import logging
import math
import sys

import psycopg

logger = logging.getLogger(__name__)

# Clip floor to avoid log(0). Equivalent to ~33.6 bits of loss.
_EPSILON = 1e-15

_OUTCOMES = ("home_win", "draw", "away_win")


# ---------------------------------------------------------------------------
# Core scoring functions (pure, no DB dependency)
# ---------------------------------------------------------------------------

def log_loss(probs: dict[str, float], outcome: str) -> float:
    """
    Multi-class log loss for one match.

    Returns -log(p(actual_outcome)). Clips p at epsilon to prevent -inf.
    Lower is better; perfect = 0; random three-way = log(3) ≈ 1.099.
    """
    p = max(probs[outcome], _EPSILON)
    return -math.log(p)


def brier_score(probs: dict[str, float], outcome: str) -> float:
    """
    Multi-class Brier score for one match.

    Sum of squared differences between predicted and actual one-hot vector.
    Range [0, 2]; perfect = 0; worst = 2; random three-way ≈ 0.667.
    """
    return sum(
        (probs[k] - (1.0 if k == outcome else 0.0)) ** 2
        for k in _OUTCOMES
    )


def devigify(
    home_raw: float,
    draw_raw: float | None,
    away_raw: float,
) -> tuple[float, float | None, float]:
    """
    Normalize raw implied probabilities so the available legs sum to 1.0.

    Prediction markets (Polymarket, Kalshi) already have near-zero vig since
    they are CLOB exchanges, so this is a minor correction. Binary markets
    (draw_raw = None) normalize only the home/away legs; draw_dev stays None.
    """
    if draw_raw is None:
        total = home_raw + away_raw
        if total <= 0:
            raise ValueError(f"Non-positive total probability: {total}")
        return home_raw / total, None, away_raw / total

    total = home_raw + draw_raw + away_raw
    if total <= 0:
        raise ValueError(f"Non-positive total probability: {total}")
    return home_raw / total, draw_raw / total, away_raw / total


def _market_probs(
    home_win_dev: float,
    draw_dev: float | None,
    away_win_dev: float,
    model_draw_prob: float,
) -> dict[str, float]:
    """
    Build a full three-way probability dict from a market snapshot.

    For binary markets (no draw leg), the model draw probability is used and
    the home/away probabilities are rescaled to fill the remaining probability.
    This is an approximation: prediction markets that do not quote draw are
    effectively saying the draw probability is whatever the model says.
    """
    if draw_dev is None:
        remaining = 1.0 - model_draw_prob
        h_plus_a = home_win_dev + away_win_dev
        if h_plus_a <= 0:
            h_plus_a = 1.0  # guard: treat as 50/50 if both are zero
        scale = remaining / h_plus_a
        return {
            "home_win": home_win_dev * scale,
            "draw": model_draw_prob,
            "away_win": away_win_dev * scale,
        }
    return {"home_win": home_win_dev, "draw": draw_dev, "away_win": away_win_dev}


def grade_match(
    fixture_id: str,
    model_version: str,
    home_win_prob: float,
    draw_prob: float,
    away_win_prob: float,
    actual_outcome: str,
    market_snapshots: list[dict],
) -> dict:
    """
    Compute the full grading row for one completed match.

    market_snapshots: list of dicts with keys
        source, home_win_dev, draw_dev (may be None), away_win_dev

    Returns a dict ready for inserting into match_grading.
    """
    model_probs = {
        "home_win": home_win_prob,
        "draw": draw_prob,
        "away_win": away_win_prob,
    }

    ml = log_loss(model_probs, actual_outcome)
    bs = brier_score(model_probs, actual_outcome)

    market_ll: dict[str, float] = {}
    market_bs: dict[str, float] = {}

    for snap in market_snapshots:
        source = snap["source"]
        mkt_probs = _market_probs(
            home_win_dev=snap["home_win_dev"],
            draw_dev=snap.get("draw_dev"),
            away_win_dev=snap["away_win_dev"],
            model_draw_prob=draw_prob,
        )
        market_ll[source] = log_loss(mkt_probs, actual_outcome)
        market_bs[source] = brier_score(mkt_probs, actual_outcome)

    return {
        "fixture_id": fixture_id,
        "model_version": model_version,
        "actual_outcome": actual_outcome,
        "model_log_loss": ml,
        "model_brier_score": bs,
        "market_log_loss": market_ll if market_ll else None,
        "market_brier_score": market_bs if market_bs else None,
    }


# ---------------------------------------------------------------------------
# Batch grading against the database
# ---------------------------------------------------------------------------

def grade_completed_matches(conn: psycopg.Connection) -> int:
    """
    Grade all completed WC2026 matches that do not yet have a grading row.

    For each (fixture, model_version) pair that has both a prediction and a
    confirmed result but no entry in match_grading, this function:
      1. Fetches the latest market snapshot per source (if any).
      2. Calls grade_match to compute log loss and Brier score.
      3. Inserts into match_grading with ON CONFLICT DO NOTHING so the job
         is safe to re-run.

    Returns the number of matches graded in this run.
    """
    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute("""
            SELECT
                mp.fixture_id,
                mp.model_version,
                mp.home_win_prob,
                mp.draw_prob,
                mp.away_win_prob,
                mr.outcome AS actual_outcome
            FROM match_predictions mp
            JOIN match_results mr ON mr.fixture_id = mp.fixture_id
            JOIN fixtures f       ON f.id = mp.fixture_id
            WHERE f.tournament_id = 'WC2026'
              AND NOT EXISTS (
                  SELECT 1 FROM match_grading mg
                  WHERE mg.fixture_id = mp.fixture_id
                    AND mg.model_version = mp.model_version
              )
            ORDER BY f.kickoff_utc
        """)
        pending = cur.fetchall()

    if not pending:
        logger.info("No ungraded matches found.")
        return 0

    graded_count = 0

    for row in pending:
        fixture_id = row["fixture_id"]

        # Latest snapshot per source for this fixture.
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("""
                SELECT DISTINCT ON (source)
                    source,
                    home_win_dev,
                    draw_dev,
                    away_win_dev
                FROM market_snapshots
                WHERE fixture_id = %s
                ORDER BY source, sampled_at DESC
            """, (fixture_id,))
            snapshots = [dict(s) for s in cur.fetchall()]

        grading = grade_match(
            fixture_id=fixture_id,
            model_version=row["model_version"],
            home_win_prob=row["home_win_prob"],
            draw_prob=row["draw_prob"],
            away_win_prob=row["away_win_prob"],
            actual_outcome=row["actual_outcome"],
            market_snapshots=snapshots,
        )

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO match_grading
                    (fixture_id, model_version, actual_outcome,
                     model_log_loss, model_brier_score,
                     market_log_loss, market_brier_score)
                VALUES
                    (%(fixture_id)s, %(model_version)s, %(actual_outcome)s,
                     %(model_log_loss)s, %(model_brier_score)s,
                     %(market_log_loss)s, %(market_brier_score)s)
                ON CONFLICT (fixture_id, model_version) DO NOTHING
            """, {
                **grading,
                "market_log_loss": (
                    json.dumps(grading["market_log_loss"])
                    if grading["market_log_loss"] else None
                ),
                "market_brier_score": (
                    json.dumps(grading["market_brier_score"])
                    if grading["market_brier_score"] else None
                ),
            })

        graded_count += 1
        logger.info(
            "Graded %s (%s): log_loss=%.4f brier=%.4f",
            fixture_id,
            row["actual_outcome"],
            grading["model_log_loss"],
            grading["model_brier_score"],
        )

    conn.commit()
    logger.info("Graded %d matches.", graded_count)
    return graded_count


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from dotenv import load_dotenv
    load_dotenv()

    from footy.db import get_conn
    with get_conn() as conn:
        n = grade_completed_matches(conn)

    if n == 0:
        print("No new matches to grade.")
    else:
        print(f"Graded {n} match(es). Results written to match_grading.")
    sys.exit(0)


if __name__ == "__main__":
    main()
