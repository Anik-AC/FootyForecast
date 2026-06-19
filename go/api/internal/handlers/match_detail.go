package handlers

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/footyforecast/api/internal/store"
)

// GetMatchEvents handles GET /v1/matches/{matchID}/events
// Returns all in-match incidents (goals, cards, substitutions, VAR).
func GetMatchEvents(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		matchID := chi.URLParam(r, "matchID")
		events, err := s.GetMatchEvents(r.Context(), matchID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, events)
	}
}

// GetMatchStats handles GET /v1/matches/{matchID}/match-stats
// Returns team-level aggregated statistics (possession, xG, shots, etc.) for both sides.
func GetMatchStats(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		matchID := chi.URLParam(r, "matchID")
		stats, err := s.GetMatchStats(r.Context(), matchID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, stats)
	}
}

// GetMatchMomentum handles GET /v1/matches/{matchID}/momentum
// Returns per-minute momentum values (positive = home dominating, negative = away).
func GetMatchMomentum(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		matchID := chi.URLParam(r, "matchID")
		points, err := s.GetMatchMomentum(r.Context(), matchID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, points)
	}
}

// GetMatchCommentary handles GET /v1/matches/{matchID}/commentary
// Returns the full timestamped commentary feed.
func GetMatchCommentary(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		matchID := chi.URLParam(r, "matchID")
		entries, err := s.GetMatchCommentary(r.Context(), matchID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, entries)
	}
}

// GetMatchPlayerStats handles GET /v1/matches/{matchID}/player-stats
// Returns per-player stats for all players who appeared in the fixture.
func GetMatchPlayerStats(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		matchID := chi.URLParam(r, "matchID")
		players, err := s.GetMatchPlayerStats(r.Context(), matchID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, players)
	}
}

// GetMatchAnalysis handles GET /v1/matches/{matchID}/analysis
// Returns the LLM-generated post-match analysis text. 404 if not yet generated.
func GetMatchAnalysis(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		matchID := chi.URLParam(r, "matchID")
		analysis, err := s.GetMatchAnalysis(r.Context(), matchID)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				writeError(w, http.StatusNotFound, "analysis not yet available")
				return
			}
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, analysis)
	}
}
