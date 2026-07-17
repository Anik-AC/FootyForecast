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
	// GetQFSimulation returns the latest QF-conditional simulation (model version ending in _qf).
	GetQFSimulation(ctx context.Context) (*models.TournamentSimulation, error)
	GetMarketComparison(ctx context.Context, matchID string) (*models.MarketComparison, error)
	GetCalibration(ctx context.Context) (*models.CalibrationSummary, error)
	GetMatchTrivia(ctx context.Context, matchID string) (*models.MatchTrivia, error)
	GetMatchPreview(ctx context.Context, matchID string) (*models.MatchPreview, error)
	GetLeaderboard(ctx context.Context) ([]models.LeaderboardEntry, error)
	CreateUserPrediction(ctx context.Context, matchID string, req models.UserPredictionRequest) (*models.UserPredictionResponse, error)
	GetMatchScorerPredictions(ctx context.Context, matchID string) (*models.MatchScorerPredictions, error)
	// GetDisagreements returns upcoming fixtures with model predictions and market data,
	// sorted by disagreement score descending. limit=0 returns all.
	GetDisagreements(ctx context.Context, limit int) ([]models.DisagreementEntry, error)
	// GetTeamEloRatings returns the latest Elo rating for every team, sorted by
	// rating descending.
	GetTeamEloRatings(ctx context.Context) ([]models.TeamRating, error)
	// GetUserStats returns prediction stats for one user: total picks, how many
	// are graded, how many the user got right, and average log loss.
	GetUserStats(ctx context.Context, userID string) (*models.UserStats, error)
	// GetGroupStandings returns computed standings for every WC 2026 group.
	GetGroupStandings(ctx context.Context) ([]models.GroupTable, error)
	// GetTopScorers returns the top N tournament goal scorers.
	GetTopScorers(ctx context.Context, limit int) ([]models.TopScorer, error)
	// GetTeams returns all WC 2026 teams with latest Elo rating and group letter.
	GetTeams(ctx context.Context) ([]models.TeamListItem, error)
	// GetTeamDetail returns full team detail including fixtures and player stats.
	GetTeamDetail(ctx context.Context, teamID string) (*models.TeamDetail, error)

	// GetHydrationAnalysis returns tournament-wide drinks break momentum analysis.
	GetHydrationAnalysis(ctx context.Context) (*models.HydrationAnalysis, error)

	// GetMatchEvents returns all match incidents (goals, cards, subs) for a fixture.
	GetMatchEvents(ctx context.Context, matchID string) ([]models.MatchEvent, error)
	// GetMatchStats returns team-level aggregated statistics for a fixture (2 rows: home + away).
	GetMatchStats(ctx context.Context, matchID string) ([]models.MatchStats, error)
	// GetMatchMomentum returns per-minute momentum values for a fixture.
	GetMatchMomentum(ctx context.Context, matchID string) ([]models.MomentumPoint, error)
	// GetMatchCommentary returns the full commentary feed for a fixture, ordered by minute.
	GetMatchCommentary(ctx context.Context, matchID string) ([]models.CommentaryEntry, error)
	// GetMatchPlayerStats returns per-player stats for all players in a fixture.
	GetMatchPlayerStats(ctx context.Context, matchID string) ([]models.MatchPlayerStat, error)
	// GetMatchAnalysis returns the LLM-generated post-match analysis for a fixture.
	GetMatchAnalysis(ctx context.Context, matchID string) (*models.MatchAnalysis, error)

	// GetTeamForm returns the last 5 completed WC2026 fixtures for a team.
	GetTeamForm(ctx context.Context, teamID string) ([]models.MatchSummary, error)
	// GetMatchH2H returns head-to-head history for the two teams in a fixture.
	GetMatchH2H(ctx context.Context, matchID string) (*models.H2HRecord, error)
	// GetTopAssists returns the top N assist providers in the tournament.
	GetTopAssists(ctx context.Context, limit int) ([]models.TopScorer, error)
	// GetTournamentTrivia computes tournament-wide records and milestones on the fly.
	GetTournamentTrivia(ctx context.Context) (*models.TournamentTriviaResponse, error)
	// GetModelComparison returns per-model grading stats across all graded WC 2026 matches,
	// ordered by mean log-loss ascending (best model first).
	GetModelComparison(ctx context.Context) ([]models.ModelComparisonRow, error)
	// GetPredictionComparison returns all knockout fixtures with side-by-side predictions
	// from the three main model versions, plus champion probabilities from each simulation.
	GetPredictionComparison(ctx context.Context) (*models.PredictionComparison, error)
}
