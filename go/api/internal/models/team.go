package models

// TeamListItem is a summary row on the teams list page.
type TeamListItem struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	ShortName     string   `json:"short_name"`
	Confederation string   `json:"confederation"`
	EloRating     *float64 `json:"elo_rating,omitempty"`
	Group         *string  `json:"group,omitempty"`
}

// PlayerStat is one player's tournament tally for a team detail page.
type PlayerStat struct {
	PlayerName  string `json:"player_name"`
	Goals       int    `json:"goals"`
	Assists     int    `json:"assists"`
	Appearances int    `json:"appearances"`
	Penalties   int    `json:"penalties"`
	YellowCards int    `json:"yellow_cards"`
	RedCards    int    `json:"red_cards"`
}

// TeamRecord is the team's WC 2026 W/D/L summary derived from match results.
type TeamRecord struct {
	Played int `json:"played"`
	Won    int `json:"won"`
	Drawn  int `json:"drawn"`
	Lost   int `json:"lost"`
	GF     int `json:"gf"`
	GA     int `json:"ga"`
	GD     int `json:"gd"`
	Points int `json:"points"`
}

// TeamDetail is the full team view for the team detail page.
type TeamDetail struct {
	ID            string        `json:"id"`
	Name          string        `json:"name"`
	ShortName     string        `json:"short_name"`
	Confederation string        `json:"confederation"`
	EloRating     *float64      `json:"elo_rating,omitempty"`
	Group         *string       `json:"group,omitempty"`
	Record        TeamRecord    `json:"record"`
	Fixtures      []MatchSummary `json:"fixtures"`
	Players       []PlayerStat  `json:"players"`
}
