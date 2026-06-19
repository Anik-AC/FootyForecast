"""
Tests for footy/ingest/scorers.py.

Network calls and DB connections are fully mocked.
"""

from unittest.mock import MagicMock, patch, call

import pytest

from footy.ingest.scorers import fetch_scorers, load_scorers


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_scorer(name: str, team: str, goals: int, assists: int | None = None) -> dict:
    return {
        "player": {"id": 1, "name": name},
        "team":   {"id": 2, "name": team},
        "goals":  goals,
        "assists": assists,
    }


def _make_http_response(scorers: list[dict], status_code: int = 200):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = {"scorers": scorers}
    if status_code >= 400:
        mock.raise_for_status.side_effect = Exception(f"HTTP {status_code}")
    else:
        mock.raise_for_status.return_value = None
    return mock


def _make_http_get(scorers: list[dict], status_code: int = 200):
    return MagicMock(return_value=_make_http_response(scorers, status_code))


def _make_conn():
    """Lightweight mock psycopg connection."""
    conn = MagicMock()
    cur = MagicMock()
    cur.__enter__ = MagicMock(return_value=cur)
    cur.__exit__ = MagicMock(return_value=False)
    conn.cursor.return_value = cur
    return conn


# ---------------------------------------------------------------------------
# fetch_scorers
# ---------------------------------------------------------------------------

class TestFetchScorers:
    def test_returns_scorers_list(self):
        data = [_make_scorer("Messi", "Argentina", 3)]
        http = _make_http_get(data)
        result = fetch_scorers("testkey", http_get=http)
        assert result == data

    def test_passes_api_key_in_header(self):
        http = _make_http_get([])
        fetch_scorers("mykey123", http_get=http)
        _, kwargs = http.call_args
        assert kwargs["headers"]["X-Auth-Token"] == "mykey123"

    def test_requests_season_2026(self):
        http = _make_http_get([])
        fetch_scorers("k", http_get=http)
        _, kwargs = http.call_args
        assert kwargs["params"]["season"] == 2026

    def test_requests_100_limit(self):
        http = _make_http_get([])
        fetch_scorers("k", http_get=http)
        _, kwargs = http.call_args
        assert kwargs["params"]["limit"] == 100

    def test_url_contains_scorers(self):
        http = _make_http_get([])
        fetch_scorers("k", http_get=http)
        args, _ = http.call_args
        assert "scorers" in args[0]

    def test_raises_on_403(self):
        mock = MagicMock()
        mock.status_code = 403
        http = MagicMock(return_value=mock)
        with pytest.raises(RuntimeError, match="403"):
            fetch_scorers("badkey", http_get=http)

    def test_raises_on_500(self):
        http = _make_http_get([], status_code=500)
        with pytest.raises(Exception):
            fetch_scorers("k", http_get=http)

    def test_returns_empty_list_when_no_scorers(self):
        http = _make_http_get([])
        result = fetch_scorers("k", http_get=http)
        assert result == []


# ---------------------------------------------------------------------------
# load_scorers
# ---------------------------------------------------------------------------

class TestLoadScorers:
    def test_upserts_known_team(self):
        conn = _make_conn()
        with patch("footy.ingest.scorers.resolve_team", return_value="ARG"):
            n = load_scorers([_make_scorer("Messi", "Argentina", 3, assists=1)], conn)
        assert n == 1
        conn.commit.assert_called_once()

    def test_upserts_multiple_players(self):
        conn = _make_conn()
        scorers = [
            _make_scorer("Messi", "Argentina", 3),
            _make_scorer("Alvarez", "Argentina", 1),
        ]
        with patch("footy.ingest.scorers.resolve_team", return_value="ARG"):
            n = load_scorers(scorers, conn)
        assert n == 2

    def test_skips_unknown_team(self):
        conn = _make_conn()
        with patch("footy.ingest.scorers.resolve_team", side_effect=KeyError("UnknownFC")):
            n = load_scorers([_make_scorer("Player X", "UnknownFC", 2)], conn)
        assert n == 0
        conn.commit.assert_called_once()  # still commits (empty batch)

    def test_skips_non_qualifier_team(self):
        conn = _make_conn()
        with patch("footy.ingest.scorers.resolve_team", return_value=None):
            n = load_scorers([_make_scorer("Player Y", "Gibraltar", 1)], conn)
        assert n == 0

    def test_skips_entry_without_player_name(self):
        conn = _make_conn()
        entry = {"player": {}, "team": {"name": "Argentina"}, "goals": 1, "assists": None}
        with patch("footy.ingest.scorers.resolve_team", return_value="ARG"):
            n = load_scorers([entry], conn)
        assert n == 0

    def test_skips_entry_without_team_name(self):
        conn = _make_conn()
        entry = {"player": {"name": "Messi"}, "team": {}, "goals": 1, "assists": None}
        n = load_scorers([entry], conn)
        assert n == 0

    def test_handles_none_assists(self):
        conn = _make_conn()
        with patch("footy.ingest.scorers.resolve_team", return_value="ARG"):
            n = load_scorers([_make_scorer("Messi", "Argentina", 3, assists=None)], conn)
        assert n == 1

    def test_handles_zero_goals(self):
        conn = _make_conn()
        with patch("footy.ingest.scorers.resolve_team", return_value="ARG"):
            n = load_scorers([_make_scorer("Defender", "Argentina", 0)], conn)
        # Goals=0 entries are still stored; filtering happens in player_predictions
        assert n == 1

    def test_commits_once(self):
        conn = _make_conn()
        with patch("footy.ingest.scorers.resolve_team", return_value="ARG"):
            load_scorers([_make_scorer("A", "X", 1), _make_scorer("B", "Y", 2)], conn)
        conn.commit.assert_called_once()

    def test_executes_insert_sql(self):
        conn = _make_conn()
        with patch("footy.ingest.scorers.resolve_team", return_value="ARG"):
            load_scorers([_make_scorer("Messi", "Argentina", 3)], conn)
        cur = conn.cursor.return_value.__enter__.return_value
        sql = cur.execute.call_args[0][0]
        assert "INSERT INTO player_tournament_stats" in sql
        assert "ON CONFLICT" in sql
