package models

// HydrationBreak captures one drinks break with the 10-minute event windows
// on either side, used to assess whether the break shifted game momentum.
type HydrationBreak struct {
	FixtureID    string `json:"fixture_id"`
	KickoffUTC   string `json:"kickoff_utc"`
	Stage        string `json:"stage"`
	BreakMinute  int    `json:"break_minute"`
	HomeTeamID   string `json:"home_team_id"`
	HomeTeamName string `json:"home_team_name"`
	AwayTeamID   string `json:"away_team_id"`
	AwayTeamName string `json:"away_team_name"`
	Venue        string `json:"venue"`         // empty when unknown
	VenueClimate string `json:"venue_climate"` // "enclosed" | "open" | "unknown"

	// Goals scored in the 10 minutes immediately before the break.
	GoalsHomeBefore int `json:"goals_home_before"`
	GoalsAwayBefore int `json:"goals_away_before"`

	// Goals scored in the 10 minutes immediately after the break.
	GoalsHomeAfter int `json:"goals_home_after"`
	GoalsAwayAfter int `json:"goals_away_after"`

	// Whether any goal was scored within the first 5 minutes after the break.
	// A high rate here would suggest the break helped reset or energise teams.
	GoalWithin5Min bool `json:"goal_within_5min"`

	// Count of "important" commentary lines in each window
	// (not team-attributed but indicates overall match activity).
	ImportantBefore int `json:"important_before"`
	ImportantAfter  int `json:"important_after"`

	// Derived momentum labels.
	MomentumBefore string `json:"momentum_before"` // "home" | "away" | "level"
	MomentumAfter  string `json:"momentum_after"`
	// Shifted is true when momentum_before != momentum_after.
	Shifted bool `json:"shifted"`
}

// HydrationAnalysis is the aggregate tournament-wide summary of drinks breaks.
type HydrationAnalysis struct {
	TotalBreaks       int     `json:"total_breaks"`
	MatchesWithBreaks int     `json:"matches_with_breaks"`
	ShiftsCount       int     `json:"shifts_count"`
	ShiftsPct         float64 `json:"shifts_pct"` // 0-100
	GoalAfterCount    int     `json:"goal_after_count"`
	GoalAfterPct      float64 `json:"goal_after_pct"` // 0-100
	// Home vs away team that benefited from the shift (gained momentum after break).
	HomeBenefitCount int `json:"home_benefit_count"`
	AwayBenefitCount int `json:"away_benefit_count"`
	// How many breaks happened in enclosed/AC venues vs open-air venues.
	EnclosedCount int `json:"enclosed_count"`
	OpenCount     int `json:"open_count"`

	Breaks []HydrationBreak `json:"breaks"`
}
