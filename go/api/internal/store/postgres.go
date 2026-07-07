package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
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
// latest prediction, result, and key events (goals/red cards) attached where available.
func (s *PostgresStore) GetMatches(ctx context.Context) ([]models.MatchSummary, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			f.id, f.kickoff_utc, f.stage, f.group_letter,
			ht.id,  ht.name,  ht.confederation,
			awt.id, awt.name, awt.confederation,
			mr.home_goals, mr.away_goals,
			COALESCE(mr.went_to_et, false), COALESCE(mr.went_to_pens, false), mr.pen_winner_id,
			mp.home_win_prob, mp.draw_prob, mp.away_win_prob,
			ke.key_events
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
		LEFT JOIN LATERAL (
			SELECT json_agg(
				json_build_object(
					'minute', e.minute,
					'incident_type', e.incident_type,
					'is_home', e.is_home,
					'player_name', COALESCE(e.player_name, '')
				) ORDER BY e.minute
			) AS key_events
			FROM match_events e
			WHERE e.fixture_id = f.id
			  AND e.incident_type IN ('goal', 'own_goal', 'red_card', 'yellow_red_card')
		) ke ON true
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
			id, stage                  string
			kickoffUTC                 time.Time
			groupLetter                *string
			homeID, homeName, homeConf string
			awayID, awayName, awayConf string
			homeGoals, awayGoals       *int
			wentToET, wentToPens       bool
			penWinnerID                *string
			homeWin, draw, awayWin     *float64
			keyEventsJSON              []byte
		)
		if err := rows.Scan(
			&id, &kickoffUTC, &stage, &groupLetter,
			&homeID, &homeName, &homeConf,
			&awayID, &awayName, &awayConf,
			&homeGoals, &awayGoals,
			&wentToET, &wentToPens, &penWinnerID,
			&homeWin, &draw, &awayWin,
			&keyEventsJSON,
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
			m.Result = &models.MatchResultSummary{
				HomeGoals:   *homeGoals,
				AwayGoals:   *awayGoals,
				WentToET:    wentToET,
				WentToPens:  wentToPens,
				PenWinnerID: penWinnerID,
			}
		}
		if homeWin != nil && draw != nil && awayWin != nil {
			m.Prediction = &models.OutcomeProbabilities{
				HomeWin: *homeWin, Draw: *draw, AwayWin: *awayWin,
			}
		}
		if keyEventsJSON != nil {
			_ = json.Unmarshal(keyEventsJSON, &m.KeyEvents)
		}
		matches = append(matches, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate matches: %w", err)
	}
	return matches, nil
}

// GetMatchPrediction returns the latest prediction for the given fixture ID.
// Returns ErrNotFound only when the fixture itself does not exist.
// Fixtures without a prediction yet return zero outcome probabilities.
func (s *PostgresStore) GetMatchPrediction(ctx context.Context, matchID string) (*models.MatchPrediction, error) {
	var (
		fixtureID, homeID, homeName, homeConf string
		awayID, awayName, awayConf            string
		kickoffUTC                            time.Time
		modelAsOf                             *time.Time
		modelVersion                          *string
		predID                                *int64
		homeWin, draw, awayWin               *float64
		homeXG, awayXG                        *float64
		over15, over25, over35, btts          *float64
		homeElo, awayElo                      *float64
	)

	var (
		resultHomeGoals, resultAwayGoals *int
		resultWentToET, resultWentToPens bool
		resultPenWinnerID                *string
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
			mp.over_1_5, mp.over_2_5, mp.over_3_5, mp.btts,
			mr.home_goals, mr.away_goals,
			COALESCE(mr.went_to_et, false), COALESCE(mr.went_to_pens, false), mr.pen_winner_id,
			(SELECT rating FROM team_ratings
			 WHERE team_id = f.home_team_id AND rating_type = 'elo' AND as_of <= f.kickoff_utc
			 ORDER BY as_of DESC LIMIT 1) AS home_elo,
			(SELECT rating FROM team_ratings
			 WHERE team_id = f.away_team_id AND rating_type = 'elo' AND as_of <= f.kickoff_utc
			 ORDER BY as_of DESC LIMIT 1) AS away_elo
		FROM fixtures f
		JOIN teams ht  ON ht.id  = f.home_team_id
		JOIN teams awt ON awt.id = f.away_team_id
		LEFT JOIN LATERAL (
			SELECT id, model_as_of, model_version,
			       home_win_prob, draw_prob, away_win_prob,
			       home_xg, away_xg, over_1_5, over_2_5, over_3_5, btts
			FROM match_predictions
			WHERE fixture_id = f.id
			ORDER BY computed_at DESC LIMIT 1
		) mp ON true
		LEFT JOIN match_results mr ON mr.fixture_id = f.id
		WHERE f.id = $1
	`, matchID).Scan(
		&fixtureID, &kickoffUTC,
		&homeID, &homeName, &homeConf,
		&awayID, &awayName, &awayConf,
		&predID,
		&modelAsOf, &modelVersion,
		&homeWin, &draw, &awayWin,
		&homeXG, &awayXG,
		&over15, &over25, &over35, &btts,
		&resultHomeGoals, &resultAwayGoals,
		&resultWentToET, &resultWentToPens, &resultPenWinnerID,
		&homeElo, &awayElo,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query match prediction: %w", err)
	}

	// Fetch scoreline grid only when a prediction exists.
	var grid []models.ScorelineProbability
	if predID != nil {
		rows, err := s.pool.Query(ctx, `
			SELECT home_goals, away_goals, probability
			FROM scoreline_probabilities
			WHERE prediction_id = $1
			ORDER BY home_goals, away_goals
		`, *predID)
		if err != nil {
			return nil, fmt.Errorf("query scoreline: %w", err)
		}
		defer rows.Close()

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
	}

	// Resolve model version and as-of, using sentinels when no prediction exists yet.
	resolvedModelVersion := "pending"
	resolvedModelAsOf := time.Now()
	if predID != nil {
		if modelVersion != nil {
			resolvedModelVersion = *modelVersion
		}
		if modelAsOf != nil {
			resolvedModelAsOf = *modelAsOf
		}
	}

	pred := &models.MatchPrediction{
		MatchID:      fixtureID,
		HomeTeam:     models.Team{ID: homeID, Name: homeName, Confederation: homeConf},
		AwayTeam:     models.Team{ID: awayID, Name: awayName, Confederation: awayConf},
		MatchDate:    kickoffUTC,
		ModelAsOf:    resolvedModelAsOf,
		ModelVersion: resolvedModelVersion,
		OutcomeProbabilities: models.OutcomeProbabilities{
			HomeWin: deref(homeWin),
			Draw:    deref(draw),
			AwayWin: deref(awayWin),
		},
		ScorelineGrid: grid,
		Totals: models.TotalsProbabilities{
			Over15: deref(over15),
			Over25: deref(over25),
			Over35: deref(over35),
			BTTS:   deref(btts),
		},
		HomeElo: homeElo,
		AwayElo: awayElo,
	}
	if homeXG != nil && awayXG != nil {
		pred.ExpectedGoals = &models.ExpectedGoals{HomeXG: *homeXG, AwayXG: *awayXG}
	}
	if resultHomeGoals != nil && resultAwayGoals != nil {
		pred.ActualResult = &models.MatchResultSummary{
			HomeGoals:   *resultHomeGoals,
			AwayGoals:   *resultAwayGoals,
			WentToET:    resultWentToET,
			WentToPens:  resultWentToPens,
			PenWinnerID: resultPenWinnerID,
		}
	}

	// Fetch grading data if the match has been graded.
	var actualOutcome string
	var modelLL, modelBS float64
	var mktLLJSON, mktBSJSON []byte
	var gradedHomeGoals, gradedAwayGoals *int
	err = s.pool.QueryRow(ctx, `
		SELECT mg.actual_outcome, mg.model_log_loss, mg.model_brier_score,
		       mg.market_log_loss, mg.market_brier_score,
		       mr.home_goals, mr.away_goals
		FROM match_grading mg
		LEFT JOIN match_results mr ON mr.fixture_id = mg.fixture_id
		WHERE mg.fixture_id = $1 AND mg.model_version = $2
	`, matchID, resolvedModelVersion).Scan(
		&actualOutcome, &modelLL, &modelBS,
		&mktLLJSON, &mktBSJSON,
		&gradedHomeGoals, &gradedAwayGoals,
	)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("query grading: %w", err)
	}
	if err == nil {
		g := &models.MatchGrading{
			ActualOutcome:   actualOutcome,
			ModelLogLoss:    modelLL,
			ModelBrierScore: modelBS,
		}
		if gradedHomeGoals != nil && gradedAwayGoals != nil {
			g.ActualScore = &models.ActualScore{HomeGoals: *gradedHomeGoals, AwayGoals: *gradedAwayGoals}
		}
		if mktLLJSON != nil {
			_ = json.Unmarshal(mktLLJSON, &g.MarketLogLoss)
		}
		if mktBSJSON != nil {
			_ = json.Unmarshal(mktBSJSON, &g.MarketBrierScore)
		}
		pred.Grading = g
	}

	return pred, nil
}

// GetLatestSimulation returns the most recent Monte Carlo simulation run,
// with per-team deltas computed against the previous run.
// Returns ErrNotFound if no simulation has been run yet.
func (s *PostgresStore) GetLatestSimulation(ctx context.Context) (*models.TournamentSimulation, error) {
	// Step 1: find the two most recent distinct run_at timestamps.
	tsRows, err := s.pool.Query(ctx, `
		SELECT DISTINCT run_at FROM simulation_results ORDER BY run_at DESC LIMIT 2
	`)
	if err != nil {
		return nil, fmt.Errorf("query simulation timestamps: %w", err)
	}
	var runTimes []time.Time
	for tsRows.Next() {
		var t time.Time
		if err := tsRows.Scan(&t); err != nil {
			tsRows.Close()
			return nil, fmt.Errorf("scan run_at: %w", err)
		}
		runTimes = append(runTimes, t)
	}
	tsRows.Close()
	if err := tsRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate timestamps: %w", err)
	}
	if len(runTimes) == 0 {
		return nil, ErrNotFound
	}
	latestRunAt := runTimes[0]

	// Step 2: n_simulations for the latest run.
	var nSims int
	err = s.pool.QueryRow(ctx, `
		SELECT n_simulations FROM simulation_results WHERE run_at = $1 LIMIT 1
	`, latestRunAt).Scan(&nSims)
	if err != nil {
		return nil, fmt.Errorf("query n_simulations: %w", err)
	}

	// helper: load all team/stage probabilities for a given run_at.
	loadProbs := func(runAt time.Time) (map[string]map[string]float64, error) {
		r, err := s.pool.Query(ctx, `
			SELECT team_id, stage, probability FROM simulation_results WHERE run_at = $1
		`, runAt)
		if err != nil {
			return nil, fmt.Errorf("query sim probs: %w", err)
		}
		defer r.Close()
		m := make(map[string]map[string]float64)
		for r.Next() {
			var teamID, stage string
			var prob float64
			if err := r.Scan(&teamID, &stage, &prob); err != nil {
				return nil, fmt.Errorf("scan sim prob: %w", err)
			}
			if m[teamID] == nil {
				m[teamID] = make(map[string]float64)
			}
			m[teamID][stage] = prob
		}
		return m, r.Err()
	}

	// Step 3: load latest and (optionally) previous run probabilities.
	latestProbs, err := loadProbs(latestRunAt)
	if err != nil {
		return nil, err
	}
	var prevProbs map[string]map[string]float64
	var previousRunAt *time.Time
	if len(runTimes) > 1 {
		t := runTimes[1]
		previousRunAt = &t
		prevProbs, err = loadProbs(t)
		if err != nil {
			return nil, err
		}
	}

	// Step 4: load all team info with their group letter.
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
		p := latestProbs[id]
		sp := models.StageProbabilities{
			RoundOf32:    p["R32"],
			RoundOf16:    p["R16"],
			QuarterFinal: p["QF"],
			SemiFinal:    p["SF"],
			Final:        p["FINAL"],
			Champion:     p["CHAMPION"],
		}
		var delta *models.StageProbabilities
		if prevProbs != nil {
			prev := prevProbs[id]
			delta = &models.StageProbabilities{
				RoundOf32:    p["R32"] - prev["R32"],
				RoundOf16:    p["R16"] - prev["R16"],
				QuarterFinal: p["QF"] - prev["QF"],
				SemiFinal:    p["SF"] - prev["SF"],
				Final:        p["FINAL"] - prev["FINAL"],
				Champion:     p["CHAMPION"] - prev["CHAMPION"],
			}
		}
		teams = append(teams, models.TeamSimulationResult{
			TeamID:             id,
			TeamName:           name,
			Group:              groupLetter,
			StageProbabilities: sp,
			Delta:              delta,
		})
	}
	if err := teamRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate team rows: %w", err)
	}

	// Step 5: latest confirmed WC2026 result as the "as-of" marker.
	var matchResultsAsOf time.Time
	err = s.pool.QueryRow(ctx, `
		SELECT COALESCE(
			(SELECT MAX(mr.confirmed_at)
			 FROM match_results mr
			 JOIN fixtures f ON f.id = mr.fixture_id
			 WHERE f.tournament_id = 'WC2026'),
			$1
		)
	`, latestRunAt).Scan(&matchResultsAsOf)
	if err != nil {
		matchResultsAsOf = latestRunAt
	}

	return &models.TournamentSimulation{
		SimulationID:     latestRunAt.UTC().Format(time.RFC3339),
		RunAt:            latestRunAt,
		PreviousRunAt:    previousRunAt,
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

// GetCalibration returns aggregate scoring metrics and per-match grading rows
// for all completed WC 2026 matches. The response distinguishes out-of-sample
// (is_retroactive=false) from retroactive (in-sample) predictions so the
// headline calibration numbers are not inflated by in-sample rows.
func (s *PostgresStore) GetCalibration(ctx context.Context) (*models.CalibrationSummary, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			mg.fixture_id,
			f.kickoff_utc,
			ht.id,  ht.name,  ht.confederation,
			awt.id, awt.name, awt.confederation,
			mg.actual_outcome,
			mp.home_win_prob, mp.draw_prob, mp.away_win_prob,
			mg.model_log_loss,
			mg.model_brier_score,
			mg.market_log_loss,
			mg.market_brier_score,
			mp.is_retroactive
		FROM match_grading mg
		JOIN fixtures f         ON f.id  = mg.fixture_id
		JOIN teams ht           ON ht.id = f.home_team_id
		JOIN teams awt          ON awt.id = f.away_team_id
		JOIN match_predictions mp
			ON mp.fixture_id    = mg.fixture_id
			AND mp.model_version = mg.model_version
		WHERE f.tournament_id = 'WC2026'
		ORDER BY f.kickoff_utc ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("query calibration: %w", err)
	}
	defer rows.Close()

	var (
		matches              []models.GradedMatch
		totalLL, totalBS     float64
		oosLL, oosBS         float64
		oosCount             int
		marketLL             = make(map[string]float64)
		marketBS             = make(map[string]float64)
		marketCounts         = make(map[string]int)
	)

	for rows.Next() {
		var (
			matchID, actualOutcome      string
			kickoffUTC                  time.Time
			homeID, homeName, homeConf  string
			awayID, awayName, awayConf  string
			homeWin, draw, awayWin      float64
			modelLL, modelBS            float64
			mktLLJSON, mktBSJSON        []byte
			isRetroactive               bool
		)
		if err := rows.Scan(
			&matchID, &kickoffUTC,
			&homeID, &homeName, &homeConf,
			&awayID, &awayName, &awayConf,
			&actualOutcome,
			&homeWin, &draw, &awayWin,
			&modelLL, &modelBS,
			&mktLLJSON, &mktBSJSON,
			&isRetroactive,
		); err != nil {
			return nil, fmt.Errorf("scan calibration row: %w", err)
		}

		totalLL += modelLL
		totalBS += modelBS
		if !isRetroactive {
			oosLL += modelLL
			oosBS += modelBS
			oosCount++
		}

		mLL := make(map[string]float64)
		mBS := make(map[string]float64)
		if mktLLJSON != nil {
			_ = json.Unmarshal(mktLLJSON, &mLL)
		}
		if mktBSJSON != nil {
			_ = json.Unmarshal(mktBSJSON, &mBS)
		}
		for src, v := range mLL {
			marketLL[src] += v
			marketCounts[src]++
		}
		for src, v := range mBS {
			marketBS[src] += v
		}

		gm := models.GradedMatch{
			MatchID:    matchID,
			KickoffUTC: kickoffUTC,
			HomeTeam:   models.Team{ID: homeID, Name: homeName, Confederation: homeConf},
			AwayTeam:   models.Team{ID: awayID, Name: awayName, Confederation: awayConf},
			ActualOutcome: actualOutcome,
			ModelProbabilities: models.OutcomeProbabilities{
				HomeWin: homeWin, Draw: draw, AwayWin: awayWin,
			},
			ModelLogLoss:    modelLL,
			ModelBrierScore: modelBS,
			IsRetroactive:   isRetroactive,
		}
		if len(mLL) > 0 {
			gm.MarketLogLoss = mLL
		}
		if len(mBS) > 0 {
			gm.MarketBrierScore = mBS
		}
		matches = append(matches, gm)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate calibration rows: %w", err)
	}

	n := len(matches)
	summary := &models.CalibrationSummary{
		TotalMatches:       n,
		OutOfSampleMatches: oosCount,
		Matches:            matches,
	}
	if n > 0 {
		summary.ModelMeanLogLoss = totalLL / float64(n)
		summary.ModelMeanBrier   = totalBS / float64(n)
	}
	if oosCount > 0 {
		summary.OOSMeanLogLoss = oosLL / float64(oosCount)
		summary.OOSMeanBrier   = oosBS / float64(oosCount)
	}
	if len(marketLL) > 0 {
		summary.MarketMeanLogLoss = make(map[string]float64)
		summary.MarketMeanBrier   = make(map[string]float64)
		for src, v := range marketLL {
			cnt := float64(marketCounts[src])
			summary.MarketMeanLogLoss[src] = v / cnt
			summary.MarketMeanBrier[src]   = marketBS[src] / cnt
		}
	}
	return summary, nil
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

// GetMatchTrivia returns the pre-generated trivia facts for a fixture.
// Returns ErrNotFound when no trivia row exists yet.
func (s *PostgresStore) GetMatchTrivia(ctx context.Context, matchID string) (*models.MatchTrivia, error) {
	var generatedAt time.Time
	var factsJSON []byte

	err := s.pool.QueryRow(ctx, `
		SELECT generated_at, facts
		FROM match_trivia
		WHERE fixture_id = $1
	`, matchID).Scan(&generatedAt, &factsJSON)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query match_trivia: %w", err)
	}

	var facts []models.TriviaFact
	if err := json.Unmarshal(factsJSON, &facts); err != nil {
		return nil, fmt.Errorf("parse trivia facts: %w", err)
	}

	return &models.MatchTrivia{
		MatchID:     matchID,
		GeneratedAt: generatedAt,
		Facts:       facts,
	}, nil
}

// GetMatchPreview returns the LLM-generated preview for a fixture.
// Returns ErrNotFound when no preview has been generated yet.
func (s *PostgresStore) GetMatchPreview(ctx context.Context, matchID string) (*models.MatchPreview, error) {
	var previewText, modelUsed string
	var generatedAt time.Time

	err := s.pool.QueryRow(ctx, `
		SELECT preview_text, model_used, generated_at
		FROM match_previews
		WHERE fixture_id = $1
	`, matchID).Scan(&previewText, &modelUsed, &generatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query match_previews: %w", err)
	}

	return &models.MatchPreview{
		MatchID:     matchID,
		PreviewText: previewText,
		ModelUsed:   modelUsed,
		GeneratedAt: generatedAt,
	}, nil
}

// GetLeaderboard returns leaderboard entries ranked by average log loss (ascending).
// Only users who have at least one graded prediction appear.
func (s *PostgresStore) GetLeaderboard(ctx context.Context) ([]models.LeaderboardEntry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			lbu.user_id,
			lbu.display_name,
			COUNT(*) AS predictions,
			AVG(up.log_loss) AS avg_log_loss,
			AVG(up.brier_score) AS avg_brier
		FROM user_predictions up
		JOIN leaderboard_users lbu ON lbu.user_id = up.user_id
		WHERE up.log_loss IS NOT NULL
		GROUP BY lbu.user_id, lbu.display_name
		ORDER BY avg_log_loss ASC, avg_brier ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("query leaderboard: %w", err)
	}
	defer rows.Close()

	var entries []models.LeaderboardEntry
	rank := 1
	for rows.Next() {
		var e models.LeaderboardEntry
		if err := rows.Scan(&e.UserID, &e.DisplayName, &e.Predictions, &e.AvgLogLoss, &e.AvgBrier); err != nil {
			return nil, fmt.Errorf("scan leaderboard row: %w", err)
		}
		e.Rank = rank
		rank++
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate leaderboard rows: %w", err)
	}
	if entries == nil {
		entries = []models.LeaderboardEntry{}
	}
	return entries, nil
}

// CreateUserPrediction inserts a user prediction and upserts the leaderboard_users row.
// Returns ErrNotFound if the fixture does not exist or has already kicked off.
func (s *PostgresStore) CreateUserPrediction(
	ctx context.Context,
	matchID string,
	req models.UserPredictionRequest,
) (*models.UserPredictionResponse, error) {
	// Fetch kickoff_utc and verify the fixture exists and hasn't kicked off.
	var kickoffUTC time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT kickoff_utc FROM fixtures WHERE id = $1 AND tournament_id = 'WC2026'
	`, matchID).Scan(&kickoffUTC)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("lookup fixture: %w", err)
	}

	// Upsert user into leaderboard_users.
	_, err = s.pool.Exec(ctx, `
		INSERT INTO leaderboard_users (user_id, display_name)
		VALUES ($1, $1)
		ON CONFLICT (user_id) DO NOTHING
	`, req.UserID)
	if err != nil {
		return nil, fmt.Errorf("upsert leaderboard_users: %w", err)
	}

	// Insert the prediction.
	var id int64
	var submittedAt time.Time
	err = s.pool.QueryRow(ctx, `
		INSERT INTO user_predictions
			(user_id, fixture_id, kickoff_utc, home_win_prob, draw_prob, away_win_prob)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (user_id, fixture_id) DO UPDATE
			SET home_win_prob = EXCLUDED.home_win_prob,
			    draw_prob     = EXCLUDED.draw_prob,
			    away_win_prob = EXCLUDED.away_win_prob,
			    submitted_at  = NOW()
		RETURNING id, submitted_at
	`, req.UserID, matchID, kickoffUTC,
		req.HomeWinProb, req.DrawProb, req.AwayWinProb,
	).Scan(&id, &submittedAt)
	if err != nil {
		return nil, fmt.Errorf("insert user_prediction: %w", err)
	}

	return &models.UserPredictionResponse{
		ID:          id,
		UserID:      req.UserID,
		FixtureID:   matchID,
		HomeWinProb: req.HomeWinProb,
		DrawProb:    req.DrawProb,
		AwayWinProb: req.AwayWinProb,
		SubmittedAt: submittedAt,
	}, nil
}

// GetDisagreements returns upcoming WC 2026 fixtures that have both a model prediction
// and at least one market snapshot, sorted by model-vs-market disagreement score
// (mean absolute difference across all three outcomes). limit=0 returns all.
func (s *PostgresStore) GetDisagreements(ctx context.Context, limit int) ([]models.DisagreementEntry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			f.id, f.kickoff_utc, f.stage,
			ht.id,  ht.name,  ht.confederation,
			awt.id, awt.name, awt.confederation,
			mp.home_win_prob, mp.draw_prob, mp.away_win_prob,
			ms.source, ms.home_win_dev, ms.draw_dev, ms.away_win_dev
		FROM fixtures f
		JOIN teams ht  ON ht.id  = f.home_team_id
		JOIN teams awt ON awt.id = f.away_team_id
		JOIN LATERAL (
			SELECT home_win_prob, draw_prob, away_win_prob
			FROM match_predictions
			WHERE fixture_id = f.id
			ORDER BY computed_at DESC LIMIT 1
		) mp ON true
		JOIN LATERAL (
			SELECT source, home_win_dev, draw_dev, away_win_dev
			FROM market_snapshots
			WHERE fixture_id = f.id
			ORDER BY sampled_at DESC LIMIT 1
		) ms ON true
		LEFT JOIN match_results mr ON mr.fixture_id = f.id
		WHERE f.tournament_id = 'WC2026'
		  AND mr.fixture_id IS NULL
	`)
	if err != nil {
		return nil, fmt.Errorf("query disagreements: %w", err)
	}
	defer rows.Close()

	var entries []models.DisagreementEntry
	for rows.Next() {
		var (
			id, stage                   string
			kickoff                     time.Time
			homeID, homeName, homeConf  string
			awayID, awayName, awayConf  string
			mHome, mDraw, mAway         float64
			mktSource                   string
			mktHome, mktAway            float64
			mktDraw                     *float64
		)
		if err := rows.Scan(
			&id, &kickoff, &stage,
			&homeID, &homeName, &homeConf,
			&awayID, &awayName, &awayConf,
			&mHome, &mDraw, &mAway,
			&mktSource, &mktHome, &mktDraw, &mktAway,
		); err != nil {
			return nil, fmt.Errorf("scan disagreement row: %w", err)
		}

		// For binary markets (no draw leg), use the model's draw prob so that
		// home/away disagreement is measured without distorting the draw delta.
		mktDrawVal := mDraw
		if mktDraw != nil {
			mktDrawVal = *mktDraw
		}

		dHome := mHome - mktHome
		dDraw := mDraw - mktDrawVal
		dAway := mAway - mktAway
		score := (fabs(dHome) + fabs(dDraw) + fabs(dAway)) / 3.0

		// ModelFavors: which outcome does the model rate most above the market?
		modelFavors := "home"
		if dDraw > dHome && dDraw > dAway {
			modelFavors = "draw"
		} else if dAway > dHome {
			modelFavors = "away"
		}

		entries = append(entries, models.DisagreementEntry{
			MatchID:    id,
			KickoffUTC: kickoff,
			Stage:      stage,
			HomeTeam:   models.Team{ID: homeID, Name: homeName, Confederation: homeConf},
			AwayTeam:   models.Team{ID: awayID, Name: awayName, Confederation: awayConf},
			ModelProbabilities:  models.OutcomeProbabilities{HomeWin: mHome, Draw: mDraw, AwayWin: mAway},
			MarketProbabilities: models.OutcomeProbabilities{HomeWin: mktHome, Draw: mktDrawVal, AwayWin: mktAway},
			MarketSource:        mktSource,
			DisagreementScore:   score,
			ModelFavors:         modelFavors,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate disagreement rows: %w", err)
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].DisagreementScore > entries[j].DisagreementScore
	})
	if limit > 0 && len(entries) > limit {
		entries = entries[:limit]
	}
	if entries == nil {
		entries = []models.DisagreementEntry{}
	}
	return entries, nil
}

// GetMatchScorerPredictions returns player anytime-scorer predictions for one fixture,
// grouped by home and away team. Returns ErrNotFound if the fixture doesn't exist
// or has no player predictions yet.
func (s *PostgresStore) GetMatchScorerPredictions(ctx context.Context, matchID string) (*models.MatchScorerPredictions, error) {
	// Verify fixture exists and get team info.
	var homeID, homeName, awayID, awayName string
	err := s.pool.QueryRow(ctx, `
		SELECT ht.id, ht.name, awt.id, awt.name
		FROM fixtures f
		JOIN teams ht  ON ht.id  = f.home_team_id
		JOIN teams awt ON awt.id = f.away_team_id
		WHERE f.id = $1
	`, matchID).Scan(&homeID, &homeName, &awayID, &awayName)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query fixture teams: %w", err)
	}

	// Fetch all player predictions for this fixture, ordered by team then prob.
	rows, err := s.pool.Query(ctx, `
		SELECT player_name, team_id, anytime_scorer_prob, tournament_goals, computed_at
		FROM player_goal_predictions
		WHERE fixture_id = $1
		ORDER BY team_id, anytime_scorer_prob DESC
	`, matchID)
	if err != nil {
		return nil, fmt.Errorf("query player predictions: %w", err)
	}
	defer rows.Close()

	homePlayers := []models.PlayerScorerPrediction{}
	awayPlayers := []models.PlayerScorerPrediction{}
	var latestComputedAt time.Time

	for rows.Next() {
		var playerName, teamID string
		var prob float64
		var goals int
		var computedAt time.Time
		if err := rows.Scan(&playerName, &teamID, &prob, &goals, &computedAt); err != nil {
			return nil, fmt.Errorf("scan player prediction row: %w", err)
		}
		if computedAt.After(latestComputedAt) {
			latestComputedAt = computedAt
		}
		p := models.PlayerScorerPrediction{
			PlayerName:        playerName,
			AnyTimeScorerProb: prob,
			TournamentGoals:   goals,
		}
		if teamID == homeID {
			homePlayers = append(homePlayers, p)
		} else if teamID == awayID {
			awayPlayers = append(awayPlayers, p)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate player predictions: %w", err)
	}

	if len(homePlayers) == 0 && len(awayPlayers) == 0 {
		return nil, ErrNotFound
	}

	return &models.MatchScorerPredictions{
		MatchID:    matchID,
		ComputedAt: latestComputedAt,
		HomeTeam: models.TeamScorerPredictions{
			TeamID:   homeID,
			TeamName: homeName,
			Players:  homePlayers,
		},
		AwayTeam: models.TeamScorerPredictions{
			TeamID:   awayID,
			TeamName: awayName,
			Players:  awayPlayers,
		},
	}, nil
}

// GetTeamEloRatings returns the latest Elo rating for every WC 2026 team,
// sorted by rating descending.
func (s *PostgresStore) GetTeamEloRatings(ctx context.Context) ([]models.TeamRating, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT ON (tr.team_id)
			tr.team_id, t.name, t.confederation, tr.rating, tr.as_of
		FROM team_ratings tr
		JOIN teams t ON t.id = tr.team_id
		WHERE tr.rating_type = 'elo'
		ORDER BY tr.team_id, tr.as_of DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("query team elo ratings: %w", err)
	}
	defer rows.Close()

	var ratings []models.TeamRating
	for rows.Next() {
		var r models.TeamRating
		if err := rows.Scan(&r.TeamID, &r.TeamName, &r.Confederation, &r.Rating, &r.AsOf); err != nil {
			return nil, fmt.Errorf("scan team rating: %w", err)
		}
		ratings = append(ratings, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate team ratings: %w", err)
	}

	sort.Slice(ratings, func(i, j int) bool {
		return ratings[i].Rating > ratings[j].Rating
	})
	if ratings == nil {
		ratings = []models.TeamRating{}
	}
	return ratings, nil
}

// GetUserStats returns pick stats for a single user across the whole tournament.
// "Correct" means the user's highest-probability outcome matched the actual outcome.
func (s *PostgresStore) GetUserStats(ctx context.Context, userID string) (*models.UserStats, error) {
	var stats models.UserStats
	var avgLL *float64
	err := s.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) AS total_picks,
			COUNT(mg.actual_outcome) AS graded,
			COUNT(*) FILTER (WHERE
				mg.actual_outcome IS NOT NULL AND (
					(up.home_win_prob >= up.draw_prob AND up.home_win_prob >= up.away_win_prob AND mg.actual_outcome = 'home_win') OR
					(up.draw_prob > up.home_win_prob AND up.draw_prob > up.away_win_prob AND mg.actual_outcome = 'draw') OR
					(up.away_win_prob > up.home_win_prob AND up.away_win_prob > up.draw_prob AND mg.actual_outcome = 'away_win')
				)
			) AS correct,
			AVG(up.log_loss) FILTER (WHERE up.log_loss IS NOT NULL) AS avg_log_loss
		FROM user_predictions up
		LEFT JOIN match_grading mg ON mg.fixture_id = up.fixture_id
		WHERE up.user_id = $1
	`, userID).Scan(&stats.TotalPicks, &stats.Graded, &stats.Correct, &avgLL)
	if err != nil {
		return nil, fmt.Errorf("query user stats: %w", err)
	}
	stats.AvgLogLoss = avgLL
	return &stats, nil
}

// GetGroupStandings computes WC 2026 group stage standings from match results.
func (s *PostgresStore) GetGroupStandings(ctx context.Context) ([]models.GroupTable, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			f.group_letter,
			ht.id, ht.name,
			awt.id, awt.name,
			mr.home_goals, mr.away_goals
		FROM fixtures f
		JOIN teams ht  ON ht.id  = f.home_team_id
		JOIN teams awt ON awt.id = f.away_team_id
		LEFT JOIN match_results mr ON mr.fixture_id = f.id
		WHERE f.tournament_id = 'WC2026' AND f.stage = 'group'
		ORDER BY f.group_letter, f.kickoff_utc
	`)
	if err != nil {
		return nil, fmt.Errorf("query group matches: %w", err)
	}
	defer rows.Close()

	// standings[group][teamID] -> *GroupStanding
	type entry struct {
		id   string
		name string
	}
	standingsMap := map[string]map[string]*models.GroupStanding{}
	teamOrder := map[string][]entry{} // to preserve consistent team order per group

	for rows.Next() {
		var groupLetter *string
		var homeID, homeName, awayID, awayName string
		var homeGoals, awayGoals *int
		if err := rows.Scan(&groupLetter, &homeID, &homeName, &awayID, &awayName, &homeGoals, &awayGoals); err != nil {
			return nil, fmt.Errorf("scan group row: %w", err)
		}
		if groupLetter == nil {
			continue
		}
		grp := *groupLetter

		if standingsMap[grp] == nil {
			standingsMap[grp] = map[string]*models.GroupStanding{}
		}
		if standingsMap[grp][homeID] == nil {
			standingsMap[grp][homeID] = &models.GroupStanding{TeamID: homeID, TeamName: homeName}
			teamOrder[grp] = append(teamOrder[grp], entry{homeID, homeName})
		}
		if standingsMap[grp][awayID] == nil {
			standingsMap[grp][awayID] = &models.GroupStanding{TeamID: awayID, TeamName: awayName}
			teamOrder[grp] = append(teamOrder[grp], entry{awayID, awayName})
		}

		if homeGoals == nil || awayGoals == nil {
			continue // match not yet played
		}
		hg, ag := *homeGoals, *awayGoals

		home := standingsMap[grp][homeID]
		away := standingsMap[grp][awayID]
		home.Played++
		away.Played++
		home.GF += hg
		home.GA += ag
		away.GF += ag
		away.GA += hg
		home.GD = home.GF - home.GA
		away.GD = away.GF - away.GA

		switch {
		case hg > ag:
			home.Won++
			home.Points += 3
			away.Lost++
		case hg == ag:
			home.Drawn++
			home.Points++
			away.Drawn++
			away.Points++
		default:
			away.Won++
			away.Points += 3
			home.Lost++
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate group rows: %w", err)
	}

	// Build sorted groups.
	var letters []string
	for k := range standingsMap {
		letters = append(letters, k)
	}
	sort.Strings(letters)

	tables := make([]models.GroupTable, 0, len(letters))
	for _, grp := range letters {
		teamMap := standingsMap[grp]
		teams := teamOrder[grp]
		standings := make([]models.GroupStanding, 0, len(teams))
		for _, t := range teams {
			if s, ok := teamMap[t.id]; ok {
				standings = append(standings, *s)
			}
		}
		sort.Slice(standings, func(i, j int) bool {
			if standings[i].Points != standings[j].Points {
				return standings[i].Points > standings[j].Points
			}
			if standings[i].GD != standings[j].GD {
				return standings[i].GD > standings[j].GD
			}
			return standings[i].GF > standings[j].GF
		})
		tables = append(tables, models.GroupTable{Letter: grp, Standings: standings})
	}
	return tables, nil
}

// GetTopScorers returns tournament goal leaders for WC 2026.
func (s *PostgresStore) GetTopScorers(ctx context.Context, limit int) ([]models.TopScorer, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.pool.Query(ctx, `
		SELECT pts.player_name, pts.team_id, t.name, pts.goals, pts.assists,
		       COALESCE(pts.appearances, 0), COALESCE(pts.penalties, 0)
		FROM player_tournament_stats pts
		JOIN teams t ON t.id = pts.team_id
		WHERE pts.tournament_id = 'WC2026' AND pts.goals > 0
		ORDER BY pts.goals DESC, pts.assists DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("query top scorers: %w", err)
	}
	defer rows.Close()

	var scorers []models.TopScorer
	for rows.Next() {
		var sc models.TopScorer
		if err := rows.Scan(&sc.PlayerName, &sc.TeamID, &sc.TeamName, &sc.Goals, &sc.Assists,
			&sc.Appearances, &sc.Penalties); err != nil {
			return nil, fmt.Errorf("scan scorer: %w", err)
		}
		scorers = append(scorers, sc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate scorers: %w", err)
	}
	if scorers == nil {
		scorers = []models.TopScorer{}
	}
	return scorers, nil
}

// GetTeams returns all WC 2026 teams with latest Elo rating and group letter.
func (s *PostgresStore) GetTeams(ctx context.Context) ([]models.TeamListItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT t.id, t.name, t.short_name, t.confederation,
		       tr.rating,
		       f.group_letter
		FROM teams t
		LEFT JOIN LATERAL (
		    SELECT rating FROM team_ratings
		    WHERE team_id = t.id AND rating_type = 'elo'
		    ORDER BY as_of DESC LIMIT 1
		) tr ON true
		LEFT JOIN LATERAL (
		    SELECT group_letter
		    FROM fixtures
		    WHERE (home_team_id = t.id OR away_team_id = t.id)
		    AND tournament_id = 'WC2026' AND stage = 'group'
		    LIMIT 1
		) f ON true
		ORDER BY t.confederation, t.name
	`)
	if err != nil {
		return nil, fmt.Errorf("query teams: %w", err)
	}
	defer rows.Close()

	var teams []models.TeamListItem
	for rows.Next() {
		var item models.TeamListItem
		if err := rows.Scan(&item.ID, &item.Name, &item.ShortName, &item.Confederation,
			&item.EloRating, &item.Group); err != nil {
			return nil, fmt.Errorf("scan team row: %w", err)
		}
		teams = append(teams, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate teams: %w", err)
	}
	if teams == nil {
		teams = []models.TeamListItem{}
	}
	return teams, nil
}

// GetTeamDetail returns full team info, fixtures, and player stats.
func (s *PostgresStore) GetTeamDetail(ctx context.Context, teamID string) (*models.TeamDetail, error) {
	// 1. Team basic info + Elo + group.
	var detail models.TeamDetail
	var groupLetter *string
	err := s.pool.QueryRow(ctx, `
		SELECT t.id, t.name, t.short_name, t.confederation,
		       tr.rating,
		       f.group_letter
		FROM teams t
		LEFT JOIN LATERAL (
		    SELECT rating FROM team_ratings
		    WHERE team_id = t.id AND rating_type = 'elo'
		    ORDER BY as_of DESC LIMIT 1
		) tr ON true
		LEFT JOIN LATERAL (
		    SELECT group_letter
		    FROM fixtures
		    WHERE (home_team_id = t.id OR away_team_id = t.id)
		    AND tournament_id = 'WC2026' AND stage = 'group'
		    LIMIT 1
		) f ON true
		WHERE t.id = $1
	`, teamID).Scan(&detail.ID, &detail.Name, &detail.ShortName, &detail.Confederation,
		&detail.EloRating, &groupLetter)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query team detail: %w", err)
	}
	detail.Group = groupLetter

	// 2. WC 2026 fixtures for this team.
	fixtureRows, err := s.pool.Query(ctx, `
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
		  AND (f.home_team_id = $1 OR f.away_team_id = $1)
		ORDER BY f.kickoff_utc ASC
	`, teamID)
	if err != nil {
		return nil, fmt.Errorf("query team fixtures: %w", err)
	}
	defer fixtureRows.Close()

	for fixtureRows.Next() {
		var (
			id, stage                  string
			kickoffUTC                 time.Time
			gl                         *string
			homeID, homeName, homeConf string
			awayID, awayName, awayConf string
			homeGoals, awayGoals       *int
			homeWin, draw, awayWin     *float64
		)
		if err := fixtureRows.Scan(
			&id, &kickoffUTC, &stage, &gl,
			&homeID, &homeName, &homeConf,
			&awayID, &awayName, &awayConf,
			&homeGoals, &awayGoals,
			&homeWin, &draw, &awayWin,
		); err != nil {
			return nil, fmt.Errorf("scan team fixture: %w", err)
		}
		m := models.MatchSummary{
			ID: id, KickoffUTC: kickoffUTC, Stage: stage, GroupLetter: gl,
			HomeTeam: models.Team{ID: homeID, Name: homeName, Confederation: homeConf},
			AwayTeam: models.Team{ID: awayID, Name: awayName, Confederation: awayConf},
		}
		if homeGoals != nil && awayGoals != nil {
			m.Result = &models.MatchResultSummary{HomeGoals: *homeGoals, AwayGoals: *awayGoals}
			// Tally W/D/L for the team record.
			isHome := homeID == teamID
			hg, ag := *homeGoals, *awayGoals
			detail.Record.Played++
			if isHome {
				detail.Record.GF += hg
				detail.Record.GA += ag
			} else {
				detail.Record.GF += ag
				detail.Record.GA += hg
			}
			detail.Record.GD = detail.Record.GF - detail.Record.GA
			if (isHome && hg > ag) || (!isHome && ag > hg) {
				detail.Record.Won++
				detail.Record.Points += 3
			} else if hg == ag {
				detail.Record.Drawn++
				detail.Record.Points++
			} else {
				detail.Record.Lost++
			}
		}
		if homeWin != nil && draw != nil && awayWin != nil {
			m.Prediction = &models.OutcomeProbabilities{HomeWin: *homeWin, Draw: *draw, AwayWin: *awayWin}
		}
		detail.Fixtures = append(detail.Fixtures, m)
	}
	if err := fixtureRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate team fixtures: %w", err)
	}

	// 3. Player stats.
	playerRows, err := s.pool.Query(ctx, `
		SELECT player_name, goals, assists,
		       COALESCE(appearances, 0), COALESCE(penalties, 0),
		       COALESCE(yellow_cards, 0), COALESCE(red_cards, 0)
		FROM player_tournament_stats
		WHERE tournament_id = 'WC2026' AND team_id = $1
		ORDER BY goals DESC, assists DESC, player_name
	`, teamID)
	if err != nil {
		return nil, fmt.Errorf("query team players: %w", err)
	}
	defer playerRows.Close()

	for playerRows.Next() {
		var p models.PlayerStat
		if err := playerRows.Scan(&p.PlayerName, &p.Goals, &p.Assists,
			&p.Appearances, &p.Penalties, &p.YellowCards, &p.RedCards); err != nil {
			return nil, fmt.Errorf("scan player stat: %w", err)
		}
		detail.Players = append(detail.Players, p)
	}
	if err := playerRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate team players: %w", err)
	}

	return &detail, nil
}

// GetMatchEvents returns all in-match incidents for one fixture, ordered by minute.
func (s *PostgresStore) GetMatchEvents(ctx context.Context, matchID string) ([]models.MatchEvent, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT minute, added_time, incident_type, is_home,
		       player_name, assist_player_name, detail, sofascore_player_id
		FROM match_events
		WHERE fixture_id = $1
		ORDER BY minute ASC, id ASC
	`, matchID)
	if err != nil {
		return nil, fmt.Errorf("query match_events: %w", err)
	}
	defer rows.Close()

	var events []models.MatchEvent
	for rows.Next() {
		var e models.MatchEvent
		if err := rows.Scan(
			&e.Minute, &e.AddedTime, &e.IncidentType, &e.IsHome,
			&e.PlayerName, &e.AssistPlayer, &e.Detail, &e.SofascorePlayer,
		); err != nil {
			return nil, fmt.Errorf("scan match event: %w", err)
		}
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate match events: %w", err)
	}
	if events == nil {
		events = []models.MatchEvent{}
	}
	return events, nil
}

// GetMatchStats returns team-level aggregated statistics (home + away) for one fixture.
func (s *PostgresStore) GetMatchStats(ctx context.Context, matchID string) ([]models.MatchStats, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT is_home, possession_pct, expected_goals, big_chances,
		       total_shots, shots_on_target, goalkeeper_saves,
		       corner_kicks, fouls, passes_total, passes_accurate,
		       tackles, free_kicks, yellow_cards, red_cards, offsides
		FROM match_statistics
		WHERE fixture_id = $1
		ORDER BY is_home DESC
	`, matchID)
	if err != nil {
		return nil, fmt.Errorf("query match_statistics: %w", err)
	}
	defer rows.Close()

	var stats []models.MatchStats
	for rows.Next() {
		var ms models.MatchStats
		if err := rows.Scan(
			&ms.IsHome, &ms.PossessionPct, &ms.ExpectedGoals, &ms.BigChances,
			&ms.TotalShots, &ms.ShotsOnTarget, &ms.GKSaves,
			&ms.CornerKicks, &ms.Fouls, &ms.PassesTotal, &ms.PassesAccurate,
			&ms.Tackles, &ms.FreeKicks, &ms.YellowCards, &ms.RedCards, &ms.Offsides,
		); err != nil {
			return nil, fmt.Errorf("scan match stats: %w", err)
		}
		stats = append(stats, ms)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate match stats: %w", err)
	}
	if stats == nil {
		stats = []models.MatchStats{}
	}
	return stats, nil
}

// GetMatchMomentum returns per-minute momentum data for one fixture.
func (s *PostgresStore) GetMatchMomentum(ctx context.Context, matchID string) ([]models.MomentumPoint, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT minute, value
		FROM match_momentum
		WHERE fixture_id = $1
		ORDER BY minute ASC
	`, matchID)
	if err != nil {
		return nil, fmt.Errorf("query match_momentum: %w", err)
	}
	defer rows.Close()

	var points []models.MomentumPoint
	for rows.Next() {
		var p models.MomentumPoint
		if err := rows.Scan(&p.Minute, &p.Value); err != nil {
			return nil, fmt.Errorf("scan momentum point: %w", err)
		}
		points = append(points, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate momentum: %w", err)
	}
	if points == nil {
		points = []models.MomentumPoint{}
	}
	return points, nil
}

// GetMatchCommentary returns the full commentary feed for one fixture, ordered by minute.
func (s *PostgresStore) GetMatchCommentary(ctx context.Context, matchID string) ([]models.CommentaryEntry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT minute, text, is_important
		FROM match_commentary
		WHERE fixture_id = $1
		ORDER BY minute ASC, id ASC
	`, matchID)
	if err != nil {
		return nil, fmt.Errorf("query match_commentary: %w", err)
	}
	defer rows.Close()

	var entries []models.CommentaryEntry
	for rows.Next() {
		var c models.CommentaryEntry
		if err := rows.Scan(&c.Minute, &c.Text, &c.IsImportant); err != nil {
			return nil, fmt.Errorf("scan commentary entry: %w", err)
		}
		entries = append(entries, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate commentary: %w", err)
	}
	if entries == nil {
		entries = []models.CommentaryEntry{}
	}
	return entries, nil
}

// GetMatchPlayerStats returns per-player stats for all players in one fixture.
func (s *PostgresStore) GetMatchPlayerStats(ctx context.Context, matchID string) ([]models.MatchPlayerStat, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT sofascore_player_id, player_name, team_id, is_home, position,
		       minutes_played, rating, goals, assists, yellow_cards, red_cards,
		       shots, shots_on_target, big_chances_created, big_chances_missed,
		       goals_inside_box, goals_outside_box, dribble_attempts, dribbles_won,
		       tackles, interceptions, clearances, blocks, duels_total, duels_won, aerial_duels_won,
		       passes_total, passes_accurate, key_passes,
		       long_balls_total, long_balls_accurate, crosses_total, crosses_accurate,
		       saves, saves_inside_box, clean_sheet, penalties_saved, runs_out,
		       fouls_committed, fouls_suffered, offsides, dispossessed
		FROM player_match_stats
		WHERE fixture_id = $1
		ORDER BY is_home DESC, rating DESC NULLS LAST, player_name
	`, matchID)
	if err != nil {
		return nil, fmt.Errorf("query player_match_stats: %w", err)
	}
	defer rows.Close()

	var players []models.MatchPlayerStat
	for rows.Next() {
		var p models.MatchPlayerStat
		if err := rows.Scan(
			&p.SofascorePlayerID, &p.PlayerName, &p.TeamID, &p.IsHome, &p.Position,
			&p.MinutesPlayed, &p.Rating, &p.Goals, &p.Assists, &p.YellowCards, &p.RedCards,
			&p.Shots, &p.ShotsOnTarget, &p.BigChancesCreated, &p.BigChancesMissed,
			&p.GoalsInsideBox, &p.GoalsOutsideBox, &p.DribbleAttempts, &p.DribblesWon,
			&p.Tackles, &p.Interceptions, &p.Clearances, &p.Blocks,
			&p.DuelsTotal, &p.DuelsWon, &p.AerialDuelsWon,
			&p.PassesTotal, &p.PassesAccurate, &p.KeyPasses,
			&p.LongBallsTotal, &p.LongBallsAccurate, &p.CrossesTotal, &p.CrossesAccurate,
			&p.Saves, &p.SavesInsideBox, &p.CleanSheet, &p.PenaltiesSaved, &p.RunsOut,
			&p.FoulsCommitted, &p.FoulsSuffered, &p.Offsides, &p.Dispossessed,
		); err != nil {
			return nil, fmt.Errorf("scan player match stat: %w", err)
		}
		players = append(players, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate player stats: %w", err)
	}
	if players == nil {
		players = []models.MatchPlayerStat{}
	}
	return players, nil
}

// GetMatchAnalysis returns the LLM-generated post-match analysis for one fixture.
// Returns ErrNotFound if no analysis has been generated yet.
func (s *PostgresStore) GetMatchAnalysis(ctx context.Context, matchID string) (*models.MatchAnalysis, error) {
	var a models.MatchAnalysis
	var generatedAt time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT fixture_id, analysis_text, has_hydration_break, hydration_break_minute,
		       generated_at, model_used
		FROM match_analysis
		WHERE fixture_id = $1
	`, matchID).Scan(
		&a.FixtureID, &a.AnalysisText, &a.HasHydrationBreak, &a.HydrationBreakMinute,
		&generatedAt, &a.ModelUsed,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query match_analysis: %w", err)
	}
	a.GeneratedAt = generatedAt.UTC().Format(time.RFC3339)
	return &a, nil
}

// venueClimate classifies WC 2026 host venues as "enclosed" (domed/retractable
// roof with AC) or "open" (outdoor). Enclosed venues should theoretically need
// fewer drinks breaks; monitoring this is the point of the hydration analysis.
var venueClimate = map[string]string{
	"AT&T Stadium":            "enclosed", // fully domed, AC
	"NRG Stadium":             "enclosed", // retractable roof, AC
	"SoFi Stadium":            "enclosed", // fully domed
	"Mercedes-Benz Stadium":   "enclosed", // retractable roof, AC
	"BC Place":                "enclosed", // retractable roof
	"Hard Rock Stadium":       "open",
	"MetLife Stadium":         "open",
	"Lincoln Financial Field": "open",
	"Levi's Stadium":          "open",
	"Gillette Stadium":        "open",
	"Arrowhead Stadium":       "open",
	"Rose Bowl":               "open",
	"Lumen Field":             "open",
	"BMO Field":               "open",
	"Estadio Akron":           "open",
	"Estadio Azteca":          "open",
	"Estadio BBVA":            "open",
}

func momentumLabel(goalsHome, goalsAway int) string {
	if goalsHome > goalsAway {
		return "home"
	}
	if goalsAway > goalsHome {
		return "away"
	}
	return "level"
}

// GetHydrationAnalysis queries match_events for all drinks_break entries in
// completed WC 2026 matches and computes 10-minute pre/post event windows to
// assess momentum impact.
func (s *PostgresStore) GetHydrationAnalysis(ctx context.Context) (*models.HydrationAnalysis, error) {
	rows, err := s.pool.Query(ctx, `
		WITH breaks AS (
			SELECT
				e.fixture_id,
				e.minute        AS break_minute,
				f.home_team_id,
				f.away_team_id,
				ht.name         AS home_team_name,
				awt.name        AS away_team_name,
				COALESCE(f.venue, '') AS venue,
				f.kickoff_utc,
				f.stage
			FROM match_events e
			JOIN fixtures f  ON f.id  = e.fixture_id
			JOIN teams ht    ON ht.id = f.home_team_id
			JOIN teams awt   ON awt.id = f.away_team_id
			JOIN match_results mr ON mr.fixture_id = f.id
			WHERE e.incident_type = 'drinks_break'
			  AND f.tournament_id = 'WC2026'
		)
		SELECT
			b.fixture_id,
			b.kickoff_utc,
			b.stage,
			b.break_minute,
			b.home_team_id,
			b.home_team_name,
			b.away_team_id,
			b.away_team_name,
			b.venue,
			gb.goals_home       AS goals_home_before,
			gb.goals_away       AS goals_away_before,
			ga.goals_home       AS goals_home_after,
			ga.goals_away       AS goals_away_after,
			ga.goals_in_5min,
			cb.important_count  AS important_before,
			ca.important_count  AS important_after
		FROM breaks b
		JOIN LATERAL (
			SELECT
				COUNT(*) FILTER (WHERE is_home AND incident_type = 'goal')     AS goals_home,
				COUNT(*) FILTER (WHERE NOT is_home AND incident_type = 'goal') AS goals_away
			FROM match_events
			WHERE fixture_id = b.fixture_id
			  AND incident_type = 'goal'
			  AND minute >= b.break_minute - 10
			  AND minute <  b.break_minute
		) gb ON true
		JOIN LATERAL (
			SELECT
				COUNT(*) FILTER (WHERE is_home AND incident_type = 'goal')     AS goals_home,
				COUNT(*) FILTER (WHERE NOT is_home AND incident_type = 'goal') AS goals_away,
				COUNT(*) FILTER (WHERE incident_type = 'goal'
				                 AND minute <= b.break_minute + 5)              AS goals_in_5min
			FROM match_events
			WHERE fixture_id = b.fixture_id
			  AND incident_type = 'goal'
			  AND minute >  b.break_minute
			  AND minute <= b.break_minute + 10
		) ga ON true
		JOIN LATERAL (
			SELECT COUNT(*) FILTER (WHERE is_important) AS important_count
			FROM match_commentary
			WHERE fixture_id = b.fixture_id
			  AND minute >= b.break_minute - 10
			  AND minute <  b.break_minute
		) cb ON true
		JOIN LATERAL (
			SELECT COUNT(*) FILTER (WHERE is_important) AS important_count
			FROM match_commentary
			WHERE fixture_id = b.fixture_id
			  AND minute >  b.break_minute
			  AND minute <= b.break_minute + 10
		) ca ON true
		ORDER BY b.kickoff_utc, b.break_minute
	`)
	if err != nil {
		return nil, fmt.Errorf("query hydration breaks: %w", err)
	}
	defer rows.Close()

	var breaks []models.HydrationBreak
	fixtureSet := map[string]struct{}{}

	for rows.Next() {
		var (
			b                    models.HydrationBreak
			kickoff              time.Time
			goalsIn5             int
		)
		if err := rows.Scan(
			&b.FixtureID, &kickoff, &b.Stage, &b.BreakMinute,
			&b.HomeTeamID, &b.HomeTeamName,
			&b.AwayTeamID, &b.AwayTeamName,
			&b.Venue,
			&b.GoalsHomeBefore, &b.GoalsAwayBefore,
			&b.GoalsHomeAfter, &b.GoalsAwayAfter,
			&goalsIn5,
			&b.ImportantBefore, &b.ImportantAfter,
		); err != nil {
			return nil, fmt.Errorf("scan hydration row: %w", err)
		}
		b.KickoffUTC = kickoff.UTC().Format(time.RFC3339)
		b.GoalWithin5Min = goalsIn5 > 0

		if c, ok := venueClimate[b.Venue]; ok {
			b.VenueClimate = c
		} else {
			b.VenueClimate = "unknown"
		}

		b.MomentumBefore = momentumLabel(b.GoalsHomeBefore, b.GoalsAwayBefore)
		b.MomentumAfter = momentumLabel(b.GoalsHomeAfter, b.GoalsAwayAfter)
		b.Shifted = b.MomentumBefore != b.MomentumAfter

		fixtureSet[b.FixtureID] = struct{}{}
		breaks = append(breaks, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate hydration rows: %w", err)
	}

	// Aggregate
	analysis := &models.HydrationAnalysis{
		TotalBreaks:       len(breaks),
		MatchesWithBreaks: len(fixtureSet),
		Breaks:            breaks,
	}
	if len(breaks) == 0 {
		return analysis, nil
	}

	for _, b := range breaks {
		if b.Shifted {
			analysis.ShiftsCount++
			// Determine who benefited: the team with momentum AFTER the break.
			if b.MomentumAfter == "home" {
				analysis.HomeBenefitCount++
			} else if b.MomentumAfter == "away" {
				analysis.AwayBenefitCount++
			}
		}
		if b.GoalWithin5Min {
			analysis.GoalAfterCount++
		}
		switch b.VenueClimate {
		case "enclosed":
			analysis.EnclosedCount++
		case "open":
			analysis.OpenCount++
		}
	}

	n := float64(len(breaks))
	analysis.ShiftsPct = float64(analysis.ShiftsCount) / n * 100
	analysis.GoalAfterPct = float64(analysis.GoalAfterCount) / n * 100

	return analysis, nil
}

// GetTeamForm returns the last 5 completed WC 2026 fixtures for a team, most
// recent first. Used to render the in-tournament form strip on match detail pages.
func (s *PostgresStore) GetTeamForm(ctx context.Context, teamID string) ([]models.MatchSummary, error) {
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
		JOIN match_results mr ON mr.fixture_id = f.id
		LEFT JOIN LATERAL (
			SELECT home_win_prob, draw_prob, away_win_prob
			FROM match_predictions
			WHERE fixture_id = f.id
			ORDER BY computed_at DESC LIMIT 1
		) mp ON true
		WHERE f.tournament_id = 'WC2026'
		  AND (f.home_team_id = $1 OR f.away_team_id = $1)
		ORDER BY f.kickoff_utc DESC
		LIMIT 5
	`, teamID)
	if err != nil {
		return nil, fmt.Errorf("query team form: %w", err)
	}
	defer rows.Close()

	var matches []models.MatchSummary
	for rows.Next() {
		var (
			id, stage                  string
			kickoffUTC                 time.Time
			groupLetter                *string
			homeID, homeName, homeConf string
			awayID, awayName, awayConf string
			homeGoals, awayGoals       *int
			homeWin, draw, awayWin     *float64
		)
		if err := rows.Scan(
			&id, &kickoffUTC, &stage, &groupLetter,
			&homeID, &homeName, &homeConf,
			&awayID, &awayName, &awayConf,
			&homeGoals, &awayGoals,
			&homeWin, &draw, &awayWin,
		); err != nil {
			return nil, fmt.Errorf("scan team form row: %w", err)
		}
		m := models.MatchSummary{
			ID: id, KickoffUTC: kickoffUTC, Stage: stage, GroupLetter: groupLetter,
			HomeTeam: models.Team{ID: homeID, Name: homeName, Confederation: homeConf},
			AwayTeam: models.Team{ID: awayID, Name: awayName, Confederation: awayConf},
		}
		if homeGoals != nil && awayGoals != nil {
			m.Result = &models.MatchResultSummary{HomeGoals: *homeGoals, AwayGoals: *awayGoals}
		}
		if homeWin != nil && draw != nil && awayWin != nil {
			m.Prediction = &models.OutcomeProbabilities{HomeWin: *homeWin, Draw: *draw, AwayWin: *awayWin}
		}
		matches = append(matches, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate team form rows: %w", err)
	}
	if matches == nil {
		matches = []models.MatchSummary{}
	}
	return matches, nil
}

// GetMatchH2H returns head-to-head history between the two teams in a fixture.
// WC 2026 encounters are taken from fixtures; historical matches come from
// historical_matches (if populated). Errors on historical lookup are swallowed
// so that the endpoint works before ingestion is complete.
func (s *PostgresStore) GetMatchH2H(ctx context.Context, matchID string) (*models.H2HRecord, error) {
	// Resolve both team IDs for the fixture.
	var homeID, awayID string
	err := s.pool.QueryRow(ctx, `
		SELECT home_team_id, away_team_id FROM fixtures WHERE id = $1
	`, matchID).Scan(&homeID, &awayID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("lookup fixture teams: %w", err)
	}

	record := &models.H2HRecord{
		HomeTeamID: homeID,
		AwayTeamID: awayID,
		Recent:     []models.H2HMatch{},
	}

	// WC2026 encounters between the two teams (excluding the current fixture).
	wcRows, err := s.pool.Query(ctx, `
		SELECT
			f.id, f.kickoff_utc, f.stage, f.group_letter,
			ht.id, ht.name, ht.confederation,
			awt.id, awt.name, awt.confederation,
			mr.home_goals, mr.away_goals
		FROM fixtures f
		JOIN teams ht  ON ht.id  = f.home_team_id
		JOIN teams awt ON awt.id = f.away_team_id
		LEFT JOIN match_results mr ON mr.fixture_id = f.id
		WHERE f.tournament_id = 'WC2026'
		  AND f.id != $3
		  AND (
		    (f.home_team_id = $1 AND f.away_team_id = $2) OR
		    (f.home_team_id = $2 AND f.away_team_id = $1)
		  )
		ORDER BY f.kickoff_utc ASC
	`, homeID, awayID, matchID)
	if err != nil {
		return nil, fmt.Errorf("query wc h2h: %w", err)
	}
	defer wcRows.Close()

	for wcRows.Next() {
		var (
			id, stage                  string
			kickoffUTC                 time.Time
			groupLetter                *string
			hID, hName, hConf          string
			aID, aName, aConf          string
			homeGoals, awayGoals       *int
		)
		if err := wcRows.Scan(&id, &kickoffUTC, &stage, &groupLetter,
			&hID, &hName, &hConf, &aID, &aName, &aConf,
			&homeGoals, &awayGoals); err != nil {
			return nil, fmt.Errorf("scan wc h2h row: %w", err)
		}
		m := models.MatchSummary{
			ID: id, KickoffUTC: kickoffUTC, Stage: stage, GroupLetter: groupLetter,
			HomeTeam: models.Team{ID: hID, Name: hName, Confederation: hConf},
			AwayTeam: models.Team{ID: aID, Name: aName, Confederation: aConf},
		}
		if homeGoals != nil && awayGoals != nil {
			m.Result = &models.MatchResultSummary{HomeGoals: *homeGoals, AwayGoals: *awayGoals}
		}
		record.WC2026 = append(record.WC2026, m)
	}
	if wcRows.Err() != nil {
		return nil, fmt.Errorf("iterate wc h2h: %w", wcRows.Err())
	}
	if record.WC2026 == nil {
		record.WC2026 = []models.MatchSummary{}
	}

	// Historical matches via team_name_map -> historical_matches.
	// Swallow errors: this table may not exist or may be empty.
	histRows, histErr := s.pool.Query(ctx, `
		SELECT
			hm.match_date::text, hm.home_team, hm.away_team,
			hm.home_score, hm.away_score, hm.tournament, hm.neutral
		FROM historical_matches hm
		WHERE (
			hm.home_team IN (SELECT raw_name FROM team_name_map WHERE team_id = $1)
			AND hm.away_team IN (SELECT raw_name FROM team_name_map WHERE team_id = $2)
		) OR (
			hm.home_team IN (SELECT raw_name FROM team_name_map WHERE team_id = $2)
			AND hm.away_team IN (SELECT raw_name FROM team_name_map WHERE team_id = $1)
		)
		ORDER BY hm.match_date DESC
		LIMIT 20
	`, homeID, awayID)
	if histErr == nil {
		defer histRows.Close()
		for histRows.Next() {
			var m models.H2HMatch
			if err := histRows.Scan(&m.Date, &m.HomeTeam, &m.AwayTeam,
				&m.HomeGoals, &m.AwayGoals, &m.Tournament, &m.Neutral); err != nil {
				break
			}
			// Tally all-time record from the perspective of homeID team.
			// Determine which side is homeID in this historical match.
			homeNames := s.teamRawNames(ctx, homeID)
			isHomeTeamOnLeft := homeNames[m.HomeTeam]
			if isHomeTeamOnLeft {
				if m.HomeGoals > m.AwayGoals {
					record.HomeTeamWins++
				} else if m.HomeGoals == m.AwayGoals {
					record.AllTimeDraws++
				} else {
					record.AwayTeamWins++
				}
			} else {
				if m.AwayGoals > m.HomeGoals {
					record.HomeTeamWins++
				} else if m.HomeGoals == m.AwayGoals {
					record.AllTimeDraws++
				} else {
					record.AwayTeamWins++
				}
			}
			record.AllTimePlayed++
			if len(record.Recent) < 5 {
				record.Recent = append(record.Recent, m)
			}
		}
	}

	return record, nil
}

// teamRawNames returns a set of raw name strings for a given team_id from team_name_map.
// Returns an empty map if the table doesn't exist or the team has no mappings.
func (s *PostgresStore) teamRawNames(ctx context.Context, teamID string) map[string]bool {
	rows, err := s.pool.Query(ctx, `
		SELECT raw_name FROM team_name_map WHERE team_id = $1
	`, teamID)
	if err != nil {
		return map[string]bool{}
	}
	defer rows.Close()
	m := map[string]bool{}
	for rows.Next() {
		var name string
		if rows.Scan(&name) == nil {
			m[name] = true
		}
	}
	return m
}

// GetTopAssists returns the top N players by assists in WC 2026.
func (s *PostgresStore) GetTopAssists(ctx context.Context, limit int) ([]models.TopScorer, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := s.pool.Query(ctx, `
		SELECT pts.player_name, pts.team_id, t.name, pts.goals, pts.assists,
		       COALESCE(pts.appearances, 0), COALESCE(pts.penalties, 0)
		FROM player_tournament_stats pts
		JOIN teams t ON t.id = pts.team_id
		WHERE pts.tournament_id = 'WC2026' AND pts.assists > 0
		ORDER BY pts.assists DESC, pts.goals DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("query top assists: %w", err)
	}
	defer rows.Close()

	var assisters []models.TopScorer
	for rows.Next() {
		var sc models.TopScorer
		if err := rows.Scan(&sc.PlayerName, &sc.TeamID, &sc.TeamName, &sc.Goals, &sc.Assists,
			&sc.Appearances, &sc.Penalties); err != nil {
			return nil, fmt.Errorf("scan assister: %w", err)
		}
		assisters = append(assisters, sc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate assisters: %w", err)
	}
	if assisters == nil {
		assisters = []models.TopScorer{}
	}
	return assisters, nil
}

// GetTournamentTrivia computes tournament-wide records and milestones from live match data.
// Each stat is queried independently; failures are silently skipped so a partial result
// is always returned rather than a hard error.
//
// Sources used, in order of reliability:
//   1. player_tournament_stats — same table as top scorers, always populated
//   2. match_results + fixtures + teams — populated for every completed match
//   3. match_events — only when per-event ingestion has run (hat-tricks, fastest goal, red cards)
//
// COUNT(*) and SUM() in PostgreSQL return int8 (bigint); we scan into int64 to avoid
// pgx type-mismatch errors that would silently suppress the fact.
func (s *PostgresStore) GetTournamentTrivia(ctx context.Context) (*models.TournamentTriviaResponse, error) {
	var facts []models.TournamentTriviaFact

	// ── 1. Player-based facts (player_tournament_stats) ──────────────────────

	// Top scorer.
	var topPlayer, topTeam string
	var topGoals int
	if err := s.pool.QueryRow(ctx, `
		SELECT pts.player_name, t.name, pts.goals
		FROM player_tournament_stats pts
		JOIN teams t ON t.id = pts.team_id
		WHERE pts.tournament_id = 'WC2026' AND pts.goals > 0
		ORDER BY pts.goals DESC, pts.assists DESC
		LIMIT 1
	`).Scan(&topPlayer, &topTeam, &topGoals); err == nil {
		facts = append(facts, models.TournamentTriviaFact{
			Category: "milestone",
			Icon:     "🥇",
			Headline: fmt.Sprintf("Golden Boot leader: %s with %d goals", topPlayer, topGoals),
			Detail:   topTeam,
		})
	}

	// Top assister.
	var topAssist, topAssistTeam string
	var topAssists int
	if err := s.pool.QueryRow(ctx, `
		SELECT pts.player_name, t.name, pts.assists
		FROM player_tournament_stats pts
		JOIN teams t ON t.id = pts.team_id
		WHERE pts.tournament_id = 'WC2026' AND pts.assists > 0
		ORDER BY pts.assists DESC, pts.goals DESC
		LIMIT 1
	`).Scan(&topAssist, &topAssistTeam, &topAssists); err == nil {
		facts = append(facts, models.TournamentTriviaFact{
			Category: "milestone",
			Icon:     "🎯",
			Headline: fmt.Sprintf("Most assists: %s with %d assists", topAssist, topAssists),
			Detail:   topAssistTeam,
		})
	}

	// Total unique scorers and total tournament goals from player stats.
	var scorerCount, ptsTotalGoals int64
	if err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FILTER (WHERE goals > 0), COALESCE(SUM(goals), 0)
		FROM player_tournament_stats
		WHERE tournament_id = 'WC2026'
	`).Scan(&scorerCount, &ptsTotalGoals); err == nil && ptsTotalGoals > 0 {
		facts = append(facts, models.TournamentTriviaFact{
			Category: "milestone",
			Icon:     "⚽",
			Headline: fmt.Sprintf("%d goals scored by %d different players", ptsTotalGoals, scorerCount),
		})
	}

	// Team with most goals (sum of player goals per team).
	var topTeamName string
	var topTeamGoals int64
	if err := s.pool.QueryRow(ctx, `
		SELECT t.name, SUM(pts.goals) AS tg
		FROM player_tournament_stats pts
		JOIN teams t ON t.id = pts.team_id
		WHERE pts.tournament_id = 'WC2026'
		GROUP BY t.id, t.name
		ORDER BY tg DESC
		LIMIT 1
	`).Scan(&topTeamName, &topTeamGoals); err == nil && topTeamGoals > 0 {
		facts = append(facts, models.TournamentTriviaFact{
			Category: "record",
			Icon:     "🔥",
			Headline: fmt.Sprintf("Most goals scored: %s with %d goals", topTeamName, topTeamGoals),
		})
	}

	// ── 2. Match-based facts (match_results) ─────────────────────────────────
	// Scan COUNT/SUM aggregates into int64 to match PostgreSQL's bigint return type.

	// Total matches played.
	var totalMatches, totalGoals int64
	if err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(SUM(home_goals + away_goals), 0)
		FROM match_results mr
		JOIN fixtures f ON f.id = mr.fixture_id
		WHERE f.tournament_id = 'WC2026'
	`).Scan(&totalMatches, &totalGoals); err == nil && totalMatches > 0 {
		avg := float64(totalGoals) / float64(totalMatches)
		facts = append(facts, models.TournamentTriviaFact{
			Category: "milestone",
			Icon:     "📊",
			Headline: fmt.Sprintf("%d matches played, %.2f goals per match", totalMatches, avg),
		})
	}

	// Biggest win by goal difference.
	var bigMatchID, bigHome, bigAway string
	var bigHG, bigAG int
	if err := s.pool.QueryRow(ctx, `
		SELECT f.id, ht.name, awt.name, mr.home_goals, mr.away_goals
		FROM match_results mr
		JOIN fixtures f    ON f.id   = mr.fixture_id
		JOIN teams ht      ON ht.id  = f.home_team_id
		JOIN teams awt     ON awt.id = f.away_team_id
		WHERE f.tournament_id = 'WC2026' AND mr.home_goals != mr.away_goals
		ORDER BY ABS(mr.home_goals - mr.away_goals) DESC, (mr.home_goals + mr.away_goals) DESC
		LIMIT 1
	`).Scan(&bigMatchID, &bigHome, &bigAway, &bigHG, &bigAG); err == nil {
		diff := bigHG - bigAG
		if diff < 0 {
			diff = -diff
		}
		winner, loser := bigHome, bigAway
		wg, lg := bigHG, bigAG
		if bigAG > bigHG {
			winner, loser = bigAway, bigHome
			wg, lg = bigAG, bigHG
		}
		hg, ag := bigHG, bigAG
		facts = append(facts, models.TournamentTriviaFact{
			Category:  "record",
			Icon:      "🏆",
			Headline:  fmt.Sprintf("Biggest win: %s %d–%d %s", winner, wg, lg, loser),
			Detail:    fmt.Sprintf("Margin of %d goals", diff),
			MatchID:   bigMatchID,
			HomeTeam:  bigHome,
			AwayTeam:  bigAway,
			HomeGoals: &hg,
			AwayGoals: &ag,
		})
	}

	// Highest-scoring match. Skip if same game as biggest win.
	var hsMatchID, hsHome, hsAway string
	var hsHG, hsAG int
	if err := s.pool.QueryRow(ctx, `
		SELECT f.id, ht.name, awt.name, mr.home_goals, mr.away_goals
		FROM match_results mr
		JOIN fixtures f    ON f.id   = mr.fixture_id
		JOIN teams ht      ON ht.id  = f.home_team_id
		JOIN teams awt     ON awt.id = f.away_team_id
		WHERE f.tournament_id = 'WC2026'
		ORDER BY (mr.home_goals + mr.away_goals) DESC
		LIMIT 1
	`).Scan(&hsMatchID, &hsHome, &hsAway, &hsHG, &hsAG); err == nil && hsMatchID != bigMatchID {
		total := hsHG + hsAG
		hg, ag := hsHG, hsAG
		facts = append(facts, models.TournamentTriviaFact{
			Category:  "record",
			Icon:      "🎇",
			Headline:  fmt.Sprintf("Most goals in one match: %d goals (%s %d–%d %s)", total, hsHome, hsHG, hsAG, hsAway),
			MatchID:   hsMatchID,
			HomeTeam:  hsHome,
			AwayTeam:  hsAway,
			HomeGoals: &hg,
			AwayGoals: &ag,
		})
	}

	// Clean sheets.
	var cleanSheets int64
	if err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM match_results mr
		JOIN fixtures f ON f.id = mr.fixture_id
		WHERE f.tournament_id = 'WC2026'
		  AND (mr.home_goals = 0 OR mr.away_goals = 0)
	`).Scan(&cleanSheets); err == nil && cleanSheets > 0 {
		facts = append(facts, models.TournamentTriviaFact{
			Category: "milestone",
			Icon:     "🧤",
			Headline: fmt.Sprintf("%d clean sheets kept so far", cleanSheets),
		})
	}

	// ── 3. Event-based facts (match_events, only when ingested) ──────────────

	// Hat-tricks: 3+ goals by one player in one fixture. Own goals excluded.
	hatRows, hatErr := s.pool.Query(ctx, `
		SELECT e.player_name, f.id, ht.name, awt.name, mr.home_goals, mr.away_goals, COUNT(*) AS goals
		FROM match_events e
		JOIN fixtures f       ON f.id   = e.fixture_id
		JOIN teams ht         ON ht.id  = f.home_team_id
		JOIN teams awt        ON awt.id = f.away_team_id
		JOIN match_results mr ON mr.fixture_id = f.id
		WHERE e.incident_type = 'goal'
		  AND f.tournament_id = 'WC2026'
		  AND e.player_name IS NOT NULL AND e.player_name != ''
		GROUP BY e.player_name, f.id, ht.name, awt.name, mr.home_goals, mr.away_goals
		HAVING COUNT(*) >= 3
		ORDER BY goals DESC
	`)
	if hatErr == nil {
		defer hatRows.Close()
		for hatRows.Next() {
			var player, htMatchID, htHome, htAway string
			var htHG, htAG int
			var htGoals int64
			if err := hatRows.Scan(&player, &htMatchID, &htHome, &htAway, &htHG, &htAG, &htGoals); err == nil {
				label := "Hat-trick"
				if htGoals >= 4 {
					label = fmt.Sprintf("%d-goal haul", htGoals)
				}
				hg, ag := htHG, htAG
				facts = append(facts, models.TournamentTriviaFact{
					Category:  "hat_trick",
					Icon:      "🎩",
					Headline:  fmt.Sprintf("%s: %s (%d goals)", label, player, htGoals),
					Detail:    fmt.Sprintf("%s %d–%d %s", htHome, htHG, htAG, htAway),
					MatchID:   htMatchID,
					HomeTeam:  htHome,
					AwayTeam:  htAway,
					HomeGoals: &hg,
					AwayGoals: &ag,
				})
			}
		}
	}

	// Fastest goal of the tournament.
	var egMinute int
	var egPlayer, egMatchID, egHome, egAway string
	var egHG, egAG int
	if err := s.pool.QueryRow(ctx, `
		SELECT e.minute, COALESCE(e.player_name, ''), f.id, ht.name, awt.name, mr.home_goals, mr.away_goals
		FROM match_events e
		JOIN fixtures f       ON f.id   = e.fixture_id
		JOIN teams ht         ON ht.id  = f.home_team_id
		JOIN teams awt        ON awt.id = f.away_team_id
		JOIN match_results mr ON mr.fixture_id = f.id
		WHERE e.incident_type = 'goal'
		  AND f.tournament_id = 'WC2026'
		ORDER BY e.minute ASC, COALESCE(e.added_time, 0) ASC
		LIMIT 1
	`).Scan(&egMinute, &egPlayer, &egMatchID, &egHome, &egAway, &egHG, &egAG); err == nil {
		headline := fmt.Sprintf("Fastest goal: %d' minute", egMinute)
		if egPlayer != "" {
			headline = fmt.Sprintf("Fastest goal: %d' by %s", egMinute, egPlayer)
		}
		hg, ag := egHG, egAG
		facts = append(facts, models.TournamentTriviaFact{
			Category:  "goal",
			Icon:      "⚡",
			Headline:  headline,
			Detail:    fmt.Sprintf("%s %d–%d %s", egHome, egHG, egAG, egAway),
			MatchID:   egMatchID,
			HomeTeam:  egHome,
			AwayTeam:  egAway,
			HomeGoals: &hg,
			AwayGoals: &ag,
		})
	}

	// Match with most red cards (surfaced only when >= 2).
	var rcMatchID, rcHome, rcAway string
	var rcHG, rcAG int
	var rcCount int64
	if err := s.pool.QueryRow(ctx, `
		SELECT f.id, ht.name, awt.name, mr.home_goals, mr.away_goals, COUNT(*) AS reds
		FROM match_events e
		JOIN fixtures f       ON f.id   = e.fixture_id
		JOIN teams ht         ON ht.id  = f.home_team_id
		JOIN teams awt        ON awt.id = f.away_team_id
		JOIN match_results mr ON mr.fixture_id = f.id
		WHERE e.incident_type IN ('red_card', 'yellow_red_card')
		  AND f.tournament_id = 'WC2026'
		GROUP BY f.id, ht.name, awt.name, mr.home_goals, mr.away_goals
		ORDER BY reds DESC
		LIMIT 1
	`).Scan(&rcMatchID, &rcHome, &rcAway, &rcHG, &rcAG, &rcCount); err == nil && rcCount >= 2 {
		hg, ag := rcHG, rcAG
		facts = append(facts, models.TournamentTriviaFact{
			Category:  "discipline",
			Icon:      "🟥",
			Headline:  fmt.Sprintf("Most red cards in one match: %d (%s vs %s)", rcCount, rcHome, rcAway),
			Detail:    fmt.Sprintf("Final score: %d–%d", rcHG, rcAG),
			MatchID:   rcMatchID,
			HomeTeam:  rcHome,
			AwayTeam:  rcAway,
			HomeGoals: &hg,
			AwayGoals: &ag,
		})
	}

	if facts == nil {
		facts = []models.TournamentTriviaFact{}
	}
	return &models.TournamentTriviaResponse{
		Facts:      facts,
		ComputedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}
