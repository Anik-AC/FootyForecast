"""
Training dataset preparation for the goals model.

Processes all historical matches through EloRater (to keep ratings accurate),
then records matches where both teams are WC 2026 qualifiers as training rows.
Each row carries pre-match Elo for both sides, per-team rest days, and a
combined weight: exponential time-decay * competitive importance.

Usage:
    from footy.features.training_data import prepare_training_data
    df = prepare_training_data(conn)
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

import numpy as np
import pandas as pd
import psycopg

from footy.ingest.team_map import TEAM_NAME_MAP
from footy.ratings.elo import EloRater, elo_key, tournament_tier

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

# How much each match type contributes to the goals model likelihood.
# Friendlies carry genuine squad-vs-squad signal but tactical motivation is low;
# 0.3 is the standard "down-weight friendlies" factor used by FiveThirtyEight.
COMPETITIVE_WEIGHTS: dict[str, float] = {
    "wc":          1.00,
    "competitive": 0.75,
    "friendly":    0.30,
}

# Default rest days assumed when a team has no prior match in the dataset.
_DEFAULT_REST_DAYS = 7.0

# Cap: beyond 21 days rest the effect is negligible (pre-tournament breaks, etc.)
_REST_CAP_DAYS = 21.0


def _rest_days(match_date: date, last_seen: dict[str, date], team_key: str) -> float:
    """Days since this team's previous match. Defaults to _DEFAULT_REST_DAYS."""
    prev = last_seen.get(team_key)
    if prev is None:
        return _DEFAULT_REST_DAYS
    return min(float((match_date - prev).days), _REST_CAP_DAYS)


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
        tournament, neutral, home_elo, away_elo,
        home_rest_days, away_rest_days,
        days_ago, weight
    where weight = time_decay * competitive_weight.
    """
    today = date.today()
    rater = EloRater()
    records: list[dict] = []
    # Tracks the date of the most recent match processed for each team key.
    last_seen: dict[str, date] = {}

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
        home_rest = _rest_days(match_date, last_seen, hk)
        away_rest = _rest_days(match_date, last_seen, ak)

        rater.process_match(home, away, hg, ag, tourn, bool(neutral))
        last_seen[hk] = match_date
        last_seen[ak] = match_date

        if (
            hk in _WC_TEAM_IDS
            and ak in _WC_TEAM_IDS
            and match_date >= min_date
        ):
            tier = tournament_tier(tourn)
            records.append({
                "match_date":    match_date,
                "home_id":       hk,
                "away_id":       ak,
                "home_goals":    int(hg),
                "away_goals":    int(ag),
                "tournament":    tourn,
                "neutral":       bool(neutral),
                "home_elo":      home_elo_pre,
                "away_elo":      away_elo_pre,
                "home_rest_days": home_rest,
                "away_rest_days": away_rest,
                "days_ago":      (today - match_date).days,
                "comp_weight":   COMPETITIVE_WEIGHTS[tier],
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
        home_rest = _rest_days(match_date, last_seen, home_id)
        away_rest = _rest_days(match_date, last_seen, away_id)
        rater.process_match(home_id, away_id, hg, ag, "FIFA World Cup", neutral=True)
        last_seen[home_id] = match_date
        last_seen[away_id] = match_date
        records.append({
            "match_date":    match_date,
            "home_id":       home_id,
            "away_id":       away_id,
            "home_goals":    int(hg),
            "away_goals":    int(ag),
            "tournament":    "FIFA World Cup",
            "neutral":       True,
            "home_elo":      home_elo_pre,
            "away_elo":      away_elo_pre,
            "home_rest_days": home_rest,
            "away_rest_days": away_rest,
            "days_ago":      (today - match_date).days,
            "comp_weight":   COMPETITIVE_WEIGHTS["wc"],
        })

    df = pd.DataFrame(records)
    time_decay = np.exp(-np.log(2) * df["days_ago"] / HALF_LIFE_DAYS)
    df["weight"] = time_decay * df["comp_weight"]

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
