package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/footyforecast/api/internal/models"
)

// PostgresStore implements Store against a live Postgres database.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore wraps a pgxpool for use by the handlers.
func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{pool: pool}
}

// GetMatches returns all WC 2026 fixtures ordered by kickoff time, with the
// latest prediction and result attached where available.
func (s *PostgresStore) GetMatches(ctx context.Context) ([]models.MatchSummary, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			f.id, f.kickoff_utc, f.stage, f.group_letter,
			ht.id,  ht.name,  ht.confederation,
			awt.id, awt.name, awt.confederation,
			mr.home_goals, mr.away_goals,
			mp.home_win_prob, mp.draw_prob, mp.away_win_prob
		FROM fixtures f
		JOIN teams ht  ON ht.id  = f.home_team_id
		JOIN teams awt ON awt.id = f.away_team_id
		LEFT JOIN match_results mr ON mr.fixture_id = f.id
		LEFT JOIN LATERAL (
			SELECT home_win_prob, draw_prob, away_win_prob
			FROM match_predictions
			WHERE fixture_id = f.id
			ORDER BY computed_at DESC LIMIT 1
		) mp ON true
		WHERE f.tournament_id = 'WC2026'
		ORDER BY f.kickoff_utc ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("query matches: %w", err)
	}
	defer rows.Close()

	var matches []models.MatchSummary
	for rows.Next() {
		var (
			id, stage                   string
			kickoffUTC                  time.Time
			groupLetter                 *string
			homeID, homeName, homeConf  string
			awayID, awayName, awayConf  string
			homeGoals, awayGoals        *int
			homeWin, draw, awayWin      *float64
		)
		if err := rows.Scan(
			&id, &kickoffUTC, &stage, &groupLetter,
			&homeID, &homeName, &homeConf,
			&awayID, &awayName, &awayConf,
			&homeGoals, &awayGoals,
			&homeWin, &draw, &awayWin,
		); err != nil {
			return nil, fmt.Errorf("scan match row: %w", err)
		}

		m := models.MatchSummary{
			ID:          id,
			KickoffUTC:  kickoffUTC,
			Stage:       stage,
			GroupLetter: groupLetter,
			HomeTeam:    models.Team{ID: homeID, Name: homeName, Confederation: homeConf},
			AwayTeam:    models.Team{ID: awayID, Name: awayName, Confederation: awayConf},
		}
		if homeGoals != nil && awayGoals != nil {
			m.Result = &models.MatchResultSummary{HomeGoals: *homeGoals, AwayGoals: *awayGoals}
		}
		if homeWin != nil && draw != nil && awayWin != nil {
			m.Prediction = &models.OutcomeProbabilities{
				HomeWin: *homeWin, Draw: *draw, AwayWin: *awayWin,
			}
		}
		matches = append(matches, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate matches: %w", err)
	}
	return matches, nil
}

// GetMatchPrediction returns the latest prediction for the given fixture ID.
// Returns ErrNotFound if the fixture does not exist or has no prediction yet.
func (s *PostgresStore) GetMatchPrediction(ctx context.Context, matchID string) (*models.MatchPrediction, error) {
	var (
		fixtureID, homeID, homeName, homeConf string
		awayID, awayName, awayConf            string
		kickoffUTC, modelAsOf                 time.Time
		modelVersion                          string
		predID                                int64
		homeWin, draw, awayWin               float64
		homeXG, awayXG                        *float64
		over15, over25, over35, btts          *float64
	)

	err := s.pool.QueryRow(ctx, `
		SELECT
			f.id, f.kickoff_utc,
			ht.id,  ht.name,  ht.confederation,
			awt.id, awt.name, awt.confederation,
			mp.id,
			mp.model_as_of, mp.model_version,
			mp.home_win_prob, mp.draw_prob, mp.away_win_prob,
			mp.home_xg, mp.away_xg,
			mp.over_1_5, mp.over_2_5, mp.over_3_5, mp.btts
		FROM fixtures f
		JOIN teams ht  ON ht.id  = f.home_team_id
		JOIN teams awt ON awt.id = f.away_team_id
		JOIN match_predictions mp ON mp.fixture_id = f.id
		WHERE f.id = $1
		ORDER BY mp.computed_at DESC
		LIMIT 1
	`, matchID).Scan(
		&fixtureID, &kickoffUTC,
		&homeID, &homeName, &homeConf,
		&awayID, &awayName, &awayConf,
		&predID,
		&modelAsOf, &modelVersion,
		&homeWin, &draw, &awayWin,
		&homeXG, &awayXG,
		&over15, &over25, &over35, &btts,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query match prediction: %w", err)
	}

	// Fetch scoreline grid (0-7 goals per side).
	rows, err := s.pool.Query(ctx, `
		SELECT home_goals, away_goals, probability
		FROM scoreline_probabilities
		WHERE prediction_id = $1
		ORDER BY home_goals, away_goals
	`, predID)
	if err != nil {
		return nil, fmt.Errorf("query scoreline: %w", err)
	}
	defer rows.Close()

	var grid []models.ScorelineProbability
	for rows.Next() {
		var sp models.ScorelineProbability
		if err := rows.Scan(&sp.HomeGoals, &sp.AwayGoals, &sp.Probability); err != nil {
			return nil, fmt.Errorf("scan scoreline row: %w", err)
		}
		grid = append(grid, sp)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate scoreline: %w", err)
	}

	pred := &models.MatchPrediction{
		MatchID:      fixtureID,
		HomeTeam:     models.Team{ID: homeID, Name: homeName, Confederation: homeConf},
		AwayTeam:     models.Team{ID: awayID, Name: awayName, Confederation: awayConf},
		MatchDate:    kickoffUTC,
		ModelAsOf:    modelAsOf,
		ModelVersion: modelVersion,
		OutcomeProbabilities: models.OutcomeProbabilities{
			HomeWin: homeWin,
			Draw:    draw,
			AwayWin: awayWin,
		},
		ScorelineGrid: grid,
		Totals: models.TotalsProbabilities{
			Over15: deref(over15),
			Over25: deref(over25),
			Over35: deref(over35),
			BTTS:   deref(btts),
		},
	}
	if homeXG != nil && awayXG != nil {
		pred.ExpectedGoals = &models.ExpectedGoals{HomeXG: *homeXG, AwayXG: *awayXG}
	}
	return pred, nil
}

// GetLatestSimulation returns the most recent Monte Carlo simulation run.
// Returns ErrNotFound if no simulation has been run yet.
func (s *PostgresStore) GetLatestSimulation(ctx context.Context) (*models.TournamentSimulation, error) {
	// Step 1: find the latest run_at and its metadata.
	var runAt time.Time
	var nSims int
	err := s.pool.QueryRow(ctx, `
		SELECT run_at, n_simulations FROM simulation_results
		ORDER BY run_at DESC LIMIT 1
	`).Scan(&runAt, &nSims)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query latest simulation meta: %w", err)
	}

	// Step 2: get all stage probabilities for this run.
	// Simulator stage names: R32, R16, QF, SF, FINAL, CHAMPION.
	rows, err := s.pool.Query(ctx, `
		SELECT team_id, stage, probability
		FROM simulation_results
		WHERE run_at = $1
	`, runAt)
	if err != nil {
		return nil, fmt.Errorf("query simulation results: %w", err)
	}
	defer rows.Close()

	probs := make(map[string]map[string]float64)
	for rows.Next() {
		var teamID, stage string
		var prob float64
		if err := rows.Scan(&teamID, &stage, &prob); err != nil {
			return nil, fmt.Errorf("scan simulation row: %w", err)
		}
		if probs[teamID] == nil {
			probs[teamID] = make(map[string]float64)
		}
		probs[teamID][stage] = prob
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate simulation rows: %w", err)
	}

	// Step 3: get all team info with their group letter.
	teamRows, err := s.pool.Query(ctx, `
		SELECT
			t.id, t.name, t.confederation,
			(SELECT f.group_letter
			 FROM fixtures f
			 WHERE (f.home_team_id = t.id OR f.away_team_id = t.id)
			   AND f.tournament_id = 'WC2026' AND f.stage = 'group'
			 LIMIT 1) AS group_letter
		FROM teams t
		ORDER BY t.name
	`)
	if err != nil {
		return nil, fmt.Errorf("query teams: %w", err)
	}
	defer teamRows.Close()

	var teams []models.TeamSimulationResult
	for teamRows.Next() {
		var id, name, conf string
		var groupLetter *string
		if err := teamRows.Scan(&id, &name, &conf, &groupLetter); err != nil {
			return nil, fmt.Errorf("scan team row: %w", err)
		}
		p := probs[id] // empty map for teams not in simulation_results
		teams = append(teams, models.TeamSimulationResult{
			TeamID:   id,
			TeamName: name,
			Group:    groupLetter,
			StageProbabilities: models.StageProbabilities{
				RoundOf32:    p["R32"],
				RoundOf16:    p["R16"],
				QuarterFinal: p["QF"],
				SemiFinal:    p["SF"],
				Final:        p["FINAL"],
				Champion:     p["CHAMPION"],
			},
		})
	}
	if err := teamRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate team rows: %w", err)
	}

	// Step 4: latest confirmed WC2026 match result as the "as-of" marker.
	var matchResultsAsOf time.Time
	err = s.pool.QueryRow(ctx, `
		SELECT COALESCE(
			(SELECT MAX(mr.confirmed_at)
			 FROM match_results mr
			 JOIN fixtures f ON f.id = mr.fixture_id
			 WHERE f.tournament_id = 'WC2026'),
			$1
		)
	`, runAt).Scan(&matchResultsAsOf)
	if err != nil {
		matchResultsAsOf = runAt
	}

	return &models.TournamentSimulation{
		SimulationID:     runAt.UTC().Format(time.RFC3339),
		RunAt:            runAt,
		NSimulations:     nSims,
		MatchResultsAsOf: matchResultsAsOf,
		Teams:            teams,
	}, nil
}

// GetMarketComparison returns the model-vs-market comparison for one fixture.
// Returns ErrNotFound if the fixture has no prediction yet.
func (s *PostgresStore) GetMarketComparison(ctx context.Context, matchID string) (*models.MarketComparison, error) {
	// Need at least a model prediction to form a comparison.
	var modelAsOf time.Time
	var homeWin, draw, awayWin float64
	var modelVersion string
	err := s.pool.QueryRow(ctx, `
		SELECT mp.model_as_of, mp.home_win_prob, mp.draw_prob, mp.away_win_prob, mp.model_version
		FROM fixtures f
		JOIN match_predictions mp ON mp.fixture_id = f.id
		WHERE f.id = $1
		ORDER BY mp.computed_at DESC
		LIMIT 1
	`, matchID).Scan(&modelAsOf, &homeWin, &draw, &awayWin, &modelVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query model for comparison: %w", err)
	}

	// Latest snapshot per market source.
	msRows, err := s.pool.Query(ctx, `
		SELECT DISTINCT ON (source)
			source, sampled_at,
			home_win_raw, draw_raw, away_win_raw,
			home_win_dev, draw_dev, away_win_dev
		FROM market_snapshots
		WHERE fixture_id = $1
		ORDER BY source, sampled_at DESC
	`, matchID)
	if err != nil {
		return nil, fmt.Errorf("query market snapshots: %w", err)
	}
	defer msRows.Close()

	var markets []models.MarketSource
	for msRows.Next() {
		var src string
		var sampledAt time.Time
		var rawHome, rawAway float64
		var rawDraw *float64
		var devHome, devAway float64
		var devDraw *float64
		if err := msRows.Scan(&src, &sampledAt,
			&rawHome, &rawDraw, &rawAway,
			&devHome, &devDraw, &devAway,
		); err != nil {
			return nil, fmt.Errorf("scan market snapshot: %w", err)
		}
		markets = append(markets, models.MarketSource{
			Source:    src,
			SampledAt: sampledAt,
			Raw:       models.MarketRaw{HomeWin: rawHome, Draw: rawDraw, AwayWin: rawAway},
			Devigged: models.OutcomeProbabilities{
				HomeWin: devHome,
				Draw:    deref(devDraw),
				AwayWin: devAway,
			},
		})
	}
	if err := msRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate market rows: %w", err)
	}

	// Disagreement score: mean absolute difference between model and average market.
	var disagreement *float64
	if len(markets) > 0 {
		var avgHome, avgDraw, avgAway float64
		for _, m := range markets {
			avgHome += m.Devigged.HomeWin
			avgDraw += m.Devigged.Draw
			avgAway += m.Devigged.AwayWin
		}
		n := float64(len(markets))
		avgHome /= n
		avgDraw /= n
		avgAway /= n
		d := (fabs(homeWin-avgHome) + fabs(draw-avgDraw) + fabs(awayWin-avgAway)) / 3
		disagreement = &d
	}

	// Grading: present only after the match is confirmed and scored.
	var grading *models.MatchGrading
	var actualOutcome string
	var modelLogLoss, modelBrierScore float64
	var marketLogLossJSON, marketBrierJSON []byte
	var homeGoals, awayGoals *int
	err = s.pool.QueryRow(ctx, `
		SELECT mg.actual_outcome, mg.model_log_loss, mg.model_brier_score,
			mg.market_log_loss, mg.market_brier_score,
			mr.home_goals, mr.away_goals
		FROM match_grading mg
		LEFT JOIN match_results mr ON mr.fixture_id = mg.fixture_id
		WHERE mg.fixture_id = $1 AND mg.model_version = $2
	`, matchID, modelVersion).Scan(
		&actualOutcome, &modelLogLoss, &modelBrierScore,
		&marketLogLossJSON, &marketBrierJSON,
		&homeGoals, &awayGoals,
	)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("query grading: %w", err)
	}
	if err == nil {
		g := &models.MatchGrading{
			ActualOutcome:   actualOutcome,
			ModelLogLoss:    modelLogLoss,
			ModelBrierScore: modelBrierScore,
		}
		if homeGoals != nil && awayGoals != nil {
			g.ActualScore = &models.ActualScore{HomeGoals: *homeGoals, AwayGoals: *awayGoals}
		}
		if marketLogLossJSON != nil {
			_ = json.Unmarshal(marketLogLossJSON, &g.MarketLogLoss)
		}
		if marketBrierJSON != nil {
			_ = json.Unmarshal(marketBrierJSON, &g.MarketBrierScore)
		}
		grading = g
	}

	return &models.MarketComparison{
		MatchID:            matchID,
		ModelAsOf:          modelAsOf,
		ModelProbabilities: models.OutcomeProbabilities{HomeWin: homeWin, Draw: draw, AwayWin: awayWin},
		Markets:            markets,
		DisagreementScore:  disagreement,
		Grading:            grading,
	}, nil
}

func deref(f *float64) float64 {
	if f == nil {
		return 0
	}
	return *f
}

func fabs(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}
