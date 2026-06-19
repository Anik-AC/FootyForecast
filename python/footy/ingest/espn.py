"""
footy/ingest/espn.py

Post-match data ingestion from ESPN's public API (no auth required).

Populates the same tables as the planned Sofascore pipeline:
  match_events        — goals, cards, subs, drinks breaks
  match_statistics    — team-level aggregates
  match_commentary    — timestamped commentary feed
  player_match_stats  — per-player per-match stats
  sofascore_event_map — reused as a generic external-event-ID cache
                        (we store the ESPN numeric event ID here)

ESPN does not provide raw per-minute momentum data (that comes from Stats Perform,
which powers ESPN's chart). match_momentum is computed from the stored commentary
feed: each commentary entry is attributed to home or away by detecting team-name
mentions in the text, then smoothed with a 5-minute rolling window.

ESPN does not provide xG so expected_goals remains NULL.

Usage:
    uv run python -m footy.ingest.espn            # all pending completed matches
    uv run python -m footy.ingest.espn --fixture WC2026-GRP-537327
    uv run python -m footy.ingest.espn --force    # re-ingest even if data exists
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timedelta
from typing import Any

import psycopg
import requests

from footy.models.venues import normalise_venue_name

logger = logging.getLogger(__name__)

_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"
_DELAY = 1.0  # seconds between requests

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

# Team-level stats: ESPN key → match_statistics column
# Only columns that exist in the match_statistics schema are listed.
# ESPN also provides interceptions, blockedShots, totalCrosses etc. but
# the DB table does not have those columns (schema focused on Sofascore layout).
_TEAM_STAT_MAP: dict[str, str] = {
    "possessionPct":    "possession_pct",
    "totalShots":       "total_shots",
    "shotsOnTarget":    "shots_on_target",
    "saves":            "goalkeeper_saves",
    "wonCorners":       "corner_kicks",
    "foulsCommitted":   "fouls",
    "totalPasses":      "passes_total",
    "accuratePasses":   "passes_accurate",
    "effectiveTackles": "tackles",
    "yellowCards":      "yellow_cards",
    "redCards":         "red_cards",
    "offsides":         "offsides",
}

# Player stats: ESPN key → player_match_stats column (None = skip)
_PLAYER_STAT_MAP: dict[str, str | None] = {
    "totalGoals":    "goals",
    "goalAssists":   "assists",
    "yellowCards":   "yellow_cards",
    "redCards":      "red_cards",
    "totalShots":    "shots",
    "shotsOnTarget": "shots_on_target",
    "saves":         "saves",
    "foulsCommitted":"fouls_committed",
    "foulsSuffered": "fouls_suffered",
    "offsides":      "offsides",
    # explicitly ignored
    "appearances":   None,
    "subIns":        None,
    "goalsConceded": None,
    "shotsFaced":    None,
    "ownGoals":      None,
}

# Key event types: ESPN type → our incident_type (None = skip)
_EVENT_TYPE_MAP: dict[str, str | None] = {
    "goal":          "goal",
    "own-goal":      "own_goal",
    "yellow-card":   "yellow_card",
    "red-card":      "red_card",
    "substitution":  "substitution",
    "start-delay":   "drinks_break",
    "end-delay":     None,
    "kickoff":       None,
    "halftime":      None,
    "start-2nd-half": None,
    "full-time":     None,
    "penalty-miss":  "penalty_missed",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get(url: str, params: dict | None = None) -> dict | None:
    time.sleep(_DELAY)
    try:
        r = requests.get(url, headers=_HEADERS, params=params, timeout=20)
        if not r.ok:
            logger.debug("ESPN %s → %d", url, r.status_code)
            return None
        return r.json()
    except Exception as exc:
        logger.warning("ESPN request failed: %s %s", url, exc)
        return None


def _normalize(name: str) -> str:
    n = name.lower()
    n = re.sub(r"[àáâãäå]", "a", n)
    n = re.sub(r"[èéêë]",   "e", n)
    n = re.sub(r"[ìíîï]",   "i", n)
    n = re.sub(r"[òóôõö]",  "o", n)
    n = re.sub(r"[ùúûü]",   "u", n)
    n = re.sub(r"[ñ]",       "n", n)
    n = re.sub(r"[ç]",       "c", n)
    n = re.sub(r"[^a-z0-9 ]", "", n)
    return re.sub(r"\s+", " ", n).strip()


# Our DB uses some names that differ from ESPN's displayName.
# Maps canonical form → list of equivalent ESPN/DB spellings to collapse.
_ESPN_NAME_ALIASES: dict[str, list[str]] = {
    "korea republic": ["south korea"],
    "czech republic": ["czechia"],
    "ivory coast":    ["cote d'ivoire", "côte d'ivoire"],
    "dr congo":       ["democratic republic of congo", "congo dr"],
    "turkey":         ["türkiye", "turkiye"],
    "cape verde":     ["cabo verde"],
}
# Build reverse map too: ESPN name → our normalized name
_ALL_ALIASES: dict[str, str] = {}
for _our, _espn_variants in _ESPN_NAME_ALIASES.items():
    _ALL_ALIASES[_our] = _our
    for _v in _espn_variants:
        _ALL_ALIASES[_normalize(_v)] = _our


def _canonical(name: str) -> str:
    """Normalize a team name to a canonical form for comparison."""
    n = _normalize(name)
    return _ALL_ALIASES.get(n, n)


def _names_match(a: str, b: str) -> bool:
    ca, cb = _canonical(a), _canonical(b)
    return ca == cb or ca in cb or cb in ca


def _parse_clock(display: str) -> tuple[int, int | None]:
    """Parse '45+2'' or '90'' → (minute, added_time)."""
    m = re.match(r"(\d+)(?:\+(\d+))?", display or "")
    if not m:
        return 0, None
    minute = int(m.group(1))
    added = int(m.group(2)) if m.group(2) else None
    return minute, added


def _parse_event_player(text: str, event_type: str) -> str | None:
    """Extract player name from ESPN event text string."""
    if event_type in ("goal", "own-goal"):
        # "Goal! Team 1, Team 0. Player Name (Team) left footed shot..."
        m = re.search(r"\.\s+([^(]+?)\s*\(", text)
        return m.group(1).strip() if m else None
    if event_type in ("yellow-card", "red-card"):
        # "Player Name (Team) is shown the yellow card..."
        m = re.match(r"^([^(]+?)\s*\(", text)
        return m.group(1).strip() if m else None
    if event_type == "substitution":
        # "Substitution, Team. Player In replaces Player Out."
        m = re.search(r"\.\s+(.+?) replaces", text)
        return m.group(1).strip() if m else None
    return None


def _parse_assist(text: str) -> str | None:
    """Extract assist player name from goal text."""
    m = re.search(r"Assisted by ([^.]+)\.", text)
    return m.group(1).strip() if m else None


_team_id_cache: dict[str, str | None] = {}


def _resolve_team_id(team_name: str, conn: psycopg.Connection) -> str | None:
    if team_name in _team_id_cache:
        return _team_id_cache[team_name]
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM teams WHERE LOWER(name) = LOWER(%s) OR LOWER(short_name) = LOWER(%s)",
            (team_name, team_name),
        )
        row = cur.fetchone()
    result = row[0] if row else None
    _team_id_cache[team_name] = result
    return result


# ---------------------------------------------------------------------------
# ESPN event ID discovery
# ---------------------------------------------------------------------------

def _search_scoreboard_date(home_team: str, away_team: str, date: datetime) -> int | None:
    """Search ESPN scoreboard for a specific date. Returns event ID or None."""
    date_str = date.strftime("%Y%m%d")
    data = _get(f"{_BASE}/scoreboard", {"dates": date_str})
    if not data:
        return None
    for event in data.get("events", []):
        comp = event.get("competitions", [{}])[0]
        teams = comp.get("competitors", [])
        if len(teams) < 2:
            continue
        ht = teams[0].get("team", {}).get("displayName", "")
        at = teams[1].get("team", {}).get("displayName", "")
        if _names_match(ht, home_team) and _names_match(at, away_team):
            return int(event["id"])
    return None


def discover_event_id(
    home_team: str,
    away_team: str,
    kickoff_utc: datetime,
) -> int | None:
    """Find the ESPN event ID for a WC 2026 match.

    Tries kickoff date first, then ±1 day to handle timezone boundary cases
    where our UTC kickoff_utc maps to a different calendar date than ESPN's.
    """
    for delta in (0, -1, 1):
        candidate = kickoff_utc + timedelta(days=delta)
        eid = _search_scoreboard_date(home_team, away_team, candidate)
        if eid is not None:
            logger.info(
                "Mapped %s vs %s → ESPN event %d (date offset %+d)",
                home_team, away_team, eid, delta,
            )
            return eid

    logger.warning(
        "Could not find ESPN event for %s vs %s near %s",
        home_team, away_team, kickoff_utc.strftime("%Y%m%d"),
    )
    return None


def get_or_create_event_id(
    fixture_id: str,
    home_team: str,
    away_team: str,
    kickoff_utc: datetime,
    conn: psycopg.Connection,
) -> int | None:
    """Return cached ESPN event ID, discovering and storing it if needed."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT sofascore_event_id FROM sofascore_event_map WHERE fixture_id = %s",
            (fixture_id,),
        )
        row = cur.fetchone()
        if row:
            return row[0]

    eid = discover_event_id(home_team, away_team, kickoff_utc)
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
# Data fetchers
# ---------------------------------------------------------------------------

def _fetch_summary(event_id: int) -> dict[str, Any] | None:
    return _get(f"{_BASE}/summary", {"event": event_id})


def ingest_statistics(event_id: int, fixture_id: str, conn: psycopg.Connection) -> bool:
    data = _fetch_summary(event_id)
    if not data:
        return False

    teams_box = data.get("boxscore", {}).get("teams", [])
    if not teams_box:
        return False

    for i, team_box in enumerate(teams_box):
        is_home = i == 0  # ESPN returns home team first
        stats_list = team_box.get("statistics", [])
        vals: dict[str, Any] = {}
        for s in stats_list:
            col = _TEAM_STAT_MAP.get(s["name"])
            if col is None:
                continue
            try:
                raw = str(s.get("displayValue", "0")).replace("%", "").strip()
                vals[col] = float(raw) if "." in raw else int(float(raw))
            except (ValueError, TypeError):
                pass

        if not vals:
            continue

        cols = list(vals.keys())
        params = [vals[c] for c in cols]
        set_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols)
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO match_statistics (fixture_id, is_home, {", ".join(cols)})
                VALUES (%s, %s, {", ".join("%s" for _ in cols)})
                ON CONFLICT (fixture_id, is_home) DO UPDATE SET {set_clause}
                """,
                [fixture_id, is_home] + params,
            )

    conn.commit()
    logger.info("Ingested statistics for %s", fixture_id)
    return True


def ingest_events(
    event_id: int,
    fixture_id: str,
    home_team: str,
    conn: psycopg.Connection,
) -> int:
    data = _fetch_summary(event_id)
    if not data:
        return 0

    key_events = data.get("keyEvents", [])
    if not key_events:
        return 0

    with conn.cursor() as cur:
        cur.execute("DELETE FROM match_events WHERE fixture_id = %s", (fixture_id,))

    count = 0
    for ev in key_events:
        ev_type_raw = ev.get("type", {}).get("type", "")
        our_type = _EVENT_TYPE_MAP.get(ev_type_raw)
        if our_type is None:
            continue

        clock_display = ev.get("clock", {}).get("displayValue", "")
        minute, added_time = _parse_clock(clock_display)
        text = ev.get("text", "")

        player_name = _parse_event_player(text, ev_type_raw)
        assist_name = _parse_assist(text) if ev_type_raw == "goal" else None

        # Determine is_home: check if team mentioned in text matches home team
        team_in_text = None
        m = re.search(r"\(([^)]+)\)", text)
        if m:
            team_in_text = m.group(1)
        is_home = _names_match(team_in_text, home_team) if team_in_text else True

        # For drinks_break, no player name is meaningful
        if our_type == "drinks_break":
            player_name = None
            assist_name = None
            is_home = True  # not team-specific

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO match_events
                    (fixture_id, minute, added_time, incident_type, is_home,
                     player_name, assist_player_name, detail)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (fixture_id, minute, added_time, our_type, is_home,
                 player_name, assist_name, text[:500] if text else None),
            )
        count += 1

    conn.commit()
    logger.info("Ingested %d events for %s", count, fixture_id)
    return count


def ingest_commentary(event_id: int, fixture_id: str, conn: psycopg.Connection) -> int:
    data = _fetch_summary(event_id)
    if not data:
        return 0

    comments = data.get("commentary", [])
    if not comments:
        return 0

    with conn.cursor() as cur:
        cur.execute("DELETE FROM match_commentary WHERE fixture_id = %s", (fixture_id,))

    _IMPORTANT_RE = re.compile(
        r"\b(goal|yellow card|red card|substitut|penalty|offside|VAR|half.?time|full.?time|drinks? break|hydration|free.?kick)\b",
        re.IGNORECASE,
    )

    count = 0
    for c in comments:
        text = c.get("text", "").strip()
        if not text:
            continue
        clock_val = c.get("time", {}).get("value")
        minute = int(clock_val) if clock_val is not None else None
        is_important = bool(_IMPORTANT_RE.search(text))

        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO match_commentary (fixture_id, minute, text, is_important) VALUES (%s, %s, %s, %s)",
                (fixture_id, minute, text, is_important),
            )
        count += 1

    conn.commit()
    logger.info("Ingested %d commentary entries for %s", count, fixture_id)
    return count


def ingest_player_stats(
    event_id: int,
    fixture_id: str,
    conn: psycopg.Connection,
) -> int:
    data = _fetch_summary(event_id)
    if not data:
        return 0

    rosters = data.get("rosters", [])
    if not rosters:
        return 0

    count = 0
    for i, team_entry in enumerate(rosters):
        is_home = i == 0  # ESPN returns home team first
        team_name = team_entry.get("team", {}).get("displayName", "")
        team_id = _resolve_team_id(team_name, conn)

        for player in team_entry.get("roster", []):
            athlete = player.get("athlete", {})
            player_id = athlete.get("id")
            player_name = athlete.get("displayName") or athlete.get("shortName")
            if not player_id or not player_name:
                continue

            # Only include players who appeared (appearances >= 1)
            stats_raw = {s["name"]: s.get("value", 0) for s in player.get("stats", [])}
            if not stats_raw.get("appearances", 0):
                continue

            position = player.get("position", {}).get("abbreviation")
            # Simplify ESPN position codes to G/D/M/F
            pos_map = {"G": "G", "GK": "G", "CB": "D", "LB": "D", "RB": "D",
                       "CD": "D", "CD-L": "D", "CD-R": "D",
                       "CM": "M", "LM": "M", "RM": "M", "AM": "M", "DM": "M",
                       "F": "F", "LF": "F", "RF": "F", "CF": "F", "CF-L": "F", "CF-R": "F",
                       "SUB": None}
            mapped_pos = pos_map.get(position, position[:1].upper() if position else None)

            row: dict[str, Any] = {
                "fixture_id": fixture_id,
                "sofascore_player_id": int(player_id),
                "player_name": player_name,
                "team_id": team_id,
                "is_home": is_home,
                "position": mapped_pos,
                "goals": 0,
                "assists": 0,
                "yellow_cards": 0,
                "red_cards": 0,
            }

            for espn_key, db_col in _PLAYER_STAT_MAP.items():
                if db_col is None:
                    continue
                val = stats_raw.get(espn_key)
                if val is None or val == 0:
                    continue
                if db_col in ("goals", "assists", "yellow_cards", "red_cards",
                              "shots", "shots_on_target", "fouls_committed",
                              "fouls_suffered", "offsides", "saves"):
                    row[db_col] = int(val)

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


# ---------------------------------------------------------------------------
# Venue extraction
# ---------------------------------------------------------------------------

def _extract_and_update_venue(
    event_id: int,
    fixture_id: str,
    conn: psycopg.Connection,
) -> str | None:
    """
    Extract venue name from ESPN gameInfo, normalize to our canonical name,
    and update fixtures.venue if it differs from the stored value.

    Returns the canonical name, or None if not found.
    """
    data = _fetch_summary(event_id)
    if not data:
        return None

    raw_name = (
        data.get("gameInfo", {})
        .get("venue", {})
        .get("fullName")
    )
    if not raw_name:
        return None

    canonical = normalise_venue_name(raw_name) or raw_name
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE fixtures SET venue = %s WHERE id = %s AND (venue IS NULL OR venue != %s)",
            (canonical, fixture_id, canonical),
        )
    conn.commit()
    return canonical


# ---------------------------------------------------------------------------
# Momentum computation from commentary
# ---------------------------------------------------------------------------

def _team_search_patterns(team_name: str) -> set[str]:
    """All normalized spellings of a team name (canonical + known aliases)."""
    canon = _canonical(team_name)
    patterns = {canon}
    for raw, mapped in _ALL_ALIASES.items():
        if mapped == canon:
            patterns.add(raw)
    return patterns


def compute_match_momentum(
    fixture_id: str,
    home_team: str,
    away_team: str,
    conn: psycopg.Connection,
) -> int:
    """Derive per-minute momentum from match_commentary and store in match_momentum.

    Positive values = home team pressure, negative = away team pressure.
    Each commentary entry is scored by detecting team-name mentions in the text:
      - mentions home but not away: +1 (or +3 for important entries)
      - mentions away but not home: -1 (or -3 for important entries)
      - mentions both or neither: 0 (neutral, skipped)
    Per-minute raw scores are smoothed with a 5-minute centred rolling window.
    Returns the number of data points written (0 if no commentary exists).
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT minute, text, is_important FROM match_commentary "
            "WHERE fixture_id = %s AND minute IS NOT NULL ORDER BY minute ASC",
            (fixture_id,),
        )
        rows = cur.fetchall()

    if not rows:
        logger.debug("No commentary with minute data for %s; skipping momentum", fixture_id)
        return 0

    home_patterns = _team_search_patterns(home_team)
    away_patterns = _team_search_patterns(away_team)

    raw: dict[int, float] = {}
    for minute, text, is_important in rows:
        text_norm = _normalize(text)
        mentions_home = any(p in text_norm for p in home_patterns)
        mentions_away = any(p in text_norm for p in away_patterns)
        if mentions_home == mentions_away:
            continue
        weight = 3.0 if is_important else 1.0
        raw[minute] = raw.get(minute, 0.0) + (weight if mentions_home else -weight)

    if not raw:
        logger.debug("No team-attributed commentary for %s", fixture_id)
        return 0

    max_minute = max(raw)
    minutes = list(range(1, max_minute + 1))
    values = [raw.get(m, 0.0) for m in minutes]

    # 5-minute centred rolling window (±2 minutes either side)
    half_w = 2
    smoothed = []
    for i in range(len(values)):
        lo = max(0, i - half_w)
        hi = min(len(values), i + half_w + 1)
        chunk = values[lo:hi]
        smoothed.append(sum(chunk) / len(chunk))

    with conn.cursor() as cur:
        cur.execute("DELETE FROM match_momentum WHERE fixture_id = %s", (fixture_id,))
        for m, v in zip(minutes, smoothed):
            cur.execute(
                "INSERT INTO match_momentum (fixture_id, minute, value) VALUES (%s, %s, %s)",
                (fixture_id, m, round(v, 4)),
            )
    conn.commit()
    logger.info("Wrote %d momentum points for %s", len(minutes), fixture_id)
    return len(minutes)


def compute_all_momentum(conn: psycopg.Connection) -> int:
    """Recompute momentum for every fixture that has commentary with minute data."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT f.id, ht.name, awt.name
            FROM match_commentary mc
            JOIN fixtures f ON f.id = mc.fixture_id
            JOIN teams ht  ON ht.id = f.home_team_id
            JOIN teams awt ON awt.id = f.away_team_id
            WHERE mc.minute IS NOT NULL
            ORDER BY f.id
            """
        )
        rows = cur.fetchall()

    logger.info("Recomputing momentum for %d fixtures", len(rows))
    total = 0
    for fixture_id, home, away in rows:
        n = compute_match_momentum(fixture_id, home, away, conn)
        if n:
            total += 1
    return total


# ---------------------------------------------------------------------------
# Main entry: ingest one completed match
# ---------------------------------------------------------------------------

def ingest_match(
    fixture_id: str,
    home_team: str,
    away_team: str,
    kickoff_utc: datetime,
    conn: psycopg.Connection,
    force: bool = False,
) -> dict[str, int]:
    """Full ESPN ingestion for one completed match."""
    if not force:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM player_match_stats WHERE fixture_id = %s",
                (fixture_id,),
            )
            if (cur.fetchone() or [0])[0] > 0:
                logger.info("ESPN data already exists for %s; skipping", fixture_id)
                return {}

    event_id = get_or_create_event_id(fixture_id, home_team, away_team, kickoff_utc, conn)
    if event_id is None:
        logger.warning("Could not find ESPN event for %s; skipping", fixture_id)
        return {}

    logger.info("Ingesting ESPN data for %s (event %d)", fixture_id, event_id)
    venue = _extract_and_update_venue(event_id, fixture_id, conn)
    if venue:
        logger.info("  Venue: %s", venue)
    # Fetch summary once and cache is handled inside each ingestor via separate calls.
    # Each ingestor calls _fetch_summary separately — acceptable for a personal project
    # with small fixture counts. Add a shared cache here if rate limits become an issue.
    commentary_n = ingest_commentary(event_id, fixture_id, conn)
    return {
        "statistics":   int(ingest_statistics(event_id, fixture_id, conn)),
        "events":       ingest_events(event_id, fixture_id, home_team, conn),
        "commentary":   commentary_n,
        "momentum":     compute_match_momentum(fixture_id, home_team, away_team, conn),
        "player_stats": ingest_player_stats(event_id, fixture_id, conn),
    }


# ---------------------------------------------------------------------------
# Bulk runner
# ---------------------------------------------------------------------------

def ingest_all_completed(conn: psycopg.Connection) -> None:
    """Fetch and store ESPN data for all completed WC 2026 matches lacking player stats."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.id, ht.name, awt.name, f.kickoff_utc
            FROM fixtures f
            JOIN teams ht  ON ht.id  = f.home_team_id
            JOIN teams awt ON awt.id  = f.away_team_id
            JOIN match_results mr ON mr.fixture_id = f.id
            WHERE f.tournament_id = 'WC2026'
              AND f.id NOT IN (SELECT DISTINCT fixture_id FROM player_match_stats)
            ORDER BY f.kickoff_utc ASC
            """
        )
        pending = cur.fetchall()

    if not pending:
        logger.info("All completed matches already have ESPN data.")
        return

    logger.info("Ingesting ESPN data for %d pending matches", len(pending))
    for fixture_id, home, away, kickoff in pending:
        try:
            counts = ingest_match(fixture_id, home, away, kickoff, conn)
            if counts:
                logger.info("  %s: %s", fixture_id, counts)
        except Exception as exc:
            logger.error("Failed to ingest %s: %s", fixture_id, exc)
        time.sleep(2)


def main() -> None:
    import argparse, os, sys
    from dotenv import load_dotenv
    from footy.db import get_conn

    parser = argparse.ArgumentParser(description="ESPN post-match data ingestion")
    parser.add_argument("--fixture", help="Specific fixture_id to ingest")
    parser.add_argument("--force", action="store_true", help="Re-ingest even if data exists")
    parser.add_argument(
        "--momentum-all",
        action="store_true",
        help="Recompute momentum from stored commentary for all fixtures (no ESPN fetch)",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    load_dotenv()

    if not os.environ.get("DATABASE_URL"):
        print("DATABASE_URL not set")
        sys.exit(1)

    with get_conn() as conn:
        if args.momentum_all:
            n = compute_all_momentum(conn)
            print(f"Recomputed momentum for {n} fixtures.")
        elif args.fixture:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT f.id, ht.name, awt.name, f.kickoff_utc "
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
