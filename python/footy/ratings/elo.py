"""
Elo rating system for international football.

Implements:
  - K-factor tiering: WC=40, competitive=30, friendly=20
  - Margin-of-victory multiplier (FiveThirtyEight formula)
  - Home advantage: +100 Elo points for non-neutral venues
  - Name normalisation: WC 2026 qualifiers keyed by FIFA code so spelling
    variants (Czech Republic / Czechia, South Korea / Korea Republic) share
    a single rating entry.

Usage (from python/ directory):
    uv run python -m footy.ratings.elo

Reads historical_matches (Kaggle CSV) and completed WC 2026 fixtures from
Postgres. Writes current ratings for all 48 WC 2026 teams to team_ratings
with rating_type = 'elo'. The table is append-only so each run adds a new
dated snapshot; old rows are not touched.
"""

from __future__ import annotations

import logging
import math
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from dotenv import load_dotenv

import psycopg

from footy.ingest.team_map import TEAM_NAME_MAP

logger = logging.getLogger(__name__)

_DEFAULT_ELO = 1500.0

# WC 2026 group stage opened 2026-06-11.
# Historical matches before this date come from the Kaggle CSV.
# Results on or after this date come from fixtures + match_results.
_WC2026_START = date(2026, 6, 11)


def elo_key(raw: str) -> str:
    """
    Normalise a raw team name to a stable Elo dict key.

    WC 2026 qualifiers resolve to their FIFA code (e.g. 'Germany' -> 'GER')
    so all spelling variants share one rating entry. Non-qualifiers and
    completely unknown names fall back to the raw string.
    """
    if raw in TEAM_NAME_MAP:
        team_id = TEAM_NAME_MAP[raw]
        return team_id if team_id is not None else raw
    return raw


def tournament_tier(tournament: str) -> str:
    """
    Classify a tournament string into one of three K-factor tiers.

    wc           FIFA World Cup (not qualification rounds)
    competitive  Qualifiers, continental championships, Confederations Cup
    friendly     International friendlies and non-competitive fixtures
    """
    t = tournament.lower()
    if "world cup" in t and "qualif" not in t and "qualification" not in t:
        return "wc"
    if "friendly" in t:
        return "friendly"
    return "competitive"


@dataclass
class EloRater:
    """
    Sequential Elo rater for international football.

    Call process_match() in strict chronological order. Any team that has
    not been seen before starts at DEFAULT_ELO (1500). Ratings are stored
    by Elo key: FIFA codes for WC 2026 qualifiers, raw names for all others.
    """

    k_wc: float = 40.0
    k_competitive: float = 30.0
    k_friendly: float = 20.0
    home_advantage: float = 100.0

    _ratings: dict[str, float] = field(default_factory=dict, repr=False)
    _played: dict[str, int] = field(default_factory=dict, repr=False)

    def rating(self, key: str) -> float:
        """Current Elo for key (FIFA code or raw name)."""
        return self._ratings.get(key, _DEFAULT_ELO)

    def _k(self, tournament: str) -> float:
        tier = tournament_tier(tournament)
        return {
            "wc": self.k_wc,
            "competitive": self.k_competitive,
            "friendly": self.k_friendly,
        }[tier]

    def _expected_home(self, r_home: float, r_away: float, neutral: bool) -> float:
        """Win probability for the home (or first-listed) team."""
        effective = r_home if neutral else r_home + self.home_advantage
        return 1.0 / (1.0 + 10.0 ** ((r_away - effective) / 400.0))

    @staticmethod
    def mov_multiplier(goal_diff: int, winner_elo_advantage: float) -> float:
        """
        Margin-of-victory multiplier (FiveThirtyEight formula).

        Larger margins increase the rating change with diminishing returns.
        The autocorrelation correction in the denominator reduces the boost
        when the stronger team wins heavily (expected outcome).

        goal_diff            absolute goal difference, must be > 0.
        winner_elo_advantage winner's Elo minus loser's Elo; clamped to >= 0
                             so an upset never produces a negative multiplier.
        """
        advantage = max(winner_elo_advantage, 0.0)
        return math.log(abs(goal_diff) + 1) * (2.2 / (advantage * 0.001 + 2.2))

    def process_match(
        self,
        home_team: str,
        away_team: str,
        home_goals: int,
        away_goals: int,
        tournament: str,
        neutral: bool,
    ) -> tuple[float, float]:
        """
        Update ratings for one match and return (new_home_elo, new_away_elo).

        home_team / away_team may be raw names or FIFA codes; both are
        normalised to Elo keys internally so callers do not need to pre-process.
        """
        hk = elo_key(home_team)
        ak = elo_key(away_team)

        r_home = self.rating(hk)
        r_away = self.rating(ak)
        e_home = self._expected_home(r_home, r_away, neutral)

        goal_diff = home_goals - away_goals
        if goal_diff > 0:
            s_home = 1.0
            mov = self.mov_multiplier(goal_diff, r_home - r_away)
        elif goal_diff < 0:
            s_home = 0.0
            mov = self.mov_multiplier(goal_diff, r_away - r_home)
        else:
            s_home = 0.5
            mov = 1.0  # draws: no margin-of-victory adjustment

        k = self._k(tournament)
        delta = k * mov * (s_home - e_home)

        self._ratings[hk] = r_home + delta
        self._ratings[ak] = r_away - delta
        self._played[hk] = self._played.get(hk, 0) + 1
        self._played[ak] = self._played.get(ak, 0) + 1

        return self._ratings[hk], self._ratings[ak]

    def matches_played(self, key: str) -> int:
        return self._played.get(key, 0)

    def snapshot(self) -> dict[str, float]:
        """Return a shallow copy of the current ratings dict."""
        return dict(self._ratings)


def build_from_db(conn: psycopg.Connection) -> tuple[EloRater, date]:
    """
    Build a fully-computed EloRater from Postgres and return it with the
    as-of date (the date of the most recent match processed).

    Processing order:
    1. historical_matches with match_date < 2026-06-11 (Kaggle CSV data)
    2. Completed WC 2026 matches from fixtures + match_results

    WC 2026 matches are treated as neutral-venue with tournament tier 'wc'.
    """
    rater = EloRater()
    last_date: date = date(2002, 1, 1)

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

    logger.info("Processing %d historical matches", len(rows))
    for match_date, home, away, hg, ag, tourn, neutral in rows:
        rater.process_match(home, away, hg, ag, tourn, bool(neutral))
        if match_date > last_date:
            last_date = match_date

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.kickoff_utc::date,
                   f.home_team_id,
                   f.away_team_id,
                   r.home_goals,
                   r.away_goals
            FROM   fixtures f
            JOIN   match_results r ON r.fixture_id = f.id
            WHERE  f.tournament_id = 'WC2026'
            ORDER  BY f.kickoff_utc ASC
            """
        )
        wc_rows = cur.fetchall()

    logger.info("Processing %d completed WC 2026 matches", len(wc_rows))
    for match_date, home_id, away_id, hg, ag in wc_rows:
        rater.process_match(home_id, away_id, hg, ag, "FIFA World Cup", neutral=True)
        if match_date > last_date:
            last_date = match_date

    total_matches = sum(rater._played.values()) // 2
    logger.info("Processed %d matches total; as-of date: %s", total_matches, last_date)
    return rater, last_date


def write_ratings(
    rater: EloRater,
    as_of_date: date,
    conn: psycopg.Connection,
) -> int:
    """
    Insert current Elo for all 48 WC 2026 teams into team_ratings.

    team_ratings is append-only. Each call adds a new dated snapshot.
    The goals model queries it as:
        WHERE team_id = $1 AND as_of < $kickoff ORDER BY as_of DESC LIMIT 1

    Returns the number of rows inserted.
    """
    as_of_ts = datetime(
        as_of_date.year, as_of_date.month, as_of_date.day,
        23, 59, 59, tzinfo=timezone.utc,
    )

    with conn.cursor() as cur:
        cur.execute("SELECT id FROM teams ORDER BY id")
        team_ids = [r[0] for r in cur.fetchall()]

    rows = [
        (team_id, "elo", rater.rating(team_id), as_of_ts)
        for team_id in team_ids
    ]

    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO team_ratings (team_id, rating_type, rating, as_of) "
            "VALUES (%s, %s, %s, %s)",
            rows,
        )
    conn.commit()
    return len(rows)


def main() -> None:
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from footy.db import get_conn

    with get_conn() as conn:
        rater, as_of_date = build_from_db(conn)

        # Print top-10 WC teams as a sanity check before writing
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM teams ORDER BY id")
            team_ids = {r[0] for r in cur.fetchall()}

        wc_ratings = {tid: rater.rating(tid) for tid in team_ids}
        top10 = sorted(wc_ratings.items(), key=lambda x: -x[1])[:10]
        print("\nTop 10 WC 2026 teams by current Elo:")
        for i, (team, elo) in enumerate(top10, 1):
            played = rater.matches_played(team)
            print(f"  {i:2d}. {team:<4}  {elo:7.1f}  ({played} matches)")

        n = write_ratings(rater, as_of_date, conn)

    print(f"\nWrote {n} Elo ratings to team_ratings (as_of {as_of_date}).")


if __name__ == "__main__":
    main()
