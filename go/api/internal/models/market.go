package models

import "time"

// MarketComparison compares the model's probabilities to market prices for one match.
type MarketComparison struct {
	MatchID            string               `json:"match_id"`
	ModelAsOf          time.Time            `json:"model_as_of"`
	ModelProbabilities OutcomeProbabilities `json:"model_probabilities"`
	Markets            []MarketSource       `json:"markets"`
	DisagreementScore  *float64             `json:"disagreement_score,omitempty"`
	Grading            *MatchGrading        `json:"grading"` // null until match is graded
}

// MarketSource is one market's latest pre-kickoff price snapshot.
type MarketSource struct {
	Source    string               `json:"source"`
	SampledAt time.Time            `json:"sampled_at"`
	Raw       MarketRaw            `json:"raw"`
	Devigged  OutcomeProbabilities `json:"devigged"`
}

// MarketRaw holds raw implied probabilities including the bookmaker margin.
// Sum across legs exceeds 1.0. Draw is nil for binary markets.
type MarketRaw struct {
	HomeWin float64  `json:"home_win"`
	Draw    *float64 `json:"draw"`
	AwayWin float64  `json:"away_win"`
}

// MatchGrading holds post-match scoring for the model and each market source.
// Populated after the result is confirmed and graded.
type MatchGrading struct {
	ActualOutcome    string             `json:"actual_outcome"`
	ActualScore      *ActualScore       `json:"actual_score,omitempty"`
	ModelLogLoss     float64            `json:"model_log_loss"`
	ModelBrierScore  float64            `json:"model_brier_score"`
	MarketLogLoss    map[string]float64 `json:"market_log_loss,omitempty"`
	MarketBrierScore map[string]float64 `json:"market_brier_score,omitempty"`
}

// ActualScore is the confirmed final scoreline.
type ActualScore struct {
	HomeGoals int `json:"home_goals"`
	AwayGoals int `json:"away_goals"`
}
