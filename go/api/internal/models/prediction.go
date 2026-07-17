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
	KnockoutProbs        *KnockoutProbabilities `json:"knockout_probs,omitempty"`
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

// ModelPick is one model's prediction for a single fixture.
type ModelPick struct {
	ModelVersion string   `json:"model_version"`
	HomeWinProb  float64  `json:"home_win_prob"`
	DrawProb     float64  `json:"draw_prob"`
	AwayWinProb  float64  `json:"away_win_prob"`
	Pick         string   `json:"pick"` // "home", "draw", "away"
	HomeXG       *float64 `json:"home_xg,omitempty"`
	AwayXG       *float64 `json:"away_xg,omitempty"`
}

// FixtureComparison combines a fixture with predictions from all available model versions.
type FixtureComparison struct {
	MatchID    string              `json:"match_id"`
	KickoffUTC time.Time           `json:"kickoff_utc"`
	Stage      string              `json:"stage"`
	HomeTeam   Team                `json:"home_team"`
	AwayTeam   Team                `json:"away_team"`
	Result     *MatchResultSummary `json:"result,omitempty"`
	Models     []ModelPick         `json:"models"`
}

// ModelComparisonRow is one model's aggregate grading stats.
type ModelComparisonRow struct {
	ModelVersion      string   `json:"model_version"`
	GradedCount       int      `json:"graded_count"`
	Accuracy          float64  `json:"accuracy"`
	MeanLogLoss       float64  `json:"mean_log_loss"`
	MeanBrierScore    float64  `json:"mean_brier_score"`
	// MarketMeanLogLoss is the mean log-loss of market odds on the same graded fixtures.
	// Null when no market data is available.
	MarketMeanLogLoss    *float64 `json:"market_mean_log_loss"`
	MarketMeanBrierScore *float64 `json:"market_mean_brier_score"`
}

// ChampionTeamProb is one team's probability of winning the tournament,
// from a specific simulation run.
type ChampionTeamProb struct {
	TeamID      string  `json:"team_id"`
	TeamName    string  `json:"team_name"`
	Probability float64 `json:"probability"`
}

// PredictionComparison is the full multi-model comparison response:
// knockout-stage fixtures annotated with per-model predictions, plus
// champion probabilities from each available simulation version.
type PredictionComparison struct {
	Matches       []FixtureComparison           `json:"matches"`
	ChampionProbs map[string][]ChampionTeamProb `json:"champion_probs"`
}

// KnockoutProbabilities extends the 90-min model for knockout rounds.
// If the match is level after 90 min it goes to ET (30 min), then penalties.
// These fields let the frontend show "if it's a draw" scenarios without
// altering the 90-min outcome_probabilities used for model grading.
type KnockoutProbabilities struct {
	// Probability each team wins across 90 min + ET + pens (full match winner).
	HomeWinFull float64 `json:"home_win_full"`
	AwayWinFull float64 `json:"away_win_full"`
	// Decomposition: chance the match reaches ET and penalties.
	GoesToET    float64 `json:"goes_to_et"`
	GoesToPens  float64 `json:"goes_to_pens"`
	// Conditional: given penalties are needed, who wins?
	HomePenWin  float64 `json:"home_pen_win"`
}
