"""
LLM match preview generator.

Pulls pre-generated trivia facts and model probabilities for a fixture, feeds
them to an LLM via OpenRouter and writes the resulting 2-3 sentence preview
to match_previews.

OpenRouter exposes an OpenAI-compatible chat completions API with many free
models. Sign up at https://openrouter.ai to get a free API key.

Usage (from python/ directory):
    uv run python -m footy.previews WC2026-GRP-A-01

All data fed to the LLM is point-in-time safe: trivia facts carry a before-kickoff
cutoff and model probabilities are generated before kickoff.

Environment variables:
    OPENROUTER_API_KEY   Required. Get one free at https://openrouter.ai
    DATABASE_URL         Required. Postgres connection string.
"""

from __future__ import annotations

import datetime
import json
import logging
import os
import sys
from typing import Any, Callable

import psycopg
import psycopg.rows
import requests

logger = logging.getLogger(__name__)

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Default model: OpenAI's open-source 120B — best quality on the free tier
# for short factual text generation. To find the exact slug for any model,
# click it on https://openrouter.ai/models?q=free and copy from the API example.
# Good alternatives if this changes:
#   "google/gemma-4-31b-it:free"          (Google, reliable instruction-following)
#   "nvidia/nemotron-3-super:free"         (NVIDIA, strong reasoning)
#   "meta-llama/llama-3.1-8b-instruct:free" (smaller, faster)
_DEFAULT_MODEL = "openai/gpt-oss-120b:free"

_SYSTEM_PROMPT = (
    "You are a concise football analyst writing short, factual pre-match previews "
    "for the FIFA World Cup 2026. Write exactly 2-3 sentences. "
    "Use the provided statistics and probabilities. "
    "Do not speculate beyond the data. "
    "Do not add a title or header. "
    "Do not use bullet points or lists."
)

# Injectable HTTP callable (same pattern as markets.py) so tests can mock it.
def _default_http_post(url: str, **kwargs: Any) -> requests.Response:
    return requests.post(url, timeout=30, **kwargs)


# ---------------------------------------------------------------------------
# Data loading from DB
# ---------------------------------------------------------------------------

def _load_fixture(fixture_id: str, conn: psycopg.Connection) -> dict | None:
    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute("""
            SELECT f.id, f.kickoff_utc, f.home_team_id, f.away_team_id,
                   ht.name AS home_name, awt.name AS away_name,
                   f.stage
            FROM fixtures f
            JOIN teams ht  ON ht.id = f.home_team_id
            JOIN teams awt ON awt.id = f.away_team_id
            WHERE f.id = %s
        """, (fixture_id,))
        return cur.fetchone()


def _load_trivia(fixture_id: str, conn: psycopg.Connection) -> list[dict]:
    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute(
            "SELECT facts FROM match_trivia WHERE fixture_id = %s",
            (fixture_id,),
        )
        row = cur.fetchone()
    if row is None:
        return []
    facts = row["facts"]
    if isinstance(facts, str):
        facts = json.loads(facts)
    return facts


def _load_prediction(fixture_id: str, conn: psycopg.Connection) -> dict | None:
    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute("""
            SELECT home_win_prob, draw_prob, away_win_prob, model_version
            FROM match_predictions
            WHERE fixture_id = %s
            ORDER BY computed_at DESC
            LIMIT 1
        """, (fixture_id,))
        return cur.fetchone()


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

def _build_user_message(
    home: str,
    away: str,
    kickoff: Any,
    prediction: dict | None,
    trivia_facts: list[dict],
) -> str:
    lines: list[str] = [f"Match: {home} vs {away}"]

    if kickoff and hasattr(kickoff, "strftime"):
        lines.append(f"Kickoff: {kickoff.strftime('%d %b %Y %H:%M UTC')}")

    if prediction:
        hw = round(prediction["home_win_prob"] * 100, 1)
        d = round(prediction["draw_prob"] * 100, 1)
        aw = round(prediction["away_win_prob"] * 100, 1)
        lines.append(f"Model probabilities: {home} win {hw}%, Draw {d}%, {away} win {aw}%")

    if trivia_facts:
        lines.append("\nKey statistical context:")
        for fact in trivia_facts[:5]:
            lines.append(f"- {fact['text']}")

    lines.append(
        "\nWrite a 2-3 sentence match preview based on the above. "
        "Be concise and factual."
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# OpenRouter call
# ---------------------------------------------------------------------------

def call_openrouter(
    user_message: str,
    model: str = _DEFAULT_MODEL,
    api_key: str | None = None,
    http_post: Callable = _default_http_post,
) -> str:
    """
    Call OpenRouter's chat completions endpoint and return the response text.

    api_key: if None, read from OPENROUTER_API_KEY environment variable.
    http_post: injectable for testing (avoids real network calls in tests).
    """
    if api_key is None:
        api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY is not set")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://footyforecast.vercel.app",
        "X-Title": "FootyForecast",
    }
    payload = {
        "model": model,
        "max_tokens": 256,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
    }

    resp = http_post(_OPENROUTER_URL, headers=headers, json=payload)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


# ---------------------------------------------------------------------------
# DB write
# ---------------------------------------------------------------------------

def write_preview(
    fixture_id: str,
    preview_text: str,
    model_used: str,
    conn: psycopg.Connection,
) -> None:
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO match_previews (fixture_id, preview_text, model_used)
            VALUES (%s, %s, %s)
            ON CONFLICT (fixture_id) DO UPDATE
                SET preview_text = EXCLUDED.preview_text,
                    model_used   = EXCLUDED.model_used,
                    generated_at = NOW()
        """, (fixture_id, preview_text, model_used))


# ---------------------------------------------------------------------------
# Per-fixture orchestrator
# ---------------------------------------------------------------------------

def generate_preview(
    fixture_id: str,
    conn: psycopg.Connection,
    model: str = _DEFAULT_MODEL,
    api_key: str | None = None,
    http_post: Callable = _default_http_post,
) -> str | None:
    """
    Generate and store a preview for one fixture. Returns the text, or None
    if the fixture was not found.
    """
    fixture = _load_fixture(fixture_id, conn)
    if fixture is None:
        logger.warning("Fixture %s not found", fixture_id)
        return None

    trivia = _load_trivia(fixture_id, conn)
    prediction = _load_prediction(fixture_id, conn)

    user_message = _build_user_message(
        home=fixture["home_name"],
        away=fixture["away_name"],
        kickoff=fixture["kickoff_utc"],
        prediction=prediction,
        trivia_facts=trivia,
    )

    preview_text = call_openrouter(
        user_message, model=model, api_key=api_key, http_post=http_post
    )
    write_preview(fixture_id, preview_text, model, conn)
    logger.info("Preview generated for %s (%d chars)", fixture_id, len(preview_text))
    return preview_text


# ---------------------------------------------------------------------------
# Batch orchestrator
# ---------------------------------------------------------------------------

def generate_all(
    conn: psycopg.Connection,
    fixture_ids: list[str] | None = None,
    model: str = _DEFAULT_MODEL,
    api_key: str | None = None,
    http_post: Callable = _default_http_post,
) -> int:
    """
    Generate previews for upcoming WC 2026 fixtures that don't have one yet.
    Returns the number of previews written.
    """
    now = datetime.datetime.now(datetime.timezone.utc)

    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        if fixture_ids:
            cur.execute(
                "SELECT id FROM fixtures WHERE tournament_id = 'WC2026' AND id = ANY(%s)",
                (fixture_ids,),
            )
        else:
            cur.execute("""
                SELECT f.id
                FROM fixtures f
                JOIN match_predictions mp ON mp.fixture_id = f.id
                LEFT JOIN match_previews mprev ON mprev.fixture_id = f.id
                WHERE f.tournament_id = 'WC2026'
                  AND f.kickoff_utc > %s
                  AND mprev.fixture_id IS NULL
                ORDER BY f.kickoff_utc
                LIMIT 48
            """, (now,))
        ids = [r["id"] for r in cur.fetchall()]

    count = 0
    for fid in ids:
        try:
            text = generate_preview(
                fid, conn, model=model, api_key=api_key, http_post=http_post
            )
            if text:
                count += 1
        except Exception:
            logger.exception("Failed to generate preview for %s", fid)
            conn.rollback()

    conn.commit()
    return count


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Generate LLM match previews via OpenRouter.")
    parser.add_argument("fixture_ids", nargs="*", help="Specific fixture IDs (optional).")
    parser.add_argument("--model", default=_DEFAULT_MODEL, help="OpenRouter model slug.")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from dotenv import load_dotenv
    load_dotenv()

    from footy.db import get_conn
    with get_conn() as conn:
        n = generate_all(conn, fixture_ids=args.fixture_ids or None, model=args.model)

    print(f"Generated {n} preview(s).")
    sys.exit(0)


if __name__ == "__main__":
    main()
