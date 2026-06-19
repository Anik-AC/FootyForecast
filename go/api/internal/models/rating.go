package models

import "time"

// TeamRating holds the latest Elo rating for one team.
type TeamRating struct {
	TeamID        string    `json:"team_id"`
	TeamName      string    `json:"team_name"`
	Confederation string    `json:"confederation"`
	Rating        float64   `json:"rating"`
	AsOf          time.Time `json:"as_of"`
}
