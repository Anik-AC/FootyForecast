package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/footyforecast/api/internal/store"
)

// GetUserStats handles GET /v1/users/{userID}/stats — pick record for one user.
func GetUserStats(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := chi.URLParam(r, "userID")
		stats, err := s.GetUserStats(r.Context(), userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, stats)
	}
}
