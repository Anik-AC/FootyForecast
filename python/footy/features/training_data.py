"""
Training dataset preparation for the goals model.

Processes all historical matches through EloRater (to keep ratings accurate),
then records matches where both teams are WC 2026 qualifiers as training rows.
Each row carries pre-match Elo for both sides and an exponential time-decay
weight (half-life 2 years per PRD).

Usage:
    from footy.features.training_data import prepare_training_data
    df = prepare_training_data(conn)
"""

from __future__ import annotations

import logging
from datetime import date

import numpy as np
import pandas as pd
import psycopg

from footy.ingest.team_map import TEAM_NAME_MAP
from footy.ratings.elo import EloRater, elo_key

logger = logging.getLogger(__name__)

# Only use matches from this date onward for training; older data adds noise.
TRAIN_MIN_DATE = date(2018, 1, 1)

# Exponential decay half-life in days (2 years per PRD).
HALF_LIFE_DAYS = 730.0

# WC 2026 group stage start — split historical vs live data.
_WC2026_START = date(2026, 6, 11)

# FIFA codes for all 48 WC 2026 qualifiers (derived from TEAM_NAME_MAP).
_WC_TEAM_IDS: frozenset[str] = frozenset(
    tid for tid in TEAM_NAME_MAP.values() if tid is not None
)


def prepare_training_data(
    conn: psycopg.Connection,
    min_date: date = TRAIN_MIN_DATE,
) -> pd.DataFrame:
    """
    Build the training dataset for the Bayesian goals model.

    Runs the full EloRater over all historical matches so ratings converge
    correctly, but only emits a training row when both teams are WC 2026
    qualifiers. Adds WC 2026 completed match results at the end.

    Returns a DataFrame with columns:
        match_date, home_id, away_id, home_goals, away_goals,
        tournament, neutral, home_elo, away_elo, days_ago, weight
    """
    today = date.today()
    rater = EloRater()
    records: list[dict] = []

    # --- Historical matches (Kaggle CSV) ---
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT match_date, home_team, away_team,
                   home_score, away_score, tournament, neutral
            FROM   historical_matches
            WHERE  match_date < %s
            ORDER  BY match_date ASC
            """,
            (_WC2026_START,),
        )
        rows = cur.fetchall()

    logger.info("Scanning %d historical matches for WC-vs-WC training rows", len(rows))

    for match_date, home, away, hg, ag, tourn, neutral in rows:
        hk = elo_key(home)
        ak = elo_key(away)

        home_elo_pre = rater.rating(hk)
        away_elo_pre = rater.rating(ak)

        rater.process_match(home, away, hg, ag, tourn, bool(neutral))

        if (
            hk in _WC_TEAM_IDS
            and ak in _WC_TEAM_IDS
            and match_date >= min_date
        ):
            records.append({
                "match_date": match_date,
                "home_id":    hk,
                "away_id":    ak,
                "home_goals": int(hg),
                "away_goals": int(ag),
                "tournament": tourn,
                "neutral":    bool(neutral),
                "home_elo":   home_elo_pre,
                "away_elo":   away_elo_pre,
                "days_ago":   (today - match_date).days,
            })

    # --- Completed WC 2026 matches ---
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.kickoff_utc::date,
                   f.home_team_id, f.away_team_id,
                   r.home_goals,   r.away_goals
            FROM   fixtures f
            JOIN   match_results r ON r.fixture_id = f.id
            WHERE  f.tournament_id = 'WC2026'
            ORDER  BY f.kickoff_utc ASC
            """
        )
        wc_rows = cur.fetchall()

    logger.info("Adding %d completed WC 2026 matches", len(wc_rows))

    for match_date, home_id, away_id, hg, ag in wc_rows:
        home_elo_pre = rater.rating(home_id)
        away_elo_pre = rater.rating(away_id)
        rater.process_match(home_id, away_id, hg, ag, "FIFA World Cup", neutral=True)
        records.append({
            "match_date": match_date,
            "home_id":    home_id,
            "away_id":    away_id,
            "home_goals": int(hg),
            "away_goals": int(ag),
            "tournament": "FIFA World Cup",
            "neutral":    True,
            "home_elo":   home_elo_pre,
            "away_elo":   away_elo_pre,
            "days_ago":   (today - match_date).days,
        })

    df = pd.DataFrame(records)
    df["weight"] = np.exp(-np.log(2) * df["days_ago"] / HALF_LIFE_DAYS)

    logger.info(
        "Training dataset: %d matches, %d unique teams, date range %s to %s",
        len(df),
        df["home_id"].nunique(),
        df["match_date"].min(),
        df["match_date"].max(),
    )
    return df


def load_wc_teams(conn: psycopg.Connection) -> pd.DataFrame:
    """
    Return a DataFrame with columns [team_id, confederation] for all 48 WC teams,
    ordered consistently for stable array indexing in the model.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT id, confederation FROM teams ORDER BY id")
        rows = cur.fetchall()
    return pd.DataFrame(rows, columns=["team_id", "confederation"])
