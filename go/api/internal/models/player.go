package models

import "time"

// PlayerScorerPrediction is one player's anytime-scorer probability for a match.
type PlayerScorerPrediction struct {
	PlayerName        string  `json:"player_name"`
	AnyTimeScorerProb float64 `json:"anytime_scorer_prob"`
	TournamentGoals   int     `json:"tournament_goals"`
}

// TeamScorerPredictions groups player predictions for one team in a match.
type TeamScorerPredictions struct {
	TeamID   string                   `json:"team_id"`
	TeamName string                   `json:"team_name"`
	Players  []PlayerScorerPrediction `json:"players"`
}

// MatchScorerPredictions is the full scorer prediction response for one fixture.
type MatchScorerPredictions struct {
	MatchID    string                `json:"match_id"`
	ComputedAt time.Time             `json:"computed_at"`
	HomeTeam   TeamScorerPredictions `json:"home_team"`
	AwayTeam   TeamScorerPredictions `json:"away_team"`
}
