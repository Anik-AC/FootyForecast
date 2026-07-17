// Command simulator runs the Monte Carlo tournament simulator.
// It reads model parameters from Postgres, simulates N full WC 2026 tournaments
// in parallel, and writes stage-advancement probabilities back to the DB.
//
// Usage:
//
//	simulator [--n N] [--version MODEL_VERSION] [--from-qf] [--dry-run]
//
// Environment:
//
//	DATABASE_URL   — Postgres connection string (required)
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"time"

	"github.com/footyforecast/simulator/internal/db"
	"github.com/footyforecast/simulator/internal/montecarlo"
	"github.com/footyforecast/simulator/internal/tournament"
)

func main() {
	n := flag.Int("n", 100_000, "number of tournament simulations")
	version := flag.String("version", "bayesian_goals_v3", "model version to load")
	fromQF := flag.Bool("from-qf", false, "simulate only QF→SF→Final using actual confirmed QF fixtures")
	dryRun := flag.Bool("dry-run", false, "simulate but do not write results to DB")
	flag.Parse()

	// DATABASE_URL must be set in the environment. For local dev, run:
	//   export DATABASE_URL="postgresql://..."
	// before invoking the simulator.
	ctx := context.Background()

	conn, err := db.Connect(ctx)
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer conn.Close(ctx)
	log.Printf("connected to database")

	// Load model parameters.
	params, err := db.LoadTeamParams(ctx, conn, *version)
	if err != nil {
		log.Fatalf("load team params: %v", err)
	}
	log.Printf("loaded params for %d teams (model: %s)", len(params), *version)

	if *fromQF {
		// QF-conditional mode: simulate only from QF using actual bracket.
		qfPairs, err := db.LoadQFFixtures(ctx, conn)
		if err != nil {
			log.Fatalf("load QF fixtures: %v", err)
		}
		log.Printf("QF bracket: %v vs %v | %v vs %v | %v vs %v | %v vs %v",
			qfPairs[0], qfPairs[1], qfPairs[2], qfPairs[3],
			qfPairs[4], qfPairs[5], qfPairs[6], qfPairs[7])

		log.Printf("starting %d QF-conditional simulations...", *n)
		start := time.Now()
		probs := montecarlo.RunFromQF(qfPairs, params, *n)
		elapsed := time.Since(start)
		log.Printf("completed %d simulations in %v (%.0f sims/sec)",
			*n, elapsed.Round(time.Millisecond), float64(*n)/elapsed.Seconds())

		printTopN(probs, tournament.StageChampion, 8)

		if *dryRun {
			log.Printf("dry-run mode: results not written to DB")
			return
		}

		qfVersion := *version + "_qf"
		runAt := time.Now().UTC()
		if err := db.WriteResults(ctx, conn, qfVersion, *n, probs, runAt); err != nil {
			log.Fatalf("write QF results: %v", err)
		}
		log.Printf("wrote QF simulation results (version=%s, run_at=%s)", qfVersion, runAt.Format(time.RFC3339))
		return
	}

	// Full tournament mode: simulate from group stage.
	groups, matchScores, err := db.LoadGroups(ctx, conn)
	if err != nil {
		log.Fatalf("load groups: %v", err)
	}
	log.Printf("loaded %d groups, %d completed match scores", len(groups), len(matchScores))

	state := tournament.TournamentState{
		Groups:           groups,
		TeamParams:       params,
		GroupMatchScores: matchScores,
	}

	log.Printf("starting %d simulations...", *n)
	start := time.Now()
	probs := montecarlo.Run(state, *n, montecarlo.GroupsToAdvancers)
	elapsed := time.Since(start)
	log.Printf("completed %d simulations in %v (%.0f sims/sec)",
		*n, elapsed.Round(time.Millisecond), float64(*n)/elapsed.Seconds())

	printTopN(probs, tournament.StageChampion, 10)

	if *dryRun {
		log.Printf("dry-run mode: results not written to DB")
		return
	}

	runAt := time.Now().UTC()
	if err := db.WriteResults(ctx, conn, *version, *n, probs, runAt); err != nil {
		log.Fatalf("write results: %v", err)
	}
	log.Printf("wrote simulation results (run_at=%s)", runAt.Format(time.RFC3339))
}

// printTopN prints the N teams most likely to reach stage, sorted by probability.
func printTopN(probs map[string]map[string]float64, stage string, n int) {
	type teamProb struct {
		id   string
		prob float64
	}
	var ranked []teamProb
	for teamID, stageProbMap := range probs {
		ranked = append(ranked, teamProb{id: teamID, prob: stageProbMap[stage]})
	}

	// Simple selection sort for top N (N is small).
	for i := 0; i < n && i < len(ranked); i++ {
		best := i
		for j := i + 1; j < len(ranked); j++ {
			if ranked[j].prob > ranked[best].prob {
				best = j
			}
		}
		ranked[i], ranked[best] = ranked[best], ranked[i]
	}

	fmt.Printf("\nTop %d teams — P(Champion):\n", n)
	fmt.Printf("%-6s  %s\n", "Team", "Probability")
	fmt.Printf("------  -----------\n")
	for i := 0; i < n && i < len(ranked); i++ {
		fmt.Printf("%-6s  %.2f%%\n", ranked[i].id, ranked[i].prob*100)
	}
	fmt.Println()
}
