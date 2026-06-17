"""
Walk-forward backtest for the Bayesian goals model.

Trains on 2014-01-01 to 2022-11-19 (the day before WC 2022), then predicts
all WC 2022 matches where both teams are WC 2026 qualifiers. This gives
honest out-of-sample calibration evidence before using the model on WC 2026.

Why WC 2022 only (not also WC 2018)?
  The current training window starts at 2018-01-01. If we predict WC 2018
  using pre-2018 data, the model trains on a different window than production,
  making calibration estimates less directly applicable. WC 2022 uses the
  same 2014+ data with the same decay structure as production.

Key metrics (per PRD):
  Brier score  (lower is better, naive 1/3-each baseline = 0.667)
  Log loss     (lower is better, naive baseline = ln(3) = 1.099)
  Calibration  (actual win rate vs predicted probability, binned)

Usage (from python/ directory):
    uv run python -m footy.models.backtest           # full run (~10 min)
    uv run python -m footy.models.backtest --quick   # 200 draws, smoke test
"""

from __future__ import annotations

import argparse
import logging
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg

from footy.features.training_data import HALF_LIFE_DAYS, _WC_TEAM_IDS
from footy.models.goals import build_model, fit
from footy.models.predict import predict_match
from footy.ratings.elo import EloRater, elo_key

logger = logging.getLogger(__name__)

_WC2022_START = date(2022, 11, 20)
_WC2022_END   = date(2022, 12, 19)  # Final was 18 Dec 2022

# Four years of pre-WC2022 data gives a similar density to the production window.
_BACKTEST_TRAIN_MIN = date(2014, 1, 1)


# ---------------------------------------------------------------------------
# Data preparation
# ---------------------------------------------------------------------------

def prepare_backtest_training(
    conn: psycopg.Connection,
    cutoff: date = _WC2022_START,
    min_date: date = _BACKTEST_TRAIN_MIN,
) -> pd.DataFrame:
    """
    Build a training DataFrame for a backtest run ending at `cutoff`.

    Mirrors prepare_training_data() exactly, with two differences:
    - Uses `cutoff` as the upper bound on historical matches (not _WC2026_START).
    - Computes days_ago relative to `cutoff` so the last pre-tournament match
      has decay weight close to 1.0, matching the production training setup.
    """
    rater   = EloRater()
    records: list[dict] = []

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT match_date, home_team, away_team,
                   home_score, away_score, tournament, neutral
            FROM   historical_matches
            WHERE  match_date < %s
            ORDER  BY match_date ASC
            """,
            (cutoff,),
        )
        rows = cur.fetchall()

    logger.info("Scanning %d historical matches for backtest (cutoff %s)", len(rows), cutoff)

    for match_date, home, away, hg, ag, tourn, neutral in rows:
        hk = elo_key(home)
        ak = elo_key(away)

        home_elo_pre = rater.rating(hk)
        away_elo_pre = rater.rating(ak)
        rater.process_match(home, away, hg, ag, tourn, bool(neutral))

        if hk in _WC_TEAM_IDS and ak in _WC_TEAM_IDS and match_date >= min_date:
            records.append({
                "match_date": match_date,
                "home_id":    hk,
                "away_id":    ak,
                "home_goals": int(hg),
                "away_goals": int(ag),
                "tournament": tourn,
                "neutral":    bool(neutral),
                "home_elo":   home_elo_pre,
                "away_elo":   away_elo_pre,
                # Decay relative to cutoff: the most recent pre-tournament match
                # gets days_ago=1 so its weight is close to 1.0, matching
                # how the production model weights its most recent observations.
                "days_ago":   (cutoff - match_date).days,
            })

    df = pd.DataFrame(records)
    df["weight"] = np.exp(-np.log(2) * df["days_ago"] / HALF_LIFE_DAYS)

    logger.info(
        "Backtest training: %d matches, %d unique teams, %s to %s",
        len(df),
        df["home_id"].nunique() if len(df) else 0,
        df["match_date"].min() if len(df) else "n/a",
        df["match_date"].max() if len(df) else "n/a",
    )
    return df


def get_eval_matches(
    conn: psycopg.Connection,
    start: date = _WC2022_START,
    end:   date = _WC2022_END,
) -> pd.DataFrame:
    """
    Pull WC 2022 matches from historical_matches where both teams are WC 2026
    qualifiers. These are the held-out predictions we score.

    Neutral=True for all WC matches (consistent with production predict logic).
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT match_date, home_team, away_team, home_score, away_score
            FROM   historical_matches
            WHERE  tournament = 'FIFA World Cup'
              AND  match_date >= %s
              AND  match_date <= %s
            ORDER  BY match_date ASC
            """,
            (start, end),
        )
        rows = cur.fetchall()

    records = []
    for match_date, home, away, hg, ag in rows:
        hk = elo_key(home)
        ak = elo_key(away)
        if hk in _WC_TEAM_IDS and ak in _WC_TEAM_IDS:
            records.append({
                "match_date": match_date,
                "home_id":    hk,
                "away_id":    ak,
                "home_goals": int(hg),
                "away_goals": int(ag),
            })

    logger.info(
        "Eval set: %d of %d WC 2022 matches have both teams as WC 2026 qualifiers",
        len(records), len(rows),
    )
    return pd.DataFrame(records)


# ---------------------------------------------------------------------------
# Metrics (pure functions — no DB, no model)
# ---------------------------------------------------------------------------

def outcome_index(home_goals: int, away_goals: int) -> int:
    """0 = home win, 1 = draw, 2 = away win."""
    if home_goals > away_goals:
        return 0
    if home_goals == away_goals:
        return 1
    return 2


def brier_score(probs: np.ndarray, outcomes: np.ndarray) -> float:
    """
    Multiclass Brier score.

    probs:    (N, 3) float array of [home_win, draw, away_win] probabilities.
    outcomes: (N,)  int array of 0/1/2.

    Returns the mean squared error between the probability vector and the
    one-hot outcome vector. Range [0, 2]; naive baseline (1/3 each) = 2/3.
    """
    one_hot = np.zeros_like(probs)
    one_hot[np.arange(len(outcomes)), outcomes] = 1.0
    return float(np.mean(np.sum((probs - one_hot) ** 2, axis=1)))


def log_loss(probs: np.ndarray, outcomes: np.ndarray, eps: float = 1e-9) -> float:
    """
    Multiclass log loss (mean negative log-likelihood of the correct outcome).

    Range [0, inf); naive baseline (1/3 each) = ln(3) ≈ 1.099.
    """
    chosen = np.clip(probs[np.arange(len(outcomes)), outcomes], eps, 1.0 - eps)
    return float(-np.mean(np.log(chosen)))


def calibration_bins(
    probs:    np.ndarray,
    outcomes: np.ndarray,
    n_bins:   int = 5,
) -> pd.DataFrame:
    """
    Home-win calibration: bucket P(home win) into n_bins equal-width bins and
    compare the mean prediction to the actual win rate in each bucket.

    A well-calibrated model lies close to the diagonal (predicted ≈ actual).
    The 'gap' column is actual - predicted; positive = underestimates home wins.
    """
    hw_prob   = probs[:, 0]
    hw_actual = (outcomes == 0).astype(float)

    edges = np.linspace(0.0, 1.0, n_bins + 1)
    rows  = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (hw_prob >= lo) & (hw_prob < hi)
        if mask.sum() == 0:
            continue
        rows.append({
            "range":     f"{lo:.0%}-{hi:.0%}",
            "n":         int(mask.sum()),
            "predicted": round(float(hw_prob[mask].mean()), 3),
            "actual":    round(float(hw_actual[mask].mean()), 3),
            "gap":       round(float(hw_actual[mask].mean() - hw_prob[mask].mean()), 3),
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Backtest runner
# ---------------------------------------------------------------------------

def run_backtest(
    conn:   psycopg.Connection,
    draws:  int = 1000,
    tune:   int = 500,
) -> dict:
    """
    Fit the model on pre-WC2022 data and predict WC 2022 held-out matches.

    Returns a dict with:
        n_eval, brier, log_loss, brier_baseline, ll_baseline,
        calibration (DataFrame), results_df (DataFrame)
    """
    cutoff = _WC2022_START

    train_df = prepare_backtest_training(conn, cutoff=cutoff)
    if len(train_df) == 0:
        raise RuntimeError(
            "No training data — is historical_matches populated? "
            "Run: uv run python -m footy.ingest.historical data/dataset/results.csv"
        )

    from footy.features.training_data import load_wc_teams
    teams_df = load_wc_teams(conn)

    logger.info("Fitting backtest model (%d draws, %d tune)", draws, tune)
    model, meta = build_model(train_df, teams_df)
    trace = fit(model, draws=draws, tune=tune, chains=2, target_accept=0.9)

    eval_df = get_eval_matches(conn)
    if len(eval_df) == 0:
        raise RuntimeError(
            "No WC 2022 eval matches found — historical_matches may not include WC 2022 data."
        )

    rng = np.random.default_rng(seed=0)
    pred_rows = []
    skipped   = 0

    for _, row in eval_df.iterrows():
        try:
            pred = predict_match(
                row["home_id"], row["away_id"],
                neutral=True,
                trace=trace,
                meta=meta,
                rng=rng,
            )
        except KeyError as exc:
            logger.warning("Skipping %s vs %s: %s", row["home_id"], row["away_id"], exc)
            skipped += 1
            continue

        pred_rows.append({
            **row.to_dict(),
            "home_win_prob": pred["home_win_prob"],
            "draw_prob":     pred["draw_prob"],
            "away_win_prob": pred["away_win_prob"],
            "home_xg":       pred["home_xg"],
            "away_xg":       pred["away_xg"],
        })

    if skipped:
        logger.warning("%d matches skipped (teams not in model)", skipped)

    results_df = pd.DataFrame(pred_rows)
    results_df["outcome"] = results_df.apply(
        lambda r: outcome_index(int(r["home_goals"]), int(r["away_goals"])), axis=1
    )

    probs    = results_df[["home_win_prob", "draw_prob", "away_win_prob"]].values
    outcomes = results_df["outcome"].values.astype(int)

    naive = np.full_like(probs, 1.0 / 3.0)

    return {
        "n_eval":          len(results_df),
        "brier":           brier_score(probs, outcomes),
        "log_loss":        log_loss(probs, outcomes),
        "brier_baseline":  brier_score(naive, outcomes),
        "ll_baseline":     log_loss(naive, outcomes),
        "calibration":     calibration_bins(probs, outcomes),
        "results_df":      results_df,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Walk-forward backtest (WC 2022).")
    parser.add_argument(
        "--quick", action="store_true",
        help="200 draws / 200 tune for a fast smoke-test (not reliable for calibration).",
    )
    args = parser.parse_args()

    from dotenv import load_dotenv
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from footy.db import get_conn

    draws = 200 if args.quick else 1000
    tune  = 200 if args.quick else 500

    with get_conn() as conn:
        results = run_backtest(conn, draws=draws, tune=tune)

    n   = results["n_eval"]
    bs  = results["brier"]
    ll  = results["log_loss"]
    bs0 = results["brier_baseline"]
    ll0 = results["ll_baseline"]

    skill_brier = (1.0 - bs / bs0) * 100
    skill_ll    = (1.0 - ll / ll0) * 100

    print(f"\n=== WC 2022 Walk-Forward Backtest ===")
    print(f"Training: {_BACKTEST_TRAIN_MIN} to {_WC2022_START} (exclusive)")
    print(f"Eval matches: {n} WC 2022 matches where both teams are WC 2026 qualifiers")
    print()
    print(f"{'Metric':<16} {'Model':>8} {'Naive(1/3)':>12} {'Skill':>8}")
    print("-" * 46)
    print(f"{'Brier score':<16} {bs:>8.4f} {bs0:>12.4f} {skill_brier:>+7.1f}%")
    print(f"{'Log loss':<16} {ll:>8.4f} {ll0:>12.4f} {skill_ll:>+7.1f}%")
    print()
    print("Calibration (home win probability):")
    print(results["calibration"].to_string(index=False))

    out_path = Path(__file__).parent.parent.parent / "data" / "backtest_wc2022.csv"
    results["results_df"].to_csv(out_path, index=False)
    print(f"\nDetailed results: {out_path}")


if __name__ == "__main__":
    main()
