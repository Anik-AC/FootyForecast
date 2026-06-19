"""
WC 2026 goal scorer ingestion.

Fetches tournament top scorers from football-data.org's free-tier endpoint and
upserts into player_tournament_stats. This is the data source for the
player goal probability model in footy/player_predictions.py.

Why this endpoint and not individual match events?
    The /competitions/WC/scorers endpoint is available on the free tier.
    Individual match goal events (/matches/{id}) require Tier 2. The scorers
    endpoint gives us cumulative goals/assists per player, which is enough to
    compute tournament scoring shares.

Usage (from python/ directory):
    uv run python -m footy.ingest.scorers

Environment variables:
    FOOTBALLDATA_KEY   Required.
    DATABASE_URL       Required.
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Any, Callable

import psycopg
import requests

from footy.ingest.team_map import resolve as resolve_team

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.football-data.org/v4"
_COMPETITION = "WC"
_SEASON = 2026
_MAX_SCORERS = 100

# Injectable for tests (same pattern as markets.py and previews.py).
def _default_http_get(url: str, **kwargs: Any) -> requests.Response:
    return requests.get(url, timeout=30, **kwargs)


def fetch_scorers(
    api_key: str,
    http_get: Callable = _default_http_get,
) -> list[dict]:
    """
    Fetch top WC 2026 scorers from football-data.org.

    Returns the raw scorers list. Each entry has keys:
        player: {name, id}
        team:   {name, id, ...}
        goals:  int
        assists: int | None
    """
    resp = http_get(
        f"{_BASE_URL}/competitions/{_COMPETITION}/scorers",
        params={"season": _SEASON, "limit": _MAX_SCORERS},
        headers={"X-Auth-Token": api_key},
    )
    if resp.status_code == 403:
        raise RuntimeError(
            "football-data.org returned 403 Forbidden. "
            "Check that FOOTBALLDATA_KEY is correct and that the WC competition "
            "is accessible on your plan."
        )
    resp.raise_for_status()
    return resp.json().get("scorers", [])


def load_scorers(
    scorers: list[dict],
    conn: psycopg.Connection,
) -> int:
    """
    Upsert scorer data into player_tournament_stats for WC2026.

    Skips entries where the team name is unknown (not in team_map) or maps
    to None (non-qualifier). Returns the number of rows upserted.
    """
    count = 0
    for entry in scorers:
        player_name = (entry.get("player") or {}).get("name")
        team_name = (entry.get("team") or {}).get("name")
        goals       = entry.get("goals") or 0
        assists     = entry.get("assists") or 0
        penalties   = entry.get("penalties") or 0
        appearances = entry.get("playedMatches") or 0

        if not player_name or not team_name:
            logger.debug("Skipping entry with missing player/team name: %r", entry)
            continue

        try:
            team_id = resolve_team(team_name)
        except KeyError:
            logger.warning("Unknown team %r for player %r; skipping", team_name, player_name)
            continue

        if team_id is None:
            logger.debug("Non-qualifier team %r; skipping player %r", team_name, player_name)
            continue

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO player_tournament_stats
                    (tournament_id, player_name, team_id, goals, assists,
                     penalties, appearances, updated_at)
                VALUES ('WC2026', %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (tournament_id, player_name, team_id) DO UPDATE
                    SET goals       = EXCLUDED.goals,
                        assists     = EXCLUDED.assists,
                        penalties   = EXCLUDED.penalties,
                        appearances = EXCLUDED.appearances,
                        updated_at  = NOW()
            """, (player_name, team_id, goals, assists, penalties, appearances))
        count += 1
        logger.debug("Upserted %s (%s): %d goals", player_name, team_id, goals)

    conn.commit()
    logger.info("Upserted %d player scorer entries.", count)
    return count


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Ingest WC 2026 goal scorer data.")
    args = parser.parse_args()  # noqa: F841 — placeholder for future flags

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from dotenv import load_dotenv
    load_dotenv()

    api_key = os.environ.get("FOOTBALLDATA_KEY")
    if not api_key:
        print(
            "FOOTBALLDATA_KEY is not set.\n"
            "Sign up for a free key at https://www.football-data.org/client/register\n"
            "Then add FOOTBALLDATA_KEY=<your-key> to python/.env"
        )
        sys.exit(1)

    from footy.db import get_conn

    scorers = fetch_scorers(api_key)
    logger.info("Fetched %d scorers from football-data.org", len(scorers))

    with get_conn() as conn:
        n = load_scorers(scorers, conn)

    print(f"Upserted {n} player scorer entries into player_tournament_stats.")
    sys.exit(0)


if __name__ == "__main__":
    main()
