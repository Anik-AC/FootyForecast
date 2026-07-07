package models

import "time"

// KeyEvent is a subset of MatchEvent included in the matches list for display
// purposes (goal scorers and red cards). Keeps the list payload small.
type KeyEvent struct {
	Minute       int    `json:"minute"`
	IncidentType string `json:"incident_type"` // goal, own_goal, red_card, yellow_red_card
	IsHome       bool   `json:"is_home"`
	PlayerName   string `json:"player_name"`
}

// MatchSummary is one row in the matches list — fixture info, optional result,
// and optional prediction probabilities for upcoming matches.
type MatchSummary struct {
	ID          string                `json:"id"`
	KickoffUTC  time.Time             `json:"kickoff_utc"`
	Stage       string                `json:"stage"`
	GroupLetter *string               `json:"group_letter"`
	HomeTeam    Team                  `json:"home_team"`
	AwayTeam    Team                  `json:"away_team"`
	Result      *MatchResultSummary   `json:"result"`      // null until the match is played
	Prediction  *OutcomeProbabilities `json:"prediction"`  // null until the model has run
	KeyEvents   []KeyEvent            `json:"key_events,omitempty"`
}

// MatchResultSummary is the final score at 90 min or AET (no penalties included).
// WentToET and WentToPens indicate whether the match required extra time or a
// penalty shootout. PenWinnerID holds the winning team's FIFA code when
// WentToPens is true.
type MatchResultSummary struct {
	HomeGoals   int     `json:"home_goals"`
	AwayGoals   int     `json:"away_goals"`
	WentToET    bool    `json:"went_to_et"`
	WentToPens  bool    `json:"went_to_pens"`
	PenWinnerID *string `json:"pen_winner_id,omitempty"`
}

// H2HMatch is one historical match entry returned in a head-to-head response.
type H2HMatch struct {
	Date       string `json:"date"`
	HomeTeam   string `json:"home_team"`
	AwayTeam   string `json:"away_team"`
	HomeGoals  int    `json:"home_goals"`
	AwayGoals  int    `json:"away_goals"`
	Tournament string `json:"tournament"`
	Neutral    bool   `json:"neutral"`
}

// H2HRecord is the head-to-head history between two specific teams for a match.
type H2HRecord struct {
	HomeTeamID   string       `json:"home_team_id"`
	AwayTeamID   string       `json:"away_team_id"`
	WC2026       []MatchSummary `json:"wc_2026"`
	AllTimePlayed int         `json:"all_time_played"`
	HomeTeamWins  int         `json:"home_team_wins"`
	AllTimeDraws  int         `json:"all_time_draws"`
	AwayTeamWins  int         `json:"away_team_wins"`
	Recent        []H2HMatch  `json:"recent"`
}
