package models

import "time"

// DisagreementEntry is one upcoming fixture where the model's probabilities
// differ significantly from the prediction market.
type DisagreementEntry struct {
	MatchID    string    `json:"match_id"`
	KickoffUTC time.Time `json:"kickoff_utc"`
	Stage      string    `json:"stage"`
	HomeTeam   Team      `json:"home_team"`
	AwayTeam   Team      `json:"away_team"`

	ModelProbabilities  OutcomeProbabilities `json:"model_probabilities"`
	MarketProbabilities OutcomeProbabilities `json:"market_probabilities"`
	MarketSource        string               `json:"market_source"`

	// DisagreementScore is the mean absolute difference across all three outcomes.
	// Range [0, 2/3]; a score of 0.10 means the model and market differ by 10pp on average.
	DisagreementScore float64 `json:"disagreement_score"`

	// ModelFavors is "home", "draw", or "away": the outcome the model rates
	// higher than the market by the largest margin.
	ModelFavors string `json:"model_favors"`
}
