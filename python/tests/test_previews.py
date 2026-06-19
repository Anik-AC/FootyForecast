"""
Tests for footy/previews.py.

The OpenRouter HTTP call and psycopg connections are fully mocked so no
network calls or DB access is required.
"""

import datetime
import json
from unittest.mock import MagicMock, patch

import pytest

from footy.previews import (
    _build_user_message,
    call_openrouter,
    write_preview,
    generate_preview,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_http_post(response_text: str, status_code: int = 200):
    """Return a fake http_post callable that returns an OpenRouter-shaped response."""
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = {
        "choices": [{"message": {"content": f"  {response_text}  "}}]
    }
    if status_code >= 400:
        response.raise_for_status.side_effect = Exception(f"HTTP {status_code}")
    else:
        response.raise_for_status.return_value = None
    return MagicMock(return_value=response)


# ---------------------------------------------------------------------------
# _build_user_message
# ---------------------------------------------------------------------------

class TestBuildUserMessage:
    def test_includes_team_names(self):
        msg = _build_user_message("Brazil", "Argentina", None, None, [])
        assert "Brazil" in msg
        assert "Argentina" in msg

    def test_includes_kickoff_when_datetime(self):
        kickoff = datetime.datetime(2026, 6, 20, 18, 0, tzinfo=datetime.timezone.utc)
        msg = _build_user_message("Brazil", "Argentina", kickoff, None, [])
        assert "20 Jun 2026" in msg

    def test_includes_probabilities(self):
        pred = {"home_win_prob": 0.55, "draw_prob": 0.25, "away_win_prob": 0.20}
        msg = _build_user_message("Brazil", "Argentina", None, pred, [])
        assert "55.0%" in msg
        assert "25.0%" in msg
        assert "20.0%" in msg

    def test_no_probabilities_omits_model_line(self):
        msg = _build_user_message("Brazil", "Argentina", None, None, [])
        assert "Model probabilities" not in msg

    def test_includes_trivia_facts(self):
        facts = [{"text": "Brazil lead H2H 40W 20D 15L."}]
        msg = _build_user_message("Brazil", "Argentina", None, None, facts)
        assert "Brazil lead H2H" in msg

    def test_caps_at_5_facts(self):
        facts = [{"text": f"Fact {i}."} for i in range(10)]
        msg = _build_user_message("Brazil", "Argentina", None, None, facts)
        assert msg.count("Fact") == 5

    def test_no_trivia_omits_context_section(self):
        msg = _build_user_message("Brazil", "Argentina", None, None, [])
        assert "Key statistical context" not in msg


# ---------------------------------------------------------------------------
# call_openrouter
# ---------------------------------------------------------------------------

class TestCallOpenrouter:
    def test_returns_stripped_text(self):
        http_post = _make_http_post("Brazil are favourites.")
        result = call_openrouter("prompt", api_key="test-key", http_post=http_post)
        assert result == "Brazil are favourites."

    def test_posts_to_openrouter_url(self):
        http_post = _make_http_post("preview")
        call_openrouter("prompt", api_key="test-key", http_post=http_post)
        url = http_post.call_args[0][0]
        assert "openrouter.ai" in url

    def test_sends_bearer_token(self):
        http_post = _make_http_post("preview")
        call_openrouter("prompt", api_key="sk-test-123", http_post=http_post)
        headers = http_post.call_args.kwargs["headers"]
        assert headers["Authorization"] == "Bearer sk-test-123"

    def test_sends_correct_model(self):
        http_post = _make_http_post("preview")
        call_openrouter("prompt", model="google/gemma-2-9b-it:free",
                        api_key="test-key", http_post=http_post)
        payload = http_post.call_args.kwargs["json"]
        assert payload["model"] == "google/gemma-2-9b-it:free"

    def test_sends_system_and_user_messages(self):
        http_post = _make_http_post("preview")
        call_openrouter("my prompt", api_key="test-key", http_post=http_post)
        messages = http_post.call_args.kwargs["json"]["messages"]
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "my prompt"

    def test_max_tokens_set(self):
        http_post = _make_http_post("preview")
        call_openrouter("prompt", api_key="test-key", http_post=http_post)
        payload = http_post.call_args.kwargs["json"]
        assert payload["max_tokens"] == 256

    def test_raises_without_api_key(self):
        import os
        env_backup = os.environ.pop("OPENROUTER_API_KEY", None)
        try:
            with pytest.raises(ValueError, match="OPENROUTER_API_KEY"):
                call_openrouter("prompt", api_key=None,
                                http_post=_make_http_post("x"))
        finally:
            if env_backup is not None:
                os.environ["OPENROUTER_API_KEY"] = env_backup

    def test_reads_api_key_from_env(self):
        import os
        http_post = _make_http_post("preview")
        os.environ["OPENROUTER_API_KEY"] = "env-key"
        try:
            call_openrouter("prompt", api_key=None, http_post=http_post)
        finally:
            del os.environ["OPENROUTER_API_KEY"]
        headers = http_post.call_args.kwargs["headers"]
        assert "env-key" in headers["Authorization"]

    def test_http_error_propagates(self):
        http_post = _make_http_post("error", status_code=429)
        with pytest.raises(Exception):
            call_openrouter("prompt", api_key="test-key", http_post=http_post)


# ---------------------------------------------------------------------------
# write_preview
# ---------------------------------------------------------------------------

class TestWritePreview:
    def test_upsert_called_with_correct_args(self):
        conn = MagicMock()
        ctx = MagicMock()
        conn.cursor.return_value.__enter__.return_value = ctx

        write_preview("WC2026-GRP-A-01", "Great match.", "llama-3.1", conn)

        ctx.execute.assert_called_once()
        sql, params = ctx.execute.call_args[0]
        assert "INSERT INTO match_previews" in sql
        assert params[0] == "WC2026-GRP-A-01"
        assert params[1] == "Great match."
        assert params[2] == "llama-3.1"

    def test_on_conflict_update_in_sql(self):
        conn = MagicMock()
        ctx = MagicMock()
        conn.cursor.return_value.__enter__.return_value = ctx

        write_preview("X", "text", "model", conn)
        sql = ctx.execute.call_args[0][0]
        assert "ON CONFLICT" in sql
        assert "DO UPDATE" in sql


# ---------------------------------------------------------------------------
# generate_preview (integration of all pieces, all DB calls mocked)
# ---------------------------------------------------------------------------

class TestGeneratePreview:
    def _make_conn(self, fixture=None, trivia=None, prediction=None):
        conn = MagicMock()
        call_count = [0]
        responses = [fixture, trivia, prediction]
        ctx = MagicMock()
        conn.cursor.return_value.__enter__.return_value = ctx

        def fetchone_side():
            idx = call_count[0]
            call_count[0] += 1
            if idx < len(responses):
                return responses[idx]
            return None

        ctx.fetchone.side_effect = fetchone_side
        return conn

    def _fixture_row(self):
        return {
            "id": "WC2026-GRP-A-01",
            "kickoff_utc": datetime.datetime(2026, 6, 20, 18, 0),
            "home_team_id": "BRA",
            "away_team_id": "ARG",
            "home_name": "Brazil",
            "away_name": "Argentina",
            "stage": "group",
        }

    def test_returns_none_for_unknown_fixture(self):
        conn = self._make_conn(fixture=None)
        result = generate_preview("NO-SUCH-ID", conn,
                                  api_key="k",
                                  http_post=_make_http_post("x"))
        assert result is None

    def test_returns_preview_text(self):
        trivia_row = {"facts": [{"template": "head_to_head", "text": "BRA lead H2H."}]}
        pred_row = {"home_win_prob": 0.5, "draw_prob": 0.25, "away_win_prob": 0.25,
                    "model_version": "v1"}
        conn = self._make_conn(fixture=self._fixture_row(),
                               trivia=trivia_row, prediction=pred_row)
        http_post = _make_http_post("Brazil are heavy favourites.")

        result = generate_preview("WC2026-GRP-A-01", conn,
                                  api_key="k", http_post=http_post)
        assert result == "Brazil are heavy favourites."

    def test_write_preview_called(self):
        conn = self._make_conn(fixture=self._fixture_row(),
                               trivia=None, prediction=None)
        http_post = _make_http_post("Some preview.")

        with patch("footy.previews.write_preview") as mock_write:
            generate_preview("WC2026-GRP-A-01", conn,
                             api_key="k", http_post=http_post)
            mock_write.assert_called_once()
            args = mock_write.call_args[0]
            assert args[0] == "WC2026-GRP-A-01"
            assert args[1] == "Some preview."

    def test_works_with_no_trivia_or_prediction(self):
        conn = self._make_conn(fixture=self._fixture_row(),
                               trivia=None, prediction=None)
        http_post = _make_http_post("Minimal preview.")

        result = generate_preview("WC2026-GRP-A-01", conn,
                                  api_key="k", http_post=http_post)
        assert result == "Minimal preview."
        http_post.assert_called_once()

    def test_trivia_string_json_is_parsed(self):
        facts = [{"template": "form_home", "text": "Brazil are in form."}]
        trivia_row = {"facts": json.dumps(facts)}
        conn = self._make_conn(fixture=self._fixture_row(),
                               trivia=trivia_row, prediction=None)
        http_post = _make_http_post("Preview with trivia.")

        generate_preview("WC2026-GRP-A-01", conn,
                         api_key="k", http_post=http_post)
        payload = http_post.call_args.kwargs["json"]
        user_msg = payload["messages"][1]["content"]
        assert "Brazil are in form." in user_msg
