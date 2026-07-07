"""
football-data.org WC 2026 fixture and result loader.

Data source: football-data.org (free tier)
Base URL:    https://api.football-data.org/v4
Auth header: X-Auth-Token: <your key>
Competition: WC (FIFA World Cup), season 2026

Usage (from python/ directory):
    uv run python -m footy.ingest.wc2026

Requires FOOTBALLDATA_KEY in environment (see .env.example).

The API response is cached to data/wc2026_fixtures_cache.json. Delete the
cache file whenever you need fresh data (new results, rescheduled kickoffs).
The free tier is rate-limited to 10 requests/minute; caching keeps usage well
within that limit.

Why not api-football.com?
    The free plan at api-football.com restricts access to seasons 2022-2024.
    Season 2026 requires a paid plan. football-data.org covers the FIFA World
    Cup on its free tier. Decision recorded in docs/decisions/ADR-003.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psycopg
import requests
from dotenv import load_dotenv

from footy.ingest.team_map import resolve as resolve_team

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.football-data.org/v4"
_COMPETITION = "WC"
_SEASON = 2026
_CACHE_PATH = Path(__file__).parent.parent.parent / "data" / "wc2026_fixtures_cache.json"
_CACHE_MAX_AGE_SECONDS = 3600  # re-fetch if cache is older than 1 hour

# football-data.org statuses for completed matches
_FINISHED_STATUSES = frozenset({"FINISHED", "AWARDED"})

# football-data.org stage → our fixtures.stage enum.
# The API uses LAST_32 / LAST_16 / QUARTER_FINALS / SEMI_FINALS for WC 2026,
# not the legacy ROUND_OF_32 etc. strings.
_STAGE_MAP: dict[str, str] = {
    "GROUP_STAGE":   "group",
    "LAST_32":       "round_of_32",
    "LAST_16":       "round_of_16",
    "QUARTER_FINALS": "quarter_final",
    "SEMI_FINALS":   "semi_final",
    "THIRD_PLACE":   "third_place",
    "FINAL":         "final",
    # Legacy strings kept for backwards compatibility with older API responses
    "ROUND_OF_32":   "round_of_32",
    "ROUND_OF_16":   "round_of_16",
    "QUARTER_FINAL": "quarter_final",
    "SEMI_FINAL":    "semi_final",
}

# football-data.org knockout stage → fixture ID prefix
_STAGE_PREFIX: dict[str, str] = {
    "LAST_32":        "R32",
    "LAST_16":        "R16",
    "QUARTER_FINALS": "QF",
    "SEMI_FINALS":    "SF",
    "THIRD_PLACE":    "3PL",
    "FINAL":          "FIN",
    # Legacy aliases
    "ROUND_OF_32":   "R32",
    "ROUND_OF_16":   "R16",
    "QUARTER_FINAL": "QF",
    "SEMI_FINAL":    "SF",
}


def build_fixture_id(match_id: int, fd_stage: str) -> str:
    """
    Generate a stable WC2026 fixture identifier from the football-data.org
    match ID and the competition stage.

    Embedding the API match ID makes the identifier stable across re-runs
    and reschedule events (the numeric ID never changes).

    Examples:
        build_fixture_id(585396, "GROUP_STAGE")  -> "WC2026-GRP-585396"
        build_fixture_id(585420, "ROUND_OF_32")  -> "WC2026-R32-585420"
        build_fixture_id(585436, "FINAL")        -> "WC2026-FIN-585436"
    """
    prefix = _STAGE_PREFIX.get(fd_stage, "GRP")
    return f"WC2026-{prefix}-{match_id}"


def _stage_from_fd(fd_stage: str) -> str:
    """Map a football-data.org stage string to our fixtures.stage enum value."""
    stage = _STAGE_MAP.get(fd_stage)
    if stage is None:
        logger.warning("Unrecognized stage %r; defaulting to 'group'", fd_stage)
        return "group"
    return stage


def _group_letter(fd_group: str | None) -> str | None:
    """
    Extract the group letter from a football-data.org group string.

    football-data.org uses strings like "GROUP_A", "GROUP_B", etc.
    Returns the letter ("A", "B", ...) or None for knockout rounds.
    """
    if not fd_group:
        return None
    if fd_group.startswith("GROUP_"):
        return fd_group.removeprefix("GROUP_")
    return None


def fetch_fixtures(api_key: str) -> list[dict]:
    """
    Fetch all WC 2026 fixtures from football-data.org.

    Returns the raw match list. Caches to disk on first call. Subsequent
    calls load from cache without hitting the API. Delete
    data/wc2026_fixtures_cache.json to force a fresh fetch.
    """
    _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)

    if _CACHE_PATH.exists():
        age = time.time() - _CACHE_PATH.stat().st_mtime
        if age < _CACHE_MAX_AGE_SECONDS:
            logger.info("Loading fixtures from cache (%.0f min old): %s", age / 60, _CACHE_PATH)
            with open(_CACHE_PATH, encoding="utf-8") as f:
                return json.load(f)
        logger.info("Cache is %.0f min old; re-fetching", age / 60)
        _CACHE_PATH.unlink()

    logger.info("Fetching WC %d fixtures from football-data.org", _SEASON)
    resp = requests.get(
        f"{_BASE_URL}/competitions/{_COMPETITION}/matches",
        params={"season": _SEASON},
        headers={"X-Auth-Token": api_key},
        timeout=30,
    )

    if resp.status_code == 403:
        raise RuntimeError(
            "football-data.org returned 403 Forbidden. "
            "Check that your FOOTBALLDATA_KEY is correct and that the WC "
            "competition is accessible on your plan."
        )
    resp.raise_for_status()

    data = resp.json()
    matches = data.get("matches", [])
    logger.info("Fetched %d fixtures", len(matches))

    with open(_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(matches, f)
    logger.info("Cached to %s", _CACHE_PATH)

    return matches


def load_fixtures(matches: list[dict], conn: psycopg.Connection) -> tuple[int, int]:
    """
    Upsert WC 2026 fixtures into fixtures and match_results tables.

    For each match in the API response:
    - Generates a stable fixture_id via build_fixture_id.
    - Resolves team names to FIFA codes via team_map.resolve. Skips matches
      where a team name is unknown (KeyError) or maps to None (non-qualifier).
    - Upserts into fixtures (ON CONFLICT updates kickoff_utc and venue to
      handle reschedules).
    - For FINISHED matches, upserts into match_results.

    Uses per-fixture savepoints so a single FK violation does not roll back
    the whole run. Commits at the end. Returns (fixtures_upserted, results_upserted).
    """
    fixtures_count = 0
    results_count = 0

    for match in matches:
        match_id = match.get("id")
        if match_id is None:
            continue

        fd_stage = match.get("stage", "GROUP_STAGE")
        fixture_id = build_fixture_id(match_id, fd_stage)

        date_str = match.get("utcDate")
        if not date_str:
            logger.warning("Match %d has no utcDate; skipping", match_id)
            continue
        kickoff_utc = datetime.fromisoformat(date_str.replace("Z", "+00:00")).astimezone(timezone.utc)

        status = match.get("status", "")
        home_name = (match.get("homeTeam") or {}).get("name") or ""
        away_name = (match.get("awayTeam") or {}).get("name") or ""

        # Knockout round placeholders: football-data.org pre-creates all 32
        # knockout slots at tournament start with null team names (TBD).
        if not home_name or not away_name:
            logger.debug("Match %d: teams TBD (knockout placeholder); skipping", match_id)
            continue

        try:
            home_id = resolve_team(home_name)
            away_id = resolve_team(away_name)
        except KeyError as exc:
            logger.warning("Skipping match %d (%s vs %s): %s",
                           match_id, home_name, away_name, exc)
            continue

        if home_id is None or away_id is None:
            logger.warning(
                "Match %d (%s vs %s): one team is a non-qualifier; skipping",
                match_id, home_name, away_name,
            )
            continue

        venue = match.get("venue")
        stage = _stage_from_fd(fd_stage)
        group = _group_letter(match.get("group"))

        # Parse result for completed matches.
        # football-data.org score object for WC 2026:
        #   regularTime:  score at 90 min
        #   extraTime:    ADDITIONAL goals scored only during ET (not cumulative)
        #   fullTime:     cumulative score including ET goals (but NOT penalties)
        #                 For PENALTY_SHOOTOUT matches, fullTime may incorporate
        #                 penalty goals — use regularTime+extraTime to be safe.
        #   penalties:    goals scored in the penalty shootout
        #
        # We store the score at the end of play (90 or 120 min) in home/away_goals.
        # Penalty shootout goals are NOT included — stored via pen_winner_id instead.
        went_to_et = False
        went_to_pens = False
        home_goals: int | None = None
        away_goals: int | None = None
        pen_winner_id: str | None = None

        if status in _FINISHED_STATUSES:
            score = match.get("score") or {}
            rt = score.get("regularTime") or {}
            et = score.get("extraTime") or {}
            pens = score.get("penalties") or {}
            ft = score.get("fullTime") or {}

            if et.get("home") is not None:
                # Sum regularTime + extraTime to get the 120-min score.
                rt_h = rt.get("home") or 0
                rt_a = rt.get("away") or 0
                home_goals = rt_h + et["home"]
                away_goals = rt_a + et["away"]
                went_to_et = True
            elif ft.get("home") is not None:
                home_goals = ft["home"]
                away_goals = ft["away"]

            if pens.get("home") is not None:
                went_to_pens = True
                # Determine penalty winner. Both teams score the same total in
                # football-data.org's penalties field when sudden death is used;
                # fall back to the score.winner field for disambiguation.
                pen_h = pens["home"]
                pen_a = pens["away"]
                winner_label = (score.get("winner") or "").upper()
                if pen_h > pen_a:
                    pen_winner_id = home_id
                elif pen_a > pen_h:
                    pen_winner_id = away_id
                elif winner_label == "HOME_TEAM":
                    pen_winner_id = home_id
                elif winner_label == "AWAY_TEAM":
                    pen_winner_id = away_id
                else:
                    # football-data.org sometimes reports equal penalty counts
                    # (API bug / data lag). Fall back to fullTime totals: for
                    # PENALTY_SHOOTOUT games, fullTime includes penalty goals,
                    # so whichever team has more in fullTime won the shootout.
                    ft_h = ft.get("home") or 0
                    ft_a = ft.get("away") or 0
                    if ft_h > ft_a:
                        pen_winner_id = home_id
                        logger.info(
                            "Match %d (%s vs %s): resolved pen winner from fullTime (%s-%s).",
                            match_id, home_name, away_name, ft_h, ft_a,
                        )
                    elif ft_a > ft_h:
                        pen_winner_id = away_id
                        logger.info(
                            "Match %d (%s vs %s): resolved pen winner from fullTime (%s-%s).",
                            match_id, home_name, away_name, ft_h, ft_a,
                        )
                    else:
                        logger.warning(
                            "Match %d (%s vs %s): penalty winner truly ambiguous "
                            "(pens %s-%s, fullTime %s-%s, winner=%r); defaulting to home team.",
                            match_id, home_name, away_name, pen_h, pen_a, ft_h, ft_a, winner_label,
                        )
                        pen_winner_id = home_id

        try:
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO fixtures
                            (id, tournament_id, home_team_id, away_team_id,
                             kickoff_utc, stage, group_letter, venue)
                        VALUES (%s, 'WC2026', %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE SET
                            kickoff_utc  = EXCLUDED.kickoff_utc,
                            group_letter = EXCLUDED.group_letter,
                            venue        = EXCLUDED.venue
                        """,
                        (fixture_id, home_id, away_id,
                         kickoff_utc, stage, group, venue),
                    )
                    fixtures_count += 1

                    if status in _FINISHED_STATUSES and home_goals is not None:
                        cur.execute(
                            """
                            INSERT INTO match_results
                                (fixture_id, home_goals, away_goals, went_to_et,
                                 went_to_pens, pen_winner_id, confirmed_at)
                            VALUES (%s, %s, %s, %s, %s, %s, NOW())
                            ON CONFLICT (fixture_id) DO UPDATE SET
                                home_goals    = EXCLUDED.home_goals,
                                away_goals    = EXCLUDED.away_goals,
                                went_to_et    = EXCLUDED.went_to_et,
                                went_to_pens  = EXCLUDED.went_to_pens,
                                pen_winner_id = EXCLUDED.pen_winner_id,
                                confirmed_at  = EXCLUDED.confirmed_at
                            """,
                            (fixture_id, home_goals, away_goals,
                             went_to_et, went_to_pens, pen_winner_id),
                        )
                        results_count += 1

        except psycopg.errors.ForeignKeyViolation as exc:
            logger.warning(
                "Skipping match %d (%s vs %s): team code not in teams table. "
                "Add the team to supabase/seed.sql. %s",
                match_id, home_name, away_name, exc,
            )

    conn.commit()
    return fixtures_count, results_count


def cleanup_knockout_fixtures(matches: list[dict], conn: psycopg.Connection) -> int:
    """
    Delete knockout fixtures that were previously stored with wrong IDs.

    Before the stage-map fix, knockout fixtures got a "GRP" prefix because the
    API stage strings (LAST_32, LAST_16, etc.) were not in _STAGE_MAP. This
    function deletes those bad rows by constructing the old wrong ID for each
    knockout match and removing it if it exists.

    Returns the number of rows deleted.
    """
    old_knockout_ids: list[str] = []
    for match in matches:
        match_id = match.get("id")
        fd_stage = match.get("stage", "GROUP_STAGE")
        if fd_stage == "GROUP_STAGE":
            continue  # Group fixtures had correct IDs; skip
        old_id = f"WC2026-GRP-{match_id}"
        old_knockout_ids.append(old_id)

    if not old_knockout_ids:
        logger.info("No knockout fixtures with legacy IDs found; nothing to clean up.")
        return 0

    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM fixtures WHERE id = ANY(%s)",
            (old_knockout_ids,),
        )
        count = cur.fetchone()[0]

    if count == 0:
        logger.info("No legacy-ID knockout fixtures found in DB; already clean.")
        return 0

    logger.info(
        "Deleting %d knockout fixture(s) with legacy GRP prefix IDs.",
        count,
    )
    # All tables that hold a FK to fixtures(id). None have ON DELETE CASCADE,
    # so we must delete child rows in dependency order before touching fixtures.
    child_tables = [
        "player_match_stats",
        "player_goal_predictions",
        "match_analysis",
        "match_commentary",
        "match_momentum",
        "match_statistics",
        "match_events",
        "sofascore_event_map",
        "match_grading",
        "market_snapshots",
        "match_predictions",
        "match_xg",
        "match_trivia",
        "match_previews",
        "user_predictions",
        "match_results",
    ]
    with conn.cursor() as cur:
        for tbl in child_tables:
            cur.execute(f"DELETE FROM {tbl} WHERE fixture_id = ANY(%s)", (old_knockout_ids,))  # noqa: S608
        cur.execute("DELETE FROM fixtures WHERE id = ANY(%s)", (old_knockout_ids,))
    conn.commit()
    logger.info("Deleted %d legacy fixture rows (and their child records).", count)
    return count


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Ingest WC 2026 fixtures from football-data.org")
    parser.add_argument(
        "--cleanup-knockout",
        action="store_true",
        help=(
            "Delete knockout fixtures stored with the legacy wrong GRP prefix "
            "(from before the stage-map fix) then re-ingest with correct IDs. "
            "Cascades to match_results and events for those fixtures."
        ),
    )
    parser.add_argument(
        "--force-fetch",
        action="store_true",
        help="Delete the local cache and force a fresh API fetch even if the cache is recent.",
    )
    args = parser.parse_args()

    load_dotenv()
    api_key = os.environ.get("FOOTBALLDATA_KEY")
    if not api_key:
        print(
            "FOOTBALLDATA_KEY is not set.\n"
            "Sign up for a free key at https://www.football-data.org/client/register\n"
            "Then add FOOTBALLDATA_KEY=<your-key> to python/.env"
        )
        sys.exit(1)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from footy.db import get_conn
    from footy.ingest.team_map import seed_name_map

    if args.force_fetch and _CACHE_PATH.exists():
        logger.info("--force-fetch: deleting cache %s", _CACHE_PATH)
        _CACHE_PATH.unlink()

    matches = fetch_fixtures(api_key)

    with get_conn() as conn:
        seed_name_map(conn)

        if args.cleanup_knockout:
            deleted = cleanup_knockout_fixtures(matches, conn)
            if deleted:
                print(f"Cleaned up {deleted} legacy knockout fixture(s) from DB.")

        n_fix, n_res = load_fixtures(matches, conn)

    print(f"Upserted {n_fix} fixtures and {n_res} results into the database.")
    if n_fix < len(matches):
        skipped = len(matches) - n_fix
        print(f"Note: {skipped} fixture(s) were skipped "
              "(unknown team names, non-qualifiers, or FK errors).")


if __name__ == "__main__":
    main()
