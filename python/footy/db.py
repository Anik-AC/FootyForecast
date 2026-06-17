"""
Database connection utilities.

Reads DATABASE_URL from the environment (loaded from .env if present).
All scripts import get_conn() for a transactional psycopg3 connection.
"""

from __future__ import annotations

import contextlib
import os

import psycopg
from dotenv import load_dotenv

load_dotenv()


def connection_string() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL environment variable is not set. "
            "Copy python/.env.example to python/.env and fill in the value."
        )
    return url


@contextlib.contextmanager
def get_conn():
    """Yield a psycopg3 connection. Commits on clean exit, rolls back on exception."""
    # prepare_threshold=None disables server-side prepared statements.
    # Required for Supabase's transaction-mode pooler (port 6543), which does
    # not preserve prepared statement state between transactions.
    with psycopg.connect(connection_string(), prepare_threshold=None) as conn:
        yield conn
