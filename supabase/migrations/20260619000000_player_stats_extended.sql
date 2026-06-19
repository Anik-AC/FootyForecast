-- =============================================================================
-- FootyForecast: Extended player tournament stats
-- Migration: 20260619000000_player_stats_extended
--
-- Adds appearance and discipline columns to player_tournament_stats.
--
-- appearances and penalties are populated by footy/ingest/scorers.py using
-- the football-data.org free-tier scorers endpoint (playedMatches, penalties).
--
-- yellow_cards and red_cards cannot currently be populated on the free tier
-- (match events require Tier 2). Columns are added now so the schema is ready
-- when the data source is available or upgraded.
-- =============================================================================

ALTER TABLE player_tournament_stats
    ADD COLUMN IF NOT EXISTS appearances  INT NOT NULL DEFAULT 0 CHECK (appearances >= 0),
    ADD COLUMN IF NOT EXISTS penalties    INT NOT NULL DEFAULT 0 CHECK (penalties >= 0),
    ADD COLUMN IF NOT EXISTS yellow_cards INT NOT NULL DEFAULT 0 CHECK (yellow_cards >= 0),
    ADD COLUMN IF NOT EXISTS red_cards    INT NOT NULL DEFAULT 0 CHECK (red_cards >= 0);

COMMENT ON COLUMN player_tournament_stats.appearances IS
    'Matches started or appeared in this tournament. Populated from football-data.org playedMatches.';

COMMENT ON COLUMN player_tournament_stats.penalties IS
    'Goals scored from the penalty spot. Populated from football-data.org penalties field.';

COMMENT ON COLUMN player_tournament_stats.yellow_cards IS
    'Yellow cards received. Not populated on free tier (requires Tier 2 match events).';

COMMENT ON COLUMN player_tournament_stats.red_cards IS
    'Red cards received. Not populated on free tier (requires Tier 2 match events).';
