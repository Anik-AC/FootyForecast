package handlers

import (
	"net/http"

	"github.com/footyforecast/api/internal/store"
)

// GetCalibration returns aggregate scoring metrics and per-match grading for all
// completed WC 2026 matches.
func GetCalibration(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		summary, err := s.GetCalibration(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load calibration data")
			return
		}
		writeJSON(w, http.StatusOK, summary)
	}
}
