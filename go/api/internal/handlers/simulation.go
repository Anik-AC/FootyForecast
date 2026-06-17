package handlers

import (
	"errors"
	"net/http"

	"github.com/footyforecast/api/internal/store"
)

// GetLatestSimulation handles GET /v1/simulation/latest.
func GetLatestSimulation(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sim, err := s.GetLatestSimulation(r.Context())
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "no simulation has run yet")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, sim)
	}
}
