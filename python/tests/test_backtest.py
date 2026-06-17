"""
Unit tests for backtest metric functions.

All tests are pure — no DB, no model, no sampling.
The DB-dependent functions (prepare_backtest_training, get_eval_matches,
run_backtest) are integration-tested manually via the --quick CLI flag.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from footy.models.backtest import (
    brier_score,
    calibration_bins,
    log_loss,
    outcome_index,
)


# ---------------------------------------------------------------------------
# outcome_index
# ---------------------------------------------------------------------------

def test_outcome_home_win():
    assert outcome_index(2, 0) == 0


def test_outcome_draw():
    assert outcome_index(1, 1) == 1
    assert outcome_index(0, 0) == 1


def test_outcome_away_win():
    assert outcome_index(0, 2) == 2


def test_outcome_high_score():
    assert outcome_index(5, 3) == 0
    assert outcome_index(1, 4) == 2


# ---------------------------------------------------------------------------
# brier_score
# ---------------------------------------------------------------------------

def test_brier_perfect_predictions():
    probs    = np.array([[1.0, 0.0, 0.0],
                         [0.0, 1.0, 0.0],
                         [0.0, 0.0, 1.0]], dtype=float)
    outcomes = np.array([0, 1, 2])
    assert brier_score(probs, outcomes) < 1e-9


def test_brier_worst_case():
    # Predict draw with certainty when home team wins: errors are (0-1)^2 + (1-0)^2 + (0-0)^2 = 2
    probs    = np.array([[0.0, 1.0, 0.0]], dtype=float)
    outcomes = np.array([0])
    assert abs(brier_score(probs, outcomes) - 2.0) < 1e-9


def test_brier_naive_baseline_near_two_thirds():
    # With balanced outcomes and 1/3 predictions, Brier = 2/3.
    n        = 3000
    probs    = np.full((n, 3), 1.0 / 3.0)
    outcomes = np.tile([0, 1, 2], n // 3)
    assert abs(brier_score(probs, outcomes) - 2.0 / 3.0) < 0.01


def test_brier_lower_for_confident_correct():
    # Confident correct prediction should be better than 1/3.
    probs_confident = np.array([[0.9, 0.05, 0.05]], dtype=float)
    probs_naive     = np.array([[1/3, 1/3,  1/3 ]], dtype=float)
    outcomes        = np.array([0])
    assert brier_score(probs_confident, outcomes) < brier_score(probs_naive, outcomes)


def test_brier_invariant_under_home_away_relabel():
    # Swapping the home/away label consistently (flip prob cols 0<->2, flip
    # outcomes 0<->2) must leave the Brier score unchanged.
    probs    = np.array([[0.6, 0.2, 0.2], [0.3, 0.3, 0.4]], dtype=float)
    outcomes = np.array([0, 2])

    probs_sw    = probs[:, [2, 1, 0]]
    outcomes_sw = np.where(outcomes == 0, 2, np.where(outcomes == 2, 0, 1))

    assert abs(brier_score(probs, outcomes) - brier_score(probs_sw, outcomes_sw)) < 1e-9


# ---------------------------------------------------------------------------
# log_loss
# ---------------------------------------------------------------------------

def test_log_loss_perfect():
    probs    = np.array([[1.0, 0.0, 0.0],
                         [0.0, 1.0, 0.0]], dtype=float)
    outcomes = np.array([0, 1])
    # eps clip prevents -inf; should be very close to 0
    assert log_loss(probs, outcomes) < 1e-6


def test_log_loss_naive_baseline():
    n        = 3000
    probs    = np.full((n, 3), 1.0 / 3.0)
    outcomes = np.tile([0, 1, 2], n // 3)
    assert abs(log_loss(probs, outcomes) - np.log(3)) < 0.01


def test_log_loss_lower_for_confident_correct():
    probs_confident = np.array([[0.9, 0.05, 0.05]], dtype=float)
    probs_naive     = np.array([[1/3, 1/3,  1/3 ]], dtype=float)
    outcomes        = np.array([0])
    assert log_loss(probs_confident, outcomes) < log_loss(probs_naive, outcomes)


def test_log_loss_strictly_positive_for_non_perfect():
    probs    = np.array([[0.7, 0.2, 0.1]], dtype=float)
    outcomes = np.array([0])
    assert log_loss(probs, outcomes) > 0


# ---------------------------------------------------------------------------
# calibration_bins
# ---------------------------------------------------------------------------

def test_calibration_returns_dataframe():
    probs    = np.array([[0.7, 0.2, 0.1]] * 10 + [[0.2, 0.4, 0.4]] * 10, dtype=float)
    outcomes = np.array([0] * 10 + [2] * 10)
    cal = calibration_bins(probs, outcomes)
    assert isinstance(cal, pd.DataFrame)
    assert {"range", "n", "predicted", "actual", "gap"}.issubset(cal.columns)


def test_calibration_n_sums_to_total():
    rng      = np.random.default_rng(0)
    probs    = rng.dirichlet([1, 1, 1], size=60).astype(float)
    outcomes = np.zeros(60, dtype=int)
    cal      = calibration_bins(probs, outcomes, n_bins=5)
    assert cal["n"].sum() == 60


def test_calibration_gap_is_actual_minus_predicted():
    probs    = np.full((10, 3), [0.3, 0.4, 0.3])
    outcomes = np.array([0] * 10)  # all home wins
    cal      = calibration_bins(probs, outcomes, n_bins=5)
    # All predictions land in the 20%-40% bucket
    assert len(cal) == 1
    row = cal.iloc[0]
    assert abs(row["gap"] - (row["actual"] - row["predicted"])) < 1e-9


def test_calibration_empty_bins_omitted():
    # All predictions in [0.8, 1.0): only one non-empty bin
    probs    = np.array([[0.85, 0.10, 0.05]] * 20, dtype=float)
    outcomes = np.zeros(20, dtype=int)
    cal      = calibration_bins(probs, outcomes, n_bins=5)
    assert len(cal) == 1


# ---------------------------------------------------------------------------
# Combined: a model with skill beats the naive baseline
# ---------------------------------------------------------------------------

def test_skilled_model_beats_naive():
    rng      = np.random.default_rng(42)
    n        = 300
    true_p   = rng.dirichlet([2.0, 1.0, 1.0], size=n)
    outcomes = np.array([rng.choice(3, p=p) for p in true_p])

    # Skilled: predictions close to true probabilities
    skilled  = np.clip(true_p + rng.normal(0, 0.05, true_p.shape), 0.01, 1.0)
    skilled /= skilled.sum(axis=1, keepdims=True)

    naive = np.full((n, 3), 1.0 / 3.0)

    assert brier_score(skilled, outcomes) < brier_score(naive, outcomes)
    assert log_loss(skilled, outcomes)    < log_loss(naive, outcomes)
