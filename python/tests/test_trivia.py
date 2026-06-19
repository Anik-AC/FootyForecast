"""
Tests for footy/trivia.py.

All template functions are pure (they take pre-fetched rows), so they can
be tested without any DB connection. DB-touching functions are tested with
a lightweight mock connection.
"""

import datetime
import json
from unittest.mock import MagicMock, call

import pytest

from footy.trivia import (
    _names_for,
    _result_for,
    _scored,
    _conceded,
    head_to_head_fact,
    h2h_recent_fact,
    form_fact,
    unbeaten_streak_fact,
    scoring_streak_fact,
    generate_facts,
    write_trivia,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def row(date, home, away, hs, as_):
    return {
        "match_date": date if isinstance(date, datetime.date) else datetime.date.fromisoformat(date),
        "home_team": home,
        "away_team": away,
        "home_score": hs,
        "away_score": as_,
    }


# ---------------------------------------------------------------------------
# _names_for
# ---------------------------------------------------------------------------

class TestNamesFor:
    def test_usa_resolves_to_multiple_spellings(self):
        names = _names_for("USA")
        assert "United States" in names or "USA" in names

    def test_unknown_code_returns_empty(self):
        names = _names_for("ZZZ")
        assert names == []

    def test_brazil_code(self):
        names = _names_for("BRA")
        assert any("Brazil" in n or "Brasil" in n for n in names)


# ---------------------------------------------------------------------------
# _result_for
# ---------------------------------------------------------------------------

class TestResultFor:
    HOME = ["England", "ENG"]
    AWAY = ["Germany", "GER"]

    def test_home_win(self):
        r = row("2020-01-01", "England", "Germany", 2, 0)
        assert _result_for(r, self.HOME) == "W"

    def test_away_win_from_home_perspective(self):
        r = row("2020-01-01", "England", "Germany", 0, 1)
        assert _result_for(r, self.HOME) == "L"

    def test_draw(self):
        r = row("2020-01-01", "England", "Germany", 1, 1)
        assert _result_for(r, self.HOME) == "D"

    def test_when_team_is_away_side(self):
        r = row("2020-01-01", "Germany", "England", 0, 2)
        assert _result_for(r, self.HOME) == "W"

    def test_loss_as_away(self):
        r = row("2020-01-01", "Germany", "England", 3, 0)
        assert _result_for(r, self.HOME) == "L"


# ---------------------------------------------------------------------------
# _scored
# ---------------------------------------------------------------------------

class TestScored:
    TEAM = ["France"]

    def test_scored_as_home(self):
        r = row("2020-01-01", "France", "Spain", 2, 0)
        assert _scored(r, self.TEAM) is True

    def test_did_not_score_as_home(self):
        r = row("2020-01-01", "France", "Spain", 0, 1)
        assert _scored(r, self.TEAM) is False

    def test_scored_as_away(self):
        r = row("2020-01-01", "Spain", "France", 0, 1)
        assert _scored(r, self.TEAM) is True

    def test_did_not_score_as_away(self):
        r = row("2020-01-01", "Spain", "France", 1, 0)
        assert _scored(r, self.TEAM) is False


# ---------------------------------------------------------------------------
# head_to_head_fact
# ---------------------------------------------------------------------------

class TestHeadToHeadFact:
    HOME_NAMES = ["Brazil"]
    AWAY_NAMES = ["Argentina"]

    def _call(self, rows):
        return head_to_head_fact(
            rows, "BRA", "ARG", self.HOME_NAMES, self.AWAY_NAMES, "Brazil", "Argentina"
        )

    def test_no_history_produces_first_meeting_text(self):
        fact = self._call([])
        assert fact is not None
        assert fact["template"] == "head_to_head"
        assert "never met" in fact["text"]
        assert fact["data"]["total"] == 0

    def test_home_leader(self):
        rows = [
            row("2020-01-01", "Brazil", "Argentina", 2, 0),
            row("2019-01-01", "Brazil", "Argentina", 1, 0),
            row("2018-01-01", "Argentina", "Brazil", 1, 2),
        ]
        fact = self._call(rows)
        assert "Brazil" in fact["text"]
        assert fact["data"]["home_wins"] == 3
        assert fact["data"]["draws"] == 0
        assert fact["data"]["away_wins"] == 0

    def test_away_leader(self):
        rows = [
            row("2020-01-01", "Argentina", "Brazil", 2, 0),
            row("2019-01-01", "Brazil", "Argentina", 0, 1),
        ]
        fact = self._call(rows)
        assert "Argentina" in fact["text"]
        assert fact["data"]["home_wins"] == 0
        assert fact["data"]["away_wins"] == 2

    def test_level_record(self):
        rows = [
            row("2020-01-01", "Brazil", "Argentina", 2, 0),
            row("2019-01-01", "Argentina", "Brazil", 2, 0),
        ]
        fact = self._call(rows)
        assert "level" in fact["text"].lower() or "are level" in fact["text"]
        assert fact["data"]["home_wins"] == 1
        assert fact["data"]["away_wins"] == 1

    def test_goals_counted_correctly_reversed_fixture(self):
        # Argentina (away) hosting Brazil (home in our sense) — reversed fixture
        rows = [row("2020-01-01", "Argentina", "Brazil", 1, 3)]
        fact = self._call(rows)
        assert fact["data"]["home_goals"] == 3  # Brazil's goals
        assert fact["data"]["away_goals"] == 1  # Argentina's goals

    def test_draw_counted(self):
        rows = [row("2020-01-01", "Brazil", "Argentina", 1, 1)]
        fact = self._call(rows)
        assert fact["data"]["draws"] == 1


# ---------------------------------------------------------------------------
# h2h_recent_fact
# ---------------------------------------------------------------------------

class TestH2hRecentFact:
    HOME_NAMES = ["England"]

    def _call(self, rows, n=5):
        return h2h_recent_fact(rows, self.HOME_NAMES, "England", "Germany", n=n)

    def test_no_rows_returns_none(self):
        assert self._call([]) is None

    def test_single_meeting(self):
        rows = [row("2021-06-29", "England", "Germany", 2, 0)]
        fact = self._call(rows)
        assert fact is not None
        assert "1W" in fact["text"] or "1" in fact["text"]
        assert "Jun 2021" in fact["text"]

    def test_sequence_in_data(self):
        rows = [
            row("2023-01-01", "England", "Germany", 1, 0),
            row("2022-01-01", "Germany", "England", 2, 2),
            row("2021-01-01", "England", "Germany", 0, 1),
        ]
        fact = self._call(rows)
        assert fact["data"]["results"] == ["W", "D", "L"]

    def test_n_limit(self):
        rows = [row(f"202{i}-01-01", "England", "Germany", i, 0) for i in range(1, 8)]
        fact = self._call(rows, n=3)
        assert fact["data"]["n"] == 3

    def test_draw_winner_text(self):
        rows = [row("2022-01-01", "England", "Germany", 1, 1)]
        fact = self._call(rows)
        assert "Draw" in fact["text"]


# ---------------------------------------------------------------------------
# form_fact
# ---------------------------------------------------------------------------

class TestFormFact:
    NAMES = ["Spain"]

    def test_no_rows_returns_none(self):
        assert form_fact([], self.NAMES, "Spain", "home") is None

    def test_outstanding_form_4_wins(self):
        rows = [
            row("2023-04-01", "Spain", "Portugal", 2, 0),
            row("2023-03-01", "Spain", "France", 1, 0),
            row("2023-02-01", "Germany", "Spain", 0, 2),
            row("2023-01-01", "Spain", "Italy", 3, 1),
            row("2022-12-01", "Spain", "Brazil", 0, 1),
        ]
        fact = form_fact(rows, self.NAMES, "Spain", "home")
        assert "outstanding" in fact["text"]

    def test_struggling_form(self):
        rows = [
            row("2023-04-01", "Spain", "Portugal", 0, 2),
            row("2023-03-01", "Spain", "France", 0, 1),
            row("2023-02-01", "Germany", "Spain", 2, 0),
            row("2023-01-01", "Spain", "Italy", 0, 1),
            row("2022-12-01", "Spain", "Brazil", 1, 0),
        ]
        fact = form_fact(rows, self.NAMES, "Spain", "home")
        assert "struggling" in fact["text"]

    def test_sequence_string(self):
        rows = [
            row("2023-04-01", "Spain", "Portugal", 1, 0),
            row("2023-03-01", "Spain", "France", 1, 1),
            row("2023-02-01", "Germany", "Spain", 2, 0),
        ]
        fact = form_fact(rows, self.NAMES, "Spain", "home")
        assert fact["data"]["sequence"] == "WDL"

    def test_role_prefix_in_template(self):
        rows = [row("2023-01-01", "Spain", "France", 1, 0)]
        fact = form_fact(rows, self.NAMES, "Spain", "away")
        assert fact["template"] == "form_away"


# ---------------------------------------------------------------------------
# unbeaten_streak_fact
# ---------------------------------------------------------------------------

class TestUnbeatenStreakFact:
    NAMES = ["Italy"]

    def test_no_rows_returns_none(self):
        assert unbeaten_streak_fact([], self.NAMES, "Italy", "home") is None

    def test_short_streak_returns_none(self):
        rows = [
            row("2023-01-01", "Italy", "France", 1, 0),
            row("2022-12-01", "Italy", "Spain", 1, 1),
        ]
        assert unbeaten_streak_fact(rows, self.NAMES, "Italy", "home") is None

    def test_loss_breaks_streak(self):
        rows = [
            row("2023-04-01", "Italy", "France", 1, 0),
            row("2023-03-01", "Italy", "Spain", 1, 1),
            row("2023-02-01", "Germany", "Italy", 1, 0),  # L for Italy
            row("2023-01-01", "Italy", "Brazil", 2, 0),
        ]
        assert unbeaten_streak_fact(rows, self.NAMES, "Italy", "home") is None

    def test_streak_of_5_reported(self):
        rows = [
            row(f"2023-0{i}-01", "Italy", "France", 1, 0) for i in range(1, 6)
        ]
        fact = unbeaten_streak_fact(rows, self.NAMES, "Italy", "home")
        assert fact is not None
        assert fact["data"]["streak"] == 5
        assert "5-match" in fact["text"]

    def test_draws_count_as_unbeaten(self):
        rows = [
            row("2023-03-01", "Italy", "France", 0, 0),
            row("2023-02-01", "Italy", "Spain", 0, 0),
            row("2023-01-01", "Italy", "Germany", 0, 0),
        ]
        fact = unbeaten_streak_fact(rows, self.NAMES, "Italy", "home")
        assert fact is not None
        assert fact["data"]["streak"] == 3


# ---------------------------------------------------------------------------
# scoring_streak_fact
# ---------------------------------------------------------------------------

class TestScoringStreakFact:
    NAMES = ["Portugal"]

    def test_no_rows_returns_none(self):
        assert scoring_streak_fact([], self.NAMES, "Portugal", "away") is None

    def test_short_streak_returns_none(self):
        rows = [
            row("2023-01-01", "Portugal", "Spain", 1, 0),
            row("2022-12-01", "Portugal", "France", 1, 1),
        ]
        assert scoring_streak_fact(rows, self.NAMES, "Portugal", "away") is None

    def test_blank_breaks_streak(self):
        rows = [
            row("2023-03-01", "Portugal", "Spain", 1, 0),
            row("2023-02-01", "Portugal", "France", 0, 0),  # didn't score
            row("2023-01-01", "Portugal", "Germany", 2, 1),
            row("2022-12-01", "Portugal", "Italy", 3, 0),
        ]
        assert scoring_streak_fact(rows, self.NAMES, "Portugal", "away") is None

    def test_streak_of_4_reported(self):
        rows = [
            row("2023-04-01", "Spain", "Portugal", 0, 2),
            row("2023-03-01", "Portugal", "France", 1, 0),
            row("2023-02-01", "Portugal", "Germany", 3, 1),
            row("2023-01-01", "Portugal", "Italy", 1, 0),
        ]
        fact = scoring_streak_fact(rows, self.NAMES, "Portugal", "away")
        assert fact is not None
        assert fact["data"]["streak"] == 4


# ---------------------------------------------------------------------------
# write_trivia (mocked DB)
# ---------------------------------------------------------------------------

class TestWriteTrivia:
    def test_upsert_called_with_correct_args(self):
        conn = MagicMock()
        ctx = MagicMock()
        conn.cursor.return_value.__enter__.return_value = ctx

        facts = [{"template": "head_to_head", "text": "X", "data": {}}]
        write_trivia("WC2026-GRP-A-01", facts, conn)

        ctx.execute.assert_called_once()
        call_args = ctx.execute.call_args[0]
        assert "INSERT INTO match_trivia" in call_args[0]
        assert call_args[1][0] == "WC2026-GRP-A-01"
        assert json.loads(call_args[1][1]) == facts

    def test_empty_facts_list_still_upserts(self):
        conn = MagicMock()
        ctx = MagicMock()
        conn.cursor.return_value.__enter__.return_value = ctx

        write_trivia("WC2026-GRP-B-01", [], conn)
        ctx.execute.assert_called_once()


# ---------------------------------------------------------------------------
# generate_facts (mocked DB)
# ---------------------------------------------------------------------------

class TestGenerateFacts:
    """
    generate_facts calls _fetch_h2h and _fetch_recent internally.
    Patch at the module level so we control what the DB returns.
    """

    def _make_conn(self, h2h_rows, home_rows, away_rows):
        """Build a mock psycopg connection returning given row sets in order."""
        conn = MagicMock()

        call_count = [0]
        rows_sequence = [h2h_rows, home_rows, away_rows]

        ctx = MagicMock()
        conn.cursor.return_value.__enter__.return_value = ctx

        def fetchall_side_effect():
            idx = call_count[0]
            call_count[0] += 1
            if idx < len(rows_sequence):
                return rows_sequence[idx]
            return []

        ctx.fetchall.side_effect = fetchall_side_effect
        return conn

    def test_no_history_returns_first_meeting_fact(self):
        conn = self._make_conn([], [], [])
        facts = generate_facts("BRA", "ARG", datetime.date(2026, 6, 20), conn,
                               home_display="Brazil", away_display="Argentina")
        templates = {f["template"] for f in facts}
        assert "head_to_head" in templates
        assert any("never met" in f["text"] for f in facts)

    def test_only_nonnone_facts_included(self):
        rows_home = [row("2023-01-01", "Brazil", "France", 1, 0)]
        rows_away = [row("2023-01-01", "Argentina", "Spain", 1, 0)]
        conn = self._make_conn([], rows_home, rows_away)

        facts = generate_facts("BRA", "ARG", datetime.date(2026, 6, 20), conn,
                               home_display="Brazil", away_display="Argentina")
        # form facts should appear (1 row each), streaks should be None (too short)
        templates = [f["template"] for f in facts]
        assert "form_home" in templates
        assert "form_away" in templates
        assert "unbeaten_streak_home" not in templates
        assert "scoring_streak_home" not in templates

    def test_full_h2h_generates_two_h2h_facts(self):
        h2h = [
            row("2023-01-01", "Brazil", "Argentina", 2, 1),
            row("2022-01-01", "Argentina", "Brazil", 1, 0),
        ]
        conn = self._make_conn(h2h, [], [])

        facts = generate_facts("BRA", "ARG", datetime.date(2026, 6, 20), conn,
                               home_display="Brazil", away_display="Argentina")
        templates = [f["template"] for f in facts]
        assert "head_to_head" in templates
        assert "h2h_recent" in templates
