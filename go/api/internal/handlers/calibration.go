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

// GetModelComparison returns per-model grading stats ordered by mean log-loss,
// so all model versions can be compared on the same set of graded matches.
func GetModelComparison(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := s.GetModelComparison(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load model comparison data")
			return
		}
		writeJSON(w, http.StatusOK, rows)
	}
}

// GetPredictionComparison returns knockout-stage fixtures with side-by-side
// predictions from all active model versions, plus champion probabilities
// from each simulation run.
func GetPredictionComparison(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		comparison, err := s.GetPredictionComparison(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load prediction comparison")
			return
		}
		writeJSON(w, http.StatusOK, comparison)
	}
}
