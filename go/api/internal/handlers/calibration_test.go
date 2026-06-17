package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/footyforecast/api/internal/handlers"
	"github.com/footyforecast/api/internal/models"
	"github.com/footyforecast/api/internal/store"
)

func TestGetCalibration_EmptyOK(t *testing.T) {
	// No graded matches yet: should return 200 with zero counts.
	ms := &mockStore{calibration: &models.CalibrationSummary{
		TotalMatches: 0,
		Matches:      []models.GradedMatch{},
	}}
	w := serve(handlers.GetCalibration(ms), "/v1/calibration", "/v1/calibration")

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var got models.CalibrationSummary
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.TotalMatches != 0 {
		t.Errorf("total_matches: got %d, want 0", got.TotalMatches)
	}
}

func TestGetCalibration_WithGradedMatches(t *testing.T) {
	summary := &models.CalibrationSummary{
		TotalMatches:     2,
		ModelMeanLogLoss: 0.693,
		ModelMeanBrier:   0.5,
		MarketMeanLogLoss: map[string]float64{"polymarket": 0.65},
		MarketMeanBrier:   map[string]float64{"polymarket": 0.48},
		Matches: []models.GradedMatch{
			{
				MatchID:    "WC2026-GRP-A-01",
				KickoffUTC: time.Now().UTC(),
				HomeTeam:   models.Team{ID: "BRA", Name: "Brazil", Confederation: "CONMEBOL"},
				AwayTeam:   models.Team{ID: "ARG", Name: "Argentina", Confederation: "CONMEBOL"},
				ActualOutcome: "home_win",
				ModelProbabilities: models.OutcomeProbabilities{
					HomeWin: 0.55, Draw: 0.25, AwayWin: 0.20,
				},
				ModelLogLoss:    0.598,
				ModelBrierScore: 0.405,
				MarketLogLoss:   map[string]float64{"polymarket": 0.58},
				MarketBrierScore: map[string]float64{"polymarket": 0.39},
			},
			{
				MatchID:    "WC2026-GRP-A-02",
				KickoffUTC: time.Now().UTC(),
				HomeTeam:   models.Team{ID: "FRA", Name: "France", Confederation: "UEFA"},
				AwayTeam:   models.Team{ID: "GER", Name: "Germany", Confederation: "UEFA"},
				ActualOutcome: "draw",
				ModelProbabilities: models.OutcomeProbabilities{
					HomeWin: 0.40, Draw: 0.30, AwayWin: 0.30,
				},
				ModelLogLoss:    1.204,
				ModelBrierScore: 0.98,
			},
		},
	}

	ms := &mockStore{calibration: summary}
	w := serve(handlers.GetCalibration(ms), "/v1/calibration", "/v1/calibration")

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var got models.CalibrationSummary
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.TotalMatches != 2 {
		t.Errorf("total_matches: got %d, want 2", got.TotalMatches)
	}
	if len(got.Matches) != 2 {
		t.Errorf("matches len: got %d, want 2", len(got.Matches))
	}
	if got.Matches[0].MatchID != "WC2026-GRP-A-01" {
		t.Errorf("first match_id: got %q", got.Matches[0].MatchID)
	}
	if got.Matches[0].ActualOutcome != "home_win" {
		t.Errorf("actual_outcome: got %q", got.Matches[0].ActualOutcome)
	}
	if got.MarketMeanLogLoss == nil {
		t.Error("market_mean_log_loss should not be nil")
	}
}

func TestGetCalibration_ContentType(t *testing.T) {
	ms := &mockStore{calibration: &models.CalibrationSummary{}}
	w := serve(handlers.GetCalibration(ms), "/v1/calibration", "/v1/calibration")
	if w.Header().Get("Content-Type") != "application/json" {
		t.Errorf("Content-Type: got %q", w.Header().Get("Content-Type"))
	}
}

func TestGetCalibration_StoreError(t *testing.T) {
	ms := &mockStore{err: store.ErrNotFound}
	w := serve(handlers.GetCalibration(ms), "/v1/calibration", "/v1/calibration")
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}
