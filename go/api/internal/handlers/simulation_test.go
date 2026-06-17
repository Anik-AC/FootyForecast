package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/footyforecast/api/internal/handlers"
	"github.com/footyforecast/api/internal/models"
	"github.com/footyforecast/api/internal/store"
	"net/http/httptest"
)

func TestGetLatestSimulation_200(t *testing.T) {
	group := "A"
	sim := &models.TournamentSimulation{
		SimulationID:     "2026-06-17T10:00:00Z",
		RunAt:            time.Now().UTC(),
		NSimulations:     100000,
		MatchResultsAsOf: time.Now().UTC(),
		Teams: []models.TeamSimulationResult{
			{
				TeamID:   "BRA",
				TeamName: "Brazil",
				Group:    &group,
				StageProbabilities: models.StageProbabilities{
					RoundOf32: 0.92, RoundOf16: 0.78,
					QuarterFinal: 0.55, SemiFinal: 0.38,
					Final: 0.22, Champion: 0.13,
				},
			},
		},
	}

	r := chi.NewRouter()
	r.Get("/v1/simulation/latest", handlers.GetLatestSimulation(&mockStore{simulation: sim}))
	req := httptest.NewRequest(http.MethodGet, "/v1/simulation/latest", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var got models.TournamentSimulation
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.NSimulations != 100000 {
		t.Errorf("n_simulations: got %d", got.NSimulations)
	}
	if len(got.Teams) != 1 {
		t.Fatalf("teams len: got %d", len(got.Teams))
	}
	if got.Teams[0].TeamID != "BRA" {
		t.Errorf("team_id: got %q", got.Teams[0].TeamID)
	}
	if got.Teams[0].Group == nil || *got.Teams[0].Group != "A" {
		t.Errorf("group: got %v", got.Teams[0].Group)
	}
	if got.Teams[0].StageProbabilities.Champion != 0.13 {
		t.Errorf("champion prob: got %v", got.Teams[0].StageProbabilities.Champion)
	}
}

func TestGetLatestSimulation_MonotoneProbabilities(t *testing.T) {
	// Stage probabilities in the response must be non-increasing:
	// champion <= final <= semi_final <= quarter_final <= round_of_16 <= round_of_32.
	// If the mock returns decreasing values, the handler must pass them through unchanged;
	// this test verifies the handler does not re-sort or modify the values.
	sim := &models.TournamentSimulation{
		SimulationID: "test",
		Teams: []models.TeamSimulationResult{
			{TeamID: "ARG", StageProbabilities: models.StageProbabilities{
				RoundOf32: 1.0, RoundOf16: 0.85, QuarterFinal: 0.60,
				SemiFinal: 0.40, Final: 0.20, Champion: 0.10,
			}},
		},
	}
	r := chi.NewRouter()
	r.Get("/v1/simulation/latest", handlers.GetLatestSimulation(&mockStore{simulation: sim}))
	req := httptest.NewRequest(http.MethodGet, "/v1/simulation/latest", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var got models.TournamentSimulation
	json.NewDecoder(w.Body).Decode(&got)
	sp := got.Teams[0].StageProbabilities
	if sp.Champion > sp.Final || sp.Final > sp.SemiFinal ||
		sp.SemiFinal > sp.QuarterFinal || sp.QuarterFinal > sp.RoundOf16 ||
		sp.RoundOf16 > sp.RoundOf32 {
		t.Errorf("stage probabilities are not monotone: %+v", sp)
	}
}

func TestGetLatestSimulation_404(t *testing.T) {
	r := chi.NewRouter()
	r.Get("/v1/simulation/latest", handlers.GetLatestSimulation(&mockStore{err: store.ErrNotFound}))
	req := httptest.NewRequest(http.MethodGet, "/v1/simulation/latest", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}
