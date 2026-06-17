"""Unit tests for footy.ratings.elo."""

from __future__ import annotations

import pytest

from footy.ratings.elo import EloRater, elo_key, tournament_tier


# ---------------------------------------------------------------------------
# elo_key
# ---------------------------------------------------------------------------

def test_elo_key_wc_qualifier_returns_fifa_code():
    assert elo_key("Germany") == "GER"
    assert elo_key("France") == "FRA"
    assert elo_key("Brazil") == "BRA"
    assert elo_key("Argentina") == "ARG"


def test_elo_key_variant_names_share_same_key():
    assert elo_key("Czech Republic") == elo_key("Czechia") == "CZE"
    assert elo_key("South Korea") == elo_key("Korea Republic") == "KOR"
    assert elo_key("Bosnia and Herzegovina") == elo_key("Bosnia-Herzegovina") == "BIH"
    assert elo_key("Ivory Coast") == elo_key("Côte d'Ivoire") == "CIV"


def test_elo_key_non_qualifier_returns_raw():
    assert elo_key("Italy") == "Italy"
    assert elo_key("Costa Rica") == "Costa Rica"
    assert elo_key("Nigeria") == "Nigeria"


def test_elo_key_unknown_team_returns_raw():
    assert elo_key("Zembla FC") == "Zembla FC"
    assert elo_key("West Germany") == "West Germany"


def test_elo_key_fifa_code_passthrough():
    # When WC 2026 fixture IDs (already FIFA codes) are passed in, they should
    # pass through unchanged since "GER" itself is not in TEAM_NAME_MAP.
    assert elo_key("GER") == "GER"
    assert elo_key("FRA") == "FRA"


# ---------------------------------------------------------------------------
# tournament_tier
# ---------------------------------------------------------------------------

def test_tournament_tier_wc():
    assert tournament_tier("FIFA World Cup") == "wc"
    assert tournament_tier("World Cup") == "wc"


def test_tournament_tier_qualification_is_competitive():
    assert tournament_tier("FIFA World Cup qualification") == "competitive"
    assert tournament_tier("FIFA World Cup qualification (CONMEBOL)") == "competitive"
    assert tournament_tier("UEFA Euro qualification") == "competitive"


def test_tournament_tier_friendly():
    assert tournament_tier("Friendly") == "friendly"
    assert tournament_tier("International Friendly") == "friendly"


def test_tournament_tier_continental_championships_are_competitive():
    assert tournament_tier("UEFA Euro") == "competitive"
    assert tournament_tier("Copa América") == "competitive"
    assert tournament_tier("Africa Cup of Nations") == "competitive"
    assert tournament_tier("AFC Asian Cup") == "competitive"


# ---------------------------------------------------------------------------
# EloRater.mov_multiplier
# ---------------------------------------------------------------------------

def test_mov_multiplier_increases_with_goal_diff():
    m1 = EloRater.mov_multiplier(1, 0.0)
    m3 = EloRater.mov_multiplier(3, 0.0)
    m5 = EloRater.mov_multiplier(5, 0.0)
    assert m1 < m3 < m5


def test_mov_multiplier_autocorrelation_correction():
    # Same goal diff; larger winner Elo advantage → smaller multiplier
    m_even = EloRater.mov_multiplier(3, 0.0)
    m_heavy_fav = EloRater.mov_multiplier(3, 500.0)
    assert m_even > m_heavy_fav


def test_mov_multiplier_upset_does_not_go_negative():
    # Negative advantage (underdog wins) should clamp to 0, not go negative
    m = EloRater.mov_multiplier(2, -200.0)
    assert m > 0


def test_mov_multiplier_is_positive():
    for diff in range(1, 6):
        for advantage in [-100, 0, 100, 500]:
            assert EloRater.mov_multiplier(diff, advantage) > 0


# ---------------------------------------------------------------------------
# EloRater.process_match — core logic
# ---------------------------------------------------------------------------

def test_initial_rating_is_default():
    r = EloRater()
    assert r.rating("ANY") == 1500.0
    assert r.matches_played("ANY") == 0


def test_equal_teams_draw_neutral_no_rating_change():
    r = EloRater()
    r._ratings["A"] = 1500.0
    r._ratings["B"] = 1500.0
    new_a, new_b = r.process_match("A", "B", 1, 1, "Friendly", neutral=True)
    assert abs(new_a - 1500.0) < 1e-9
    assert abs(new_b - 1500.0) < 1e-9


def test_home_advantage_applied_non_neutral():
    r = EloRater()
    r._ratings["H"] = 1500.0
    r._ratings["A"] = 1500.0
    # Equal teams, draw, non-neutral: home was expected to win > 0.5
    # so draw is underperformance for home → home loses a little
    new_h, new_a = r.process_match("H", "A", 1, 1, "Friendly", neutral=False)
    assert new_h < 1500.0
    assert new_a > 1500.0


def test_home_advantage_skipped_neutral():
    r = EloRater()
    r._ratings["H"] = 1500.0
    r._ratings["A"] = 1500.0
    new_h, new_a = r.process_match("H", "A", 1, 1, "Friendly", neutral=True)
    assert abs(new_h - 1500.0) < 1e-9
    assert abs(new_a - 1500.0) < 1e-9


def test_upset_produces_larger_change_than_expected_win():
    """An underdog winning should shift ratings more than a favourite winning."""
    r_upset = EloRater()
    r_upset._ratings["STRONG"] = 1700.0
    r_upset._ratings["WEAK"] = 1300.0
    r_upset.process_match("STRONG", "WEAK", 0, 1, "FIFA World Cup", neutral=True)
    upset_gain = r_upset.rating("WEAK") - 1300.0

    r_fav = EloRater()
    r_fav._ratings["STRONG"] = 1700.0
    r_fav._ratings["WEAK"] = 1300.0
    r_fav.process_match("STRONG", "WEAK", 1, 0, "FIFA World Cup", neutral=True)
    fav_gain = r_fav.rating("STRONG") - 1700.0

    assert upset_gain > fav_gain > 0


def test_expected_win_produces_small_change():
    r = EloRater()
    r._ratings["STRONG"] = 1700.0
    r._ratings["WEAK"] = 1300.0
    r.process_match("STRONG", "WEAK", 1, 0, "FIFA World Cup", neutral=True)
    # Favourite won: small gain for STRONG, small loss for WEAK
    assert 1700.0 < r.rating("STRONG") < 1720.0
    assert 1280.0 < r.rating("WEAK") < 1300.0


def test_wc_k_higher_than_friendly():
    r_wc = EloRater()
    r_fr = EloRater()
    for r in (r_wc, r_fr):
        r._ratings["X"] = 1500.0
        r._ratings["Y"] = 1500.0
    # Same result, different tournament tier
    new_wc, _ = r_wc.process_match("X", "Y", 2, 0, "FIFA World Cup", neutral=True)
    new_fr, _ = r_fr.process_match("X", "Y", 2, 0, "Friendly", neutral=True)
    assert new_wc > new_fr


def test_ratings_are_zero_sum():
    """Total Elo must be conserved: what one team gains the other loses."""
    r = EloRater()
    r._ratings["X"] = 1600.0
    r._ratings["Y"] = 1400.0
    total_before = r.rating("X") + r.rating("Y")
    r.process_match("X", "Y", 3, 1, "Friendly", neutral=True)
    total_after = r.rating("X") + r.rating("Y")
    assert abs(total_after - total_before) < 1e-9


def test_matches_played_increments():
    r = EloRater()
    r.process_match("ARG", "BRA", 1, 0, "Friendly", neutral=True)
    assert r.matches_played("ARG") == 1
    assert r.matches_played("BRA") == 1
    r.process_match("ARG", "FRA", 2, 1, "Friendly", neutral=True)
    assert r.matches_played("ARG") == 2
    assert r.matches_played("FRA") == 1


def test_snapshot_is_independent_copy():
    r = EloRater()
    r._ratings["X"] = 1600.0
    snap = r.snapshot()
    r._ratings["X"] = 1700.0
    assert snap["X"] == 1600.0  # snapshot was not mutated


def test_raw_name_and_fifa_code_use_same_entry():
    """
    Passing 'Germany' and 'GER' should update the same Elo entry because
    both normalise to 'GER' via elo_key.
    """
    r = EloRater()
    r.process_match("Germany", "France", 2, 1, "Friendly", neutral=True)
    elo_after_name = r.rating("GER")

    r2 = EloRater()
    r2.process_match("GER", "FRA", 2, 1, "Friendly", neutral=True)
    elo_after_code = r2.rating("GER")

    assert abs(elo_after_name - elo_after_code) < 1e-9
