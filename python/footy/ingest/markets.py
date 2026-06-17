"""
Market data ingestion from Polymarket and Kalshi.

Fetches current pre-kickoff price snapshots for WC 2026 fixtures and
writes them to market_snapshots.

Usage (from python/ directory):
    uv run python -m footy.ingest.markets               # all upcoming fixtures
    uv run python -m footy.ingest.markets --fixture-id WC2026-GRP-A-01

Environment variables:
    DATABASE_URL    — Postgres connection string (required)
    KALSHI_API_KEY  — Kalshi bearer token (optional; Kalshi skipped if absent)

Polymarket requires no API key. Kalshi requires authentication for market data.

Design notes:
  - Both Polymarket and Kalshi are prediction-market CLOB exchanges: prices are
    already fair-value probabilities with near-zero vig. De-vigging is applied
    anyway to force the legs to sum exactly to 1.0.
  - Binary markets (no draw leg) store NULL for draw_raw/draw_dev. The grading
    module handles this by substituting the model's draw probability.
  - The fetch functions accept an optional `http_get` callable so tests can
    inject a mock without hitting the network.
"""

from __future__ import annotations

import datetime
import json
import logging
import os
import sys
from typing import Callable

import psycopg
import requests

from footy.grading import devigify
from footy.ingest.market_map import match_market_to_fixture, market_search_query

logger = logging.getLogger(__name__)

_POLYMARKET_GAMMA = "https://gamma-api.polymarket.com"
_KALSHI_API       = "https://api.kalshi.com/trade-api/v2"
_REQUEST_TIMEOUT  = 15  # seconds


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _default_http_get(url: str, headers: dict | None = None) -> dict:
    """Real HTTP GET, returns parsed JSON."""
    resp = requests.get(url, headers=headers or {}, timeout=_REQUEST_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Polymarket client
# ---------------------------------------------------------------------------

def fetch_polymarket_odds(
    home_id: str,
    away_id: str,
    http_get: Callable = _default_http_get,
) -> dict | None:
    """
    Search Polymarket for a WC 2026 match market and return raw odds.

    Returns a dict {home_win_raw, draw_raw, away_win_raw} or None if no
    matching market is found or prices are unavailable.

    Polymarket structures soccer markets in one of two ways:
      (a) Three-way: outcomes ["Home", "Draw", "Away"] or team names
      (b) Binary: "Will {Home} beat {Away}?" with outcomes ["Yes", "No"]

    In case (b), draw_raw is returned as None.
    """
    query = market_search_query(home_id, away_id)
    url = (
        f"{_POLYMARKET_GAMMA}/events"
        f"?q={requests.utils.quote(query)}"
        f"&active=true&closed=false&limit=20"
    )

    try:
        data = http_get(url)
    except Exception as exc:
        logger.warning("Polymarket search failed for %s vs %s: %s", home_id, away_id, exc)
        return None

    events = data if isinstance(data, list) else data.get("events", data)
    if not isinstance(events, list):
        logger.warning("Unexpected Polymarket response shape: %r", type(data))
        return None

    for event in events:
        for market in event.get("markets", []):
            question = market.get("question", "")
            if not match_market_to_fixture(question, home_id, away_id):
                # Also try event title as fallback.
                if not match_market_to_fixture(event.get("title", ""), home_id, away_id):
                    continue

            outcomes_raw = market.get("outcomes", "[]")
            prices_raw   = market.get("outcomePrices", "[]")

            try:
                outcomes: list[str] = (
                    json.loads(outcomes_raw)
                    if isinstance(outcomes_raw, str)
                    else outcomes_raw
                )
                prices: list[str] = (
                    json.loads(prices_raw)
                    if isinstance(prices_raw, str)
                    else prices_raw
                )
                prices_f = [float(p) for p in prices]
            except (json.JSONDecodeError, ValueError) as exc:
                logger.warning("Cannot parse Polymarket prices for %s: %s", question, exc)
                continue

            return _parse_polymarket_market(outcomes, prices_f, home_id, away_id)

    logger.info("No Polymarket market found for %s vs %s", home_id, away_id)
    return None


def _parse_polymarket_market(
    outcomes: list[str],
    prices: list[float],
    home_id: str,
    away_id: str,
) -> dict | None:
    """
    Convert Polymarket outcomes/prices into {home_win_raw, draw_raw, away_win_raw}.

    Handles three outcome shapes:
      - ["Yes", "No"]: binary; YES = home team wins (assuming "Will {home} beat {away}?")
      - [home_name, "Draw", away_name]: three-way
      - [home_name, away_name]: binary without draw
    """
    if len(outcomes) != len(prices) or not outcomes:
        return None

    norm = [o.lower().strip() for o in outcomes]

    if len(outcomes) == 2:
        if set(norm) == {"yes", "no"}:
            yes_idx = norm.index("yes")
            no_idx  = norm.index("no")
            # "Will {home} beat {away}?" YES = home win, NO = away win (no draw).
            home_raw = prices[yes_idx]
            away_raw = prices[no_idx]
            h, _, a = devigify(home_raw, None, away_raw)
            return {"home_win_raw": home_raw, "draw_raw": None,
                    "away_win_raw": away_raw, "home_win_dev": h, "draw_dev": None, "away_win_dev": a}
        else:
            # Two named outcomes: team A vs team B, no draw.
            home_raw = prices[0]
            away_raw = prices[1]
            h, _, a = devigify(home_raw, None, away_raw)
            return {"home_win_raw": home_raw, "draw_raw": None,
                    "away_win_raw": away_raw, "home_win_dev": h, "draw_dev": None, "away_win_dev": a}

    if len(outcomes) == 3:
        # Find draw position.
        draw_idx = next((i for i, o in enumerate(norm) if "draw" in o or "tie" in o), None)
        if draw_idx is None:
            # No draw in three outcomes: unusual but treat as first=home, last=away.
            h, _, a = devigify(prices[0], None, prices[2])
            return {"home_win_raw": prices[0], "draw_raw": None,
                    "away_win_raw": prices[2], "home_win_dev": h, "draw_dev": None, "away_win_dev": a}

        remaining = [i for i in range(3) if i != draw_idx]
        # Determine which of the remaining two is home vs away by name matching.
        # If we can't tell, assume first = home.
        home_idx = remaining[0]
        away_idx = remaining[1]
        h, d, a = devigify(prices[home_idx], prices[draw_idx], prices[away_idx])
        return {
            "home_win_raw": prices[home_idx],
            "draw_raw":     prices[draw_idx],
            "away_win_raw": prices[away_idx],
            "home_win_dev": h,
            "draw_dev":     d,
            "away_win_dev": a,
        }

    return None


# ---------------------------------------------------------------------------
# Kalshi client
# ---------------------------------------------------------------------------

def fetch_kalshi_odds(
    home_id: str,
    away_id: str,
    api_key: str | None = None,
    http_get: Callable = _default_http_get,
) -> dict | None:
    """
    Search Kalshi for a WC 2026 match market and return raw odds.

    Returns {home_win_raw, draw_raw, away_win_raw} or None.

    Kalshi markets are binary contracts. A match typically has two markets:
      - "Will {Home} win?" (yes_price = implied P(home win))
      - "Will {Away} win?" (yes_price = implied P(away win))
    No explicit draw market is usual; draw_raw is None.

    Authentication via bearer token is required by Kalshi's API.
    """
    if not api_key:
        logger.debug("KALSHI_API_KEY not set; skipping Kalshi for %s vs %s", home_id, away_id)
        return None

    headers = {"Authorization": f"Bearer {api_key}"}

    from footy.ingest.market_map import market_name
    home_name = market_name(home_id)
    away_name = market_name(away_id)
    query = f"{home_name} {away_name} 2026"

    url = (
        f"{_KALSHI_API}/markets"
        f"?limit=20&status=open"
        f"&full_text_search={requests.utils.quote(query)}"
    )

    try:
        data = http_get(url, headers=headers)
    except Exception as exc:
        logger.warning("Kalshi search failed for %s vs %s: %s", home_id, away_id, exc)
        return None

    markets = data.get("markets", [])
    if not markets:
        logger.info("No Kalshi market found for %s vs %s", home_id, away_id)
        return None

    # Collect home-win and away-win markets for this fixture.
    home_price: float | None = None
    away_price: float | None = None

    for mkt in markets:
        title = mkt.get("title", "") or mkt.get("question", "")
        if not title:
            continue

        yes_bid  = mkt.get("yes_bid",  0.0) or 0.0
        yes_ask  = mkt.get("yes_ask",  0.0) or 0.0
        mid      = (float(yes_bid) + float(yes_ask)) / 2.0

        if mid <= 0:
            continue

        # A market titled "Will {Home} win?" yields P(home win).
        # A market titled "Will {Away} win?" yields P(away win).
        norm_title = title.lower()
        if home_name.lower() in norm_title and ("win" in norm_title or "beat" in norm_title):
            if away_name.lower() not in norm_title:
                # "Will Brazil win?" style
                home_price = mid
                continue
        if away_name.lower() in norm_title and ("win" in norm_title or "beat" in norm_title):
            if home_name.lower() not in norm_title:
                away_price = mid

    if home_price is None or away_price is None:
        logger.info(
            "Kalshi: incomplete markets for %s vs %s (home=%s away=%s)",
            home_id, away_id, home_price, away_price,
        )
        return None

    h, _, a = devigify(home_price, None, away_price)
    return {
        "home_win_raw": home_price,
        "draw_raw":     None,
        "away_win_raw": away_price,
        "home_win_dev": h,
        "draw_dev":     None,
        "away_win_dev": a,
    }


# ---------------------------------------------------------------------------
# DB write
# ---------------------------------------------------------------------------

def write_snapshot(
    conn: psycopg.Connection,
    fixture_id: str,
    source: str,
    odds: dict,
    sampled_at: datetime.datetime | None = None,
) -> None:
    """
    Insert one market snapshot row into market_snapshots.

    odds keys: home_win_raw, draw_raw, away_win_raw, home_win_dev, draw_dev, away_win_dev
    """
    if sampled_at is None:
        sampled_at = datetime.datetime.now(datetime.timezone.utc)

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO market_snapshots
                (fixture_id, source, sampled_at,
                 home_win_raw, draw_raw,     away_win_raw,
                 home_win_dev, draw_dev,     away_win_dev)
            VALUES
                (%(fixture_id)s, %(source)s, %(sampled_at)s,
                 %(home_win_raw)s, %(draw_raw)s, %(away_win_raw)s,
                 %(home_win_dev)s, %(draw_dev)s, %(away_win_dev)s)
        """, {
            "fixture_id":   fixture_id,
            "source":       source,
            "sampled_at":   sampled_at,
            "home_win_raw": odds["home_win_raw"],
            "draw_raw":     odds.get("draw_raw"),
            "away_win_raw": odds["away_win_raw"],
            "home_win_dev": odds["home_win_dev"],
            "draw_dev":     odds.get("draw_dev"),
            "away_win_dev": odds["away_win_dev"],
        })


def load_snapshots(
    conn: psycopg.Connection,
    fixture_ids: list[str] | None = None,
    kalshi_api_key: str | None = None,
    http_get: Callable = _default_http_get,
) -> int:
    """
    Fetch and store market snapshots for WC 2026 fixtures.

    If fixture_ids is None, targets all fixtures that have not yet kicked off.
    Returns the total number of snapshot rows inserted.
    """
    now = datetime.datetime.now(datetime.timezone.utc)

    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        if fixture_ids:
            cur.execute("""
                SELECT f.id, f.home_team_id, f.away_team_id
                FROM fixtures f
                WHERE f.tournament_id = 'WC2026'
                  AND f.id = ANY(%s)
                ORDER BY f.kickoff_utc
            """, (fixture_ids,))
        else:
            cur.execute("""
                SELECT f.id, f.home_team_id, f.away_team_id
                FROM fixtures f
                WHERE f.tournament_id = 'WC2026'
                  AND f.kickoff_utc > %s
                ORDER BY f.kickoff_utc
                LIMIT 48
            """, (now,))
        fixtures = cur.fetchall()

    if not fixtures:
        logger.info("No upcoming fixtures found.")
        return 0

    inserted = 0

    for fix in fixtures:
        fid      = fix["id"]
        home_id  = fix["home_team_id"]
        away_id  = fix["away_team_id"]

        for source, odds in [
            ("polymarket", fetch_polymarket_odds(home_id, away_id, http_get=http_get)),
            ("kalshi",     fetch_kalshi_odds(home_id, away_id,
                                             api_key=kalshi_api_key, http_get=http_get)),
        ]:
            if odds is None:
                continue
            try:
                write_snapshot(conn, fid, source, odds, sampled_at=now)
                inserted += 1
                logger.info("Stored %s snapshot for %s", source, fid)
            except Exception as exc:
                logger.warning("Failed to write %s snapshot for %s: %s", source, fid, exc)
                conn.rollback()
                continue

    conn.commit()
    return inserted


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Fetch WC 2026 market snapshots.")
    parser.add_argument("--fixture-id", nargs="*", help="Limit to specific fixture IDs.")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from dotenv import load_dotenv
    load_dotenv()

    kalshi_key = os.environ.get("KALSHI_API_KEY")

    from footy.db import get_conn
    with get_conn() as conn:
        n = load_snapshots(conn, fixture_ids=args.fixture_id, kalshi_api_key=kalshi_key)

    print(f"Inserted {n} market snapshot row(s).")
    sys.exit(0)


if __name__ == "__main__":
    main()
