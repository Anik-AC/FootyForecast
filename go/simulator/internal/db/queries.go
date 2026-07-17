package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/footyforecast/simulator/internal/tournament"
)

// LoadTeamParams reads all rows from team_model_params joined to model_globals
// for the given model version and returns a map keyed by team_id.
func LoadTeamParams(ctx context.Context, conn *pgx.Conn, modelVersion string) (map[string]tournament.TeamParams, error) {
	// Load global params once.
	var mu, homeAdv float64
	err := conn.QueryRow(ctx,
		`SELECT mu_mean, home_adv_mean FROM model_globals WHERE model_version = $1`,
		modelVersion,
	).Scan(&mu, &homeAdv)
	if err != nil {
		return nil, fmt.Errorf("load model_globals for version %q: %w", modelVersion, err)
	}

	rows, err := conn.Query(ctx,
		`SELECT team_id, att_mean, def_mean FROM team_model_params WHERE model_version = $1`,
		modelVersion,
	)
	if err != nil {
		return nil, fmt.Errorf("query team_model_params: %w", err)
	}
	defer rows.Close()

	params := make(map[string]tournament.TeamParams)
	for rows.Next() {
		var teamID string
		var att, def float64
		if err := rows.Scan(&teamID, &att, &def); err != nil {
			return nil, fmt.Errorf("scan team_model_params row: %w", err)
		}
		params[teamID] = tournament.TeamParams{
			ID:      teamID,
			Att:     att,
			Def:     def,
			Mu:      mu,
			HomeAdv: homeAdv,
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate team_model_params: %w", err)
	}
	if len(params) == 0 {
		return nil, fmt.Errorf("no team params found for model version %q — run the Python model first", modelVersion)
	}
	return params, nil
}

// GroupAssignment holds a team's group letter as loaded from the DB.
type GroupAssignment struct {
	TeamID string
	Group  string // single letter A-L
}

// LoadGroups builds the []tournament.Group slice from the fixtures table.
// It reads all WC 2026 group-stage fixtures and assembles 12 Group structs.
// Completed matches (with scores) are returned separately in matchScores.
func LoadGroups(ctx context.Context, conn *pgx.Conn) (
	[]tournament.Group,
	map[string][2]int, // "HOME:AWAY" -> [hg, ag] for completed matches
	error,
) {
	// Fixtures in the group stage: status FT/AET/PEN have results.
	rows, err := conn.Query(ctx, `
		SELECT
			f.id,
			f.home_team_id,
			f.away_team_id,
			COALESCE(mp.home_xg, 0) AS home_xg,
			COALESCE(mp.away_xg, 0) AS away_xg,
			f.group_letter,
			COALESCE(mr.home_goals, -1) AS home_goals,
			COALESCE(mr.away_goals, -1) AS away_goals
		FROM fixtures f
		LEFT JOIN match_results mr ON mr.fixture_id = f.id
		LEFT JOIN LATERAL (
			SELECT home_xg, away_xg
			FROM match_predictions
			WHERE fixture_id = f.id
			ORDER BY computed_at DESC
			LIMIT 1
		) mp ON true
		WHERE f.tournament_id = 'WC2026'
		  AND f.stage         = 'group'
		ORDER BY f.group_letter, f.kickoff_utc
	`)
	if err != nil {
		return nil, nil, fmt.Errorf("query group fixtures: %w", err)
	}
	defer rows.Close()

	type fixtureRow struct {
		ID        string
		HomeID    string
		AwayID    string
		HomeXG    float64
		AwayXG    float64
		Group     string
		HomeGoals int
		AwayGoals int
	}

	// Collect by group letter.
	groupMap := make(map[string]*tournament.Group)
	teamGroups := make(map[string]string) // teamID -> group letter
	matchScores := make(map[string][2]int)

	for rows.Next() {
		var fr fixtureRow
		if err := rows.Scan(
			&fr.ID, &fr.HomeID, &fr.AwayID,
			&fr.HomeXG, &fr.AwayXG,
			&fr.Group,
			&fr.HomeGoals, &fr.AwayGoals,
		); err != nil {
			return nil, nil, fmt.Errorf("scan fixture row: %w", err)
		}

		grp, ok := groupMap[fr.Group]
		if !ok {
			grp = &tournament.Group{Letter: fr.Group}
			groupMap[fr.Group] = grp
		}

		grp.Matches = append(grp.Matches, tournament.Match{
			HomeID: fr.HomeID,
			AwayID: fr.AwayID,
			HomeXG: fr.HomeXG,
			AwayXG: fr.AwayXG,
		})

		teamGroups[fr.HomeID] = fr.Group
		teamGroups[fr.AwayID] = fr.Group

		if fr.HomeGoals >= 0 && fr.AwayGoals >= 0 {
			key := fr.HomeID + ":" + fr.AwayID
			matchScores[key] = [2]int{fr.HomeGoals, fr.AwayGoals}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("iterate fixture rows: %w", err)
	}

	// Build teams lists for each group (unique, sorted).
	for _, grp := range groupMap {
		seen := make(map[string]bool)
		for _, m := range grp.Matches {
			if !seen[m.HomeID] {
				grp.Teams = append(grp.Teams, m.HomeID)
				seen[m.HomeID] = true
			}
			if !seen[m.AwayID] {
				grp.Teams = append(grp.Teams, m.AwayID)
				seen[m.AwayID] = true
			}
		}
	}

	// Convert map to sorted slice (groups A-L).
	groups := make([]tournament.Group, 0, len(groupMap))
	for letter := "A"; len(groups) < len(groupMap); letter = nextLetter(letter) {
		if grp, ok := groupMap[letter]; ok {
			groups = append(groups, *grp)
		}
	}

	return groups, matchScores, nil
}

// LoadQFFixtures returns the 8 team IDs of the 4 QF matches in bracket order:
// [QF0home, QF0away, QF1home, QF1away, QF2home, QF2away, QF3home, QF3away].
// Matches are sorted by kickoff_utc so the bracket order is consistent.
func LoadQFFixtures(ctx context.Context, conn *pgx.Conn) ([8]string, error) {
	rows, err := conn.Query(ctx, `
		SELECT home_team_id, away_team_id
		FROM fixtures
		WHERE tournament_id = 'WC2026' AND stage = 'quarter_final'
		ORDER BY kickoff_utc ASC
	`)
	if err != nil {
		return [8]string{}, fmt.Errorf("query QF fixtures: %w", err)
	}
	defer rows.Close()

	var qfPairs [8]string
	idx := 0
	for rows.Next() {
		var home, away string
		if err := rows.Scan(&home, &away); err != nil {
			return [8]string{}, fmt.Errorf("scan QF fixture: %w", err)
		}
		if idx+2 > 8 {
			return [8]string{}, fmt.Errorf("too many QF fixtures in DB")
		}
		qfPairs[idx] = home
		qfPairs[idx+1] = away
		idx += 2
	}
	if err := rows.Err(); err != nil {
		return [8]string{}, fmt.Errorf("iterate QF fixtures: %w", err)
	}
	if idx != 8 {
		return [8]string{}, fmt.Errorf("expected 4 QF fixtures, got %d", idx/2)
	}
	return qfPairs, nil
}

func nextLetter(s string) string {
	return string(rune(s[0] + 1))
}

// WriteResults persists one simulation run's probabilities to simulation_results.
// runAt is the timestamp that identifies this run (all rows share it).
func WriteResults(
	ctx context.Context,
	conn *pgx.Conn,
	modelVersion string,
	nSims int,
	probs map[string]map[string]float64,
	runAt time.Time,
) error {
	stages := []string{"R32", "R16", "QF", "SF", "FINAL", "CHAMPION"}

	batch := &pgx.Batch{}
	for teamID, stageProbMap := range probs {
		for _, stage := range stages {
			p := stageProbMap[stage]
			batch.Queue(
				`INSERT INTO simulation_results
					(run_at, model_version, n_simulations, team_id, stage, probability)
				VALUES ($1, $2, $3, $4, $5, $6)
				ON CONFLICT (run_at, team_id, stage) DO UPDATE
					SET probability = EXCLUDED.probability,
					    n_simulations = EXCLUDED.n_simulations`,
				runAt, modelVersion, nSims, teamID, stage, p,
			)
		}
	}

	br := conn.SendBatch(ctx, batch)
	defer br.Close()

	total := 0
	for range len(probs) * len(stages) {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("insert simulation_results row %d: %w", total, err)
		}
		total++
	}
	return br.Close()
}
