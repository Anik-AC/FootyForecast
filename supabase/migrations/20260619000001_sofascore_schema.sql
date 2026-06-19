-- =============================================================================
-- FootyForecast: Sofascore post-match data
-- Migration: 20260619000001_sofascore_schema
--
-- Stores all data scraped from Sofascore's unofficial API after each match:
--   sofascore_event_map   — our fixture_id → sofascore numeric event ID
--   match_events          — goals, cards, subs with exact minute
--   match_statistics      — team-level aggregates (possession, xG, shots, etc.)
--   match_momentum        — per-minute momentum values (positive = home)
--   match_commentary      — timestamped commentary lines
--   player_match_stats    — per-player per-match stats (all categories)
--   match_analysis        — LLM-generated match analysis (hydration breaks etc.)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Sofascore ID mapping
-- ---------------------------------------------------------------------------

CREATE TABLE sofascore_event_map (
    fixture_id         TEXT        PRIMARY KEY REFERENCES fixtures(id),
    sofascore_event_id INT         NOT NULL UNIQUE,
    mapped_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sofascore_event_map IS
    'Maps our fixture IDs to Sofascore numeric event IDs. Populated on first '
    'scrape of each match. Used for all subsequent Sofascore API calls.';

-- ---------------------------------------------------------------------------
-- Match events (goals, cards, substitutions, VAR)
-- ---------------------------------------------------------------------------

CREATE TABLE match_events (
    id                 BIGSERIAL   PRIMARY KEY,
    fixture_id         TEXT        NOT NULL REFERENCES fixtures(id),
    minute             INT         NOT NULL,
    added_time         INT,
    incident_type      TEXT        NOT NULL,  -- goal, yellow_card, red_card, substitution, var
    is_home            BOOLEAN     NOT NULL,
    player_name        TEXT,
    assist_player_name TEXT,
    detail             TEXT,       -- e.g. "Left foot shot from inside box"
    sofascore_player_id INT
);

CREATE INDEX match_events_fixture_idx ON match_events (fixture_id, minute);

COMMENT ON TABLE match_events IS
    'One row per match incident from Sofascore. Includes goals with assist info, '
    'yellow/red cards, substitutions, and VAR decisions with the minute they occurred.';

-- ---------------------------------------------------------------------------
-- Team-level match statistics
-- ---------------------------------------------------------------------------

CREATE TABLE match_statistics (
    fixture_id         TEXT        NOT NULL REFERENCES fixtures(id),
    is_home            BOOLEAN     NOT NULL,

    possession_pct     FLOAT,      -- ball possession percentage
    expected_goals     FLOAT,      -- xG
    big_chances        INT,
    total_shots        INT,
    shots_on_target    INT,
    goalkeeper_saves   INT,
    corner_kicks       INT,
    fouls              INT,
    passes_total       INT,
    passes_accurate    INT,
    tackles            INT,
    free_kicks         INT,
    yellow_cards       INT,
    red_cards          INT,
    offsides           INT,

    PRIMARY KEY (fixture_id, is_home)
);

COMMENT ON TABLE match_statistics IS
    'Team-level match stats from Sofascore (one row per team per match). '
    'Source: /api/v1/event/{id}/statistics grouped by period=ALL.';

-- ---------------------------------------------------------------------------
-- Per-minute momentum
-- ---------------------------------------------------------------------------

CREATE TABLE match_momentum (
    fixture_id TEXT    NOT NULL REFERENCES fixtures(id),
    minute     INT     NOT NULL,
    value      FLOAT   NOT NULL,  -- positive = home momentum, negative = away
    PRIMARY KEY (fixture_id, minute)
);

COMMENT ON TABLE match_momentum IS
    'Per-minute momentum values from Sofascore graphPoints. Positive = home '
    'team dominating that minute, negative = away. Range roughly -10 to +10.';

-- ---------------------------------------------------------------------------
-- Match commentary
-- ---------------------------------------------------------------------------

CREATE TABLE match_commentary (
    id           BIGSERIAL   PRIMARY KEY,
    fixture_id   TEXT        NOT NULL REFERENCES fixtures(id),
    minute       INT,
    text         TEXT        NOT NULL,
    is_important BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX match_commentary_fixture_idx ON match_commentary (fixture_id, minute);

COMMENT ON TABLE match_commentary IS
    'Full match commentary from Sofascore comments endpoint. is_important flags '
    'goal/card/sub-level entries. Used for hydration break detection.';

-- ---------------------------------------------------------------------------
-- Per-player per-match statistics
-- ---------------------------------------------------------------------------

CREATE TABLE player_match_stats (
    fixture_id              TEXT        NOT NULL REFERENCES fixtures(id),
    sofascore_player_id     INT         NOT NULL,
    player_name             TEXT        NOT NULL,
    team_id                 TEXT        REFERENCES teams(id),
    is_home                 BOOLEAN     NOT NULL,
    position                TEXT,       -- G, D, M, F

    -- Core
    minutes_played          INT,
    rating                  FLOAT,      -- Sofascore 1-10 rating

    -- Goals & assists
    goals                   INT         NOT NULL DEFAULT 0,
    assists                 INT         NOT NULL DEFAULT 0,

    -- Disciplinary
    yellow_cards            INT         NOT NULL DEFAULT 0,
    red_cards               INT         NOT NULL DEFAULT 0,

    -- Attack
    shots                   INT,
    shots_on_target         INT,
    big_chances_created     INT,
    big_chances_missed      INT,
    goals_inside_box        INT,
    goals_outside_box       INT,
    dribble_attempts        INT,
    dribbles_won            INT,

    -- Defense
    tackles                 INT,
    interceptions           INT,
    clearances              INT,
    blocks                  INT,
    duels_total             INT,
    duels_won               INT,
    aerial_duels_won        INT,

    -- Passing
    passes_total            INT,
    passes_accurate         INT,
    key_passes              INT,
    long_balls_total        INT,
    long_balls_accurate     INT,
    crosses_total           INT,
    crosses_accurate        INT,

    -- Goalkeeping
    saves                   INT,
    saves_inside_box        INT,
    clean_sheet             BOOLEAN,
    penalties_saved         INT,
    runs_out                INT,

    -- Other
    fouls_committed         INT,
    fouls_suffered          INT,
    offsides                INT,
    dispossessed            INT,

    PRIMARY KEY (fixture_id, sofascore_player_id)
);

CREATE INDEX player_match_stats_fixture_idx ON player_match_stats (fixture_id, is_home);
CREATE INDEX player_match_stats_player_idx  ON player_match_stats (player_name, team_id);

COMMENT ON TABLE player_match_stats IS
    'Per-player per-match statistics from Sofascore lineups endpoint. Covers all '
    'stat categories: general, attack, defense, passing, goalkeeping. One row per '
    'player per match. Used both for frontend display and as model training features.';

-- ---------------------------------------------------------------------------
-- LLM match analysis
-- ---------------------------------------------------------------------------

CREATE TABLE match_analysis (
    fixture_id              TEXT        PRIMARY KEY REFERENCES fixtures(id),
    analysis_text           TEXT        NOT NULL,
    has_hydration_break     BOOLEAN     NOT NULL DEFAULT FALSE,
    hydration_break_minute  INT,
    generated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model_used              TEXT
);

COMMENT ON TABLE match_analysis IS
    'LLM-generated post-match analysis. Includes hydration break detection and '
    'momentum analysis around cooling break minutes. Generated by OpenRouter.';
