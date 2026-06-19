package handlers

import (
	"net/http"

	"github.com/footyforecast/api/internal/store"
)

// GetDisagreements returns upcoming fixtures ranked by model-vs-market disagreement.
func GetDisagreements(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		entries, err := s.GetDisagreements(r.Context(), 0)
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, entries)
	}
}
