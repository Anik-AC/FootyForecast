"""
Elo-based match prediction model (elo_v1).

Converts Elo rating differences to 3-way win/draw/loss probabilities using
a standard logistic formula. No MCMC: this model runs in seconds.

Math:
    E_home = 1 / (1 + 10^(-(elo_home - elo_away) / 400))

    This is the expected score for the home team where draws count as 0.5, so:
        E = P(win) + 0.5 * P(draw)
    Rearranging:
        P(win)  = E - 0.5 * P(draw)
        P(loss) = 1 - E - 0.5 * P(draw)

    P(draw) = P_DRAW_MAX * exp(-delta^2 / (2 * DRAW_DECAY^2))
    peaks at 0.25 when teams are equal, decays as the Elo gap widens.

All WC 2026 matches are neutral (no home advantage applied). Elo ratings are
rebuilt fresh from all historical matches using EloRater.build_from_db() so
the ratings reflect every completed match.

Usage (from python/ directory):
    uv run python -m footy.models.elo_predict
    uv run python -m footy.models.elo_predict --retroactive
"""

from __future__ import annotations

import argparse
import json
import logging
import math
from datetime import datetime, timedelta, timezone

import psycopg
from dotenv import load_dotenv

from footy.ratings.elo import EloRater, build_from_db

logger = logging.getLogger(__name__)

MODEL_VERSION = "elo_v1"

# Draw probability at equal Elo (~25% in international knockout football)
_P_DRAW_MAX = 0.25

# Gaussian decay: Elo difference at which draw probability falls to ~61% of max
_DRAW_DECAY = 400.0


def elo_to_probs(elo_home: float, elo_away: float) -> tuple[float, float, float]:
    """
    Convert Elo ratings to (P_home_win, P_draw, P_away_win) for 90-min result.

    WC 2026 is a neutral venue so no home advantage is added.
    """
    delta = elo_home - elo_away
    E = 1.0 / (1.0 + 10.0 ** (-delta / 400.0))  # expected score (win=1, draw=0.5, loss=0)

    p_draw = _P_DRAW_MAX * math.exp(-(delta ** 2) / (2.0 * _DRAW_DECAY ** 2))

    p_home = E - 0.5 * p_draw
    p_away = 1.0 - E - 0.5 * p_draw

    # Clamp: for very large Elo gaps the formula can push p_away negative
    p_home = max(0.01, p_home)
    p_away = max(0.01, p_away)
    p_draw = max(0.01, p_draw)

    total = p_home + p_draw + p_away
    return p_home / total, p_draw / total, p_away / total


def _write_prediction(
    cur: psycopg.Cursor,
    fixture_id: str,
    kickoff_utc: datetime,
    model_as_of: datetime,
    home_win: float,
    draw: float,
    away_win: float,
    elo_home: float,
    elo_away: float,
    is_retroactive: bool = False,
) -> None:
    cur.execute(
        """
        INSERT INTO match_predictions
            (fixture_id, model_version, model_as_of, kickoff_utc,
             home_win_prob, draw_prob, away_win_prob,
             home_xg, away_xg,
             over_1_5, over_2_5, over_3_5, btts,
             feature_snapshot, is_retroactive)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (fixture_id, model_version) DO UPDATE SET
            model_as_of   = EXCLUDED.model_as_of,
            home_win_prob = EXCLUDED.home_win_prob,
            draw_prob     = EXCLUDED.draw_prob,
            away_win_prob = EXCLUDED.away_win_prob,
            feature_snapshot = EXCLUDED.feature_snapshot,
            computed_at   = NOW()
        """,
        (
            fixture_id, MODEL_VERSION, model_as_of, kickoff_utc,
            home_win, draw, away_win,
            None, None,           # no xG for Elo model
            None, None, None, None,  # no over/BTTS
            json.dumps({"elo_home": round(elo_home, 1), "elo_away": round(elo_away, 1)}),
            is_retroactive,
        ),
    )


def predict_all_upcoming(
    conn: psycopg.Connection,
    rater: EloRater,
    model_as_of: datetime,
) -> int:
    """Predict all WC 2026 fixtures without a result. Returns count written."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.id, f.home_team_id, f.away_team_id, f.kickoff_utc
            FROM   fixtures f
            LEFT JOIN match_results r ON r.fixture_id = f.id
            LEFT JOIN match_predictions p
                   ON p.fixture_id = f.id AND p.model_version = %s
            WHERE  f.tournament_id = 'WC2026'
              AND  r.fixture_id IS NULL
              AND  p.fixture_id IS NULL
              AND  f.home_team_id IS NOT NULL
              AND  f.away_team_id IS NOT NULL
              AND  f.kickoff_utc > %s
            ORDER  BY f.kickoff_utc ASC
            """,
            (MODEL_VERSION, model_as_of),
        )
        fixtures = cur.fetchall()

    logger.info("Predicting %d upcoming fixtures with Elo model", len(fixtures))
    n = 0
    for fixture_id, home_id, away_id, kickoff_utc in fixtures:
        elo_h = rater.rating(home_id)
        elo_a = rater.rating(away_id)
        hw, d, aw = elo_to_probs(elo_h, elo_a)
        with conn.cursor() as cur:
            _write_prediction(cur, fixture_id, kickoff_utc, model_as_of,
                              hw, d, aw, elo_h, elo_a)
        conn.commit()
        logger.debug("%s  %s vs %s  HW=%.1f%%  D=%.1f%%  AW=%.1f%%",
                     fixture_id, home_id, away_id, hw * 100, d * 100, aw * 100)
        n += 1
    return n


def predict_all_retroactive(
    conn: psycopg.Connection,
    rater: EloRater,
) -> int:
    """
    Predict all completed WC 2026 fixtures that have no Elo prediction row.

    Uses today's Elo ratings as a point-in-time approximation; results are
    marked is_retroactive=True so they are excluded from live calibration.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.id, f.home_team_id, f.away_team_id, f.kickoff_utc
            FROM   fixtures f
            JOIN   match_results r ON r.fixture_id = f.id
            LEFT JOIN match_predictions p
                   ON p.fixture_id = f.id AND p.model_version = %s
            WHERE  f.tournament_id = 'WC2026'
              AND  p.fixture_id IS NULL
              AND  f.home_team_id IS NOT NULL
              AND  f.away_team_id IS NOT NULL
            ORDER  BY f.kickoff_utc ASC
            """,
            (MODEL_VERSION,),
        )
        fixtures = cur.fetchall()

    logger.info("Retroactively predicting %d completed fixtures with Elo model", len(fixtures))
    n = 0
    for fixture_id, home_id, away_id, kickoff_utc in fixtures:
        elo_h = rater.rating(home_id)
        elo_a = rater.rating(away_id)
        hw, d, aw = elo_to_probs(elo_h, elo_a)
        model_as_of = kickoff_utc - timedelta(hours=2)
        with conn.cursor() as cur:
            _write_prediction(cur, fixture_id, kickoff_utc, model_as_of,
                              hw, d, aw, elo_h, elo_a, is_retroactive=True)
        conn.commit()
        n += 1
    return n


def main() -> None:
    parser = argparse.ArgumentParser(description="Elo-based WC 2026 match predictions")
    parser.add_argument(
        "--retroactive",
        action="store_true",
        help="Also predict completed matches (marks is_retroactive=True)",
    )
    args = parser.parse_args()

    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from footy.db import get_conn

    with get_conn() as conn:
        rater, as_of = build_from_db(conn)
        print(f"Elo ratings built as of {as_of}")

        model_as_of = datetime.now(tz=timezone.utc)

        if args.retroactive:
            r = predict_all_retroactive(conn, rater)
            print(f"Retroactively predicted {r} completed fixtures.")
        n = predict_all_upcoming(conn, rater, model_as_of)
        print(f"Wrote predictions for {n} upcoming WC 2026 fixtures (model_version={MODEL_VERSION}).")


if __name__ == "__main__":
    main()
