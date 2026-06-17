"""
Prediction module: loads the saved posterior trace and generates match predictions.

For each upcoming WC 2026 fixture, samples from the posterior predictive
distribution to compute win/draw/loss probabilities, expected goals, scoreline
probabilities, over/under, and BTTS. Writes results to match_predictions and
scoreline_probabilities in Postgres.

Usage (from python/ directory):
    uv run python -m footy.models.predict
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import psycopg
import xarray as xr
from dotenv import load_dotenv

from footy.models.goals import MODEL_VERSION

logger = logging.getLogger(__name__)

# Number of posterior samples used per prediction.
# 10 000 gives <0.5 pp Monte Carlo error on probabilities.
N_SAMPLES = 10_000


# ---------------------------------------------------------------------------
# Core prediction function (pure, no DB)
# ---------------------------------------------------------------------------

def predict_match(
    home_id: str,
    away_id: str,
    neutral: bool,
    trace: xr.DataTree,
    meta: dict,
    rng: np.random.Generator | None = None,
) -> dict:
    """
    Sample the posterior predictive distribution for one match.

    Returns a dict with:
        home_win_prob, draw_prob, away_win_prob  (sum to 1)
        home_xg, away_xg                         (posterior mean lambda)
        over_1_5, over_2_5, over_3_5             (P(total goals > threshold))
        btts                                      (P(both teams score))
        scoreline_probs                           (dict {(hg, ag): prob})
    """
    if rng is None:
        rng = np.random.default_rng()

    team_idx: dict[str, int] = meta["team_idx"]

    if home_id not in team_idx:
        raise KeyError(f"Team '{home_id}' not in model (was it in training data?)")
    if away_id not in team_idx:
        raise KeyError(f"Team '{away_id}' not in model (was it in training data?)")

    hi = team_idx[home_id]
    ai = team_idx[away_id]

    # Flatten (chains × draws) → 1-D arrays
    post = trace.posterior
    mu_s       = post["mu"].values.flatten()
    home_adv_s = post["home_adv"].values.flatten()
    att_s      = post["att"].values.reshape(-1, meta["n_teams"])
    def_s      = post["def_strength"].values.reshape(-1, meta["n_teams"])

    n_post = len(mu_s)
    idx    = rng.choice(n_post, size=min(N_SAMPLES, n_post), replace=False)

    log_lam_h = (
        mu_s[idx]
        + att_s[idx, hi]
        - def_s[idx, ai]
        + home_adv_s[idx] * (0.0 if neutral else 1.0)
    )
    log_lam_a = mu_s[idx] + att_s[idx, ai] - def_s[idx, hi]

    lam_h = np.exp(log_lam_h)
    lam_a = np.exp(log_lam_a)

    # Posterior predictive goal samples
    hg = rng.poisson(lam_h)
    ag = rng.poisson(lam_a)

    n = len(hg)
    home_win = float((hg > ag).sum()) / n
    draw     = float((hg == ag).sum()) / n
    away_win = float((hg < ag).sum()) / n

    # Scoreline grid (cap at 7 to match schema constraint)
    max_g = 8
    scoreline_probs: dict[tuple[int, int], float] = {}
    for h in range(max_g):
        for a in range(max_g):
            p = float(((hg == h) & (ag == a)).sum()) / n
            if p > 0:
                scoreline_probs[(h, a)] = p

    return {
        "home_win_prob":    home_win,
        "draw_prob":        draw,
        "away_win_prob":    away_win,
        "home_xg":          float(lam_h.mean()),
        "away_xg":          float(lam_a.mean()),
        "over_1_5":         float(((hg + ag) > 1.5).sum()) / n,
        "over_2_5":         float(((hg + ag) > 2.5).sum()) / n,
        "over_3_5":         float(((hg + ag) > 3.5).sum()) / n,
        "btts":             float(((hg > 0) & (ag > 0)).sum()) / n,
        "scoreline_probs":  scoreline_probs,
    }


# ---------------------------------------------------------------------------
# DB write helpers
# ---------------------------------------------------------------------------

def _write_prediction(
    cur: psycopg.Cursor,
    fixture_id: str,
    kickoff_utc: datetime,
    model_as_of: datetime,
    pred: dict,
) -> int:
    """Upsert one row into match_predictions. Returns the prediction id."""
    cur.execute(
        """
        INSERT INTO match_predictions
            (fixture_id, model_version, model_as_of, kickoff_utc,
             home_win_prob, draw_prob, away_win_prob,
             home_xg, away_xg,
             over_1_5, over_2_5, over_3_5, btts)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (fixture_id, model_version) DO UPDATE SET
            model_as_of   = EXCLUDED.model_as_of,
            home_win_prob = EXCLUDED.home_win_prob,
            draw_prob     = EXCLUDED.draw_prob,
            away_win_prob = EXCLUDED.away_win_prob,
            home_xg       = EXCLUDED.home_xg,
            away_xg       = EXCLUDED.away_xg,
            over_1_5      = EXCLUDED.over_1_5,
            over_2_5      = EXCLUDED.over_2_5,
            over_3_5      = EXCLUDED.over_3_5,
            btts          = EXCLUDED.btts,
            computed_at   = NOW()
        RETURNING id
        """,
        (
            fixture_id, MODEL_VERSION, model_as_of, kickoff_utc,
            pred["home_win_prob"], pred["draw_prob"], pred["away_win_prob"],
            pred["home_xg"], pred["away_xg"],
            pred["over_1_5"], pred["over_2_5"], pred["over_3_5"], pred["btts"],
        ),
    )
    row = cur.fetchone()
    return row[0]


def _write_scorelines(
    cur: psycopg.Cursor,
    prediction_id: int,
    scoreline_probs: dict[tuple[int, int], float],
) -> None:
    """Delete + reinsert scoreline rows for this prediction."""
    cur.execute(
        "DELETE FROM scoreline_probabilities WHERE prediction_id = %s",
        (prediction_id,),
    )
    rows = [
        (prediction_id, hg, ag, p)
        for (hg, ag), p in scoreline_probs.items()
    ]
    cur.executemany(
        "INSERT INTO scoreline_probabilities (prediction_id, home_goals, away_goals, probability) "
        "VALUES (%s, %s, %s, %s)",
        rows,
    )


# ---------------------------------------------------------------------------
# Predict all upcoming fixtures
# ---------------------------------------------------------------------------

def predict_all_upcoming(
    conn: psycopg.Connection,
    trace: xr.DataTree,
    meta: dict,
    model_as_of: datetime,
) -> int:
    """
    Predict all WC 2026 fixtures that have no result yet and write to DB.

    Returns the number of fixtures predicted.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.id, f.home_team_id, f.away_team_id, f.kickoff_utc
            FROM   fixtures f
            LEFT JOIN match_results r ON r.fixture_id = f.id
            WHERE  f.tournament_id = 'WC2026'
              AND  r.fixture_id IS NULL
              AND  f.home_team_id IS NOT NULL
              AND  f.away_team_id IS NOT NULL
              AND  f.kickoff_utc > %s
            ORDER  BY f.kickoff_utc ASC
            """,
            (model_as_of,),
        )
        fixtures = cur.fetchall()

    logger.info("Predicting %d upcoming fixtures", len(fixtures))
    rng = np.random.default_rng(seed=42)
    n_written = 0

    for fixture_id, home_id, away_id, kickoff_utc in fixtures:
        try:
            pred = predict_match(
                home_id, away_id,
                neutral=True,   # all WC matches are neutral-venue
                trace=trace,
                meta=meta,
                rng=rng,
            )
        except KeyError as exc:
            logger.warning("Skipping %s: %s", fixture_id, exc)
            continue

        with conn.cursor() as cur:
            pred_id = _write_prediction(cur, fixture_id, kickoff_utc, model_as_of, pred)
            _write_scorelines(cur, pred_id, pred["scoreline_probs"])
        conn.commit()

        logger.debug(
            "%s  %s vs %s  HW=%.1f%%  D=%.1f%%  AW=%.1f%%",
            fixture_id, home_id, away_id,
            pred["home_win_prob"] * 100,
            pred["draw_prob"] * 100,
            pred["away_win_prob"] * 100,
        )
        n_written += 1

    return n_written


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from footy.db import get_conn
    from footy.models.goals import load

    trace, meta = load()

    # model_as_of: use now so the DB constraint (model_as_of < kickoff_utc) passes
    # for all future fixtures.
    model_as_of = datetime.now(tz=timezone.utc)

    with get_conn() as conn:
        n = predict_all_upcoming(conn, trace, meta, model_as_of)

    print(f"Wrote predictions for {n} upcoming WC 2026 fixtures.")


if __name__ == "__main__":
    main()
