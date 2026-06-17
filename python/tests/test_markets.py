"""Tests for footy.ingest.markets and footy.ingest.market_map."""

from __future__ import annotations

import pytest

from footy.ingest.market_map import (
    market_name,
    market_search_query,
    match_market_to_fixture,
    team_id_from_name,
)
from footy.ingest.markets import (
    _parse_polymarket_market,
    fetch_polymarket_odds,
    fetch_kalshi_odds,
)


# ---------------------------------------------------------------------------
# market_map: market_name
# ---------------------------------------------------------------------------

def test_market_name_known_teams():
    assert market_name("BRA") == "Brazil"
    assert market_name("ARG") == "Argentina"
    assert market_name("USA") == "United States"
    assert market_name("KOR") == "South Korea"


def test_market_name_unknown_raises():
    with pytest.raises(KeyError):
        market_name("XYZ")


def test_market_name_all_48_present():
    """Spot check: all teams from seed.sql have a market name."""
    seed_ids = [
        "USA", "CAN", "MEX", "PAN", "HAI", "CUW",
        "ARG", "BRA", "COL", "URU", "ECU", "PAR",
        "GER", "FRA", "ENG", "ESP", "POR", "NED",
        "BEL", "CRO", "AUT", "SUI", "SCO", "TUR",
        "CZE", "NOR", "SWE", "BIH",
        "MAR", "SEN", "EGY", "CIV", "RSA", "GHA",
        "COD", "ALG", "TUN", "CPV",
        "JPN", "KOR", "AUS", "IRN", "KSA", "IRQ",
        "JOR", "QAT", "UZB", "NZL",
    ]
    for tid in seed_ids:
        name = market_name(tid)
        assert isinstance(name, str) and len(name) > 0, f"Empty name for {tid}"


# ---------------------------------------------------------------------------
# market_map: team_id_from_name
# ---------------------------------------------------------------------------

def test_team_id_from_name_direct():
    assert team_id_from_name("Brazil") == "BRA"
    assert team_id_from_name("Argentina") == "ARG"
    assert team_id_from_name("United States") == "USA"


def test_team_id_from_name_alias():
    assert team_id_from_name("South Korea") == "KOR"
    assert team_id_from_name("Korea Republic") == "KOR"
    assert team_id_from_name("Ivory Coast") == "CIV"
    assert team_id_from_name("DR Congo") == "COD"


def test_team_id_from_name_case_insensitive():
    assert team_id_from_name("brazil") == "BRA"
    assert team_id_from_name("ARGENTINA") == "ARG"


def test_team_id_from_name_unknown_returns_none():
    assert team_id_from_name("Zembla FC") is None


# ---------------------------------------------------------------------------
# market_map: market_search_query
# ---------------------------------------------------------------------------

def test_market_search_query_contains_both_names():
    q = market_search_query("BRA", "ARG")
    assert "Brazil" in q
    assert "Argentina" in q


# ---------------------------------------------------------------------------
# market_map: match_market_to_fixture
# ---------------------------------------------------------------------------

def test_match_market_to_fixture_matches_standard_title():
    assert match_market_to_fixture("Brazil vs Argentina", "BRA", "ARG") is True
    assert match_market_to_fixture("Argentina vs Brazil", "BRA", "ARG") is True


def test_match_market_to_fixture_case_insensitive():
    assert match_market_to_fixture("brazil vs argentina", "BRA", "ARG") is True


def test_match_market_to_fixture_no_match():
    assert match_market_to_fixture("Brazil vs France", "BRA", "ARG") is False


def test_match_market_to_fixture_alias():
    # Polymarket may say "South Korea vs England"
    assert match_market_to_fixture("South Korea vs England", "KOR", "ENG") is True
    assert match_market_to_fixture("Korea Republic vs England", "KOR", "ENG") is True


def test_match_market_to_fixture_usa_alias():
    assert match_market_to_fixture("United States vs Mexico", "USA", "MEX") is True


# ---------------------------------------------------------------------------
# _parse_polymarket_market
# ---------------------------------------------------------------------------

def test_parse_binary_yes_no():
    result = _parse_polymarket_market(["Yes", "No"], [0.70, 0.30], "BRA", "ARG")
    assert result is not None
    assert result["draw_raw"] is None
    assert result["draw_dev"] is None
    # home = Yes = 0.70, away = No = 0.30; de-vigged they stay 0.70 and 0.30
    assert abs(result["home_win_dev"] - 0.70) < 1e-9
    assert abs(result["away_win_dev"] - 0.30) < 1e-9


def test_parse_binary_yes_no_devigs():
    # Slight vig: 0.72 + 0.32 = 1.04
    result = _parse_polymarket_market(["Yes", "No"], [0.72, 0.32], "BRA", "ARG")
    assert result is not None
    total = result["home_win_dev"] + result["away_win_dev"]
    assert abs(total - 1.0) < 1e-9


def test_parse_three_way_with_draw():
    result = _parse_polymarket_market(
        ["Brazil", "Draw", "Argentina"],
        [0.50, 0.20, 0.30],
        "BRA", "ARG",
    )
    assert result is not None
    assert result["draw_raw"] == 0.20
    total = result["home_win_dev"] + result["draw_dev"] + result["away_win_dev"]
    assert abs(total - 1.0) < 1e-9


def test_parse_three_way_draw_at_different_positions():
    # Draw first
    result = _parse_polymarket_market(
        ["Draw", "Brazil", "Argentina"],
        [0.20, 0.50, 0.30],
        "BRA", "ARG",
    )
    assert result is not None
    assert result["draw_raw"] == 0.20


def test_parse_empty_returns_none():
    assert _parse_polymarket_market([], [], "BRA", "ARG") is None


def test_parse_mismatched_lengths_returns_none():
    assert _parse_polymarket_market(["Yes", "No"], [0.70], "BRA", "ARG") is None


# ---------------------------------------------------------------------------
# fetch_polymarket_odds (mocked HTTP)
# ---------------------------------------------------------------------------

def _make_http_get(response: object):
    """Return a fake http_get callable that returns `response`."""
    def _get(url: str, headers: dict | None = None) -> object:
        return response
    return _get


def test_fetch_polymarket_binary_market():
    fake_response = [
        {
            "title": "Brazil vs Argentina 2026",
            "markets": [
                {
                    "question": "Will Brazil beat Argentina?",
                    "outcomes": '["Yes", "No"]',
                    "outcomePrices": '["0.65", "0.35"]',
                }
            ],
        }
    ]
    result = fetch_polymarket_odds("BRA", "ARG", http_get=_make_http_get(fake_response))
    assert result is not None
    assert result["draw_raw"] is None
    assert abs(result["home_win_dev"] - 0.65) < 1e-9


def test_fetch_polymarket_three_way_market():
    fake_response = [
        {
            "title": "Brazil vs Argentina 2026",
            "markets": [
                {
                    "question": "Brazil vs Argentina: who wins?",
                    "outcomes": '["Brazil", "Draw", "Argentina"]',
                    "outcomePrices": '["0.55", "0.20", "0.25"]',
                }
            ],
        }
    ]
    result = fetch_polymarket_odds("BRA", "ARG", http_get=_make_http_get(fake_response))
    assert result is not None
    assert result["draw_raw"] == 0.20
    total = result["home_win_dev"] + result["draw_dev"] + result["away_win_dev"]
    assert abs(total - 1.0) < 1e-9


def test_fetch_polymarket_no_matching_market():
    fake_response = [
        {
            "title": "France vs Germany 2026",
            "markets": [
                {
                    "question": "Will France beat Germany?",
                    "outcomes": '["Yes", "No"]',
                    "outcomePrices": '["0.60", "0.40"]',
                }
            ],
        }
    ]
    # Searching for BRA vs ARG should not match a France vs Germany market.
    result = fetch_polymarket_odds("BRA", "ARG", http_get=_make_http_get(fake_response))
    assert result is None


def test_fetch_polymarket_empty_response():
    result = fetch_polymarket_odds("BRA", "ARG", http_get=_make_http_get([]))
    assert result is None


def test_fetch_polymarket_http_error():
    def _failing_get(url, headers=None):
        raise ConnectionError("network error")

    result = fetch_polymarket_odds("BRA", "ARG", http_get=_failing_get)
    assert result is None


def test_fetch_polymarket_response_with_events_key():
    # Some Polymarket endpoints wrap the list in {"events": [...]}
    fake_response = {
        "events": [
            {
                "title": "USA vs Mexico 2026",
                "markets": [
                    {
                        "question": "Will the United States beat Mexico?",
                        "outcomes": '["Yes", "No"]',
                        "outcomePrices": '["0.55", "0.45"]',
                    }
                ],
            }
        ]
    }
    result = fetch_polymarket_odds("USA", "MEX", http_get=_make_http_get(fake_response))
    assert result is not None
    assert abs(result["home_win_dev"] - 0.55) < 1e-9


# ---------------------------------------------------------------------------
# fetch_kalshi_odds (mocked HTTP)
# ---------------------------------------------------------------------------

def test_fetch_kalshi_skipped_without_api_key():
    called = []

    def _spy_get(url, headers=None):
        called.append(url)
        return {"markets": []}

    result = fetch_kalshi_odds("BRA", "ARG", api_key=None, http_get=_spy_get)
    assert result is None
    assert len(called) == 0  # should not make any HTTP call


def test_fetch_kalshi_parses_home_and_away_markets():
    fake_response = {
        "markets": [
            {
                "title": "Will Brazil win?",
                "yes_bid": 0.60,
                "yes_ask": 0.64,
            },
            {
                "title": "Will Argentina win?",
                "yes_bid": 0.28,
                "yes_ask": 0.32,
            },
        ]
    }
    result = fetch_kalshi_odds(
        "BRA", "ARG",
        api_key="fake-key",
        http_get=_make_http_get(fake_response),
    )
    assert result is not None
    # home mid = (0.60+0.64)/2 = 0.62, away mid = (0.28+0.32)/2 = 0.30
    total = result["home_win_dev"] + result["away_win_dev"]
    assert abs(total - 1.0) < 1e-9
    assert result["draw_raw"] is None


def test_fetch_kalshi_missing_away_market_returns_none():
    fake_response = {
        "markets": [
            {"title": "Will Brazil win?", "yes_bid": 0.60, "yes_ask": 0.64},
        ]
    }
    result = fetch_kalshi_odds(
        "BRA", "ARG",
        api_key="fake-key",
        http_get=_make_http_get(fake_response),
    )
    assert result is None


def test_fetch_kalshi_http_error_returns_none():
    def _failing_get(url, headers=None):
        raise ConnectionError("timeout")

    result = fetch_kalshi_odds(
        "BRA", "ARG",
        api_key="fake-key",
        http_get=_failing_get,
    )
    assert result is None
