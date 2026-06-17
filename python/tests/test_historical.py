"""Tests for footy.ingest.historical."""

from __future__ import annotations

import csv
import datetime
import os
import tempfile
from pathlib import Path

import pytest

from footy.ingest.historical import _parse_row, load_csv


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row(**overrides) -> dict[str, str]:
    """Build a minimal valid CSV row dict with optional field overrides."""
    defaults = {
        "date":       "2010-06-11",
        "home_team":  "South Africa",
        "away_team":  "Mexico",
        "home_score": "1",
        "away_score": "1",
        "tournament": "FIFA World Cup",
        "city":       "Johannesburg",
        "country":    "South Africa",
        "neutral":    "TRUE",
    }
    return {**defaults, **overrides}


def _write_csv(rows: list[dict]) -> Path:
    """Write a list of row dicts to a temp CSV file, return its Path."""
    fieldnames = ["date", "home_team", "away_team", "home_score", "away_score",
                  "tournament", "city", "country", "neutral"]
    fd, path_str = tempfile.mkstemp(suffix=".csv")
    with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})
    return Path(path_str)


# ---------------------------------------------------------------------------
# Unit tests for _parse_row (no database required)
# ---------------------------------------------------------------------------

def test_parse_row_valid():
    result = _parse_row(_row())
    assert result is not None
    match_date, home, away, home_score, away_score, tournament, neutral, source = result
    assert match_date == datetime.date(2010, 6, 11)
    assert home == "South Africa"
    assert away == "Mexico"
    assert home_score == 1
    assert away_score == 1
    assert neutral is True
    assert source == "kaggle"


def test_parse_row_filters_before_2002():
    assert _parse_row(_row(date="2001-12-31")) is None


def test_parse_row_accepts_cutoff_date_exactly():
    assert _parse_row(_row(date="2002-01-01")) is not None


def test_parse_row_rejects_negative_home_score():
    assert _parse_row(_row(home_score="-1")) is None


def test_parse_row_rejects_negative_away_score():
    assert _parse_row(_row(away_score="-1")) is None


def test_parse_row_rejects_non_integer_score():
    assert _parse_row(_row(home_score="abc")) is None


def test_parse_row_rejects_bad_date():
    assert _parse_row(_row(date="not-a-date")) is None


def test_parse_row_neutral_false():
    result = _parse_row(_row(neutral="FALSE"))
    assert result is not None
    assert result[6] is False  # neutral field


def test_parse_row_zero_zero_draw():
    result = _parse_row(_row(home_score="0", away_score="0"))
    assert result is not None
    assert result[3] == 0
    assert result[4] == 0


# ---------------------------------------------------------------------------
# Integration tests for load_csv (require Postgres with migration applied)
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_load_csv_count(pg_conn):
    rows = [
        _row(date="2010-06-11", home_team="South Africa", away_team="Mexico"),
        _row(date="2010-06-12", home_team="Uruguay",      away_team="France",
             home_score="0", away_score="0", neutral="TRUE"),
    ]
    path = _write_csv(rows)
    try:
        inserted = load_csv(path, pg_conn)
        assert inserted == 2
    finally:
        path.unlink()


@pytest.mark.integration
def test_load_csv_filters_before_2002(pg_conn):
    rows = [
        _row(date="2001-12-31", home_team="A", away_team="B"),
        _row(date="2002-01-01", home_team="C", away_team="D"),
    ]
    path = _write_csv(rows)
    try:
        inserted = load_csv(path, pg_conn)
        assert inserted == 1  # only the 2002-01-01 row
    finally:
        path.unlink()


@pytest.mark.integration
def test_load_csv_idempotent(pg_conn):
    rows = [_row(date="2010-06-11", home_team="South Africa", away_team="Mexico")]
    path = _write_csv(rows)
    try:
        first_run = load_csv(path, pg_conn)
        second_run = load_csv(path, pg_conn)
        assert first_run == 1
        assert second_run == 0  # ON CONFLICT DO NOTHING
    finally:
        path.unlink()


@pytest.mark.integration
def test_load_csv_skips_negative_score(pg_conn):
    rows = [
        _row(date="2010-06-11", home_team="A", away_team="B", home_score="-1"),
        _row(date="2010-06-12", home_team="C", away_team="D"),
    ]
    path = _write_csv(rows)
    try:
        inserted = load_csv(path, pg_conn)
        assert inserted == 1  # bad row skipped, good row inserted
    finally:
        path.unlink()
