"""
Pytest configuration for FootyForecast integration tests.

Integration tests require a running Postgres instance with both migrations
applied (20260616000000_initial_schema and 20260617000000_historical_matches).
Set DATABASE_URL in python/.env before running integration tests.

Run only unit tests (no database):
    uv run pytest -m "not integration"

Run everything (requires Postgres):
    uv run pytest
"""

from __future__ import annotations

import pytest
import psycopg
from dotenv import load_dotenv

from footy.db import connection_string

load_dotenv()


@pytest.fixture
def pg_conn():
    """
    Provide a clean Postgres connection for each integration test.

    Truncates historical_matches at the start of each test so tests are
    independent. Using TRUNCATE at the start (not teardown) means a failed
    test does not leave dirty state that blocks the next test.

    prepare_threshold=None disables server-side prepared statements, which is
    required for Supabase's transaction-mode pooler and also prevents
    DuplicatePreparedStatement errors when multiple tests run in the same
    process.
    """
    conn = psycopg.connect(connection_string(), prepare_threshold=None, autocommit=False)
    with conn.cursor() as cur:
        cur.execute("TRUNCATE historical_matches RESTART IDENTITY")
    conn.commit()
    yield conn
    conn.close()
