package models

import "time"

// UserPredictionRequest is the POST body for submitting a leaderboard prediction.
type UserPredictionRequest struct {
	UserID      string  `json:"user_id"`
	HomeWinProb float64 `json:"home_win_prob"`
	DrawProb    float64 `json:"draw_prob"`
	AwayWinProb float64 `json:"away_win_prob"`
}

// UserPredictionResponse is returned after a successful submission.
type UserPredictionResponse struct {
	ID          int64     `json:"id"`
	UserID      string    `json:"user_id"`
	FixtureID   string    `json:"fixture_id"`
	HomeWinProb float64   `json:"home_win_prob"`
	DrawProb    float64   `json:"draw_prob"`
	AwayWinProb float64   `json:"away_win_prob"`
	SubmittedAt time.Time `json:"submitted_at"`
}

// LeaderboardEntry is one row in the leaderboard ranking.
type LeaderboardEntry struct {
	Rank        int     `json:"rank"`
	UserID      string  `json:"user_id"`
	DisplayName string  `json:"display_name"`
	Predictions int     `json:"predictions"`
	AvgLogLoss  float64 `json:"avg_log_loss"`
	AvgBrier    float64 `json:"avg_brier"`
}

// UserStats summarises one user's prediction record across the tournament.
type UserStats struct {
	TotalPicks int      `json:"total_picks"`
	Graded     int      `json:"graded"`
	Correct    int      `json:"correct"`
	AvgLogLoss *float64 `json:"avg_log_loss,omitempty"`
}
