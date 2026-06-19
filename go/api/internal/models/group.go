package models

// GroupStanding is one team's record in a group.
type GroupStanding struct {
	TeamID   string `json:"team_id"`
	TeamName string `json:"team_name"`
	Played   int    `json:"played"`
	Won      int    `json:"won"`
	Drawn    int    `json:"drawn"`
	Lost     int    `json:"lost"`
	GF       int    `json:"gf"`
	GA       int    `json:"ga"`
	GD       int    `json:"gd"`
	Points   int    `json:"points"`
}

// GroupTable is one group's full standings sorted by position.
type GroupTable struct {
	Letter    string          `json:"letter"`
	Standings []GroupStanding `json:"standings"`
}

// TopScorer is one player's tournament goal tally.
type TopScorer struct {
	PlayerName  string `json:"player_name"`
	TeamID      string `json:"team_id"`
	TeamName    string `json:"team_name"`
	Goals       int    `json:"goals"`
	Assists     int    `json:"assists"`
	Appearances int    `json:"appearances"`
	Penalties   int    `json:"penalties"`
}
