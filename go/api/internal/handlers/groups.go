package handlers

import (
	"net/http"
	"strconv"

	"github.com/footyforecast/api/internal/store"
)

// GetGroupStandings handles GET /v1/groups.
func GetGroupStandings(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tables, err := s.GetGroupStandings(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, tables)
	}
}

// GetTopScorers handles GET /v1/stats/scorers.
func GetTopScorers(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		scorers, err := s.GetTopScorers(r.Context(), limit)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, scorers)
	}
}
