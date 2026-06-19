package handlers_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/footyforecast/api/internal/handlers"
	"github.com/footyforecast/api/internal/models"
	"github.com/footyforecast/api/internal/store"
)

// servePost routes a single POST request through a chi router.
func servePost(handler http.HandlerFunc, path, url string, body []byte) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	r.Post(path, handler)
	req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ---- GetMatchTrivia tests ---------------------------------------------------

func TestGetMatchTrivia_200(t *testing.T) {
	trivia := &models.MatchTrivia{
		MatchID:     "WC2026-GRP-A-01",
		GeneratedAt: time.Now().UTC(),
		Facts: []models.TriviaFact{
			{Template: "head_to_head", Text: "Brazil lead H2H 40W 20D 15L.", Data: json.RawMessage(`{"total":75}`)},
		},
	}
	ms := &mockStore{trivia: trivia}
	w := serve(
		handlers.GetMatchTrivia(ms),
		"/v1/matches/{matchID}/trivia",
		"/v1/matches/WC2026-GRP-A-01/trivia",
	)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var got models.MatchTrivia
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.MatchID != "WC2026-GRP-A-01" {
		t.Errorf("match_id: got %q", got.MatchID)
	}
	if len(got.Facts) != 1 {
		t.Errorf("facts len: got %d", len(got.Facts))
	}
	if got.Facts[0].Template != "head_to_head" {
		t.Errorf("template: got %q", got.Facts[0].Template)
	}
}

func TestGetMatchTrivia_404(t *testing.T) {
	ms := &mockStore{err: store.ErrNotFound}
	w := serve(
		handlers.GetMatchTrivia(ms),
		"/v1/matches/{matchID}/trivia",
		"/v1/matches/ghost/trivia",
	)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestGetMatchTrivia_500(t *testing.T) {
	ms := &mockStore{err: errInternal}
	w := serve(
		handlers.GetMatchTrivia(ms),
		"/v1/matches/{matchID}/trivia",
		"/v1/matches/x/trivia",
	)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

// ---- GetMatchPreview tests --------------------------------------------------

func TestGetMatchPreview_200(t *testing.T) {
	preview := &models.MatchPreview{
		MatchID:     "WC2026-GRP-A-01",
		PreviewText: "Brazil are favourites.",
		ModelUsed:   "claude-haiku-4-5-20251001",
		GeneratedAt: time.Now().UTC(),
	}
	ms := &mockStore{preview: preview}
	w := serve(
		handlers.GetMatchPreview(ms),
		"/v1/matches/{matchID}/preview",
		"/v1/matches/WC2026-GRP-A-01/preview",
	)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var got models.MatchPreview
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.PreviewText != "Brazil are favourites." {
		t.Errorf("preview_text: got %q", got.PreviewText)
	}
	if got.ModelUsed != "claude-haiku-4-5-20251001" {
		t.Errorf("model_used: got %q", got.ModelUsed)
	}
}

func TestGetMatchPreview_404(t *testing.T) {
	ms := &mockStore{err: store.ErrNotFound}
	w := serve(
		handlers.GetMatchPreview(ms),
		"/v1/matches/{matchID}/preview",
		"/v1/matches/ghost/preview",
	)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

// ---- GetLeaderboard tests ---------------------------------------------------

func TestGetLeaderboard_200_Empty(t *testing.T) {
	ms := &mockStore{leaderboard: []models.LeaderboardEntry{}}
	w := serve(
		handlers.GetLeaderboard(ms),
		"/v1/leaderboard",
		"/v1/leaderboard",
	)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var got []models.LeaderboardEntry
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty leaderboard, got %d entries", len(got))
	}
}

func TestGetLeaderboard_200_WithEntries(t *testing.T) {
	entries := []models.LeaderboardEntry{
		{Rank: 1, UserID: "alice", DisplayName: "alice", Predictions: 5, AvgLogLoss: 0.8, AvgBrier: 0.4},
		{Rank: 2, UserID: "bob", DisplayName: "bob", Predictions: 3, AvgLogLoss: 0.9, AvgBrier: 0.45},
	}
	ms := &mockStore{leaderboard: entries}
	w := serve(
		handlers.GetLeaderboard(ms),
		"/v1/leaderboard",
		"/v1/leaderboard",
	)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var got []models.LeaderboardEntry
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(got))
	}
	if got[0].UserID != "alice" {
		t.Errorf("first entry user_id: got %q", got[0].UserID)
	}
}

func TestGetLeaderboard_ContentType(t *testing.T) {
	ms := &mockStore{leaderboard: []models.LeaderboardEntry{}}
	w := serve(handlers.GetLeaderboard(ms), "/v1/leaderboard", "/v1/leaderboard")
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type: got %q", ct)
	}
}

func TestGetLeaderboard_500(t *testing.T) {
	ms := &mockStore{err: errInternal}
	w := serve(handlers.GetLeaderboard(ms), "/v1/leaderboard", "/v1/leaderboard")
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

// ---- CreateUserPrediction tests --------------------------------------------

func validPredBody() []byte {
	b, _ := json.Marshal(models.UserPredictionRequest{
		UserID:      "alice",
		HomeWinProb: 0.5,
		DrawProb:    0.25,
		AwayWinProb: 0.25,
	})
	return b
}

func TestCreateUserPrediction_201(t *testing.T) {
	resp := &models.UserPredictionResponse{
		ID:          1,
		UserID:      "alice",
		FixtureID:   "WC2026-GRP-A-01",
		HomeWinProb: 0.5,
		DrawProb:    0.25,
		AwayWinProb: 0.25,
		SubmittedAt: time.Now().UTC(),
	}
	ms := &mockStore{userPrediction: resp}
	w := servePost(
		handlers.CreateUserPrediction(ms),
		"/v1/matches/{matchID}/predictions",
		"/v1/matches/WC2026-GRP-A-01/predictions",
		validPredBody(),
	)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var got models.UserPredictionResponse
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.UserID != "alice" {
		t.Errorf("user_id: got %q", got.UserID)
	}
	if got.FixtureID != "WC2026-GRP-A-01" {
		t.Errorf("fixture_id: got %q", got.FixtureID)
	}
}

func TestCreateUserPrediction_404_UnknownMatch(t *testing.T) {
	ms := &mockStore{err: store.ErrNotFound}
	w := servePost(
		handlers.CreateUserPrediction(ms),
		"/v1/matches/{matchID}/predictions",
		"/v1/matches/NO-SUCH/predictions",
		validPredBody(),
	)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestCreateUserPrediction_400_MissingUserID(t *testing.T) {
	body, _ := json.Marshal(models.UserPredictionRequest{
		HomeWinProb: 0.5,
		DrawProb:    0.25,
		AwayWinProb: 0.25,
	})
	ms := &mockStore{}
	w := servePost(
		handlers.CreateUserPrediction(ms),
		"/v1/matches/{matchID}/predictions",
		"/v1/matches/X/predictions",
		body,
	)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestCreateUserPrediction_400_ProbsDoNotSumToOne(t *testing.T) {
	body, _ := json.Marshal(models.UserPredictionRequest{
		UserID:      "alice",
		HomeWinProb: 0.5,
		DrawProb:    0.5,
		AwayWinProb: 0.5,
	})
	ms := &mockStore{}
	w := servePost(
		handlers.CreateUserPrediction(ms),
		"/v1/matches/{matchID}/predictions",
		"/v1/matches/X/predictions",
		body,
	)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestCreateUserPrediction_400_NegativeProb(t *testing.T) {
	body, _ := json.Marshal(models.UserPredictionRequest{
		UserID:      "alice",
		HomeWinProb: -0.1,
		DrawProb:    0.6,
		AwayWinProb: 0.5,
	})
	ms := &mockStore{}
	w := servePost(
		handlers.CreateUserPrediction(ms),
		"/v1/matches/{matchID}/predictions",
		"/v1/matches/X/predictions",
		body,
	)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestCreateUserPrediction_400_InvalidJSON(t *testing.T) {
	ms := &mockStore{}
	w := servePost(
		handlers.CreateUserPrediction(ms),
		"/v1/matches/{matchID}/predictions",
		"/v1/matches/X/predictions",
		[]byte("not json"),
	)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestCreateUserPrediction_400_ProbAboveOne(t *testing.T) {
	body, _ := json.Marshal(models.UserPredictionRequest{
		UserID:      "alice",
		HomeWinProb: 1.1,
		DrawProb:    0.0,
		AwayWinProb: 0.0,
	})
	ms := &mockStore{}
	w := servePost(
		handlers.CreateUserPrediction(ms),
		"/v1/matches/{matchID}/predictions",
		"/v1/matches/X/predictions",
		body,
	)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

// errInternal is a sentinel non-ErrNotFound error for 500 tests.
var errInternal = errors.New("db exploded")
