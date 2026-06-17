package models

import "time"

// MatchSummary is one row in the matches list — fixture info, optional result,
// and optional prediction probabilities for upcoming matches.
type MatchSummary struct {
	ID          string               `json:"id"`
	KickoffUTC  time.Time            `json:"kickoff_utc"`
	Stage       string               `json:"stage"`
	GroupLetter *string              `json:"group_letter"`
	HomeTeam    Team                 `json:"home_team"`
	AwayTeam    Team                 `json:"away_team"`
	Result      *MatchResultSummary  `json:"result"`      // null until the match is played
	Prediction  *OutcomeProbabilities `json:"prediction"` // null until the model has run
}

// MatchResultSummary is the final score (90 min or AET, no penalties).
type MatchResultSummary struct {
	HomeGoals int `json:"home_goals"`
	AwayGoals int `json:"away_goals"`
}
