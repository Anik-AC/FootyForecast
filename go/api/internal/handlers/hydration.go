package handlers

import (
	"net/http"

	"github.com/footyforecast/api/internal/store"
)

// GetHydrationAnalysis handles GET /v1/stats/hydration-breaks.
// Returns tournament-wide drinks break momentum analysis derived from
// match_events and match_commentary.
func GetHydrationAnalysis(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		analysis, err := s.GetHydrationAnalysis(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, analysis)
	}
}
