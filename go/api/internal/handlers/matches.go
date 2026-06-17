package handlers

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/footyforecast/api/internal/store"
)

// GetMatchPrediction handles GET /v1/matches/{matchID}/prediction.
func GetMatchPrediction(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		matchID := chi.URLParam(r, "matchID")
		pred, err := s.GetMatchPrediction(r.Context(), matchID)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "no prediction found for match "+matchID)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, pred)
	}
}

// GetMarketComparison handles GET /v1/matches/{matchID}/market-comparison.
func GetMarketComparison(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		matchID := chi.URLParam(r, "matchID")
		cmp, err := s.GetMarketComparison(r.Context(), matchID)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "no prediction found for match "+matchID)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, cmp)
	}
}
