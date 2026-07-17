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

import json
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

def _scale_rest(rest_days: float, meta: dict) -> float:
    """Apply the same scaling used during training."""
    center = meta.get("rest_center", 4.0)
    scale  = meta.get("rest_scale",  4.0)
    cap    = meta.get("rest_cap",   14.0)
    return (min(rest_days, cap) - center) / scale


# WC 2026 host nations. FIFA lists them as the "home" side in their fixtures.
# They receive a partial home-crowd advantage (0.5 of the fitted home_adv term).
_HOST_NATIONS = {"USA", "CAN", "MEX"}
_HOST_ADV_FACTOR = 0.5


def predict_match(
    home_id: str,
    away_id: str,
    neutral: bool,
    trace: xr.DataTree,
    meta: dict,
    rng: np.random.Generator | None = None,
    home_rest_days: float = 7.0,
    away_rest_days: float = 7.0,
    home_adv_factor: float | None = None,
) -> dict:
    """
    Sample the posterior predictive distribution for one match.

    home_rest_days / away_rest_days: days since each team's previous match.
    Default 7.0 (comfortable pre-tournament rest) when unknown.

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

    home_rest_x = _scale_rest(home_rest_days, meta)
    away_rest_x = _scale_rest(away_rest_days, meta)

    # Flatten (chains × draws) → 1-D arrays
    post = trace.posterior
    mu_s        = post["mu"].values.flatten()
    home_adv_s  = post["home_adv"].values.flatten()
    att_s       = post["att"].values.reshape(-1, meta["n_teams"])
    def_s       = post["def_strength"].values.reshape(-1, meta["n_teams"])
    rest_coef_s = post["rest_coef"].values.flatten()

    n_post = len(mu_s)
    idx    = rng.choice(n_post, size=min(N_SAMPLES, n_post), replace=False)

    # home_adv_factor: 0.0 = fully neutral, 1.0 = full home advantage.
    # If not supplied: neutral=True gives 0.0; neutral=False gives 1.0.
    # Caller may override to 0.5 for host-nation partial home advantage.
    if home_adv_factor is None:
        home_adv_factor = 0.0 if neutral else 1.0

    log_lam_h = (
        mu_s[idx]
        + att_s[idx, hi]
        - def_s[idx, ai]
        + home_adv_s[idx] * home_adv_factor
        + rest_coef_s[idx] * home_rest_x
    )
    log_lam_a = (
        mu_s[idx]
        + att_s[idx, ai]
        - def_s[idx, hi]
        + rest_coef_s[idx] * away_rest_x
    )

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
    model_version: str = MODEL_VERSION,
    feature_snapshot: dict | None = None,
    is_retroactive: bool = False,
) -> int:
    """Upsert one row into match_predictions. Returns the prediction id."""
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
            model_as_of       = EXCLUDED.model_as_of,
            home_win_prob     = EXCLUDED.home_win_prob,
            draw_prob         = EXCLUDED.draw_prob,
            away_win_prob     = EXCLUDED.away_win_prob,
            home_xg           = EXCLUDED.home_xg,
            away_xg           = EXCLUDED.away_xg,
            over_1_5          = EXCLUDED.over_1_5,
            over_2_5          = EXCLUDED.over_2_5,
            over_3_5          = EXCLUDED.over_3_5,
            btts              = EXCLUDED.btts,
            feature_snapshot  = EXCLUDED.feature_snapshot,
            is_retroactive    = EXCLUDED.is_retroactive,
            computed_at       = NOW()
        RETURNING id
        """,
        (
            fixture_id, model_version, model_as_of, kickoff_utc,
            pred["home_win_prob"], pred["draw_prob"], pred["away_win_prob"],
            pred["home_xg"], pred["away_xg"],
            pred["over_1_5"], pred["over_2_5"], pred["over_3_5"], pred["btts"],
            json.dumps(feature_snapshot) if feature_snapshot else None,
            is_retroactive,
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

def _team_last_kickoff(conn: psycopg.Connection) -> dict[str, datetime]:
    """
    Return the most recent completed-match kickoff UTC for every WC 2026 team.
    Used to compute rest days for upcoming fixtures.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (team_id)
                   team_id, kickoff_utc
            FROM (
                SELECT home_team_id AS team_id, f.kickoff_utc
                FROM   fixtures f
                JOIN   match_results r ON r.fixture_id = f.id
                WHERE  f.tournament_id = 'WC2026'
                UNION ALL
                SELECT away_team_id AS team_id, f.kickoff_utc
                FROM   fixtures f
                JOIN   match_results r ON r.fixture_id = f.id
                WHERE  f.tournament_id = 'WC2026'
            ) sub
            ORDER BY team_id, kickoff_utc DESC
            """
        )
        return {row[0]: row[1] for row in cur.fetchall()}


def predict_all_upcoming(
    conn: psycopg.Connection,
    trace: xr.DataTree,
    meta: dict,
    model_as_of: datetime,
    model_version: str = MODEL_VERSION,
) -> int:
    """
    Predict all WC 2026 fixtures that have no result yet and write to DB.

    Computes rest days per team from the most recent completed match in the
    tournament. Teams with no completed match default to 7 days (pre-tournament
    rest assumption).

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

    last_kickoff = _team_last_kickoff(conn)

    logger.info("Predicting %d upcoming fixtures", len(fixtures))
    rng = np.random.default_rng(seed=42)
    n_written = 0

    for fixture_id, home_id, away_id, kickoff_utc in fixtures:
        # Rest days: difference between this kickoff and team's last completed match.
        # Default 7.0 if the team hasn't played yet in the tournament.
        _default = 7.0
        home_rest = (
            (kickoff_utc - last_kickoff[home_id]).days
            if home_id in last_kickoff else _default
        )
        away_rest = (
            (kickoff_utc - last_kickoff[away_id]).days
            if away_id in last_kickoff else _default
        )

        # Host nations (USA, CAN, MEX) play in front of home crowds; give them
        # half the fitted home_adv signal rather than treating the match as
        # fully neutral.
        host_factor = _HOST_ADV_FACTOR if home_id in _HOST_NATIONS else 0.0

        try:
            pred = predict_match(
                home_id, away_id,
                neutral=True,
                trace=trace,
                meta=meta,
                rng=rng,
                home_rest_days=float(home_rest),
                away_rest_days=float(away_rest),
                home_adv_factor=host_factor,
            )
        except KeyError as exc:
            logger.warning("Skipping %s: %s", fixture_id, exc)
            continue

        snapshot = {
            "home_rest_days": home_rest,
            "away_rest_days": away_rest,
            "model_version":  model_version,
            "host_adv_factor": host_factor,
        }

        with conn.cursor() as cur:
            pred_id = _write_prediction(
                cur, fixture_id, kickoff_utc, model_as_of, pred,
                model_version=model_version,
                feature_snapshot=snapshot,
            )
            _write_scorelines(cur, pred_id, pred["scoreline_probs"])
        conn.commit()

        logger.debug(
            "%s  %s (rest=%dd) vs %s (rest=%dd)  HW=%.1f%%  D=%.1f%%  AW=%.1f%%",
            fixture_id, home_id, int(home_rest), away_id, int(away_rest),
            pred["home_win_prob"] * 100,
            pred["draw_prob"] * 100,
            pred["away_win_prob"] * 100,
        )
        n_written += 1

    return n_written


def predict_all_retroactive(
    conn: psycopg.Connection,
    trace: xr.DataTree,
    meta: dict,
    model_version: str = MODEL_VERSION,
) -> int:
    """
    Generate predictions for completed WC 2026 fixtures that have no prediction row.

    These are retroactive: the model runs today using features as they stand now
    (Elo ratings, rest days) rather than as they were at kickoff. This is a known
    point-in-time deviation, acceptable only for display purposes. Predictions are
    labelled with model_as_of = kickoff_utc - 2h so the DB constraint passes.

    Returns the number of fixtures predicted.
    """
    from datetime import timedelta

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.id, f.home_team_id, f.away_team_id, f.kickoff_utc
            FROM   fixtures f
            JOIN   match_results r ON r.fixture_id = f.id
            LEFT JOIN match_predictions p ON p.fixture_id = f.id AND p.model_version = %s
            WHERE  f.tournament_id = 'WC2026'
              AND  p.fixture_id IS NULL
              AND  f.home_team_id IS NOT NULL
              AND  f.away_team_id IS NOT NULL
            ORDER  BY f.kickoff_utc ASC
            """,
            (model_version,),
        )
        fixtures = cur.fetchall()

    last_kickoff = _team_last_kickoff(conn)
    logger.info("Retroactively predicting %d completed fixtures without predictions", len(fixtures))
    rng = np.random.default_rng(seed=99)
    n_written = 0

    for fixture_id, home_id, away_id, kickoff_utc in fixtures:
        _default = 7.0
        home_rest = (kickoff_utc - last_kickoff[home_id]).days if home_id in last_kickoff else _default
        away_rest = (kickoff_utc - last_kickoff[away_id]).days if away_id in last_kickoff else _default

        try:
            pred = predict_match(
                home_id, away_id,
                neutral=True,
                trace=trace,
                meta=meta,
                home_rest_days=home_rest,
                away_rest_days=away_rest,
                rng=rng,
            )
        except Exception as exc:
            logger.warning("Skipping %s (%s vs %s): %s", fixture_id, home_id, away_id, exc)
            continue

        # model_as_of must be before kickoff to satisfy the DB check constraint.
        # is_retroactive=True marks this as in-sample; calibration excludes it.
        model_as_of = kickoff_utc - timedelta(hours=2)
        with conn.cursor() as cur:
            pred_id = _write_prediction(
                cur, fixture_id, kickoff_utc, model_as_of, pred,
                model_version=model_version,
                is_retroactive=True,
            )
            _write_scorelines(cur, pred_id, pred["scoreline_probs"])
        conn.commit()
        logger.debug("Retroactive %s  HW=%.1f%%  D=%.1f%%  AW=%.1f%%",
                     fixture_id, pred["home_win_prob"]*100, pred["draw_prob"]*100, pred["away_win_prob"]*100)
        n_written += 1

    return n_written


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    import argparse
    from pathlib import Path as _Path

    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="WC 2026 match prediction pipeline")
    parser.add_argument(
        "--retroactive",
        action="store_true",
        help="Also predict completed matches that have no prediction row (point-in-time caveat applies)",
    )
    parser.add_argument(
        "--model-version",
        default=None,
        help=f"Override model version tag written to DB (default: {MODEL_VERSION})",
    )
    parser.add_argument(
        "--trace-path",
        default=None,
        help="Path to the .nc trace file (default: data/traces/goals_model.nc)",
    )
    args = parser.parse_args()

    from footy.db import get_conn
    from footy.models.goals import load, _TRACE_PATH
    from footy.models.scorer import compute_all_scorer_predictions

    trace_path = _Path(args.trace_path) if args.trace_path else _TRACE_PATH
    mv         = args.model_version or MODEL_VERSION

    trace, meta = load(path=trace_path)
    print(f"Loaded trace from {trace_path}  (model_version={mv})")

    # model_as_of: use now so the DB constraint (model_as_of < kickoff_utc) passes
    # for all future fixtures.
    model_as_of = datetime.now(tz=timezone.utc)

    with get_conn() as conn:
        if args.retroactive:
            r = predict_all_retroactive(conn, trace, meta, model_version=mv)
            print(f"Retroactively predicted {r} completed fixtures.")
        n = predict_all_upcoming(conn, trace, meta, model_as_of, model_version=mv)
        print(f"Wrote predictions for {n} upcoming WC 2026 fixtures.")
        if mv == MODEL_VERSION:
            s = compute_all_scorer_predictions(conn)
            print(f"Wrote scorer predictions for {s} upcoming WC 2026 fixtures.")


if __name__ == "__main__":
    main()
