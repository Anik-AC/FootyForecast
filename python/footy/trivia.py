"""
Auto-trivia engine: generates pre-match statistical facts from historical_matches.

All queries enforce point-in-time correctness by filtering match_date < kickoff_date.
The engine resolves FIFA codes to historical name spellings via team_map.TEAM_NAME_MAP.

Usage (from python/ directory):
    uv run python -m footy.trivia WC2026-GRP-A-01

Facts generated per fixture:
  - head_to_head    : all-time H2H record
  - h2h_recent      : last 5 meetings
  - form_home       : home team last 5 matches
  - form_away       : away team last 5 matches
  - unbeaten_streak : current unbeaten run for each team
  - scoring_streak  : consecutive matches with at least one goal
"""

from __future__ import annotations

import datetime
import json
import logging
import sys
from typing import Any

import psycopg
import psycopg.rows

from footy.ingest.team_map import TEAM_NAME_MAP

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Name resolution: FIFA code -> list of spellings in historical_matches
# ---------------------------------------------------------------------------

def _names_for(team_id: str) -> list[str]:
    """Return all historical name spellings that resolve to this FIFA code."""
    return [name for name, code in TEAM_NAME_MAP.items() if code == team_id]


# ---------------------------------------------------------------------------
# Low-level query helpers (return raw rows as dicts)
# ---------------------------------------------------------------------------

def _fetch_h2h(
    home_names: list[str],
    away_names: list[str],
    before: datetime.date,
    conn: psycopg.Connection,
    limit: int | None = None,
) -> list[dict]:
    """Return rows from historical_matches for meetings between two teams."""
    sql = """
        SELECT match_date, home_team, away_team, home_score, away_score
        FROM historical_matches
        WHERE match_date < %(before)s
          AND (
              (home_team = ANY(%(home)s) AND away_team = ANY(%(away)s))
           OR (home_team = ANY(%(away)s) AND away_team = ANY(%(home)s))
          )
        ORDER BY match_date DESC
    """
    if limit:
        sql += f" LIMIT {int(limit)}"

    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute(sql, {"before": before, "home": home_names, "away": away_names})
        return cur.fetchall()


def _fetch_recent(
    names: list[str],
    before: datetime.date,
    conn: psycopg.Connection,
    n: int = 5,
) -> list[dict]:
    """Return the last n matches (any opponent) for a team."""
    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute("""
            SELECT match_date, home_team, away_team, home_score, away_score
            FROM historical_matches
            WHERE match_date < %(before)s
              AND (home_team = ANY(%(names)s) OR away_team = ANY(%(names)s))
            ORDER BY match_date DESC
            LIMIT %(n)s
        """, {"before": before, "names": names, "n": n})
        return cur.fetchall()


# ---------------------------------------------------------------------------
# Per-row perspective helpers
# ---------------------------------------------------------------------------

def _result_for(row: dict, team_names: list[str]) -> str:
    """Return 'W', 'D', or 'L' from the given team's perspective."""
    is_home = row["home_team"] in team_names
    hs, as_ = row["home_score"], row["away_score"]
    if hs == as_:
        return "D"
    if (is_home and hs > as_) or (not is_home and as_ > hs):
        return "W"
    return "L"


def _scored(row: dict, team_names: list[str]) -> bool:
    """Return True if the team scored at least one goal in this match."""
    is_home = row["home_team"] in team_names
    return (row["home_score"] if is_home else row["away_score"]) > 0


def _conceded(row: dict, team_names: list[str]) -> bool:
    """Return True if the team conceded at least one goal."""
    is_home = row["home_team"] in team_names
    return (row["away_score"] if is_home else row["home_score"]) > 0


# ---------------------------------------------------------------------------
# Stat template functions (pure: no DB calls, operate on pre-fetched rows)
# ---------------------------------------------------------------------------

def head_to_head_fact(
    rows: list[dict],
    home_id: str,
    away_id: str,
    home_names: list[str],
    away_names: list[str],
    home_display: str,
    away_display: str,
) -> dict[str, Any] | None:
    """Overall H2H fact from all historical meetings."""
    if not rows:
        return {
            "template": "head_to_head",
            "text": f"{home_display} and {away_display} have never met in an international match.",
            "data": {"total": 0, "home_wins": 0, "draws": 0, "away_wins": 0},
        }

    total = len(rows)
    home_wins = sum(1 for r in rows if _result_for(r, home_names) == "W")
    draws = sum(1 for r in rows if _result_for(r, home_names) == "D")
    away_wins = total - home_wins - draws

    home_goals = sum(r["home_score"] if r["home_team"] in home_names else r["away_score"] for r in rows)
    away_goals = sum(r["away_score"] if r["home_team"] in home_names else r["home_score"] for r in rows)

    if home_wins > away_wins:
        leader = home_display
        record = f"{home_wins}W {draws}D {away_wins}L"
    elif away_wins > home_wins:
        leader = away_display
        record = f"{away_wins}W {draws}D {home_wins}L"
    else:
        leader = None
        record = f"{home_wins}W {draws}D {away_wins}L"

    if leader:
        text = (
            f"{leader} lead the all-time H2H {record} "
            f"({home_goals}-{away_goals} on goals) across {total} meetings."
        )
    else:
        text = (
            f"{home_display} and {away_display} are level in the all-time H2H "
            f"with {record} across {total} meetings ({home_goals}-{away_goals} on goals)."
        )

    return {
        "template": "head_to_head",
        "text": text,
        "data": {
            "total": total,
            "home_wins": home_wins,
            "draws": draws,
            "away_wins": away_wins,
            "home_goals": home_goals,
            "away_goals": away_goals,
        },
    }


def h2h_recent_fact(
    rows: list[dict],
    home_names: list[str],
    home_display: str,
    away_display: str,
    n: int = 5,
) -> dict[str, Any] | None:
    """Last N meetings between the two teams."""
    recent = rows[:n]
    if not recent:
        return None

    results = [_result_for(r, home_names) for r in recent]
    sequence = " ".join(results)
    last = recent[0]
    last_date = last["match_date"].strftime("%b %Y") if hasattr(last["match_date"], "strftime") else str(last["match_date"])
    score = f"{last['home_score']}-{last['away_score']}"
    who_won = _result_for(last, home_names)
    winner = home_display if who_won == "W" else (away_display if who_won == "L" else "Draw")

    text = (
        f"In their last {len(recent)} meetings, {home_display} are {results.count('W')}W "
        f"{results.count('D')}D {results.count('L')}L. "
        f"Most recently ({last_date}): {score}, {winner}."
    )
    return {
        "template": "h2h_recent",
        "text": text,
        "data": {"results": results, "sequence": sequence, "n": len(recent)},
    }


def form_fact(
    rows: list[dict],
    team_names: list[str],
    display_name: str,
    role: str,
) -> dict[str, Any] | None:
    """Last 5 matches form string for one team."""
    if not rows:
        return None

    results = [_result_for(r, team_names) for r in rows]
    wins = results.count("W")
    draws = results.count("D")
    losses = results.count("L")
    sequence = "".join(results)

    if wins >= 4:
        tone = "in outstanding form"
    elif wins >= 2:
        tone = "in decent form"
    elif losses >= 3:
        tone = "struggling for form"
    else:
        tone = "in mixed form"

    text = (
        f"{display_name} are {tone} heading into this match: "
        f"{wins}W {draws}D {losses}L in their last {len(rows)} games (most recent first: {sequence})."
    )
    return {
        "template": f"form_{role}",
        "text": text,
        "data": {"results": results, "wins": wins, "draws": draws, "losses": losses, "sequence": sequence},
    }


def unbeaten_streak_fact(
    rows: list[dict],
    team_names: list[str],
    display_name: str,
    role: str,
) -> dict[str, Any] | None:
    """Current unbeaten run (W or D, no L) counted from most recent match backwards."""
    if not rows:
        return None

    streak = 0
    for row in rows:
        r = _result_for(row, team_names)
        if r == "L":
            break
        streak += 1

    if streak < 3:
        return None

    text = f"{display_name} are on a {streak}-match unbeaten run heading into this fixture."
    return {
        "template": f"unbeaten_streak_{role}",
        "text": text,
        "data": {"streak": streak},
    }


def scoring_streak_fact(
    rows: list[dict],
    team_names: list[str],
    display_name: str,
    role: str,
) -> dict[str, Any] | None:
    """Consecutive matches where the team scored at least one goal."""
    if not rows:
        return None

    streak = 0
    for row in rows:
        if _scored(row, team_names):
            streak += 1
        else:
            break

    if streak < 3:
        return None

    text = f"{display_name} have scored in each of their last {streak} international matches."
    return {
        "template": f"scoring_streak_{role}",
        "text": text,
        "data": {"streak": streak},
    }


# ---------------------------------------------------------------------------
# Orchestrator: generate all facts for one fixture
# ---------------------------------------------------------------------------

def generate_facts(
    home_id: str,
    away_id: str,
    kickoff_date: datetime.date,
    conn: psycopg.Connection,
    home_display: str | None = None,
    away_display: str | None = None,
) -> list[dict]:
    """
    Generate all trivia facts for a fixture. Returns a list of fact dicts.

    home_display / away_display: human-readable team names for the fact text.
    If None, defaults to the first name in _names_for() or the FIFA code.
    """
    home_names = _names_for(home_id)
    away_names = _names_for(away_id)

    if not home_names:
        logger.warning("No historical names found for %s", home_id)
        home_names = [home_id]
    if not away_names:
        logger.warning("No historical names found for %s", away_id)
        away_names = [away_id]

    if home_display is None:
        home_display = home_names[0]
    if away_display is None:
        away_display = away_names[0]

    h2h_rows = _fetch_h2h(home_names, away_names, kickoff_date, conn)
    home_form_rows = _fetch_recent(home_names, kickoff_date, conn, n=10)
    away_form_rows = _fetch_recent(away_names, kickoff_date, conn, n=10)

    facts: list[dict] = []

    f = head_to_head_fact(h2h_rows, home_id, away_id, home_names, away_names, home_display, away_display)
    if f:
        facts.append(f)

    f = h2h_recent_fact(h2h_rows, home_names, home_display, away_display, n=5)
    if f:
        facts.append(f)

    f = form_fact(home_form_rows[:5], home_names, home_display, "home")
    if f:
        facts.append(f)

    f = form_fact(away_form_rows[:5], away_names, away_display, "away")
    if f:
        facts.append(f)

    f = unbeaten_streak_fact(home_form_rows, home_names, home_display, "home")
    if f:
        facts.append(f)

    f = unbeaten_streak_fact(away_form_rows, away_names, away_display, "away")
    if f:
        facts.append(f)

    f = scoring_streak_fact(home_form_rows, home_names, home_display, "home")
    if f:
        facts.append(f)

    f = scoring_streak_fact(away_form_rows, away_names, away_display, "away")
    if f:
        facts.append(f)

    return facts


# ---------------------------------------------------------------------------
# DB write
# ---------------------------------------------------------------------------

def write_trivia(fixture_id: str, facts: list[dict], conn: psycopg.Connection) -> None:
    """Upsert trivia facts for one fixture into match_trivia."""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO match_trivia (fixture_id, facts)
            VALUES (%s, %s::jsonb)
            ON CONFLICT (fixture_id) DO UPDATE
                SET facts = EXCLUDED.facts,
                    generated_at = NOW()
        """, (fixture_id, json.dumps(facts)))


def generate_all(conn: psycopg.Connection, fixture_ids: list[str] | None = None) -> int:
    """
    Generate and store trivia for WC 2026 fixtures.

    If fixture_ids is None, targets all upcoming fixtures that have a prediction
    but not yet kicked off. Returns the number of fixtures processed.
    """
    now = datetime.datetime.now(datetime.timezone.utc)

    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        if fixture_ids:
            cur.execute("""
                SELECT f.id, f.kickoff_utc, f.home_team_id, f.away_team_id,
                       ht.name AS home_name, awt.name AS away_name
                FROM fixtures f
                JOIN teams ht  ON ht.id  = f.home_team_id
                JOIN teams awt ON awt.id = f.away_team_id
                WHERE f.tournament_id = 'WC2026'
                  AND f.id = ANY(%s)
            """, (fixture_ids,))
        else:
            cur.execute("""
                SELECT f.id, f.kickoff_utc, f.home_team_id, f.away_team_id,
                       ht.name AS home_name, awt.name AS away_name
                FROM fixtures f
                JOIN teams ht  ON ht.id  = f.home_team_id
                JOIN teams awt ON awt.id = f.away_team_id
                WHERE f.tournament_id = 'WC2026'
                  AND f.kickoff_utc > %s
                ORDER BY f.kickoff_utc
                LIMIT 48
            """, (now,))
        fixtures = cur.fetchall()

    count = 0
    for fix in fixtures:
        kickoff_date = (
            fix["kickoff_utc"].date()
            if hasattr(fix["kickoff_utc"], "date")
            else fix["kickoff_utc"]
        )
        facts = generate_facts(
            home_id=fix["home_team_id"],
            away_id=fix["away_team_id"],
            kickoff_date=kickoff_date,
            conn=conn,
            home_display=fix["home_name"],
            away_display=fix["away_name"],
        )
        write_trivia(fix["id"], facts, conn)
        logger.info("Generated %d facts for %s", len(facts), fix["id"])
        count += 1

    conn.commit()
    return count


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Generate match trivia facts.")
    parser.add_argument("fixture_ids", nargs="*", help="Specific fixture IDs (optional).")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from dotenv import load_dotenv
    load_dotenv()

    from footy.db import get_conn
    with get_conn() as conn:
        n = generate_all(conn, fixture_ids=args.fixture_ids or None)

    print(f"Generated trivia for {n} fixture(s).")
    sys.exit(0)


if __name__ == "__main__":
    main()
