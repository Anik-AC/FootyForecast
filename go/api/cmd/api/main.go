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
		r.Get("/matches/{matchID}/prediction", handlers.GetMatchPrediction(s))
		r.Get("/matches/{matchID}/market-comparison", handlers.GetMarketComparison(s))
		r.Get("/simulation/latest", handlers.GetLatestSimulation(s))
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
