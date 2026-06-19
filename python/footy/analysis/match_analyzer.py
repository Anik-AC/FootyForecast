"""
footy/analysis/match_analyzer.py

LLM-powered post-match analysis using OpenRouter.

Analyses:
  1. Detects hydration/cooling breaks from commentary text.
  2. Analyses momentum before and after those breaks.
  3. Generates a concise match analysis covering key turning points,
     team performance, and hydration break impact.

Requires OPENROUTER_API_KEY in environment. Silently skips if absent.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import psycopg
import requests

logger = logging.getLogger(__name__)

_MODEL = "anthropic/claude-haiku-4-5"
_OR_URL = "https://openrouter.ai/api/v1/chat/completions"

_HYDRATION_PATTERN = re.compile(
    r"(hydration|cooling|water|drinks?)\s+(break|interval|pause|stop)",
    re.IGNORECASE,
)


def _fetch_match_data(fixture_id: str, conn: psycopg.Connection) -> dict[str, Any] | None:
    """Pull all the data we need for analysis from the DB."""
    result: dict[str, Any] = {"fixture_id": fixture_id}

    with conn.cursor() as cur:
        # Basic match info
        cur.execute(
            """
            SELECT f.kickoff_utc, ht.name, awt.name,
                   mr.home_goals, mr.away_goals
            FROM fixtures f
            JOIN teams ht  ON ht.id  = f.home_team_id
            JOIN teams awt ON awt.id  = f.away_team_id
            LEFT JOIN match_results mr ON mr.fixture_id = f.id
            WHERE f.id = %s
            """,
            (fixture_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        result["kickoff"] = str(row[0])
        result["home_team"] = row[1]
        result["away_team"] = row[2]
        result["home_goals"] = row[3]
        result["away_goals"] = row[4]

        # Commentary
        cur.execute(
            "SELECT minute, text FROM match_commentary WHERE fixture_id = %s ORDER BY minute ASC",
            (fixture_id,),
        )
        result["commentary"] = [{"minute": r[0], "text": r[1]} for r in cur.fetchall()]

        # Momentum (sample every 5 minutes to keep prompt short)
        cur.execute(
            "SELECT minute, value FROM match_momentum WHERE fixture_id = %s AND minute %% 5 = 0 ORDER BY minute",
            (fixture_id,),
        )
        result["momentum"] = [{"minute": r[0], "value": r[1]} for r in cur.fetchall()]

        # Key events
        cur.execute(
            """
            SELECT minute, incident_type, is_home, player_name, assist_player_name
            FROM match_events WHERE fixture_id = %s ORDER BY minute
            """,
            (fixture_id,),
        )
        result["events"] = [
            {"minute": r[0], "type": r[1], "is_home": r[2], "player": r[3], "assist": r[4]}
            for r in cur.fetchall()
        ]

        # Team stats summary
        cur.execute(
            """
            SELECT is_home, possession_pct, expected_goals, total_shots,
                   goalkeeper_saves, corner_kicks, fouls
            FROM match_statistics WHERE fixture_id = %s
            """,
            (fixture_id,),
        )
        stats = {}
        for r in cur.fetchall():
            side = "home" if r[0] else "away"
            stats[side] = {
                "possession": r[1], "xg": r[2], "shots": r[3],
                "saves": r[4], "corners": r[5], "fouls": r[6],
            }
        result["team_stats"] = stats

    return result


def _detect_hydration_breaks(commentary: list[dict]) -> list[dict]:
    """Find commentary entries that mention a hydration/cooling break."""
    breaks = []
    for c in commentary:
        if _HYDRATION_PATTERN.search(c.get("text", "")):
            breaks.append({"minute": c.get("minute"), "text": c["text"]})
    return breaks


def _momentum_window(momentum: list[dict], minute: int, window: int = 10) -> dict:
    """Average home momentum in the ±window minutes around a given minute."""
    before = [p["value"] for p in momentum if minute - window <= p["minute"] < minute]
    after  = [p["value"] for p in momentum if minute <= p["minute"] < minute + window]
    return {
        "before_avg": round(sum(before) / len(before), 2) if before else None,
        "after_avg":  round(sum(after)  / len(after),  2) if after  else None,
    }


def _build_prompt(data: dict, hydration_breaks: list[dict]) -> str:
    home = data["home_team"]
    away = data["away_team"]
    score = f"{data['home_goals']}-{data['away_goals']}"
    stats = data.get("team_stats", {})

    lines = [
        f"Match: {home} {score} {away}",
        "",
        "Key events:",
    ]
    for ev in data.get("events", []):
        side = home if ev["is_home"] else away
        p = ev.get("player") or "Unknown"
        assist = f" (assist: {ev['assist']})" if ev.get("assist") else ""
        lines.append(f"  {ev['minute']}' {ev['type'].replace('_', ' ')}: {side} — {p}{assist}")

    if stats:
        lines.append("")
        lines.append("Team statistics:")
        for side, s in stats.items():
            team = home if side == "home" else away
            lines.append(
                f"  {team}: possession={s.get('possession')}%, xG={s.get('xg')}, "
                f"shots={s.get('shots')}, saves={s.get('saves')}"
            )

    if hydration_breaks:
        lines.append("")
        lines.append("Hydration/cooling breaks detected:")
        for b in hydration_breaks:
            lines.append(f"  Minute {b['minute']}: {b['text'][:120]}")

    momentum_sample = data.get("momentum", [])[:18]  # first 90 min in 5-min steps
    if momentum_sample:
        lines.append("")
        lines.append("Momentum (positive = home, negative = away, sampled every 5 min):")
        vals = " ".join(f"{p['minute']}:{p['value']:+.1f}" for p in momentum_sample)
        lines.append(f"  {vals}")

    lines.append("")
    lines.append(
        "Write a concise 3-paragraph post-match analysis (200-250 words total):\n"
        "1. Overall match verdict: who dominated and why the score reflects (or doesn't) the play.\n"
        "2. Key turning points and momentum shifts.\n"
        "3. If there were hydration/cooling breaks, analyse how the game changed around them — "
        "did either team benefit? If no breaks, note the match's physical intensity.\n"
        "Be specific, reference actual player names and minutes. No filler phrases."
    )

    return "\n".join(lines)


def generate_analysis(fixture_id: str, conn: psycopg.Connection) -> bool:
    """
    Generate and store a post-match LLM analysis.
    Returns True if analysis was written, False if skipped/failed.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        logger.info("OPENROUTER_API_KEY not set; skipping match analysis for %s", fixture_id)
        return False

    # Skip if analysis already exists
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM match_analysis WHERE fixture_id = %s", (fixture_id,))
        if cur.fetchone():
            logger.info("Analysis already exists for %s", fixture_id)
            return False

    data = _fetch_match_data(fixture_id, conn)
    if not data:
        logger.warning("No data found for %s", fixture_id)
        return False

    # Require Sofascore commentary to exist before analysis
    if not data.get("commentary"):
        logger.info("No commentary yet for %s; skipping analysis", fixture_id)
        return False

    hydration_breaks = _detect_hydration_breaks(data["commentary"])
    prompt = _build_prompt(data, hydration_breaks)

    try:
        resp = requests.post(
            _OR_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://footyforecast.app",
                "X-Title": "FootyForecast",
            },
            json={
                "model": _MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 400,
                "temperature": 0.6,
            },
            timeout=60,
        )
        resp.raise_for_status()
        analysis_text = resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.error("OpenRouter call failed for %s: %s", fixture_id, exc)
        return False

    hb_minute = hydration_breaks[0]["minute"] if hydration_breaks else None

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO match_analysis
                (fixture_id, analysis_text, has_hydration_break, hydration_break_minute, model_used)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (fixture_id) DO UPDATE
                SET analysis_text = EXCLUDED.analysis_text,
                    has_hydration_break = EXCLUDED.has_hydration_break,
                    hydration_break_minute = EXCLUDED.hydration_break_minute,
                    generated_at = NOW()
            """,
            (fixture_id, analysis_text, bool(hydration_breaks), hb_minute, _MODEL),
        )
    conn.commit()
    logger.info(
        "Analysis generated for %s (hydration breaks: %d)", fixture_id, len(hydration_breaks)
    )
    return True
