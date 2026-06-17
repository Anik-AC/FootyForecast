"""
Kaggle historical international results loader.

Source:
    https://www.kaggle.com/datasets/martj42/international-football-results-from-1872-to-present
    CSV columns: date, home_team, away_team, home_score, away_score,
                 tournament, city, country, neutral

Usage (from python/ directory):
    uv run python -m footy.ingest.historical data/results.csv

The script is idempotent: re-running on the same CSV will not create
duplicate rows. Only data from 2002-01-01 onward is loaded; the PRD
specifies 2002 as the start of the training window.
"""

from __future__ import annotations

import csv
import datetime
import logging
import sys
from pathlib import Path

import psycopg

logger = logging.getLogger(__name__)

_TRAINING_CUTOFF = datetime.date(2002, 1, 1)
_BATCH_SIZE = 500


def _parse_row(row: dict[str, str]) -> tuple | None:
    """
    Validate and parse one CSV row into a DB insert tuple.

    Returns None to silently skip the row (pre-2002, bad data).
    Logs a warning for rows that look like they should be valid but are not.
    """
    try:
        match_date = datetime.date.fromisoformat(row["date"])
    except (ValueError, KeyError):
        logger.warning("Skipping row with unparseable date: %r", row.get("date"))
        return None

    if match_date < _TRAINING_CUTOFF:
        return None

    try:
        home_score = int(row["home_score"])
        away_score = int(row["away_score"])
    except (ValueError, KeyError):
        logger.warning(
            "Skipping row with non-integer score: %r vs %r",
            row.get("home_score"),
            row.get("away_score"),
        )
        return None

    if home_score < 0 or away_score < 0:
        logger.warning("Skipping row with negative score: %d %d", home_score, away_score)
        return None

    neutral_raw = row.get("neutral", "").strip().upper()
    neutral = neutral_raw in ("TRUE", "1", "YES")

    return (
        match_date,
        row.get("home_team", "").strip(),
        row.get("away_team", "").strip(),
        home_score,
        away_score,
        row.get("tournament", "").strip(),
        neutral,
        "kaggle",
    )


def _flush_batch(rows: list[tuple], conn: psycopg.Connection) -> int:
    """
    Insert a batch of rows into historical_matches with conflict-skip semantics.

    Uses executemany with ON CONFLICT DO NOTHING. psycopg3's executemany uses
    server-side prepared statements and batch execution, which is fast enough
    for the Kaggle dataset size (~50k rows). Returns the number of rows actually
    inserted (duplicates do not count).
    """
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO historical_matches
                (match_date, home_team, away_team, home_score, away_score,
                 tournament, neutral, source)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (match_date, home_team, away_team) DO NOTHING
            """,
            rows,
        )
        return cur.rowcount


def load_csv(path: Path, conn: psycopg.Connection) -> int:
    """
    Load the Kaggle results CSV into historical_matches.

    Filters rows before 2002-01-01. Skips rows with unparseable dates or
    scores. Idempotent via ON CONFLICT DO NOTHING on (match_date, home_team,
    away_team). Commits at the end. Returns the number of rows inserted.
    """
    batch: list[tuple] = []
    total_inserted = 0

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            parsed = _parse_row(row)
            if parsed is None:
                continue
            batch.append(parsed)
            if len(batch) >= _BATCH_SIZE:
                total_inserted += _flush_batch(batch, conn)
                batch.clear()

    if batch:
        total_inserted += _flush_batch(batch, conn)

    conn.commit()
    return total_inserted


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python -m footy.ingest.historical <path/to/results.csv>")
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"File not found: {path}")
        sys.exit(1)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from footy.db import get_conn
    with get_conn() as conn:
        inserted = load_csv(path, conn)
    print(f"Inserted {inserted} rows into historical_matches.")


if __name__ == "__main__":
    main()
