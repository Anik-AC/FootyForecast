"""
Background scheduler: polls football-data.org for new WC 2026 results and
runs the full update pipeline automatically whenever new results are found.

Pipeline (triggered by each new match result):
  1.  Ingest results         footy.ingest.wc2026
  2.  Update Elo ratings     footy.ratings.elo
  3.  Regenerate predictions footy.models.predict   (picks up new knockout fixtures)
  4.  Grade predictions      footy.grading
  5.  Bracket simulation     go/simulator (subprocess)
  6.  Scorer stats           footy.ingest.scorers
  7.  Player predictions     footy.player_predictions
  8.  Trivia refresh         footy.trivia
  9.  LLM previews           footy.previews         (requires OPENROUTER_API_KEY)
  10. ESPN post-match        footy.ingest.espn
  11. LLM match analysis     footy.analysis.match_analyzer (requires OPENROUTER_API_KEY)

Usage:
    uv run python -m footy.scheduler

Environment variables (from python/.env):
    DATABASE_URL          required
    FOOTBALLDATA_KEY      required (football-data.org free key)
    OPENROUTER_API_KEY    optional; previews are skipped if absent
    SCHEDULER_INTERVAL    optional; seconds between polls (default: 300)
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Default poll interval: 5 minutes. Configurable so you can set a shorter
# interval during match days or a longer one during off-days.
_POLL_INTERVAL = int(os.environ.get("SCHEDULER_INTERVAL", "300"))

_REPO_ROOT = Path(__file__).parent.parent.parent
_SIMULATOR_DIR = _REPO_ROOT / "go" / "simulator"
_SIMULATOR_N = "100000"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _count_results(conn) -> int:
    """Return the number of completed WC 2026 match results in the DB."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*)
            FROM   match_results mr
            JOIN   fixtures f ON f.id = mr.fixture_id
            WHERE  f.tournament_id = 'WC2026'
            """
        )
        return cur.fetchone()[0]


def _run_simulator() -> None:
    """Run the Go Monte Carlo bracket simulator via subprocess."""
    logger.info("Simulator: starting (%s iterations)...", _SIMULATOR_N)
    result = subprocess.run(
        ["go", "run", "./cmd/simulator", f"--n={_SIMULATOR_N}"],
        cwd=_SIMULATOR_DIR,
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode != 0:
        logger.error("Simulator failed (exit %d):\n%s", result.returncode, result.stderr)
    else:
        last_line = result.stdout.strip().splitlines()[-1] if result.stdout.strip() else "ok"
        logger.info("Simulator done: %s", last_line)


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def run_content_refresh(conn, api_key: str, openrouter_key: str | None) -> None:
    """
    Refresh all display content without requiring new results.

    Run once on startup to ensure grading, trivia, previews and player
    predictions are populated even when results were ingested in a prior
    session. All steps are idempotent.
    """
    logger.info("=== Startup content refresh ===")

    try:
        from footy.grading import grade_completed_matches, grade_user_predictions
        n_model = grade_completed_matches(conn)
        n_user = grade_user_predictions(conn)
        logger.info("Grading: %d model, %d user predictions graded", n_model, n_user)
    except Exception as exc:
        logger.error("Grading failed: %s", exc)

    try:
        from footy.ingest.scorers import fetch_scorers, load_scorers
        scorers = fetch_scorers(api_key)
        n_scorers = load_scorers(scorers, conn)
        logger.info("Scorers: %d player stat rows written", n_scorers)
    except Exception as exc:
        logger.error("Scorer ingestion failed: %s", exc)

    try:
        from footy.player_predictions import generate_all
        n_player = generate_all(conn)
        logger.info("Player predictions: %d rows written", n_player)
    except Exception as exc:
        logger.error("Player prediction generation failed: %s", exc)

    try:
        from footy.trivia import generate_all as generate_trivia
        n_trivia = generate_trivia(conn)
        logger.info("Trivia: %d fixtures updated", n_trivia)
    except Exception as exc:
        logger.error("Trivia refresh failed: %s", exc)

    if openrouter_key:
        try:
            from footy.previews import generate_all as generate_previews
            n_prev = generate_previews(conn)
            logger.info("Previews: %d generated", n_prev)
        except Exception as exc:
            logger.error("Preview generation failed: %s", exc)
    else:
        logger.info("OPENROUTER_API_KEY not set — skipping previews.")

    logger.info("=== Startup refresh complete ===")


def run_pipeline(conn, api_key: str, openrouter_key: str | None) -> bool:
    """
    Run the full post-match update pipeline against the provided connection.

    Returns True if new results were found and processed, False if nothing
    had changed since the last poll (pipeline skipped after ingest).
    """
    from footy.ingest.wc2026 import _CACHE_PATH, fetch_fixtures, load_fixtures

    # Always delete the on-disk cache so we fetch fresh data from the API.
    # The cache exists to avoid burning API quota during development; the
    # scheduler manages its own polling interval instead.
    if _CACHE_PATH.exists():
        _CACHE_PATH.unlink()

    results_before = _count_results(conn)

    try:
        matches = fetch_fixtures(api_key)
        n_fix, n_res = load_fixtures(matches, conn)
        logger.info("Ingest: %d fixtures, %d results upserted", n_fix, n_res)
    except Exception as exc:
        logger.error("Ingest failed: %s", exc)
        return False

    results_after = _count_results(conn)
    new_results = results_after - results_before

    if new_results == 0:
        logger.info("No new results — nothing to do.")
        return False

    logger.info("=== %d new result(s) detected — running full pipeline ===", new_results)

    # Step 2: Update Elo ratings.
    # Reads historical_matches + completed WC 2026 fixtures and appends a new
    # dated snapshot to team_ratings. The goals model and simulator both read
    # the latest snapshot when scoring upcoming fixtures.
    try:
        from footy.ratings.elo import build_from_db, write_ratings
        rater, as_of_date = build_from_db(conn)
        n_ratings = write_ratings(rater, as_of_date, conn)
        logger.info("Elo: %d ratings written (as-of %s)", n_ratings, as_of_date)
    except Exception as exc:
        logger.error("Elo update failed: %s", exc)

    # Step 3: Regenerate match predictions.
    # The Bayesian model trace is static (trained pre-tournament), but re-running
    # predict_all_upcoming picks up knockout fixtures whose teams are now known
    # after group stage results finalise round participants.
    try:
        from footy.models.goals import load as load_goals_model
        from footy.models.predict import predict_all_upcoming
        trace, meta = load_goals_model()
        n_preds = predict_all_upcoming(conn, trace, meta, datetime.now(tz=timezone.utc))
        logger.info("Predictions: %d fixtures updated", n_preds)
    except FileNotFoundError:
        logger.warning(
            "Model trace not found — skipping prediction regeneration. "
            "Run 'uv run python -m footy.models.goals' to train the model first."
        )
    except Exception as exc:
        logger.error("Prediction regeneration failed: %s", exc)

    # Step 4: Grade completed predictions (model + user).
    try:
        from footy.grading import grade_completed_matches, grade_user_predictions
        n_model = grade_completed_matches(conn)
        n_user = grade_user_predictions(conn)
        logger.info("Grading: %d model, %d user predictions graded", n_model, n_user)
    except Exception as exc:
        logger.error("Grading failed: %s", exc)

    # Step 5: Re-run Monte Carlo bracket simulator.
    # Reads updated match_predictions and match_results to propagate group
    # standings and knockout-round advancement probabilities.
    try:
        _run_simulator()
    except Exception as exc:
        logger.error("Simulator failed: %s", exc)

    # Step 6: Refresh scorer stats from football-data.org.
    try:
        from footy.ingest.scorers import fetch_scorers, load_scorers
        scorers = fetch_scorers(api_key)
        n_scorers = load_scorers(scorers, conn)
        logger.info("Scorers: %d player stat rows written", n_scorers)
    except Exception as exc:
        logger.error("Scorer ingestion failed: %s", exc)

    # Step 7: Regenerate player anytime-scorer predictions.
    try:
        from footy.player_predictions import generate_all
        n_player = generate_all(conn)
        logger.info("Player predictions: %d rows written", n_player)
    except Exception as exc:
        logger.error("Player prediction generation failed: %s", exc)

    # Step 8: Refresh trivia for upcoming fixtures.
    try:
        from footy.trivia import generate_all as generate_trivia
        n_trivia = generate_trivia(conn)
        logger.info("Trivia: %d fixtures updated", n_trivia)
    except Exception as exc:
        logger.error("Trivia refresh failed: %s", exc)

    # Step 9: Refresh LLM previews for upcoming fixtures.
    if openrouter_key:
        try:
            from footy.previews import generate_all as generate_previews
            n_prev = generate_previews(conn)
            logger.info("Previews: %d generated", n_prev)
        except Exception as exc:
            logger.error("Preview generation failed: %s", exc)
    else:
        logger.info("OPENROUTER_API_KEY not set — skipping previews.")

    # Step 10: Ingest ESPN post-match data (stats, events, commentary, player stats).
    # Only runs for completed matches that do not yet have player_match_stats rows.
    try:
        from footy.ingest.espn import ingest_all_completed
        ingest_all_completed(conn)
    except Exception as exc:
        logger.error("ESPN ingestion failed: %s", exc)

    # Step 11: Generate LLM post-match analysis for newly ingested matches.
    # Requires commentary to exist (populated by step 10) and OPENROUTER_API_KEY.
    if openrouter_key:
        try:
            from footy.analysis.match_analyzer import generate_analysis
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT mc.fixture_id
                    FROM   match_commentary mc
                    LEFT   JOIN match_analysis ma ON ma.fixture_id = mc.fixture_id
                    WHERE  ma.fixture_id IS NULL
                    """
                )
                pending = [r[0] for r in cur.fetchall()]
            n_analyses = 0
            for fid in pending:
                if generate_analysis(fid, conn):
                    n_analyses += 1
            logger.info("Match analysis: %d generated", n_analyses)
        except Exception as exc:
            logger.error("Match analysis failed: %s", exc)
    else:
        logger.info("OPENROUTER_API_KEY not set — skipping match analysis.")

    logger.info("=== Pipeline complete ===")
    return True


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )

    api_key = os.environ.get("FOOTBALLDATA_KEY")
    if not api_key:
        logger.error(
            "FOOTBALLDATA_KEY is not set. "
            "Add it to python/.env and restart the scheduler."
        )
        sys.exit(1)

    openrouter_key = os.environ.get("OPENROUTER_API_KEY") or None

    from footy.db import get_conn

    logger.info(
        "Scheduler started. Polling every %ds for new WC 2026 results.",
        _POLL_INTERVAL,
    )

    # On startup, refresh all display content regardless of whether new
    # results exist. This handles the case where results were ingested in a
    # prior session and the DB is ahead of the scheduler's knowledge.
    try:
        with get_conn() as conn:
            run_content_refresh(conn, api_key, openrouter_key)
    except Exception as exc:
        logger.error("Startup refresh failed: %s", exc, exc_info=True)

    while True:
        logger.info("--- Poll at %s ---", datetime.now(tz=timezone.utc).strftime("%H:%M:%S UTC"))
        try:
            with get_conn() as conn:
                run_pipeline(conn, api_key, openrouter_key)
        except Exception as exc:
            logger.error("Unhandled error in pipeline: %s", exc, exc_info=True)

        logger.info("Sleeping %ds...", _POLL_INTERVAL)
        time.sleep(_POLL_INTERVAL)


if __name__ == "__main__":
    main()
