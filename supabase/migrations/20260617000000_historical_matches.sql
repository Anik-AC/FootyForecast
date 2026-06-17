-- =============================================================================
-- FootyForecast: Historical matches schema
-- Migration: 20260617000000_historical_matches
--
-- Adds two tables that the initial schema omits:
--
-- historical_matches: one row per international match from the Kaggle CSV.
--   Team names are TEXT, not FK references to teams(id). The Kaggle dataset
--   covers ~220 nations with spelling variants that do not map cleanly to our
--   48-team table. Name normalization happens at feature-computation time via
--   team_name_map and footy/ingest/team_map.py, not at load time.
--
-- team_name_map: maps raw name strings from external sources (Kaggle, API-
--   Football) to FIFA three-letter codes. NULL team_id means "known non-
--   qualifier; skip." A missing row means "unknown name; raise an error."
--   The Python module footy/ingest/team_map.py is the canonical source; this
--   table is seeded from that dict.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Historical match results (training data)
-- ---------------------------------------------------------------------------

CREATE TABLE historical_matches (
    id           BIGSERIAL   PRIMARY KEY,
    match_date   DATE        NOT NULL,
    home_team    TEXT        NOT NULL,
    away_team    TEXT        NOT NULL,
    home_score   INT         NOT NULL CHECK (home_score >= 0),
    away_score   INT         NOT NULL CHECK (away_score >= 0),
    tournament   TEXT        NOT NULL DEFAULT '',
    neutral      BOOLEAN     NOT NULL DEFAULT FALSE,
    source       TEXT        NOT NULL DEFAULT 'kaggle',
    loaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (match_date, home_team, away_team)
);

COMMENT ON TABLE historical_matches IS
    'International football results from the Kaggle training dataset (2002+). '
    'Team names are stored as raw TEXT because the dataset covers ~220 nations '
    'and cannot FK into the 48-team WC 2026 teams table. '
    'Name normalization (raw name -> FIFA code) is done at feature time via team_name_map.';

COMMENT ON COLUMN historical_matches.source IS
    'Data provenance identifier. ''kaggle'' for the Kaggle CSV; extend as needed.';

COMMENT ON COLUMN historical_matches.neutral IS
    'True if the match was played at a neutral venue. Used as a model feature.';

CREATE INDEX historical_matches_date_idx
    ON historical_matches (match_date);

CREATE INDEX historical_matches_teams_idx
    ON historical_matches (home_team, away_team);


-- ---------------------------------------------------------------------------
-- Team name normalization map
-- ---------------------------------------------------------------------------

CREATE TABLE team_name_map (
    raw_name TEXT PRIMARY KEY,
    team_id  TEXT REFERENCES teams(id)
);

COMMENT ON TABLE team_name_map IS
    'Maps raw team name strings from external sources to FIFA three-letter codes '
    '(teams.id). NULL team_id marks a known non-qualifier; the row is present so '
    'the ingestion script knows the name was considered rather than silently missing. '
    'A missing row means the name was never mapped and should raise an error. '
    'Seeded from footy/ingest/team_map.py: TEAM_NAME_MAP dict.';

COMMENT ON COLUMN team_name_map.raw_name IS
    'Exact string as it appears in the data source. Case-sensitive.';

COMMENT ON COLUMN team_name_map.team_id IS
    'FIFA three-letter code. NULL means the team is a known non-qualifier for WC 2026. '
    'Rows with NULL team_id allow the ingestion script to skip without raising an error.';
