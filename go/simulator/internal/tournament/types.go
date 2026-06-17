// Package tournament contains the data types and pure logic for simulating
// the WC 2026 tournament. No database access lives here — the DB layer
// constructs these types and passes them in.
package tournament

// TeamParams holds the posterior mean attack / defence strengths for one team,
// plus the global Poisson parameters. The simulator uses these to compute
// expected goals for any pair: exp(Mu + Att[home] - Def[away]).
type TeamParams struct {
	ID       string
	Att      float64
	Def      float64
	Mu       float64 // global intercept (shared across all teams)
	HomeAdv  float64 // log boost for home team (WC matches are neutral, so unused)
}

// Match represents one scheduled or simulated fixture with expected-goals rates.
// HomeXG and AwayXG are used to draw Poisson goal samples.
type Match struct {
	HomeID string
	AwayID string
	HomeXG float64
	AwayXG float64
}

// Result is the outcome of a simulated match: final score and whether extra
// time / penalties were required (relevant for knockout rounds).
type Result struct {
	HomeGoals  int
	AwayGoals  int
	Pens       bool   // true if resolved by penalties
	PensWinner string // "home" or "away" when Pens is true
}

// Standing accumulates a team's group stage record.
type Standing struct {
	TeamID     string
	Played     int
	Won        int
	Drawn      int
	Lost       int
	GoalsFor   int
	GoalsAgst  int
	Points     int
}

// GD returns goal difference.
func (s Standing) GD() int { return s.GoalsFor - s.GoalsAgst }

// ApplyResult updates two standings in place for a match result.
func ApplyResult(home, away *Standing, hg, ag int) {
	home.Played++
	away.Played++
	home.GoalsFor += hg
	home.GoalsAgst += ag
	away.GoalsFor += ag
	away.GoalsAgst += hg

	switch {
	case hg > ag:
		home.Won++
		home.Points += 3
		away.Lost++
	case hg < ag:
		away.Won++
		away.Points += 3
		home.Lost++
	default:
		home.Drawn++
		home.Points++
		away.Drawn++
		away.Points++
	}
}

// GroupResult bundles the final group standings after all three matchdays,
// alongside the raw match scores (needed for head-to-head tiebreakers).
type GroupResult struct {
	Letter   string
	Standings []Standing
	// MatchScores maps "HOME:AWAY" -> [homeGoals, awayGoals] for all group matches.
	MatchScores map[string][2]int
}

// Stage constants used in simulation_results.
const (
	StageR32     = "R32"
	StageR16     = "R16"
	StageQF      = "QF"
	StageSF      = "SF"
	StageFinal   = "FINAL"
	StageChampion = "CHAMPION"
)
