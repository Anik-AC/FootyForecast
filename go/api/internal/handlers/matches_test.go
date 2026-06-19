package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/footyforecast/api/internal/handlers"
	"github.com/footyforecast/api/internal/models"
	"github.com/footyforecast/api/internal/store"
)

// mockStore implements store.Store with canned responses.
type mockStore struct {
	matches          []models.MatchSummary
	prediction       *models.MatchPrediction
	simulation       *models.TournamentSimulation
	comparison       *models.MarketComparison
	calibration      *models.CalibrationSummary
	trivia           *models.MatchTrivia
	preview          *models.MatchPreview
	leaderboard      []models.LeaderboardEntry
	userPrediction   *models.UserPredictionResponse
	scorerPrediction *models.MatchScorerPredictions
	disagreements    []models.DisagreementEntry
	eloRatings       []models.TeamRating
	err              error
}

func (m *mockStore) GetMatches(_ context.Context) ([]models.MatchSummary, error) {
	return m.matches, m.err
}
func (m *mockStore) GetMatchPrediction(_ context.Context, _ string) (*models.MatchPrediction, error) {
	return m.prediction, m.err
}
func (m *mockStore) GetLatestSimulation(_ context.Context) (*models.TournamentSimulation, error) {
	return m.simulation, m.err
}
func (m *mockStore) GetMarketComparison(_ context.Context, _ string) (*models.MarketComparison, error) {
	return m.comparison, m.err
}
func (m *mockStore) GetCalibration(_ context.Context) (*models.CalibrationSummary, error) {
	return m.calibration, m.err
}
func (m *mockStore) GetMatchTrivia(_ context.Context, _ string) (*models.MatchTrivia, error) {
	return m.trivia, m.err
}
func (m *mockStore) GetMatchPreview(_ context.Context, _ string) (*models.MatchPreview, error) {
	return m.preview, m.err
}
func (m *mockStore) GetLeaderboard(_ context.Context) ([]models.LeaderboardEntry, error) {
	return m.leaderboard, m.err
}
func (m *mockStore) CreateUserPrediction(_ context.Context, _ string, req models.UserPredictionRequest) (*models.UserPredictionResponse, error) {
	return m.userPrediction, m.err
}
func (m *mockStore) GetMatchScorerPredictions(_ context.Context, _ string) (*models.MatchScorerPredictions, error) {
	return m.scorerPrediction, m.err
}
func (m *mockStore) GetDisagreements(_ context.Context, _ int) ([]models.DisagreementEntry, error) {
	return m.disagreements, m.err
}
func (m *mockStore) GetTeamEloRatings(_ context.Context) ([]models.TeamRating, error) {
	return m.eloRatings, m.err
}
func (m *mockStore) GetUserStats(_ context.Context, _ string) (*models.UserStats, error) {
	return nil, m.err
}
func (m *mockStore) GetGroupStandings(_ context.Context) ([]models.GroupTable, error) {
	return nil, m.err
}
func (m *mockStore) GetTopScorers(_ context.Context, _ int) ([]models.TopScorer, error) {
	return nil, m.err
}
func (m *mockStore) GetTeams(_ context.Context) ([]models.TeamListItem, error) {
	return nil, m.err
}
func (m *mockStore) GetTeamDetail(_ context.Context, _ string) (*models.TeamDetail, error) {
	return nil, m.err
}
func (m *mockStore) GetMatchEvents(_ context.Context, _ string) ([]models.MatchEvent, error) {
	return nil, m.err
}
func (m *mockStore) GetMatchStats(_ context.Context, _ string) ([]models.MatchStats, error) {
	return nil, m.err
}
func (m *mockStore) GetMatchMomentum(_ context.Context, _ string) ([]models.MomentumPoint, error) {
	return nil, m.err
}
func (m *mockStore) GetMatchCommentary(_ context.Context, _ string) ([]models.CommentaryEntry, error) {
	return nil, m.err
}
func (m *mockStore) GetMatchPlayerStats(_ context.Context, _ string) ([]models.MatchPlayerStat, error) {
	return nil, m.err
}
func (m *mockStore) GetMatchAnalysis(_ context.Context, _ string) (*models.MatchAnalysis, error) {
	return nil, m.err
}
func (m *mockStore) GetHydrationAnalysis(_ context.Context) (*models.HydrationAnalysis, error) {
	return nil, m.err
}
func (m *mockStore) GetTeamForm(_ context.Context, _ string) ([]models.MatchSummary, error) {
	return nil, m.err
}
func (m *mockStore) GetMatchH2H(_ context.Context, _ string) (*models.H2HRecord, error) {
	return nil, m.err
}
func (m *mockStore) GetTopAssists(_ context.Context, _ int) ([]models.TopScorer, error) {
	return nil, m.err
}
func (m *mockStore) GetTournamentTrivia(_ context.Context) (*models.TournamentTriviaResponse, error) {
	return nil, m.err
}

// serve routes a single GET request through a chi router and returns the recorder.
func serve(handler http.HandlerFunc, path, url string) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	r.Get(path, handler)
	req := httptest.NewRequest(http.MethodGet, url, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ---- GetMatchPrediction tests -----------------------------------------------

func TestGetMatchPrediction_200(t *testing.T) {
	xg := 1.4
	pred := &models.MatchPrediction{
		MatchID:      "WC2026-GRP-A-01",
		HomeTeam:     models.Team{ID: "BRA", Name: "Brazil", Confederation: "CONMEBOL"},
		AwayTeam:     models.Team{ID: "ARG", Name: "Argentina", Confederation: "CONMEBOL"},
		MatchDate:    time.Now().UTC(),
		ModelAsOf:    time.Now().UTC(),
		ModelVersion: "bayesian_goals_v1",
		OutcomeProbabilities: models.OutcomeProbabilities{
			HomeWin: 0.45, Draw: 0.28, AwayWin: 0.27,
		},
		ScorelineGrid: []models.ScorelineProbability{
			{HomeGoals: 1, AwayGoals: 0, Probability: 0.12},
		},
		Totals:        models.TotalsProbabilities{Over15: 0.7, Over25: 0.45, Over35: 0.25, BTTS: 0.5},
		ExpectedGoals: &models.ExpectedGoals{HomeXG: xg, AwayXG: 1.1},
	}

	ms := &mockStore{prediction: pred}
	w := serve(
		handlers.GetMatchPrediction(ms),
		"/v1/matches/{matchID}/prediction",
		"/v1/matches/WC2026-GRP-A-01/prediction",
	)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var got models.MatchPrediction
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got.MatchID != "WC2026-GRP-A-01" {
		t.Errorf("match_id: got %q", got.MatchID)
	}
	if got.HomeTeam.ID != "BRA" {
		t.Errorf("home_team.id: got %q", got.HomeTeam.ID)
	}
	if got.OutcomeProbabilities.HomeWin != 0.45 {
		t.Errorf("home_win: got %v", got.OutcomeProbabilities.HomeWin)
	}
	if len(got.ScorelineGrid) != 1 {
		t.Errorf("scoreline_grid len: got %d", len(got.ScorelineGrid))
	}
	if got.ExpectedGoals == nil || got.ExpectedGoals.HomeXG != xg {
		t.Errorf("expected_goals.home_xg: got %v", got.ExpectedGoals)
	}
}

func TestGetMatchPrediction_404(t *testing.T) {
	ms := &mockStore{err: store.ErrNotFound}
	w := serve(
		handlers.GetMatchPrediction(ms),
		"/v1/matches/{matchID}/prediction",
		"/v1/matches/no-such-match/prediction",
	)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	var errResp models.ErrorResponse
	if err := json.NewDecoder(w.Body).Decode(&errResp); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if errResp.Error == "" {
		t.Error("expected non-empty error message")
	}
}

func TestGetMatchPrediction_ContentType(t *testing.T) {
	ms := &mockStore{prediction: &models.MatchPrediction{MatchID: "x"}}
	w := serve(
		handlers.GetMatchPrediction(ms),
		"/v1/matches/{matchID}/prediction",
		"/v1/matches/x/prediction",
	)
	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type: got %q", ct)
	}
}

// ---- GetMarketComparison tests -----------------------------------------------

func TestGetMarketComparison_200_NoMarkets(t *testing.T) {
	// A match with a prediction but no market data yet returns 200 with empty markets.
	cmp := &models.MarketComparison{
		MatchID:            "WC2026-GRP-A-01",
		ModelAsOf:          time.Now().UTC(),
		ModelProbabilities: models.OutcomeProbabilities{HomeWin: 0.4, Draw: 0.3, AwayWin: 0.3},
		Markets:            []models.MarketSource{},
	}
	ms := &mockStore{comparison: cmp}
	w := serve(
		handlers.GetMarketComparison(ms),
		"/v1/matches/{matchID}/market-comparison",
		"/v1/matches/WC2026-GRP-A-01/market-comparison",
	)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var got models.MarketComparison
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Grading != nil {
		t.Errorf("grading should be nil for unplayed match")
	}
}

func TestGetMarketComparison_404(t *testing.T) {
	ms := &mockStore{err: store.ErrNotFound}
	w := serve(
		handlers.GetMarketComparison(ms),
		"/v1/matches/{matchID}/market-comparison",
		"/v1/matches/ghost/market-comparison",
	)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}
