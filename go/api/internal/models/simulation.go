package models

import "time"

// TournamentSimulation holds the results of one Monte Carlo simulation run.
type TournamentSimulation struct {
	SimulationID     string                 `json:"simulation_id"`
	RunAt            time.Time              `json:"run_at"`
	NSimulations     int                    `json:"n_simulations"`
	MatchResultsAsOf time.Time              `json:"match_results_as_of"`
	Teams            []TeamSimulationResult `json:"teams"`
}

// TeamSimulationResult is one team's stage-advancement probabilities.
type TeamSimulationResult struct {
	TeamID             string             `json:"team_id"`
	TeamName           string             `json:"team_name"`
	Group              *string            `json:"group"`      // null after group stage ends
	Eliminated         bool               `json:"eliminated"` // true once knocked out
	StageProbabilities StageProbabilities `json:"stage_probabilities"`
}

// StageProbabilities are the reach-or-further probabilities per knockout stage.
// Values are monotonically non-increasing: champion <= final <= semi_final <= ...
type StageProbabilities struct {
	RoundOf32    float64 `json:"round_of_32"`
	RoundOf16    float64 `json:"round_of_16"`
	QuarterFinal float64 `json:"quarter_final"`
	SemiFinal    float64 `json:"semi_final"`
	Final        float64 `json:"final"`
	Champion     float64 `json:"champion"`
}
