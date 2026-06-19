-- =============================================================================
-- FootyForecast: Player scorer predictions
-- Migration: 20260618000001_player_predictions
--
-- Adds two tables to support Track B (player-event model):
--
--   player_tournament_stats  — running goal/assist tallies per player per
--                              tournament, ingested from football-data.org's
--                              /competitions/WC/scorers endpoint.
--
--   player_goal_predictions  — per-player anytime-scorer probabilities for each
--                              upcoming fixture, computed from tournament scoring
--                              shares and team-level expected goals.
-- =============================================================================

CREATE TABLE player_tournament_stats (
    id            BIGSERIAL   PRIMARY KEY,
    tournament_id TEXT        NOT NULL REFERENCES tournaments(id),
    player_name   TEXT        NOT NULL,
    team_id       TEXT        NOT NULL REFERENCES teams(id),
    goals         INT         NOT NULL DEFAULT 0 CHECK (goals >= 0),
    assists       INT         NOT NULL DEFAULT 0 CHECK (assists >= 0),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tournament_id, player_name, team_id)
);

COMMENT ON TABLE player_tournament_stats IS
    'Tournament goal and assist tallies per player. Populated by the scorers '
    'ingestion job. Source: football-data.org /competitions/WC/scorers endpoint.';

COMMENT ON COLUMN player_tournament_stats.player_name IS
    'Player name as returned by football-data.org. Not FK-linked to a players '
    'table (no players table in v1). Name is the join key with player_goal_predictions.';

CREATE INDEX player_tournament_stats_team_idx
    ON player_tournament_stats (tournament_id, team_id, goals DESC);


CREATE TABLE player_goal_predictions (
    fixture_id          TEXT        NOT NULL REFERENCES fixtures(id),
    player_name         TEXT        NOT NULL,
    team_id             TEXT        NOT NULL REFERENCES teams(id),
    anytime_scorer_prob FLOAT       NOT NULL CHECK (anytime_scorer_prob BETWEEN 0 AND 1),
    tournament_goals    INT         NOT NULL DEFAULT 0 CHECK (tournament_goals >= 0),
    method              TEXT        NOT NULL DEFAULT 'scoring_share',
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (fixture_id, player_name, team_id)
);

COMMENT ON TABLE player_goal_predictions IS
    'Per-player anytime-scorer probabilities for upcoming fixtures. '
    'Computed as: P(scores) = 1 - exp(-team_xg * player_share), where '
    'player_share = player_goals / team_total_goals_in_tournament. '
    'Refreshed each time the scorers ingestion and player_predictions jobs run.';

COMMENT ON COLUMN player_goal_predictions.method IS
    'Model method used. scoring_share = tournament goal share model. '
    'Future versions may add lineup-conditioned estimates.';

CREATE INDEX player_goal_predictions_fixture_team_idx
    ON player_goal_predictions (fixture_id, team_id, anytime_scorer_prob DESC);
