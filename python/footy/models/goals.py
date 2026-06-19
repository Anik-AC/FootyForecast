"""
Bayesian hierarchical goals model (PyMC).

Model structure (log-linear Poisson):
    log(λ_home) = μ + att[home] - def[away] + home_adv * (1 - neutral)
    log(λ_away) = μ + att[away] - def[home]
    home_goals  ~ Poisson(λ_home)
    away_goals  ~ Poisson(λ_away)

Partial pooling: team attack / defence strengths drawn from confederation-level
hyperpriors so teams with few matches (e.g. Curaçao) borrow from their
confederation average rather than relying solely on sparse evidence.

Non-centred parameterisation is used for the team-level parameters so NUTS
can sample the funnel geometry efficiently (standard practice for hierarchical
models).

Time decay: exponential weights on the match log-likelihoods (half-life 2 years),
implemented via pm.Potential so the sampler sees a weighted log-posterior.

Usage (from python/ directory):
    uv run python -m footy.models.goals           # full run (~20-40 min on CPU)
    uv run python -m footy.models.goals --quick   # 200 draws for smoke-testing
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import arviz as az
import numpy as np
import pandas as pd
import pymc as pm
import pytensor.tensor as pt
import xarray as xr
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

MODEL_VERSION = "bayesian_goals_v2"

_TRACE_DIR = Path(__file__).parent.parent.parent / "data" / "traces"
_TRACE_PATH = _TRACE_DIR / "goals_model.nc"
_META_PATH  = _TRACE_DIR / "goals_model_meta.json"


# ---------------------------------------------------------------------------
# Model definition
# ---------------------------------------------------------------------------

_REST_CENTER = 4.0   # days considered "neutral" rest (center of scaling)
_REST_SCALE  = 4.0   # one unit of rest_coef effect per 4 extra days of rest
_REST_CAP    = 14.0  # beyond this, diminishing returns are negligible


def _scale_rest(rest_days_arr: np.ndarray) -> np.ndarray:
    """
    Scale raw rest days to a centred feature for the model.

    Returns (clipped_days - REST_CENTER) / REST_SCALE, so:
      0 days rest  → -1.0
      4 days rest  →  0.0  (neutral)
      8 days rest  → +1.0
      14+ days     → +2.5  (capped)
    """
    return (np.clip(rest_days_arr, 0.0, _REST_CAP) - _REST_CENTER) / _REST_SCALE


def build_model(
    df: pd.DataFrame,
    teams_df: pd.DataFrame,
) -> tuple[pm.Model, dict]:
    """
    Construct the PyMC model from training data.

    Returns the model and a metadata dict with the team/confederation
    index mappings needed for prediction.

    Model formula (log-linear Poisson):
        log(λ_home) = μ + att[h] - def[a] + home_adv*(1-neutral)
                        + rest_coef * home_rest_scaled
        log(λ_away) = μ + att[a] - def[h]
                        + rest_coef * away_rest_scaled

    rest_coef captures the per-4-day effect of additional rest on a team's
    attacking rate. Prior: Normal(0, 0.1). Expected posterior: slightly positive
    (more rest → marginally higher xG). A zero posterior means rest has no
    detectable effect in the training data.
    """
    # --- Encode teams ---
    team_ids = teams_df["team_id"].values.tolist()
    n_teams  = len(team_ids)
    team_idx = {t: i for i, t in enumerate(team_ids)}

    # --- Encode confederations ---
    conf_list = sorted(teams_df["confederation"].unique())
    n_confs   = len(conf_list)
    conf_idx  = {c: i for i, c in enumerate(conf_list)}
    team_conf = np.array([conf_idx[c] for c in teams_df["confederation"]], dtype=int)

    # --- Match arrays ---
    valid = df["home_id"].isin(team_idx) & df["away_id"].isin(team_idx)
    if not valid.all():
        n_dropped = (~valid).sum()
        logger.warning("Dropping %d rows with unknown team IDs", n_dropped)
        df = df[valid].copy()

    home_idx_arr  = df["home_id"].map(team_idx).values.astype(int)
    away_idx_arr  = df["away_id"].map(team_idx).values.astype(int)
    home_goals    = df["home_goals"].values.astype(int)
    away_goals    = df["away_goals"].values.astype(int)
    neutral_arr   = df["neutral"].values.astype(float)
    weight_arr    = df["weight"].values.astype(float)

    # Rest days: scaled centred feature (0 at 4 days rest, ±1 per 4 days).
    home_rest_arr = _scale_rest(df["home_rest_days"].values.astype(float))
    away_rest_arr = _scale_rest(df["away_rest_days"].values.astype(float))

    logger.info(
        "Building model: %d matches, %d teams, %d confederations",
        len(df), n_teams, n_confs,
    )

    with pm.Model() as model:
        # ----------------------------------------------------------------
        # Confederation-level hyperpriors
        # ----------------------------------------------------------------
        mu_att_c    = pm.Normal("mu_att_c",    0.0, 0.5, shape=n_confs)
        sigma_att_c = pm.HalfNormal("sigma_att_c", 0.3, shape=n_confs)
        mu_def_c    = pm.Normal("mu_def_c",    0.0, 0.5, shape=n_confs)
        sigma_def_c = pm.HalfNormal("sigma_def_c", 0.3, shape=n_confs)

        # ----------------------------------------------------------------
        # Team-level parameters — non-centred for efficient NUTS sampling.
        # ----------------------------------------------------------------
        att_z = pm.Normal("att_z", 0.0, 1.0, shape=n_teams)
        def_z = pm.Normal("def_z", 0.0, 1.0, shape=n_teams)

        att_raw = pm.Deterministic(
            "att_raw",
            mu_att_c[team_conf] + sigma_att_c[team_conf] * att_z,
        )
        def_raw = pm.Deterministic(
            "def_raw",
            mu_def_c[team_conf] + sigma_def_c[team_conf] * def_z,
        )

        # Sum-to-zero constraint removes the intercept/attack/defence
        # identifiability problem.
        att = pm.Deterministic("att",          att_raw - pt.mean(att_raw))
        def_strength = pm.Deterministic("def_strength", def_raw - pt.mean(def_raw))

        # ----------------------------------------------------------------
        # Global parameters
        # ----------------------------------------------------------------
        mu       = pm.Normal("mu",       0.3, 0.2)   # log of avg goals per team
        home_adv = pm.Normal("home_adv", 0.2, 0.1)   # log boost for home team

        # Effect of rest on attacking rate, per 4-day unit above the 4-day
        # baseline. Prior centred at 0 (no assumed effect direction); width 0.1
        # allows effects up to ±10% on expected goals per 4 days.
        rest_coef = pm.Normal("rest_coef", 0.0, 0.1)

        # ----------------------------------------------------------------
        # Expected goals (log scale) for each match
        # ----------------------------------------------------------------
        log_lam_home = (
            mu
            + att[home_idx_arr]
            - def_strength[away_idx_arr]
            + home_adv * (1.0 - neutral_arr)
            + rest_coef * home_rest_arr
        )
        log_lam_away = (
            mu
            + att[away_idx_arr]
            - def_strength[home_idx_arr]
            + rest_coef * away_rest_arr
        )

        # ----------------------------------------------------------------
        # Weighted Poisson likelihood via pm.Potential.
        # Weight = time_decay * competitive_weight so friendlies contribute
        # less than competitive matches and older matches less than recent ones.
        # ----------------------------------------------------------------
        home_loglike = pm.logp(pm.Poisson.dist(mu=pt.exp(log_lam_home)), home_goals)
        away_loglike = pm.logp(pm.Poisson.dist(mu=pt.exp(log_lam_away)), away_goals)
        pm.Potential("weighted_ll", (weight_arr * (home_loglike + away_loglike)).sum())

    meta = {
        "team_idx":   team_idx,
        "conf_idx":   conf_idx,
        "team_conf":  team_conf.tolist(),
        "team_ids":   team_ids,
        "conf_list":  conf_list,
        "n_teams":    n_teams,
        "n_confs":    n_confs,
        "rest_center": _REST_CENTER,
        "rest_scale":  _REST_SCALE,
        "rest_cap":    _REST_CAP,
    }
    return model, meta


# ---------------------------------------------------------------------------
# Fit
# ---------------------------------------------------------------------------

def fit(
    model: pm.Model,
    draws: int = 1000,
    tune: int = 500,
    chains: int = 2,
    target_accept: float = 0.9,
    random_seed: int = 42,
) -> xr.DataTree:
    """
    Sample the posterior with NUTS and return an ArviZ InferenceData object.

    target_accept=0.9 is higher than the default (0.8) to handle the
    hierarchical geometry more reliably; it reduces step size and slows
    sampling slightly but prevents divergences.
    """
    logger.info(
        "Sampling: %d draws, %d tuning steps, %d chains", draws, tune, chains
    )
    with model:
        trace = pm.sample(
            draws=draws,
            tune=tune,
            chains=chains,
            target_accept=target_accept,
            random_seed=random_seed,
            progressbar=True,
        )
    return trace


# ---------------------------------------------------------------------------
# Persist
# ---------------------------------------------------------------------------

def save(trace: xr.DataTree, meta: dict, path: Path = _TRACE_PATH) -> None:
    """Save trace (NetCDF4) and metadata (JSON) to disk."""
    path.parent.mkdir(parents=True, exist_ok=True)
    # az.to_netcdf was removed in ArviZ 1.x; use the DataTree method directly.
    trace.to_netcdf(str(path))
    with open(_META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    logger.info("Saved trace to %s", path)


def load(path: Path = _TRACE_PATH) -> tuple[xr.DataTree, dict]:
    """Load trace and metadata from disk."""
    if not path.exists():
        raise FileNotFoundError(
            f"No trace found at {path}. Run `python -m footy.models.goals` first."
        )
    trace = az.from_netcdf(str(path))
    with open(_META_PATH, encoding="utf-8") as f:
        meta = json.load(f)
    logger.info("Loaded trace from %s", path)
    return trace, meta


# ---------------------------------------------------------------------------
# Export parameters to Postgres (for the Go simulator)
# ---------------------------------------------------------------------------

def export_params(trace: xr.DataTree, meta: dict, conn) -> None:
    """
    Write posterior mean attack / defence strengths and global parameters to
    team_model_params and model_globals so the Go simulator can read them.

    Uses ON CONFLICT DO UPDATE so re-running after a new fit overwrites stale values.
    """
    import psycopg

    att_means = trace.posterior["att"].mean(dim=["chain", "draw"]).values
    def_means = trace.posterior["def_strength"].mean(dim=["chain", "draw"]).values
    mu_mean       = float(trace.posterior["mu"].mean(dim=["chain", "draw"]).values)
    home_adv_mean = float(trace.posterior["home_adv"].mean(dim=["chain", "draw"]).values)

    version = MODEL_VERSION

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO model_globals (model_version, mu_mean, home_adv_mean)
            VALUES (%s, %s, %s)
            ON CONFLICT (model_version) DO UPDATE
                SET mu_mean       = EXCLUDED.mu_mean,
                    home_adv_mean = EXCLUDED.home_adv_mean,
                    as_of         = NOW()
            """,
            (version, mu_mean, home_adv_mean),
        )
        rows = [
            (team_id, version, float(att_means[i]), float(def_means[i]))
            for i, team_id in enumerate(meta["team_ids"])
        ]
        cur.executemany(
            """
            INSERT INTO team_model_params (team_id, model_version, att_mean, def_mean)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (team_id, model_version) DO UPDATE
                SET att_mean = EXCLUDED.att_mean,
                    def_mean = EXCLUDED.def_mean,
                    as_of    = NOW()
            """,
            rows,
        )
    conn.commit()
    logger.info("Exported params for %d teams to DB (model_version=%s)", len(rows), version)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Fit the Bayesian goals model.")
    parser.add_argument(
        "--quick",
        action="store_true",
        help="200 draws / 200 tune / 2 chains for smoke-testing (not production).",
    )
    args = parser.parse_args()

    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from footy.db import get_conn
    from footy.features.training_data import load_wc_teams, prepare_training_data

    with get_conn() as conn:
        df       = prepare_training_data(conn)
        teams_df = load_wc_teams(conn)

    print(f"\nTraining on {len(df)} matches involving {df['home_id'].nunique()} unique WC teams.")
    print(f"Date range: {df['match_date'].min()} to {df['match_date'].max()}")

    draws = 200 if args.quick else 1000
    tune  = 200 if args.quick else 500

    model, meta = build_model(df, teams_df)
    trace = fit(model, draws=draws, tune=tune)

    # Quick convergence check: any R-hat > 1.05 is a warning sign.
    rhat = az.rhat(trace)
    bad  = {k: float(v.values.max()) for k, v in rhat.items()
            if float(v.values.max()) > 1.05}
    if bad:
        print(f"\nWARNING: R-hat > 1.05 for: {bad}")
        print("Consider increasing tune/draws or checking for model issues.")
    else:
        print("\nConvergence OK: all R-hat <= 1.05")

    save(trace, meta)

    with get_conn() as conn:
        export_params(trace, meta, conn)
    print("Model parameters exported to DB (team_model_params, model_globals).")

    # Print attack rankings as a sanity check.
    att_mean = trace.posterior["att"].mean(dim=["chain", "draw"]).values
    ranking  = sorted(zip(meta["team_ids"], att_mean), key=lambda x: -x[1])
    print("\nTop 10 attack strengths (posterior mean):")
    for i, (team, val) in enumerate(ranking[:10], 1):
        print(f"  {i:2d}. {team:<4}  {val:+.3f}")

    print(f"\nTrace saved to {_TRACE_PATH}")


if __name__ == "__main__":
    main()
