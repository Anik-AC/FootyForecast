// Package store defines the data-access interface the handlers depend on.
// The concrete PostgresStore implementation lives in postgres.go.
// Keeping this as an interface allows handlers to be tested with a mock store.
package store

import (
	"context"
	"errors"

	"github.com/footyforecast/api/internal/models"
)

// ErrNotFound is returned when a requested resource does not exist in the DB.
var ErrNotFound = errors.New("not found")

// Store is the only DB access point for the API handlers.
type Store interface {
	GetMatches(ctx context.Context) ([]models.MatchSummary, error)
	GetMatchPrediction(ctx context.Context, matchID string) (*models.MatchPrediction, error)
	GetLatestSimulation(ctx context.Context) (*models.TournamentSimulation, error)
	GetMarketComparison(ctx context.Context, matchID string) (*models.MarketComparison, error)
	GetCalibration(ctx context.Context) (*models.CalibrationSummary, error)
}
