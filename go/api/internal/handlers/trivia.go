package handlers

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/footyforecast/api/internal/models"
	"github.com/footyforecast/api/internal/store"
)

// GetMatchScorerPredictions handles GET /v1/matches/{matchID}/scorers.
func GetMatchScorerPredictions(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		matchID := chi.URLParam(r, "matchID")
		scorers, err := s.GetMatchScorerPredictions(r.Context(), matchID)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "no scorer predictions found for match "+matchID)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, scorers)
	}
}

// GetMatchTrivia handles GET /v1/matches/{matchID}/trivia.
func GetMatchTrivia(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		matchID := chi.URLParam(r, "matchID")
		trivia, err := s.GetMatchTrivia(r.Context(), matchID)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "no trivia found for match "+matchID)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, trivia)
	}
}

// GetMatchPreview handles GET /v1/matches/{matchID}/preview.
func GetMatchPreview(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		matchID := chi.URLParam(r, "matchID")
		preview, err := s.GetMatchPreview(r.Context(), matchID)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "no preview found for match "+matchID)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, preview)
	}
}

// GetTournamentTrivia handles GET /v1/stats/trivia.
func GetTournamentTrivia(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		trivia, err := s.GetTournamentTrivia(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, trivia)
	}
}

// GetLeaderboard handles GET /v1/leaderboard.
func GetLeaderboard(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		entries, err := s.GetLeaderboard(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, entries)
	}
}

// CreateUserPrediction handles POST /v1/matches/{matchID}/predictions.
//
// Validates that probabilities are in [0,1] and sum to 1.0 within 0.001
// tolerance, then delegates to the store.
func CreateUserPrediction(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		matchID := chi.URLParam(r, "matchID")

		var req models.UserPredictionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}

		if req.UserID == "" {
			writeError(w, http.StatusBadRequest, "user_id is required")
			return
		}

		for _, p := range []float64{req.HomeWinProb, req.DrawProb, req.AwayWinProb} {
			if p < 0 || p > 1 {
				writeError(w, http.StatusBadRequest, "probabilities must be between 0 and 1")
				return
			}
		}
		sum := req.HomeWinProb + req.DrawProb + req.AwayWinProb
		if math.Abs(sum-1.0) > 0.001 {
			writeError(w, http.StatusBadRequest, "probabilities must sum to 1.0")
			return
		}

		resp, err := s.CreateUserPrediction(r.Context(), matchID, req)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "match not found or already kicked off")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusCreated, resp)
	}
}
