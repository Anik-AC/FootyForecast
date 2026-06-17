// Package models contains the response types served by the API.
// Field names and JSON tags match the schemas in docs/api/openapi.yaml exactly.
package models

// Team is the team identifier block included in match and simulation responses.
type Team struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Confederation string `json:"confederation"`
}

// OutcomeProbabilities is the three-way match outcome distribution.
// HomeWin + Draw + AwayWin = 1.0 within floating-point tolerance.
type OutcomeProbabilities struct {
	HomeWin float64 `json:"home_win"`
	Draw    float64 `json:"draw"`
	AwayWin float64 `json:"away_win"`
}

// ErrorResponse is the JSON body for all non-2xx responses.
type ErrorResponse struct {
	Error string `json:"error"`
	Code  string `json:"code,omitempty"`
}
