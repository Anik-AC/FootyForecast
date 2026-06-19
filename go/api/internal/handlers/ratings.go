package handlers

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/footyforecast/api/internal/store"
)

// GetTeamEloRatings handles GET /v1/teams/ratings — latest Elo rating per team.
func GetTeamEloRatings(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ratings, err := s.GetTeamEloRatings(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, ratings)
	}
}

// GetTeams handles GET /v1/teams — all WC 2026 teams with Elo and group.
func GetTeams(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		teams, err := s.GetTeams(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, teams)
	}
}

// GetTeamDetail handles GET /v1/teams/{teamID} — full team detail.
func GetTeamDetail(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		teamID := chi.URLParam(r, "teamID")
		detail, err := s.GetTeamDetail(r.Context(), teamID)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				writeError(w, http.StatusNotFound, "team not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, detail)
	}
}
