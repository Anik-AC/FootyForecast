package models

// MatchEvent is one in-match incident (goal, card, substitution, VAR).
type MatchEvent struct {
	Minute          int     `json:"minute"`
	AddedTime       *int    `json:"added_time,omitempty"`
	IncidentType    string  `json:"incident_type"`
	IsHome          bool    `json:"is_home"`
	PlayerName      *string `json:"player_name,omitempty"`
	AssistPlayer    *string `json:"assist_player,omitempty"`
	Detail          *string `json:"detail,omitempty"`
	SofascorePlayer *int    `json:"sofascore_player_id,omitempty"`
}

// MatchStats holds team-level stats for one side of a match.
type MatchStats struct {
	IsHome         bool     `json:"is_home"`
	PossessionPct  *float64 `json:"possession_pct,omitempty"`
	ExpectedGoals  *float64 `json:"expected_goals,omitempty"`
	BigChances     *int     `json:"big_chances,omitempty"`
	TotalShots     *int     `json:"total_shots,omitempty"`
	ShotsOnTarget  *int     `json:"shots_on_target,omitempty"`
	GKSaves        *int     `json:"goalkeeper_saves,omitempty"`
	CornerKicks    *int     `json:"corner_kicks,omitempty"`
	Fouls          *int     `json:"fouls,omitempty"`
	PassesTotal    *int     `json:"passes_total,omitempty"`
	PassesAccurate *int     `json:"passes_accurate,omitempty"`
	Tackles        *int     `json:"tackles,omitempty"`
	FreeKicks      *int     `json:"free_kicks,omitempty"`
	YellowCards    *int     `json:"yellow_cards,omitempty"`
	RedCards       *int     `json:"red_cards,omitempty"`
	Offsides       *int     `json:"offsides,omitempty"`
}

// MomentumPoint is the per-minute momentum value for a match.
// Positive = home team dominating, negative = away.
type MomentumPoint struct {
	Minute int     `json:"minute"`
	Value  float64 `json:"value"`
}

// CommentaryEntry is one commentary line from Sofascore.
type CommentaryEntry struct {
	Minute      *int   `json:"minute,omitempty"`
	Text        string `json:"text"`
	IsImportant bool   `json:"is_important"`
}

// MatchPlayerStat holds one player's stats for a single match.
type MatchPlayerStat struct {
	SofascorePlayerID int     `json:"sofascore_player_id"`
	PlayerName        string  `json:"player_name"`
	TeamID            *string `json:"team_id,omitempty"`
	IsHome            bool    `json:"is_home"`
	Position          *string `json:"position,omitempty"`

	// Core
	MinutesPlayed *int     `json:"minutes_played,omitempty"`
	Rating        *float64 `json:"rating,omitempty"`

	// Goals & assists
	Goals   int `json:"goals"`
	Assists int `json:"assists"`

	// Disciplinary
	YellowCards int `json:"yellow_cards"`
	RedCards    int `json:"red_cards"`

	// Attack
	Shots              *int `json:"shots,omitempty"`
	ShotsOnTarget      *int `json:"shots_on_target,omitempty"`
	BigChancesCreated  *int `json:"big_chances_created,omitempty"`
	BigChancesMissed   *int `json:"big_chances_missed,omitempty"`
	GoalsInsideBox     *int `json:"goals_inside_box,omitempty"`
	GoalsOutsideBox    *int `json:"goals_outside_box,omitempty"`
	DribbleAttempts    *int `json:"dribble_attempts,omitempty"`
	DribblesWon        *int `json:"dribbles_won,omitempty"`

	// Defense
	Tackles        *int `json:"tackles,omitempty"`
	Interceptions  *int `json:"interceptions,omitempty"`
	Clearances     *int `json:"clearances,omitempty"`
	Blocks         *int `json:"blocks,omitempty"`
	DuelsTotal     *int `json:"duels_total,omitempty"`
	DuelsWon       *int `json:"duels_won,omitempty"`
	AerialDuelsWon *int `json:"aerial_duels_won,omitempty"`

	// Passing
	PassesTotal        *int `json:"passes_total,omitempty"`
	PassesAccurate     *int `json:"passes_accurate,omitempty"`
	KeyPasses          *int `json:"key_passes,omitempty"`
	LongBallsTotal     *int `json:"long_balls_total,omitempty"`
	LongBallsAccurate  *int `json:"long_balls_accurate,omitempty"`
	CrossesTotal       *int `json:"crosses_total,omitempty"`
	CrossesAccurate    *int `json:"crosses_accurate,omitempty"`

	// Goalkeeping
	Saves          *int  `json:"saves,omitempty"`
	SavesInsideBox *int  `json:"saves_inside_box,omitempty"`
	CleanSheet     *bool `json:"clean_sheet,omitempty"`
	PenaltiesSaved *int  `json:"penalties_saved,omitempty"`
	RunsOut        *int  `json:"runs_out,omitempty"`

	// Other
	FoulsCommitted *int `json:"fouls_committed,omitempty"`
	FoulsSuffered  *int `json:"fouls_suffered,omitempty"`
	Offsides       *int `json:"offsides,omitempty"`
	Dispossessed   *int `json:"dispossessed,omitempty"`
}

// MatchAnalysis is the LLM-generated post-match narrative.
type MatchAnalysis struct {
	FixtureID             string  `json:"fixture_id"`
	AnalysisText          string  `json:"analysis_text"`
	HasHydrationBreak     bool    `json:"has_hydration_break"`
	HydrationBreakMinute  *int    `json:"hydration_break_minute,omitempty"`
	GeneratedAt           string  `json:"generated_at"`
	ModelUsed             *string `json:"model_used,omitempty"`
}
