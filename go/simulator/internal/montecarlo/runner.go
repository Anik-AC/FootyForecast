// Package montecarlo runs N parallel tournament simulations and aggregates
// stage-advancement probabilities.
package montecarlo

import (
	"math/rand"
	"runtime"
	"sync"

	"github.com/footyforecast/simulator/internal/tournament"
)

// StageCount tallies how many simulations each team reached each stage.
type StageCount map[string]map[string]int // teamID -> stage -> count

// Run executes n full-tournament simulations using up to runtime.NumCPU()
// goroutines and returns probabilities keyed by (teamID, stage).
//
// advancersFn is called once per simulation to turn group results into a
// 32-team bracket. groupsToAdvancers is the canonical implementation.
func Run(
	state tournament.TournamentState,
	n int,
	advancersFn func([][2]string, []tournament.GroupResult, *rand.Rand) []string,
) map[string]map[string]float64 {

	workers := runtime.NumCPU()
	if workers > n {
		workers = n
	}

	// Each worker gets its own RNG seeded from the global source to avoid
	// lock contention on a shared generator.
	results := make(chan map[string]string, n)

	var wg sync.WaitGroup
	perWorker := n / workers

	for w := 0; w < workers; w++ {
		wg.Add(1)
		count := perWorker
		if w == workers-1 {
			count = n - (workers-1)*perWorker // last worker picks up remainder
		}
		rng := rand.New(rand.NewSource(int64(w * 0xDEADBEEF))) //nolint:gosec

		go func(rng *rand.Rand, count int) {
			defer wg.Done()
			for range count {
				qualifiers, groupResults := tournament.SimulateGroupStage(state, rng)
				advancers := advancersFn(qualifiers, groupResults, rng)
				reached := tournament.SimulateKnockout(advancers, state.TeamParams, rng)
				results <- reached
			}
		}(rng, count)
	}

	// Close the channel once all workers are done.
	go func() {
		wg.Wait()
		close(results)
	}()

	// Accumulate counts.
	counts := make(StageCount)
	for reached := range results {
		for team, stage := range reached {
			if counts[team] == nil {
				counts[team] = make(map[string]int)
			}
			counts[team][stage]++
		}
	}

	// Convert to probabilities.
	probs := make(map[string]map[string]float64, len(counts))
	stages := []string{
		tournament.StageR32,
		tournament.StageR16,
		tournament.StageQF,
		tournament.StageSF,
		tournament.StageFinal,
		tournament.StageChampion,
	}
	for team, stageCounts := range counts {
		probs[team] = make(map[string]float64, len(stages))

		// A team that reached, say, QF also reached R16 and R32 — make counts
		// cumulative (reaching SF means they are also counted in R16, R32, QF).
		cumulCount := 0
		// Walk from deepest to shallowest, accumulating.
		for si := len(stages) - 1; si >= 0; si-- {
			cumulCount += stageCounts[stages[si]]
			probs[team][stages[si]] = float64(cumulCount) / float64(n)
		}
	}
	return probs
}

// GroupsToAdvancers converts group winners/runners-up and group results into
// the 32-team bracket in WC 2026 slot order.
//
// WC 2026 Round of 32 bracket (12 groups A-L, 24 direct qualifiers + 8 best thirds):
//
// The exact seeding matrix for best-thirds is determined by FIFA based on
// which groups the thirds came from. For v1 we randomise the third-place
// slots within the bracket. This gives correct tournament probabilities on
// average; seeding-specific path analysis is a follow-on task.
func GroupsToAdvancers(
	qualifiers [][2]string,
	groupResults []tournament.GroupResult,
	rng *rand.Rand,
) []string {
	// Build the 32 advancers: winner-A, runner-B, winner-B, runner-A, ... etc.
	// For simplicity in v1 we pair winner[i] vs runner[i+1 mod 12] alternately.
	// This is a placeholder pairing; exact FIFA bracket is a follow-on.
	advancers := make([]string, 0, 32)
	for _, q := range qualifiers {
		advancers = append(advancers, q[0]) // winners
	}
	for _, q := range qualifiers {
		advancers = append(advancers, q[1]) // runners-up
	}

	// Add 8 best thirds.
	thirds := tournament.SelectBestThirds(groupResults, rng)
	advancers = append(advancers, thirds...)

	// Shuffle thirds into the bracket (v1: random placement).
	rng.Shuffle(len(advancers), func(i, j int) {
		advancers[i], advancers[j] = advancers[j], advancers[i]
	})

	return advancers[:32]
}
