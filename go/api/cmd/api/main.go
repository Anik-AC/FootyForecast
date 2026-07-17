// Command api starts the FootyForecast JSON API server.
// It reads precomputed predictions and simulation results from Postgres
// and serves them as JSON. No predictions are computed on request.
//
// Environment:
//
//	DATABASE_URL         — Postgres connection string (required)
//	PORT                 — listen port (default 8080)
//	CORS_ALLOWED_ORIGIN  — allowed CORS origin (default *)
package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/footyforecast/api/internal/db"
	"github.com/footyforecast/api/internal/handlers"
	"github.com/footyforecast/api/internal/middleware"
	"github.com/footyforecast/api/internal/store"
)

func main() {
	ctx := context.Background()

	pool, err := db.NewPool(ctx)
	if err != nil {
		log.Fatalf("database pool: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("database ping: %v", err)
	}
	log.Printf("connected to database")

	s := store.NewPostgresStore(pool)

	r := chi.NewRouter()
	r.Use(middleware.CORS)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	r.Route("/v1", func(r chi.Router) {
		r.Get("/matches", handlers.GetMatches(s))
		r.Get("/matches/disagreements", handlers.GetDisagreements(s))
		r.Get("/matches/{matchID}/prediction", handlers.GetMatchPrediction(s))
		r.Get("/matches/{matchID}/market-comparison", handlers.GetMarketComparison(s))
		r.Get("/matches/{matchID}/trivia", handlers.GetMatchTrivia(s))
		r.Get("/matches/{matchID}/preview", handlers.GetMatchPreview(s))
		r.Get("/matches/{matchID}/scorers", handlers.GetMatchScorerPredictions(s))
		r.Post("/matches/{matchID}/predictions", handlers.CreateUserPrediction(s))
		r.Get("/matches/{matchID}/events", handlers.GetMatchEvents(s))
		r.Get("/matches/{matchID}/match-stats", handlers.GetMatchStats(s))
		r.Get("/matches/{matchID}/momentum", handlers.GetMatchMomentum(s))
		r.Get("/matches/{matchID}/commentary", handlers.GetMatchCommentary(s))
		r.Get("/matches/{matchID}/player-stats", handlers.GetMatchPlayerStats(s))
		r.Get("/matches/{matchID}/analysis", handlers.GetMatchAnalysis(s))
		r.Get("/matches/{matchID}/h2h", handlers.GetMatchH2H(s))
		r.Get("/teams", handlers.GetTeams(s))
		r.Get("/teams/ratings", handlers.GetTeamEloRatings(s))
		r.Get("/teams/{teamID}", handlers.GetTeamDetail(s))
		r.Get("/teams/{teamID}/form", handlers.GetTeamForm(s))
		r.Get("/users/{userID}/stats", handlers.GetUserStats(s))
		r.Get("/groups", handlers.GetGroupStandings(s))
		r.Get("/stats/scorers", handlers.GetTopScorers(s))
		r.Get("/stats/assists", handlers.GetTopAssists(s))
		r.Get("/stats/trivia", handlers.GetTournamentTrivia(s))
		r.Get("/stats/hydration-breaks", handlers.GetHydrationAnalysis(s))
		r.Get("/simulation/latest", handlers.GetLatestSimulation(s))
		r.Get("/simulation/qf", handlers.GetQFSimulation(s))
		r.Get("/calibration", handlers.GetCalibration(s))
		r.Get("/stats/models", handlers.GetModelComparison(s))
		r.Get("/predictions/compare", handlers.GetPredictionComparison(s))
		r.Get("/leaderboard", handlers.GetLeaderboard(s))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("listening on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("server: %v", err)
	}
}
