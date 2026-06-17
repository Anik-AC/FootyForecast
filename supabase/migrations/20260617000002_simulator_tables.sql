-- Simulator tables: model parameters (written by Python) and simulation
-- results (written by Go simulator).
--
-- Interface contract: Python writes team_model_params and model_globals after
-- each model fit. Go reads them, runs Monte Carlo, and writes simulation_results.

-- Team-level attack / defence posterior means, one row per team per model run.
CREATE TABLE IF NOT EXISTS team_model_params (
    id            BIGSERIAL PRIMARY KEY,
    team_id       TEXT        NOT NULL REFERENCES teams(id),
    model_version TEXT        NOT NULL,
    as_of         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    att_mean      DOUBLE PRECISION NOT NULL,
    def_mean      DOUBLE PRECISION NOT NULL,
    UNIQUE (team_id, model_version)
);

-- Global model parameters (not tied to a specific team).
CREATE TABLE IF NOT EXISTS model_globals (
    id            BIGSERIAL PRIMARY KEY,
    model_version TEXT        NOT NULL UNIQUE,
    as_of         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    mu_mean       DOUBLE PRECISION NOT NULL,
    home_adv_mean DOUBLE PRECISION NOT NULL
);

-- Monte Carlo output: per-team probability of reaching each stage.
-- Stage values: GROUP_EXIT, R32, R16, QF, SF, FINAL, CHAMPION.
-- Written by the Go simulator after each run; older rows are deleted first.
CREATE TABLE IF NOT EXISTS simulation_results (
    id            BIGSERIAL PRIMARY KEY,
    run_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model_version TEXT        NOT NULL,
    n_simulations INTEGER     NOT NULL,
    team_id       TEXT        NOT NULL REFERENCES teams(id),
    stage         TEXT        NOT NULL CHECK (stage IN ('R32','R16','QF','SF','FINAL','CHAMPION')),
    probability   DOUBLE PRECISION NOT NULL CHECK (probability >= 0 AND probability <= 1),
    UNIQUE (run_at, team_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_simulation_results_run_at ON simulation_results (run_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_model_params_version ON team_model_params (model_version, team_id);
