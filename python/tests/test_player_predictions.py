"""
Tests for footy/player_predictions.py.

The pure compute_team_probabilities function is tested exhaustively.
DB-touching functions are tested with mock connections.
"""

import math
from unittest.mock import MagicMock, call

import pytest

from footy.player_predictions import (
    compute_team_probabilities,
    generate_predictions,
    generate_all,
    _MIN_GOALS,
    _MIN_XG,
    _MAX_PLAYERS_PER_TEAM,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _player(name: str, goals: int) -> dict:
    return {"player_name": name, "goals": goals}


def _make_conn(fixture_row=None, home_players=None, away_players=None):
    """
    Build a mock psycopg connection whose cursors return rows in a fixed sequence:
      1st fetchone  -> fixture_row  (the match_predictions JOIN query)
      subsequent fetchall calls -> home_players, then away_players
    """
    conn = MagicMock()
    fetchone_responses = [fixture_row]
    fetchall_responses = []
    if home_players is not None:
        fetchall_responses.append(home_players)
    if away_players is not None:
        fetchall_responses.append(away_players)

    fetchone_iter = iter(fetchone_responses)
    fetchall_iter = iter(fetchall_responses)

    def make_cursor(*args, **kwargs):
        cur = MagicMock()
        cur.__enter__ = MagicMock(return_value=cur)
        cur.__exit__ = MagicMock(return_value=False)
        cur.fetchone.side_effect = lambda: next(fetchone_iter, None)
        cur.fetchall.side_effect = lambda: next(fetchall_iter, [])
        return cur

    conn.cursor.side_effect = make_cursor
    return conn


# ---------------------------------------------------------------------------
# compute_team_probabilities (pure)
# ---------------------------------------------------------------------------

class TestComputeTeamProbabilities:
    def test_single_player_gets_full_share(self):
        players = [_player("Messi", 3)]
        result = compute_team_probabilities(players, team_total_goals=3, team_xg=1.5)
        assert len(result) == 1
        prob = result[0]["anytime_scorer_prob"]
        expected = 1.0 - math.exp(-1.5)
        assert abs(prob - expected) < 1e-5

    def test_two_players_share_proportionally(self):
        players = [_player("A", 2), _player("B", 1)]
        result = compute_team_probabilities(players, team_total_goals=3, team_xg=2.0)
        prob_a = result[0]["anytime_scorer_prob"]
        prob_b = result[1]["anytime_scorer_prob"]
        # A has 2/3 share, B has 1/3 share
        assert abs(prob_a - (1.0 - math.exp(-2.0 * 2 / 3))) < 1e-5
        assert abs(prob_b - (1.0 - math.exp(-2.0 * 1 / 3))) < 1e-5

    def test_sorted_by_probability_descending(self):
        players = [_player("Low", 1), _player("High", 5)]
        result = compute_team_probabilities(players, team_total_goals=6, team_xg=2.0)
        assert result[0]["player_name"] == "High"
        assert result[1]["player_name"] == "Low"

    def test_returns_empty_when_total_goals_zero(self):
        result = compute_team_probabilities([], team_total_goals=0, team_xg=1.5)
        assert result == []

    def test_returns_empty_when_xg_below_minimum(self):
        players = [_player("Messi", 3)]
        result = compute_team_probabilities(players, team_total_goals=3, team_xg=0.0)
        assert result == []

    def test_respects_max_players_limit(self):
        players = [_player(f"Player{i}", 1) for i in range(20)]
        result = compute_team_probabilities(players, team_total_goals=20, team_xg=2.0)
        assert len(result) == _MAX_PLAYERS_PER_TEAM

    def test_probability_between_zero_and_one(self):
        players = [_player("Haaland", 5), _player("Odo", 2)]
        result = compute_team_probabilities(players, team_total_goals=7, team_xg=3.0)
        for r in result:
            assert 0.0 <= r["anytime_scorer_prob"] <= 1.0

    def test_higher_xg_gives_higher_probability(self):
        players = [_player("Messi", 3)]
        low = compute_team_probabilities(players, 3, team_xg=0.5)
        high = compute_team_probabilities(players, 3, team_xg=2.0)
        assert high[0]["anytime_scorer_prob"] > low[0]["anytime_scorer_prob"]

    def test_result_includes_required_keys(self):
        players = [_player("Kane", 2)]
        result = compute_team_probabilities(players, 2, 1.5)
        assert "player_name" in result[0]
        assert "goals" in result[0]
        assert "anytime_scorer_prob" in result[0]

    def test_goals_preserved_in_result(self):
        players = [_player("Mbappe", 4)]
        result = compute_team_probabilities(players, 4, 1.5)
        assert result[0]["goals"] == 4

    def test_xg_at_min_threshold_is_accepted(self):
        players = [_player("X", 1)]
        result = compute_team_probabilities(players, 1, team_xg=_MIN_XG)
        assert len(result) == 1

    def test_xg_just_below_min_threshold_is_rejected(self):
        players = [_player("X", 1)]
        result = compute_team_probabilities(players, 1, team_xg=_MIN_XG - 0.001)
        assert result == []


# ---------------------------------------------------------------------------
# generate_predictions (DB-touching)
# ---------------------------------------------------------------------------

class TestGeneratePredictions:
    def _fixture_row(self, home_xg=1.5, away_xg=1.0):
        return {
            "home_team_id": "ARG",
            "away_team_id": "FRA",
            "home_xg": home_xg,
            "away_xg": away_xg,
        }

    def test_returns_zero_when_fixture_not_found(self):
        conn = _make_conn(fixture_row=None)
        n = generate_predictions("UNKNOWN-FIXTURE", conn)
        assert n == 0

    def test_returns_zero_when_xg_is_none(self):
        row = {"home_team_id": "ARG", "away_team_id": "FRA", "home_xg": None, "away_xg": None}
        conn = _make_conn(fixture_row=row)
        n = generate_predictions("F1", conn)
        assert n == 0

    def test_returns_zero_when_no_scorers_for_either_team(self):
        conn = _make_conn(
            fixture_row=self._fixture_row(),
            home_players=[],
            away_players=[],
        )
        n = generate_predictions("F1", conn)
        assert n == 0

    def test_generates_predictions_for_scoring_players(self):
        home_players = [_player("Messi", 3), _player("Alvarez", 1)]
        away_players = [_player("Mbappe", 2)]
        conn = _make_conn(
            fixture_row=self._fixture_row(),
            home_players=home_players,
            away_players=away_players,
        )
        n = generate_predictions("F1", conn)
        assert n == 3  # 2 home + 1 away

    def test_writes_one_prediction_for_one_scorer(self):
        home_players = [_player("Messi", 3)]
        conn = _make_conn(
            fixture_row=self._fixture_row(),
            home_players=home_players,
            away_players=[],
        )
        n = generate_predictions("F1", conn)
        assert n == 1

    def test_skips_home_team_when_no_players(self):
        conn = _make_conn(
            fixture_row=self._fixture_row(),
            home_players=[],
            away_players=[_player("Mbappe", 2)],
        )
        n = generate_predictions("F1", conn)
        assert n == 1


# ---------------------------------------------------------------------------
# generate_all (DB-touching)
# ---------------------------------------------------------------------------

class TestGenerateAll:
    def test_returns_total_count(self):
        # generate_all uses a different cursor pattern for the fixture ID query
        conn = MagicMock()

        # First cursor call: SELECT DISTINCT f.id → returns two fixture IDs
        ids_cur = MagicMock()
        ids_cur.__enter__ = MagicMock(return_value=ids_cur)
        ids_cur.__exit__ = MagicMock(return_value=False)
        ids_cur.fetchall.return_value = [{"id": "F1"}, {"id": "F2"}]

        # Subsequent cursor calls: return nothing (so generate_predictions returns 0)
        empty_cur = MagicMock()
        empty_cur.__enter__ = MagicMock(return_value=empty_cur)
        empty_cur.__exit__ = MagicMock(return_value=False)
        empty_cur.fetchone.return_value = None
        empty_cur.fetchall.return_value = []

        conn.cursor.side_effect = [ids_cur, empty_cur, empty_cur, empty_cur, empty_cur]

        n = generate_all(conn)
        conn.commit.assert_called_once()
        assert isinstance(n, int)

    def test_commits_at_end(self):
        conn = MagicMock()
        cur = MagicMock()
        cur.__enter__ = MagicMock(return_value=cur)
        cur.__exit__ = MagicMock(return_value=False)
        cur.fetchall.return_value = []
        cur.fetchone.return_value = None
        conn.cursor.return_value = cur
        generate_all(conn)
        conn.commit.assert_called_once()

    def test_rolls_back_on_exception_and_continues(self):
        conn = MagicMock()
        ids_cur = MagicMock()
        ids_cur.__enter__ = MagicMock(return_value=ids_cur)
        ids_cur.__exit__ = MagicMock(return_value=False)
        ids_cur.fetchall.return_value = [{"id": "F1"}, {"id": "F2"}]

        fail_cur = MagicMock()
        fail_cur.__enter__ = MagicMock(return_value=fail_cur)
        fail_cur.__exit__ = MagicMock(return_value=False)
        fail_cur.fetchone.side_effect = Exception("db error")
        fail_cur.fetchall.return_value = []

        conn.cursor.side_effect = [ids_cur] + [fail_cur] * 10

        # Should not raise; should rollback
        n = generate_all(conn)
        conn.rollback.assert_called()
        conn.commit.assert_called_once()
