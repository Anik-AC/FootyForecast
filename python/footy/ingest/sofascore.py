"""
footy/ingest/sofascore.py

Scrapes post-match data from Sofascore's unofficial JSON API.
Runs after each match completes (called by the scheduler).

Data collected per match:
  - Event ID mapping (our fixture_id → Sofascore numeric ID)
  - Match incidents (goals, cards, subs with exact minute)
  - Team statistics (possession, xG, shots, saves, corners, etc.)
  - Per-minute momentum graph values
  - Match commentary
  - Per-player match statistics (all categories)

Personal project use only. Sofascore's API is unofficial but has been stable
for years. Respects their servers with delays between requests.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime
from typing import Any, Callable

import cloudscraper
import psycopg

logger = logging.getLogger(__name__)

_BASE = "https://api.sofascore.com/api/v1"
_DELAY = 1.5  # seconds between API calls — be a good citizen

# A single cloudscraper session is reused for the lifetime of one ingestion run.
# cloudscraper solves Cloudflare's JS challenge automatically and maintains cookies.
_scraper: cloudscraper.CloudScraper | None = None


def _get_scraper() -> cloudscraper.CloudScraper:
    global _scraper
    if _scraper is None:
        _scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False},
        )
        _scraper.headers.update({
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.sofascore.com/",
            "Origin": "https://www.sofascore.com",
        })
    return _scraper


def _default_http(url: str, **kwargs: Any) -> Any:
    return _get_scraper().get(url, timeout=30, **kwargs)


# ---------------------------------------------------------------------------
# Stat key mapping: Sofascore JSON key → our DB column name
# ---------------------------------------------------------------------------

_PLAYER_STAT_MAP: dict[str, str | None] = {
    "rating": "rating",
    "minutesPlayed": "minutes_played",
    "goals": "goals",
    "goalAssist": "assists",
    "yellowCard": "yellow_cards",
    "yellowRedCard": "yellow_cards",  # second yellow = red in effect
    "redCard": "red_cards",
    "onTargetScoringAttempt": "shots_on_target",
    "totalScoringAttempts": "shots",
    "bigChanceCreated": "big_chances_created",
    "bigChanceMissed": "big_chances_missed",
    "goalsFromInsideTheBox": "goals_inside_box",
    "goalsFromOutsideTheBox": "goals_outside_box",
    "attemptedDribbles": "dribble_attempts",
    "successfulDribbles": "dribbles_won",
    "tacklesMade": "tackles",
    "interceptions": "interceptions",
    "clearances": "clearances",
    "blockedShots": "blocks",
    "totalDuels": "duels_total",
    "duelsWon": "duels_won",
    "wonContest": "aerial_duels_won",
    "totalPasses": "passes_total",
    "accuratePasses": "passes_accurate",
    "keyPasses": "key_passes",
    "totalLongBalls": "long_balls_total",
    "accurateLongBalls": "long_balls_accurate",
    "totalCross": "crosses_total",
    "accurateCross": "crosses_accurate",
    "saves": "saves",
    "savedShotsFromInsideTheBox": "saves_inside_box",
    "cleanSheet": "clean_sheet",
    "penaltySave": "penalties_saved",
    "totalKeeperSweeper": "runs_out",
    "challengeLost": "dispossessed",
    "fouls": "fouls_committed",
    "wasFouled": "fouls_suffered",
    "offsideGiven": "offsides",
    # Keys to explicitly skip (not stored)
    "accurateKeeperSweeper": None,
    "totwQualify": None,
    "ratingVersions": None,
    "touches": None,
    "totalContest": None,
    "errorLeadToGoal": None,
    "errorLeadToShot": None,
}

# Team-level stat name → DB column (from the statistics endpoint)
_TEAM_STAT_MAP: dict[str, str] = {
    "Ball possession": "possession_pct",
    "Expected goals": "expected_goals",
    "Big chances": "big_chances",
    "Total shots": "total_shots",
    "Shots on target": "shots_on_target",
    "Goalkeeper saves": "goalkeeper_saves",
    "Corner kicks": "corner_kicks",
    "Fouls": "fouls",
    "Total passes": "passes_total",
    "Accurate passes": "passes_accurate",
    "Tackles": "tackles",
    "Free kicks": "free_kicks",
    "Yellow cards": "yellow_cards",
    "Red cards": "red_cards",
    "Offsides": "offsides",
}


# ---------------------------------------------------------------------------
# Event ID discovery
# ---------------------------------------------------------------------------

def _normalize_name(name: str) -> str:
    """Lowercase, strip accents, collapse spaces."""
    n = name.lower()
    for src, dst in [
        ("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"),
        ("ñ", "n"), ("ü", "u"), ("ö", "o"), ("ä", "a"), ("ß", "ss"),
        ("ç", "c"), ("ã", "a"), ("â", "a"), ("ê", "e"), ("ô", "o"),
    ]:
        n = n.replace(src, dst)
    n = re.sub(r"[^a-z0-9 ]", "", n)
    return re.sub(r"\s+", " ", n).strip()


def _names_match(a: str, b: str) -> bool:
    na, nb = _normalize_name(a), _normalize_name(b)
    if na == nb:
        return True
    # One contained in the other handles "Korea Republic" vs "South Korea" etc.
    return na in nb or nb in na


def discover_event_id(
    home_team: str,
    away_team: str,
    kickoff_utc: datetime,
    http: Callable = _default_http,
) -> int | None:
    """
    Find the Sofascore event ID for a WC 2026 match.
    Searches the scheduled-events endpoint for the match date and fuzzy-matches
    by team name. Returns None if not found.
    """
    date_str = kickoff_utc.strftime("%Y-%m-%d")
    url = f"{_BASE}/sport/football/scheduled-events/{date_str}"
    try:
        resp = http(url)
        if not resp.ok:
            logger.warning("Sofascore schedule endpoint returned %d for %s", resp.status_code, date_str)
            return None
        events = resp.json().get("events", [])
    except Exception as exc:
        logger.warning("Failed to fetch Sofascore schedule for %s: %s", date_str, exc)
        return None

    for event in events:
        # Only WC 2026 matches
        t_name = event.get("tournament", {}).get("name", "")
        ut_name = event.get("tournament", {}).get("uniqueTournament", {}).get("name", "")
        if "World Cup" not in t_name and "World Cup" not in ut_name:
            continue

        ht = event.get("homeTeam", {}).get("name", "")
        at = event.get("awayTeam", {}).get("name", "")
        if _names_match(ht, home_team) and _names_match(at, away_team):
            eid = event.get("id")
            logger.info("Mapped %s vs %s → Sofascore event %d", home_team, away_team, eid)
            return eid

    logger.warning("Could not find Sofascore event for %s vs %s on %s", home_team, away_team, date_str)
    return None


def get_or_create_event_id(
    fixture_id: str,
    home_team: str,
    away_team: str,
    kickoff_utc: datetime,
    conn: psycopg.Connection,
    http: Callable = _default_http,
) -> int | None:
    """Return cached Sofascore event ID, discovering and storing it if needed."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT sofascore_event_id FROM sofascore_event_map WHERE fixture_id = %s",
            (fixture_id,),
        )
        row = cur.fetchone()
        if row:
            return row[0]

    eid = discover_event_id(home_team, away_team, kickoff_utc, http)
    if eid is None:
        return None

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO sofascore_event_map (fixture_id, sofascore_event_id)
            VALUES (%s, %s)
            ON CONFLICT (fixture_id) DO NOTHING
            """,
            (fixture_id, eid),
        )
    conn.commit()
    return eid


# ---------------------------------------------------------------------------
# Individual data fetchers
# ---------------------------------------------------------------------------

def _fetch(url: str, http: Callable) -> dict | None:
    time.sleep(_DELAY)
    try:
        resp = http(url)
        if not resp.ok:
            logger.debug("Sofascore %s → %d", url, resp.status_code)
            return None
        return resp.json()
    except Exception as exc:
        logger.warning("Sofascore request failed for %s: %s", url, exc)
        return None


def ingest_events(event_id: int, fixture_id: str, conn: psycopg.Connection, http: Callable) -> int:
    """Ingest match incidents (goals, cards, subs) into match_events."""
    data = _fetch(f"{_BASE}/event/{event_id}/incidents", http)
    if not data:
        return 0

    # Clear existing data so re-runs are idempotent
    with conn.cursor() as cur:
        cur.execute("DELETE FROM match_events WHERE fixture_id = %s", (fixture_id,))

    count = 0
    for inc in data.get("incidents", []):
        inc_type = inc.get("incidentType", "")
        # Map Sofascore types to our enum values
        type_map = {
            "goal": "goal",
            "ownGoal": "own_goal",
            "yellowCard": "yellow_card",
            "yellowRedCard": "yellow_card",
            "redCard": "red_card",
            "substitution": "substitution",
            "varDecision": "var",
            "penaltyMissed": "penalty_missed",
        }
        our_type = type_map.get(inc_type)
        if not our_type:
            continue

        player = inc.get("player") or inc.get("playerIn") or {}
        assist = inc.get("assist1") or {}

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO match_events
                    (fixture_id, minute, added_time, incident_type, is_home,
                     player_name, assist_player_name, detail, sofascore_player_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    fixture_id,
                    inc.get("time", 0),
                    inc.get("addedTime"),
                    our_type,
                    inc.get("isHome", True),
                    player.get("name"),
                    assist.get("name") or None,
                    inc.get("text") or inc.get("incidentClass"),
                    player.get("id"),
                ),
            )
        count += 1

    conn.commit()
    logger.info("Ingested %d events for fixture %s", count, fixture_id)
    return count


def ingest_statistics(event_id: int, fixture_id: str, conn: psycopg.Connection, http: Callable) -> bool:
    """Ingest team-level match statistics."""
    data = _fetch(f"{_BASE}/event/{event_id}/statistics", http)
    if not data:
        return False

    # Find the ALL-period group
    all_period = next(
        (s for s in data.get("statistics", []) if s.get("period") == "ALL"),
        None,
    ) or (data.get("statistics", [{}])[0] if data.get("statistics") else None)

    if not all_period:
        return False

    home_vals: dict[str, Any] = {}
    away_vals: dict[str, Any] = {}

    for group in all_period.get("groups", []):
        for item in group.get("statisticsItems", []):
            stat_name = item.get("name", "")
            col = _TEAM_STAT_MAP.get(stat_name)
            if not col:
                continue

            raw_home = str(item.get("home", "0")).replace("%", "").strip()
            raw_away = str(item.get("away", "0")).replace("%", "").strip()

            try:
                home_vals[col] = float(raw_home) if "." in raw_home else int(raw_home)
                away_vals[col] = float(raw_away) if "." in raw_away else int(raw_away)
            except ValueError:
                pass

    if not home_vals and not away_vals:
        return False

    cols = list(set(list(home_vals.keys()) + list(away_vals.keys())))
    for is_home, vals in [(True, home_vals), (False, away_vals)]:
        set_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols)
        col_clause = ", ".join(cols)
        param_clause = ", ".join(f"%s" for _ in cols)
        params = [vals.get(c) for c in cols]
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO match_statistics (fixture_id, is_home, {col_clause})
                VALUES (%s, %s, {param_clause})
                ON CONFLICT (fixture_id, is_home) DO UPDATE SET {set_clause}
                """,
                [fixture_id, is_home] + params,
            )

    conn.commit()
    logger.info("Ingested statistics for fixture %s", fixture_id)
    return True


def ingest_momentum(event_id: int, fixture_id: str, conn: psycopg.Connection, http: Callable) -> int:
    """Ingest per-minute momentum values."""
    data = _fetch(f"{_BASE}/event/{event_id}/momentum", http)
    if not data:
        return 0

    points = data.get("graphPoints", [])
    if not points:
        return 0

    with conn.cursor() as cur:
        cur.execute("DELETE FROM match_momentum WHERE fixture_id = %s", (fixture_id,))
        for pt in points:
            minute = pt.get("minute") or pt.get("time")
            value = pt.get("value")
            if minute is None or value is None:
                continue
            cur.execute(
                "INSERT INTO match_momentum (fixture_id, minute, value) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                (fixture_id, minute, float(value)),
            )

    conn.commit()
    logger.info("Ingested %d momentum points for %s", len(points), fixture_id)
    return len(points)


def ingest_commentary(event_id: int, fixture_id: str, conn: psycopg.Connection, http: Callable) -> int:
    """Ingest match commentary."""
    data = _fetch(f"{_BASE}/event/{event_id}/comments", http)
    if not data:
        return 0

    comments = data.get("comments", []) or data.get("comment", []) or []
    if not comments:
        return 0

    with conn.cursor() as cur:
        cur.execute("DELETE FROM match_commentary WHERE fixture_id = %s", (fixture_id,))

    count = 0
    for comment in comments:
        text = comment.get("text") or comment.get("body") or ""
        if not text:
            continue
        minute = comment.get("time") or comment.get("minute")
        is_important = bool(comment.get("isImportant") or comment.get("important"))
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO match_commentary (fixture_id, minute, text, is_important) VALUES (%s, %s, %s, %s)",
                (fixture_id, minute, text, is_important),
            )
        count += 1

    conn.commit()
    logger.info("Ingested %d commentary entries for %s", count, fixture_id)
    return count


def ingest_player_stats(event_id: int, fixture_id: str, conn: psycopg.Connection, http: Callable) -> int:
    """Ingest per-player match statistics from the lineups endpoint."""
    data = _fetch(f"{_BASE}/event/{event_id}/lineups", http)
    if not data:
        return 0

    count = 0
    for is_home, side_key in [(True, "home"), (False, "away")]:
        side = data.get(side_key, {})
        for entry in side.get("players", []):
            player = entry.get("player", {})
            stats = entry.get("statistics", {})
            if not player or not stats:
                continue

            player_id = player.get("id")
            player_name = player.get("name") or player.get("shortName")
            if not player_id or not player_name:
                continue

            # Try to resolve team_id from the team in the side data
            team_name = side.get("team", {}).get("name", "")
            team_id = _resolve_team_id(team_name, conn)

            # Build column values from stat mapping
            row: dict[str, Any] = {
                "fixture_id": fixture_id,
                "sofascore_player_id": player_id,
                "player_name": player_name,
                "team_id": team_id,
                "is_home": is_home,
                "position": _map_position(player.get("position") or entry.get("position")),
            }

            for ss_key, db_col in _PLAYER_STAT_MAP.items():
                if db_col is None:
                    continue
                val = stats.get(ss_key)
                if val is None:
                    continue
                if db_col == "clean_sheet":
                    row[db_col] = bool(val)
                elif db_col == "rating":
                    row[db_col] = float(val)
                else:
                    try:
                        row[db_col] = int(val)
                    except (TypeError, ValueError):
                        row[db_col] = val

            cols = list(row.keys())
            params = [row[c] for c in cols]
            conflict_updates = ", ".join(
                f"{c} = EXCLUDED.{c}" for c in cols
                if c not in ("fixture_id", "sofascore_player_id")
            )
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO player_match_stats ({", ".join(cols)})
                    VALUES ({", ".join("%s" for _ in cols)})
                    ON CONFLICT (fixture_id, sofascore_player_id) DO UPDATE SET {conflict_updates}
                    """,
                    params,
                )
            count += 1

    conn.commit()
    logger.info("Ingested %d player stat rows for %s", count, fixture_id)
    return count


def _map_position(pos: str | None) -> str | None:
    if not pos:
        return None
    return {"G": "G", "GK": "G", "D": "D", "M": "M", "F": "F",
            "goalkeeper": "G", "defender": "D", "midfielder": "M", "forward": "F"}.get(pos, pos[:1].upper() if pos else None)


_team_id_cache: dict[str, str | None] = {}

def _resolve_team_id(team_name: str, conn: psycopg.Connection) -> str | None:
    if team_name in _team_id_cache:
        return _team_id_cache[team_name]
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM teams WHERE LOWER(name) = LOWER(%s) OR LOWER(short_name) = LOWER(%s)", (team_name, team_name))
        row = cur.fetchone()
        result = row[0] if row else None
    _team_id_cache[team_name] = result
    return result


# ---------------------------------------------------------------------------
# Main entry: ingest one completed match
# ---------------------------------------------------------------------------

def ingest_match(
    fixture_id: str,
    home_team: str,
    away_team: str,
    kickoff_utc: datetime,
    conn: psycopg.Connection,
    http: Callable = _default_http,
    force: bool = False,
) -> dict[str, int]:
    """
    Full Sofascore ingestion for one completed match.

    Discovers the Sofascore event ID if needed, then sequentially fetches
    events, statistics, momentum, commentary, and player stats.

    Returns a dict of ingested counts per category.
    """
    if not force:
        # Skip if we already have player stats for this match
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM player_match_stats WHERE fixture_id = %s",
                (fixture_id,),
            )
            if (cur.fetchone() or [0])[0] > 0:
                logger.info("Sofascore data already exists for %s; skipping", fixture_id)
                return {}

    event_id = get_or_create_event_id(fixture_id, home_team, away_team, kickoff_utc, conn, http)
    if event_id is None:
        logger.warning("Could not find Sofascore event for %s; skipping", fixture_id)
        return {}

    logger.info("Ingesting Sofascore data for %s (event %d)", fixture_id, event_id)

    return {
        "events":      ingest_events(event_id, fixture_id, conn, http),
        "statistics":  int(ingest_statistics(event_id, fixture_id, conn, http)),
        "momentum":    ingest_momentum(event_id, fixture_id, conn, http),
        "commentary":  ingest_commentary(event_id, fixture_id, conn, http),
        "player_stats": ingest_player_stats(event_id, fixture_id, conn, http),
    }


# ---------------------------------------------------------------------------
# Bulk runner: ingest all completed matches that lack Sofascore data
# ---------------------------------------------------------------------------

def ingest_all_completed(conn: psycopg.Connection, http: Callable = _default_http) -> None:
    """
    Fetches and stores Sofascore data for all completed WC 2026 matches
    that do not yet have player stats. Intended to be called from the scheduler.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.id, ht.name, awt.name, f.kickoff_utc
            FROM fixtures f
            JOIN teams ht  ON ht.id  = f.home_team_id
            JOIN teams awt ON awt.id  = f.away_team_id
            JOIN match_results mr ON mr.fixture_id = f.id
            WHERE f.tournament_id = 'WC2026'
              AND f.id NOT IN (
                  SELECT DISTINCT fixture_id FROM player_match_stats
              )
            ORDER BY f.kickoff_utc ASC
            """
        )
        pending = cur.fetchall()

    if not pending:
        logger.info("All completed matches already have Sofascore data.")
        return

    logger.info("Ingesting Sofascore data for %d pending matches", len(pending))
    for fixture_id, home, away, kickoff in pending:
        try:
            counts = ingest_match(fixture_id, home, away, kickoff, conn, http, force=False)
            if counts:
                logger.info("  %s: %s", fixture_id, counts)
        except Exception as exc:
            logger.error("Failed to ingest %s: %s", fixture_id, exc)
        time.sleep(2)  # extra pause between matches


def main() -> None:
    import argparse
    import sys
    from dotenv import load_dotenv
    import os
    from footy.db import get_conn

    parser = argparse.ArgumentParser(description="Sofascore post-match data ingestion")
    parser.add_argument("--fixture", help="Specific fixture_id to ingest (omit to ingest all pending)")
    parser.add_argument("--force", action="store_true", help="Re-ingest even if data already exists")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    load_dotenv()

    if not os.environ.get("DATABASE_URL"):
        print("DATABASE_URL not set")
        sys.exit(1)

    with get_conn() as conn:
        if args.fixture:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, ht.name, awt.name, f.kickoff_utc "
                    "FROM fixtures f "
                    "JOIN teams ht  ON ht.id  = f.home_team_id "
                    "JOIN teams awt ON awt.id  = f.away_team_id "
                    "WHERE f.id = %s",
                    (args.fixture,),
                )
                row = cur.fetchone()
            if not row:
                print(f"Fixture {args.fixture!r} not found")
                sys.exit(1)
            counts = ingest_match(row[0], row[1], row[2], row[3], conn, force=args.force)
            print(f"Done: {counts}")
        else:
            ingest_all_completed(conn)
            print("Done.")


if __name__ == "__main__":
    main()
