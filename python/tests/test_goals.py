"""
Unit tests for the goals model and prediction module.

Tests cover pure functions only — no PyMC sampling or DB connections.
The predict_match function is tested by constructing a minimal fake trace
with fixed posterior samples.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from footy.features.training_data import HALF_LIFE_DAYS, TRAIN_MIN_DATE
from footy.models.predict import predict_match


# ---------------------------------------------------------------------------
# training_data helpers
# ---------------------------------------------------------------------------

def test_train_min_date_is_2018():
    from datetime import date
    assert TRAIN_MIN_DATE == date(2018, 1, 1)


def test_half_life_is_730():
    assert HALF_LIFE_DAYS == 730.0


def test_weight_formula_at_zero_days():
    """A match played today has weight = 1.0."""
    import numpy as np
    weight = np.exp(-np.log(2) * 0 / HALF_LIFE_DAYS)
    assert abs(weight - 1.0) < 1e-9


def test_weight_formula_at_half_life():
    """A match played exactly one half-life ago has weight = 0.5."""
    import numpy as np
    weight = np.exp(-np.log(2) * HALF_LIFE_DAYS / HALF_LIFE_DAYS)
    assert abs(weight - 0.5) < 1e-9


def test_weight_formula_is_strictly_decreasing():
    import numpy as np
    days = np.array([0, 100, 365, 730, 1460])
    weights = np.exp(-np.log(2) * days / HALF_LIFE_DAYS)
    assert all(weights[i] > weights[i + 1] for i in range(len(weights) - 1))


# ---------------------------------------------------------------------------
# predict_match — fake trace fixture
# ---------------------------------------------------------------------------

def _make_fake_trace(n_chains: int = 2, n_draws: int = 50, n_teams: int = 4) -> tuple:
    """
    Build a minimal ArviZ InferenceData with fixed posterior samples.

    Teams: "AAA"=0, "BBB"=1, "CCC"=2, "DDD"=3
    att values set so AAA is strong attacker, BBB weak.
    def_strength set so CCC is strong defender, DDD weak.
    """
    import xarray as xr
    import arviz as az

    rng   = np.random.default_rng(0)
    shape = (n_chains, n_draws)

    # Fixed values (small noise to avoid degenerate posteriors)
    mu_vals       = np.full(shape, 0.3) + rng.normal(0, 0.01, shape)
    home_adv_vals = np.full(shape, 0.2) + rng.normal(0, 0.01, shape)
    # att: AAA=+0.5, BBB=-0.5, CCC=0, DDD=0
    att_vals = np.zeros((*shape, n_teams))
    att_vals[..., 0] =  0.5   # AAA strong attacker
    att_vals[..., 1] = -0.5   # BBB weak attacker
    att_vals += rng.normal(0, 0.01, att_vals.shape)
    # def_strength: CCC=−0.5 (hard to score against), DDD=+0.5 (easy)
    def_vals = np.zeros((*shape, n_teams))
    def_vals[..., 2] = -0.5   # CCC strong defence
    def_vals[..., 3] =  0.5   # DDD weak defence
    def_vals += rng.normal(0, 0.01, def_vals.shape)

    posterior_ds = xr.Dataset({
        "mu":           xr.DataArray(mu_vals,       dims=["chain", "draw"]),
        "home_adv":     xr.DataArray(home_adv_vals, dims=["chain", "draw"]),
        "att":          xr.DataArray(att_vals,      dims=["chain", "draw", "team"]),
        "def_strength": xr.DataArray(def_vals,      dims=["chain", "draw", "team"]),
    })
    # ArviZ >= 0.19 uses xarray DataTree; az.InferenceData was removed.
    trace = xr.DataTree.from_dict({"posterior": posterior_ds})

    meta = {
        "team_idx": {"AAA": 0, "BBB": 1, "CCC": 2, "DDD": 3},
        "n_teams":  n_teams,
    }
    return trace, meta


@pytest.fixture
def fake_trace():
    return _make_fake_trace()


# ---------------------------------------------------------------------------
# predict_match: output structure
# ---------------------------------------------------------------------------

def test_predict_match_returns_required_keys(fake_trace):
    trace, meta = fake_trace
    result = predict_match("AAA", "BBB", neutral=True, trace=trace, meta=meta)
    for key in ("home_win_prob", "draw_prob", "away_win_prob",
                "home_xg", "away_xg", "over_1_5", "over_2_5",
                "over_3_5", "btts", "scoreline_probs"):
        assert key in result, f"Missing key: {key}"


def test_wdl_probs_sum_to_one(fake_trace):
    trace, meta = fake_trace
    result = predict_match("AAA", "DDD", neutral=True, trace=trace, meta=meta)
    total = result["home_win_prob"] + result["draw_prob"] + result["away_win_prob"]
    assert abs(total - 1.0) < 1e-6


def test_all_probs_between_0_and_1(fake_trace):
    trace, meta = fake_trace
    result = predict_match("AAA", "BBB", neutral=True, trace=trace, meta=meta)
    for key in ("home_win_prob", "draw_prob", "away_win_prob",
                "over_1_5", "over_2_5", "over_3_5", "btts"):
        assert 0.0 <= result[key] <= 1.0, f"{key} = {result[key]} out of [0,1]"


def test_xg_is_positive(fake_trace):
    trace, meta = fake_trace
    result = predict_match("CCC", "DDD", neutral=True, trace=trace, meta=meta)
    assert result["home_xg"] > 0
    assert result["away_xg"] > 0


def test_scoreline_probs_sum_near_one(fake_trace):
    trace, meta = fake_trace
    # Use moderate-strength teams so lambda_home ~ 2.2; with lambda <= 3, P(X>7) < 1%.
    result = predict_match("AAA", "BBB", neutral=True, trace=trace, meta=meta)
    total = sum(result["scoreline_probs"].values())
    # Some probability mass falls beyond the 7-goal cap; allow up to 1% missing.
    assert 0.99 <= total <= 1.0, f"Scoreline probs sum to {total}"


def test_scoreline_probs_all_non_negative(fake_trace):
    trace, meta = fake_trace
    result = predict_match("BBB", "DDD", neutral=True, trace=trace, meta=meta)
    for (hg, ag), p in result["scoreline_probs"].items():
        assert p >= 0, f"Negative prob at ({hg}, {ag}): {p}"
        assert 0 <= hg <= 7
        assert 0 <= ag <= 7


# ---------------------------------------------------------------------------
# predict_match: over/under consistency with scoreline probs
# ---------------------------------------------------------------------------

def test_over_2_5_consistent_with_scorelines(fake_trace):
    trace, meta = fake_trace
    result = predict_match("AAA", "DDD", neutral=True, trace=trace, meta=meta)
    over_from_grid = sum(
        p for (hg, ag), p in result["scoreline_probs"].items()
        if hg + ag > 2
    )
    # Should match within 1pp (small differences from the 7-goal cap)
    assert abs(over_from_grid - result["over_2_5"]) < 0.02


def test_btts_consistent_with_scorelines(fake_trace):
    trace, meta = fake_trace
    result = predict_match("AAA", "DDD", neutral=True, trace=trace, meta=meta)
    btts_from_grid = sum(
        p for (hg, ag), p in result["scoreline_probs"].items()
        if hg > 0 and ag > 0
    )
    assert abs(btts_from_grid - result["btts"]) < 0.02


# ---------------------------------------------------------------------------
# predict_match: home advantage and team strength effects
# ---------------------------------------------------------------------------

def test_stronger_attacker_has_higher_xg(fake_trace):
    """AAA (strong attacker) should produce higher home xG than BBB."""
    trace, meta = fake_trace
    r_aaa = predict_match("AAA", "CCC", neutral=True, trace=trace, meta=meta)
    r_bbb = predict_match("BBB", "CCC", neutral=True, trace=trace, meta=meta)
    assert r_aaa["home_xg"] > r_bbb["home_xg"]


def test_home_advantage_increases_win_prob(fake_trace):
    """Same teams: home team should win more often in non-neutral venue."""
    trace, meta = fake_trace
    # Fixed seeds so both calls use the same posterior draw order; only λ_home
    # differs (non-neutral adds home_adv ≈ +0.2 to the log rate), making the
    # direction deterministic without relying on random Poisson noise.
    r_neutral = predict_match("AAA", "BBB", neutral=True,  trace=trace, meta=meta,
                              rng=np.random.default_rng(42))
    r_home    = predict_match("AAA", "BBB", neutral=False, trace=trace, meta=meta,
                              rng=np.random.default_rng(42))
    assert r_home["home_win_prob"] > r_neutral["home_win_prob"]


def test_unknown_team_raises_key_error(fake_trace):
    trace, meta = fake_trace
    with pytest.raises(KeyError, match="ZZZ"):
        predict_match("ZZZ", "AAA", neutral=True, trace=trace, meta=meta)
