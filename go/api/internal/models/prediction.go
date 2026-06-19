package models

import "time"

// MatchPrediction is the full pre-match prediction for one fixture.
type MatchPrediction struct {
	MatchID              string                 `json:"match_id"`
	HomeTeam             Team                   `json:"home_team"`
	AwayTeam             Team                   `json:"away_team"`
	MatchDate            time.Time              `json:"match_date"`
	ModelAsOf            time.Time              `json:"model_as_of"`
	ModelVersion         string                 `json:"model_version"`
	OutcomeProbabilities OutcomeProbabilities   `json:"outcome_probabilities"`
	ScorelineGrid        []ScorelineProbability `json:"scoreline_grid"`
	Totals               TotalsProbabilities    `json:"totals"`
	ExpectedGoals        *ExpectedGoals         `json:"expected_goals,omitempty"`
	HomeElo              *float64               `json:"home_elo,omitempty"`
	AwayElo              *float64               `json:"away_elo,omitempty"`
	ActualResult         *MatchResultSummary    `json:"actual_result,omitempty"`
	Grading              *MatchGrading          `json:"grading,omitempty"`
}

// ScorelineProbability is one cell of the scoreline grid.
type ScorelineProbability struct {
	HomeGoals   int     `json:"home_goals"`
	AwayGoals   int     `json:"away_goals"`
	Probability float64 `json:"probability"`
}

// TotalsProbabilities holds pre-computed over/under and BTTS marginals,
// derived from the scoreline grid and included for frontend convenience.
type TotalsProbabilities struct {
	Over15 float64 `json:"over_1_5"`
	Over25 float64 `json:"over_2_5"`
	Over35 float64 `json:"over_3_5"`
	BTTS   float64 `json:"btts"`
}

// ExpectedGoals holds the model mean goals per team (lambda values).
type ExpectedGoals struct {
	HomeXG float64 `json:"home_xg"`
	AwayXG float64 `json:"away_xg"`
}
