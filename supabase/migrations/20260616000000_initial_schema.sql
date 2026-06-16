-- =============================================================================
-- FootyForecast: Initial schema
-- Migration: 20260616000000_initial_schema
--
-- Key design principle: point-in-time correctness is enforced at the database
-- level, not just by convention. Two mechanisms are used:
--
-- 1. model_as_of < kickoff_utc is a CHECK constraint on match_predictions and
--    user_predictions. kickoff_utc is denormalized into both tables because a
--    Postgres CHECK constraint cannot reference another table; bringing the
--    column to where it is needed avoids a trigger.
--
-- 2. team_ratings is append-only (never UPDATE, only INSERT). The as_of column
--    records the latest match incorporated into each rating. Queries use:
--      WHERE team_id = $1 AND as_of < $kickoff ORDER BY as_of DESC LIMIT 1
--
-- All timestamps are TIMESTAMPTZ (stored in UTC).
-- All probability columns are FLOAT with CHECK constraints bounding them to
-- [0, 1].
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Reference tables
-- ---------------------------------------------------------------------------

CREATE TABLE tournaments (
    id         TEXT        PRIMARY KEY,
    name       TEXT        NOT NULL,
    start_date DATE        NOT NULL,
    end_date   DATE        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tournaments IS
    'Competition registry. WC2026 is the only row for v1.';


CREATE TABLE teams (
    id            TEXT        PRIMARY KEY,
    name          TEXT        NOT NULL,
    short_name    TEXT        NOT NULL,
    confederation TEXT        NOT NULL CHECK (confederation IN (
        'UEFA', 'CONMEBOL', 'CAF', 'AFC', 'CONCACAF', 'OFC'
    )),
    fifa_code     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE teams IS
    'One row per qualified team. Seeded at setup; does not change during the tournament.';

COMMENT ON COLUMN teams.id IS
    'FIFA three-letter code, e.g. BRA. Used as stable FK across all tables.';


CREATE TABLE fixtures (
    id            TEXT        PRIMARY KEY,
    tournament_id TEXT        NOT NULL REFERENCES tournaments(id),
    home_team_id  TEXT        NOT NULL REFERENCES teams(id),
    away_team_id  TEXT        NOT NULL REFERENCES teams(id),
    kickoff_utc   TIMESTAMPTZ NOT NULL,
    stage         TEXT        NOT NULL CHECK (stage IN (
        'group', 'round_of_32', 'round_of_16',
        'quarter_final', 'semi_final', 'final'
    )),
    group_letter  TEXT,
    venue         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT no_self_match CHECK (home_team_id <> away_team_id)
);

COMMENT ON TABLE fixtures IS
    'One row per confirmed match. Group stage rows are seeded by the ingestion '
    'pipeline from the fixture data feed. Knockout rows are inserted once opponents '
    'are determined; null-team placeholder rows are not used.';

COMMENT ON COLUMN fixtures.group_letter IS
    'Group letter A-L for group stage matches. NULL for knockout rounds.';

COMMENT ON COLUMN fixtures.id IS
    'Human-readable stable identifier, e.g. WC2026-GRP-A-01. '
    'Assigned by the ingestion pipeline from the fixture feed.';


-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------

CREATE TABLE match_results (
    fixture_id    TEXT        PRIMARY KEY REFERENCES fixtures(id),
    -- home_goals and away_goals record the score at the end of regulation
    -- (90 min) or extra time (120 min). Penalty kicks are not included in the
    -- score; they are tracked separately via pen_winner_id. The model is
    -- graded on the 90-minute outcome, which is what prediction markets use.
    home_goals    INT         NOT NULL CHECK (home_goals >= 0),
    away_goals    INT         NOT NULL CHECK (away_goals >= 0),
    outcome       TEXT        GENERATED ALWAYS AS (
        CASE
            WHEN home_goals > away_goals THEN 'home_win'
            WHEN home_goals < away_goals THEN 'away_win'
            ELSE 'draw'
        END
    ) STORED,
    went_to_et    BOOLEAN     NOT NULL DEFAULT FALSE,
    went_to_pens  BOOLEAN     NOT NULL DEFAULT FALSE,
    pen_winner_id TEXT        REFERENCES teams(id),
    confirmed_at  TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pens_require_et CHECK (
        NOT went_to_pens OR went_to_et
    ),
    CONSTRAINT pen_winner_only_when_pens CHECK (
        (went_to_pens AND pen_winner_id IS NOT NULL)
        OR (NOT went_to_pens AND pen_winner_id IS NULL)
    )
);

COMMENT ON TABLE match_results IS
    'Final results. outcome is a generated column derived from goals at '
    'regulation/extra time and reflects what the model is graded on. '
    'Penalty outcome is tracked separately for bracket propagation.';

COMMENT ON COLUMN match_results.outcome IS
    'home_win / draw / away_win at regulation/extra time. Generated from goals; '
    'never drawn from penalty result. Used for model grading.';

COMMENT ON COLUMN match_results.pen_winner_id IS
    'Populated only for knockout matches that went to a shootout. The Go '
    'simulator uses this when propagating teams through the bracket.';

COMMENT ON COLUMN match_results.confirmed_at IS
    'Timestamp when this result was ingested. Used to determine match_results_as_of '
    'in simulation runs.';


-- ---------------------------------------------------------------------------
-- Point-in-time feature tables
-- ---------------------------------------------------------------------------

CREATE TABLE team_ratings (
    id          BIGSERIAL   PRIMARY KEY,
    team_id     TEXT        NOT NULL REFERENCES teams(id),
    rating_type TEXT        NOT NULL,
    rating      FLOAT       NOT NULL,
    as_of       TIMESTAMPTZ NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE team_ratings IS
    'Append-only temporal table. One row per team per rating update. '
    'Do not UPDATE existing rows; only INSERT new ones. '
    'Correct query pattern: '
    '  SELECT rating FROM team_ratings '
    '  WHERE team_id = $1 AND as_of < $kickoff_utc '
    '  ORDER BY as_of DESC LIMIT 1';

COMMENT ON COLUMN team_ratings.as_of IS
    'Timestamp of the latest match result incorporated into this rating. '
    'Must be strictly less than the kickoff_utc of any match being predicted.';

COMMENT ON COLUMN team_ratings.rating_type IS
    'Rating system identifier, e.g. ''elo''. Extensible without schema changes.';

CREATE INDEX team_ratings_team_as_of_idx
    ON team_ratings (team_id, as_of DESC);


CREATE TABLE match_xg (
    fixture_id    TEXT        NOT NULL REFERENCES fixtures(id),
    team_id       TEXT        NOT NULL REFERENCES teams(id),
    xg_for        FLOAT       NOT NULL CHECK (xg_for >= 0),
    xg_against    FLOAT       NOT NULL CHECK (xg_against >= 0),
    shots_for     INT         CHECK (shots_for >= 0),
    shots_against INT         CHECK (shots_against >= 0),
    source        TEXT        NOT NULL,
    as_of         TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (fixture_id, team_id, source)
);

COMMENT ON TABLE match_xg IS
    'xG and shot data for historical matches, used to compute rolling form '
    'features. as_of is the timestamp when this data became available (roughly '
    'the match date). One row per (fixture, team, source) allows multiple '
    'providers per match.';

COMMENT ON COLUMN match_xg.source IS
    'Data provider identifier, e.g. ''statsbomb'' or ''fbref''.';


-- ---------------------------------------------------------------------------
-- Prediction tables
-- ---------------------------------------------------------------------------

CREATE TABLE match_predictions (
    id               BIGSERIAL   PRIMARY KEY,
    fixture_id       TEXT        NOT NULL REFERENCES fixtures(id),
    model_version    TEXT        NOT NULL,
    model_as_of      TIMESTAMPTZ NOT NULL,
    -- kickoff_utc is denormalized from fixtures so the CHECK constraint below
    -- can be enforced without a database trigger. A Postgres CHECK constraint
    -- cannot reference another table; bringing the column here is the clean
    -- alternative. It must match fixtures.kickoff_utc for this fixture_id.
    kickoff_utc      TIMESTAMPTZ NOT NULL,
    home_win_prob    FLOAT       NOT NULL CHECK (home_win_prob BETWEEN 0 AND 1),
    draw_prob        FLOAT       NOT NULL CHECK (draw_prob BETWEEN 0 AND 1),
    away_win_prob    FLOAT       NOT NULL CHECK (away_win_prob BETWEEN 0 AND 1),
    home_xg          FLOAT       CHECK (home_xg >= 0),
    away_xg          FLOAT       CHECK (away_xg >= 0),
    over_1_5         FLOAT       CHECK (over_1_5 BETWEEN 0 AND 1),
    over_2_5         FLOAT       CHECK (over_2_5 BETWEEN 0 AND 1),
    over_3_5         FLOAT       CHECK (over_3_5 BETWEEN 0 AND 1),
    btts             FLOAT       CHECK (btts BETWEEN 0 AND 1),
    feature_snapshot JSONB,
    computed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT probs_sum_to_one CHECK (
        ABS(home_win_prob + draw_prob + away_win_prob - 1.0) < 0.001
    ),
    -- Critical correctness guardrail: the model must only have seen data
    -- available before kickoff. This constraint is the database-level
    -- enforcement of the point-in-time rule.
    CONSTRAINT model_as_of_before_kickoff CHECK (model_as_of < kickoff_utc),
    UNIQUE (fixture_id, model_version)
);

COMMENT ON TABLE match_predictions IS
    'One row per (fixture, model_version). Python refreshes with '
    'INSERT ... ON CONFLICT (fixture_id, model_version) DO UPDATE.';

COMMENT ON COLUMN match_predictions.model_as_of IS
    'Point-in-time data cutoff. Must be < kickoff_utc (enforced by '
    'model_as_of_before_kickoff CHECK constraint). Displayed on the frontend.';

COMMENT ON COLUMN match_predictions.kickoff_utc IS
    'Denormalized from fixtures.kickoff_utc. Required to enforce '
    'model_as_of_before_kickoff without a trigger.';

COMMENT ON COLUMN match_predictions.feature_snapshot IS
    'Exact feature values used by the model: team ratings, form windows, rest '
    'days, etc. Write-once audit record for post-hoc leakage investigation.';

CREATE INDEX match_predictions_fixture_computed_idx
    ON match_predictions (fixture_id, computed_at DESC);


CREATE TABLE scoreline_probabilities (
    prediction_id BIGINT NOT NULL REFERENCES match_predictions(id) ON DELETE CASCADE,
    home_goals    INT    NOT NULL CHECK (home_goals BETWEEN 0 AND 7),
    away_goals    INT    NOT NULL CHECK (away_goals BETWEEN 0 AND 7),
    probability   FLOAT  NOT NULL CHECK (probability BETWEEN 0 AND 1),
    PRIMARY KEY (prediction_id, home_goals, away_goals)
);

COMMENT ON TABLE scoreline_probabilities IS
    'P(home=i, away=j) for each prediction. Goals are bounded 0-7, covering '
    '>99.9% of Poisson mass at realistic lambda values. Cascades on prediction '
    'delete so a model refresh (delete+reinsert) stays clean.';


-- ---------------------------------------------------------------------------
-- Simulation tables
-- ---------------------------------------------------------------------------

CREATE TABLE simulation_runs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    n_simulations       INT         NOT NULL CHECK (n_simulations > 0),
    match_results_as_of TIMESTAMPTZ NOT NULL,
    model_version       TEXT        NOT NULL
);

COMMENT ON TABLE simulation_runs IS
    'Metadata per Monte Carlo run. id is a UUID for stable cross-run referencing '
    '(used by the historical diff view in the frontend).';

COMMENT ON COLUMN simulation_runs.match_results_as_of IS
    'Timestamp of the latest confirmed match result incorporated into this run. '
    'Displayed on the frontend so users know which results are reflected.';

COMMENT ON COLUMN simulation_runs.n_simulations IS
    'Number of full tournament draws. Production target is 100,000+, giving '
    'stage probability estimates accurate to ~0.3pp at the 95% level.';

CREATE INDEX simulation_runs_run_at_idx
    ON simulation_runs (run_at DESC);


CREATE TABLE team_stage_probabilities (
    simulation_id UUID    NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
    team_id       TEXT    NOT NULL REFERENCES teams(id),
    eliminated    BOOLEAN NOT NULL DEFAULT FALSE,
    round_of_32   FLOAT   NOT NULL CHECK (round_of_32   BETWEEN 0 AND 1),
    round_of_16   FLOAT   NOT NULL CHECK (round_of_16   BETWEEN 0 AND 1),
    quarter_final FLOAT   NOT NULL CHECK (quarter_final BETWEEN 0 AND 1),
    semi_final    FLOAT   NOT NULL CHECK (semi_final    BETWEEN 0 AND 1),
    final         FLOAT   NOT NULL CHECK (final         BETWEEN 0 AND 1),
    champion      FLOAT   NOT NULL CHECK (champion      BETWEEN 0 AND 1),
    PRIMARY KEY (simulation_id, team_id),
    -- Stage probabilities must be monotonically non-increasing. champion <=
    -- final makes sense because you can only win the final if you reached it.
    -- This constraint catches a whole class of simulator bugs at insert time.
    CONSTRAINT stage_probs_monotone CHECK (
        champion      <= final
        AND final         <= semi_final
        AND semi_final    <= quarter_final
        AND quarter_final <= round_of_16
        AND round_of_16   <= round_of_32
    )
);

COMMENT ON TABLE team_stage_probabilities IS
    'Per-team stage-advancement probabilities from one simulation run. Values '
    'are independent reach-or-further probabilities, not mutually exclusive. '
    'The sum across all teams for a stage equals the number of teams that can '
    'reach it (e.g. exactly 1 for champion, 2 for final).';


-- ---------------------------------------------------------------------------
-- Market tables
-- ---------------------------------------------------------------------------

CREATE TABLE market_snapshots (
    id           BIGSERIAL   PRIMARY KEY,
    fixture_id   TEXT        NOT NULL REFERENCES fixtures(id),
    source       TEXT        NOT NULL CHECK (source IN ('polymarket', 'kalshi')),
    sampled_at   TIMESTAMPTZ NOT NULL,
    home_win_raw FLOAT       NOT NULL,
    draw_raw     FLOAT,
    away_win_raw FLOAT       NOT NULL,
    home_win_dev FLOAT       NOT NULL CHECK (home_win_dev BETWEEN 0 AND 1),
    draw_dev     FLOAT                CHECK (draw_dev     BETWEEN 0 AND 1),
    away_win_dev FLOAT       NOT NULL CHECK (away_win_dev BETWEEN 0 AND 1),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE market_snapshots IS
    'Pre-kickoff price snapshots from Polymarket and Kalshi. Multiple snapshots '
    'per (fixture, source) are kept; the API serves the latest by sampled_at. '
    'draw_raw and draw_dev are nullable: binary markets may not quote the draw leg.';

COMMENT ON COLUMN market_snapshots.home_win_raw IS
    'Raw implied probability. Summed across legs this exceeds 1.0 due to the '
    'bookmaker margin (vig). Do not display next to model probabilities.';

COMMENT ON COLUMN market_snapshots.home_win_dev IS
    'De-vigged (normalized) probability. Sums to 1.0 across legs and is '
    'directly comparable to model output.';

CREATE INDEX market_snapshots_fixture_source_idx
    ON market_snapshots (fixture_id, source, sampled_at DESC);


-- ---------------------------------------------------------------------------
-- Grading table
-- ---------------------------------------------------------------------------

CREATE TABLE match_grading (
    fixture_id         TEXT        NOT NULL REFERENCES fixtures(id),
    model_version      TEXT        NOT NULL,
    actual_outcome     TEXT        NOT NULL CHECK (actual_outcome IN (
        'home_win', 'draw', 'away_win'
    )),
    model_log_loss     FLOAT       NOT NULL,
    model_brier_score  FLOAT       NOT NULL,
    -- JSONB maps from source name to score, e.g. {"polymarket": 0.42}.
    -- This matches the additionalProperties pattern in the OpenAPI spec.
    market_log_loss    JSONB,
    market_brier_score JSONB,
    graded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (fixture_id, model_version)
);

COMMENT ON TABLE match_grading IS
    'Post-match scoring. One row per (fixture, model_version). '
    'market_log_loss is a JSONB map {source: score} matching the OpenAPI spec.';


-- ---------------------------------------------------------------------------
-- User predictions (leaderboard)
-- ---------------------------------------------------------------------------

CREATE TABLE user_predictions (
    id            BIGSERIAL   PRIMARY KEY,
    user_id       TEXT        NOT NULL,
    fixture_id    TEXT        NOT NULL REFERENCES fixtures(id),
    -- kickoff_utc denormalized from fixtures for the same reason as in
    -- match_predictions: to allow the CHECK constraint below.
    kickoff_utc   TIMESTAMPTZ NOT NULL,
    home_win_prob FLOAT       NOT NULL CHECK (home_win_prob BETWEEN 0 AND 1),
    draw_prob     FLOAT       NOT NULL CHECK (draw_prob     BETWEEN 0 AND 1),
    away_win_prob FLOAT       NOT NULL CHECK (away_win_prob BETWEEN 0 AND 1),
    submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    log_loss      FLOAT,
    brier_score   FLOAT,
    CONSTRAINT user_probs_sum_to_one CHECK (
        ABS(home_win_prob + draw_prob + away_win_prob - 1.0) < 0.001
    ),
    CONSTRAINT submitted_before_kickoff CHECK (submitted_at < kickoff_utc),
    UNIQUE (user_id, fixture_id)
);

COMMENT ON TABLE user_predictions IS
    'User-submitted pre-match probability distributions for the leaderboard. '
    'log_loss and brier_score are populated post-match by the grading batch job.';

COMMENT ON COLUMN user_predictions.kickoff_utc IS
    'Denormalized from fixtures.kickoff_utc. Required for the '
    'submitted_before_kickoff CHECK constraint.';
