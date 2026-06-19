package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/footyforecast/api/internal/store"
)

// GetTeamForm handles GET /v1/teams/{teamID}/form
// Returns the last 5 completed WC 2026 fixtures for the team, most recent first.
func GetTeamForm(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		teamID := chi.URLParam(r, "teamID")
		matches, err := s.GetTeamForm(r.Context(), teamID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, matches)
	}
}

// GetMatchH2H handles GET /v1/matches/{matchID}/h2h
// Returns head-to-head history between the two teams in this fixture.
func GetMatchH2H(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		matchID := chi.URLParam(r, "matchID")
		h2h, err := s.GetMatchH2H(r.Context(), matchID)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "fixture not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, h2h)
	}
}

// GetTopAssists handles GET /v1/stats/assists?limit=N
// Returns the top N assist providers in the tournament.
func GetTopAssists(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := 10
		if l := r.URL.Query().Get("limit"); l != "" {
			if n, err := strconv.Atoi(l); err == nil && n > 0 {
				limit = n
			}
		}
		assisters, err := s.GetTopAssists(r.Context(), limit)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, assisters)
	}
}
