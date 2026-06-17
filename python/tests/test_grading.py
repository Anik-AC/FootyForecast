"""Tests for footy.grading."""

from __future__ import annotations

import math
import pytest

from footy.grading import (
    brier_score,
    devigify,
    grade_match,
    log_loss,
)


# ---------------------------------------------------------------------------
# log_loss
# ---------------------------------------------------------------------------

def test_log_loss_perfect_home_win():
    probs = {"home_win": 1.0, "draw": 0.0, "away_win": 0.0}
    result = log_loss(probs, "home_win")
    assert math.isclose(result, 0.0, abs_tol=1e-10)


def test_log_loss_random_three_way():
    # Random uniform: each outcome = 1/3
    probs = {"home_win": 1 / 3, "draw": 1 / 3, "away_win": 1 / 3}
    expected = math.log(3)  # ≈ 1.0986
    result = log_loss(probs, "home_win")
    assert math.isclose(result, expected, rel_tol=1e-9)


def test_log_loss_draws_from_correct_outcome():
    probs = {"home_win": 0.5, "draw": 0.3, "away_win": 0.2}
    assert math.isclose(log_loss(probs, "home_win"), -math.log(0.5))
    assert math.isclose(log_loss(probs, "draw"),     -math.log(0.3))
    assert math.isclose(log_loss(probs, "away_win"), -math.log(0.2))


def test_log_loss_clips_zero_probability():
    # p=0 for the actual outcome should not raise; returns a very large finite value.
    probs = {"home_win": 0.0, "draw": 0.5, "away_win": 0.5}
    result = log_loss(probs, "home_win")
    assert math.isfinite(result)
    assert result > 30  # clipped at epsilon = 1e-15, so -log(1e-15) ≈ 34.5


def test_log_loss_lower_is_better():
    good  = log_loss({"home_win": 0.9, "draw": 0.05, "away_win": 0.05}, "home_win")
    worse = log_loss({"home_win": 0.4, "draw": 0.3,  "away_win": 0.3},  "home_win")
    assert good < worse


# ---------------------------------------------------------------------------
# brier_score
# ---------------------------------------------------------------------------

def test_brier_score_perfect():
    probs = {"home_win": 1.0, "draw": 0.0, "away_win": 0.0}
    assert math.isclose(brier_score(probs, "home_win"), 0.0, abs_tol=1e-10)


def test_brier_score_worst_case():
    # Assign all probability to wrong outcome.
    probs = {"home_win": 0.0, "draw": 0.0, "away_win": 1.0}
    # (0-1)^2 + (0-0)^2 + (1-0)^2 = 1 + 0 + 1 = 2
    assert math.isclose(brier_score(probs, "home_win"), 2.0, abs_tol=1e-10)


def test_brier_score_uniform():
    probs = {"home_win": 1 / 3, "draw": 1 / 3, "away_win": 1 / 3}
    # (1/3-1)^2 + (1/3-0)^2 + (1/3-0)^2 = 4/9 + 1/9 + 1/9 = 6/9 = 2/3
    expected = 2 / 3
    assert math.isclose(brier_score(probs, "home_win"), expected, rel_tol=1e-9)


def test_brier_score_uses_correct_outcome():
    probs = {"home_win": 0.6, "draw": 0.2, "away_win": 0.2}
    # Actual = draw:
    # (0.6-0)^2 + (0.2-1)^2 + (0.2-0)^2 = 0.36 + 0.64 + 0.04 = 1.04
    assert math.isclose(brier_score(probs, "draw"), 1.04, rel_tol=1e-9)


def test_brier_score_lower_is_better():
    good  = brier_score({"home_win": 0.9, "draw": 0.05, "away_win": 0.05}, "home_win")
    worse = brier_score({"home_win": 0.4, "draw": 0.3,  "away_win": 0.3},  "home_win")
    assert good < worse


# ---------------------------------------------------------------------------
# devigify
# ---------------------------------------------------------------------------

def test_devigify_three_way():
    h, d, a = devigify(0.50, 0.25, 0.35)
    total = h + d + a
    assert math.isclose(total, 1.0, rel_tol=1e-9)
    # Ratios preserved
    assert math.isclose(h / a, 0.50 / 0.35, rel_tol=1e-6)


def test_devigify_binary_no_draw():
    h, d, a = devigify(0.60, None, 0.45)
    assert d is None
    assert math.isclose(h + a, 1.0, rel_tol=1e-9)
    assert math.isclose(h / a, 0.60 / 0.45, rel_tol=1e-6)


def test_devigify_already_normalized_three_way():
    h, d, a = devigify(0.5, 0.2, 0.3)
    assert math.isclose(h + d + a, 1.0, rel_tol=1e-9)


def test_devigify_already_normalized_binary():
    h, d, a = devigify(0.6, None, 0.4)
    assert math.isclose(h + a, 1.0, rel_tol=1e-9)


def test_devigify_raises_on_zero_total():
    with pytest.raises(ValueError):
        devigify(0.0, None, 0.0)


# ---------------------------------------------------------------------------
# grade_match
# ---------------------------------------------------------------------------

def _base_grade(**overrides) -> dict:
    defaults = dict(
        fixture_id="WC2026-GRP-A-01",
        model_version="v1",
        home_win_prob=0.60,
        draw_prob=0.20,
        away_win_prob=0.20,
        actual_outcome="home_win",
        market_snapshots=[],
    )
    return grade_match(**{**defaults, **overrides})


def test_grade_match_returns_required_keys():
    g = _base_grade()
    for key in ("fixture_id", "model_version", "actual_outcome",
                "model_log_loss", "model_brier_score"):
        assert key in g


def test_grade_match_no_markets_has_null_market_scores():
    g = _base_grade()
    assert g["market_log_loss"] is None
    assert g["market_brier_score"] is None


def test_grade_match_correct_log_loss():
    g = _base_grade(home_win_prob=0.6, actual_outcome="home_win")
    expected = -math.log(0.6)
    assert math.isclose(g["model_log_loss"], expected, rel_tol=1e-9)


def test_grade_match_correct_brier():
    g = _base_grade(
        home_win_prob=0.6, draw_prob=0.2, away_win_prob=0.2,
        actual_outcome="home_win",
    )
    # (0.6-1)^2 + (0.2-0)^2 + (0.2-0)^2 = 0.16 + 0.04 + 0.04 = 0.24
    assert math.isclose(g["model_brier_score"], 0.24, rel_tol=1e-9)


def test_grade_match_three_way_market():
    snapshots = [{"source": "polymarket", "home_win_dev": 0.65, "draw_dev": 0.15, "away_win_dev": 0.20}]
    g = _base_grade(actual_outcome="home_win", market_snapshots=snapshots)
    assert "polymarket" in g["market_log_loss"]
    assert math.isclose(g["market_log_loss"]["polymarket"], -math.log(0.65), rel_tol=1e-9)


def test_grade_match_binary_market_uses_model_draw():
    # Binary market: no draw leg. Model draw = 0.20.
    # home_win_dev=0.70, away_win_dev=0.30, remaining=(1-0.20)=0.80
    # Scaled home = 0.70/(0.70+0.30) * 0.80 = 0.56, away = 0.24, draw = 0.20
    snapshots = [{"source": "kalshi", "home_win_dev": 0.70, "draw_dev": None, "away_win_dev": 0.30}]
    g = _base_grade(draw_prob=0.20, actual_outcome="home_win", market_snapshots=snapshots)
    assert "kalshi" in g["market_log_loss"]
    expected_home_prob = 0.70 / (0.70 + 0.30) * (1 - 0.20)  # = 0.56
    assert math.isclose(g["market_log_loss"]["kalshi"], -math.log(expected_home_prob), rel_tol=1e-6)


def test_grade_match_multiple_markets():
    snapshots = [
        {"source": "polymarket", "home_win_dev": 0.65, "draw_dev": 0.15, "away_win_dev": 0.20},
        {"source": "kalshi",     "home_win_dev": 0.62, "draw_dev": None, "away_win_dev": 0.38},
    ]
    g = _base_grade(actual_outcome="home_win", market_snapshots=snapshots)
    assert set(g["market_log_loss"].keys()) == {"polymarket", "kalshi"}
    assert set(g["market_brier_score"].keys()) == {"polymarket", "kalshi"}


def test_grade_match_upset_penalty():
    # Model said 80% home win, actual = away win. Should be high log loss.
    g = _base_grade(
        home_win_prob=0.80, draw_prob=0.10, away_win_prob=0.10,
        actual_outcome="away_win",
    )
    assert g["model_log_loss"] > 2.0  # -log(0.10) ≈ 2.303


def test_grade_match_fixture_id_propagated():
    g = _base_grade(fixture_id="WC2026-QF-01")
    assert g["fixture_id"] == "WC2026-QF-01"


# ---------------------------------------------------------------------------
# Integration test (requires Postgres)
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_grade_completed_matches_integration(pg_conn):
    from footy.grading import grade_completed_matches
    # No fixtures/predictions/results seeded, so result should be 0.
    n = grade_completed_matches(pg_conn)
    assert n == 0
