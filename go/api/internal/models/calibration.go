package models

import "time"

// CalibrationSummary is the response for GET /v1/calibration.
// It contains aggregate scoring metrics and one entry per graded match.
// OOS (out-of-sample) metrics cover only genuine pre-match predictions;
// retroactive predictions are excluded from those figures.
type CalibrationSummary struct {
	TotalMatches           int                `json:"total_matches"`
	OutOfSampleMatches     int                `json:"out_of_sample_matches"`
	ModelMeanLogLoss       float64            `json:"model_mean_log_loss"`
	ModelMeanBrier         float64            `json:"model_mean_brier"`
	OOSMeanLogLoss         float64            `json:"oos_mean_log_loss"`
	OOSMeanBrier           float64            `json:"oos_mean_brier"`
	MarketMeanLogLoss      map[string]float64 `json:"market_mean_log_loss,omitempty"`
	MarketMeanBrier        map[string]float64 `json:"market_mean_brier,omitempty"`
	Matches                []GradedMatch      `json:"matches"`
}

// GradedMatch holds prediction scores for one completed match.
type GradedMatch struct {
	MatchID             string               `json:"match_id"`
	KickoffUTC          time.Time            `json:"kickoff_utc"`
	HomeTeam            Team                 `json:"home_team"`
	AwayTeam            Team                 `json:"away_team"`
	ActualOutcome       string               `json:"actual_outcome"`
	ModelProbabilities  OutcomeProbabilities `json:"model_probabilities"`
	ModelLogLoss        float64              `json:"model_log_loss"`
	ModelBrierScore     float64              `json:"model_brier_score"`
	IsRetroactive       bool                 `json:"is_retroactive"`
	MarketLogLoss       map[string]float64   `json:"market_log_loss,omitempty"`
	MarketBrierScore    map[string]float64   `json:"market_brier_score,omitempty"`
}
