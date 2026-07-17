package tournament

import (
	"math"
	"math/rand"
)

// Group describes one of the 12 WC 2026 groups: its letter and the three
// scheduled matches (each team plays every other team once).
type Group struct {
	Letter  string
	Teams   []string  // 4 team IDs
	Matches []Match   // 6 matches (all pairs); HomeXG/AwayXG may be 0 if unscheduled
}

// TournamentState is the complete tournament snapshot the simulator works from.
// Completed group matches already have results (stored in MatchScores);
// upcoming matches are sampled from the Poisson model.
type TournamentState struct {
	Groups      []Group
	TeamParams  map[string]TeamParams
	// GroupMatchScores holds already-played results: "HOME:AWAY" -> [hg, ag].
	// The simulator fills in unplayed matches by sampling Poisson(xg).
	GroupMatchScores map[string][2]int
}

// hostNations are the WC 2026 host countries. They play in front of home
// crowds so receive a partial home-advantage term (hostAdvFactor of HomeAdv).
var hostNations = map[string]bool{"USA": true, "CAN": true, "MEX": true}

// hostAdvFactor is the fraction of the model's home_adv applied to host nations.
// 0.5 = half the fitted home-field signal (crowds are more mixed in a World Cup
// than in a club league, but hosts still benefit from local support and logistics).
const hostAdvFactor = 0.5

// lambdas computes expected goals for home vs away using the Poisson model.
// All WC 2026 matches are neutral except for host nations (USA, CAN, MEX) which
// receive a partial home-advantage boost per the PRD.
func lambdas(home, away string, params map[string]TeamParams) (float64, float64) {
	hp := params[home]
	ap := params[away]

	advFactor := 0.0
	if hostNations[home] {
		advFactor = hostAdvFactor
	}

	lh := math.Exp(hp.Mu + hp.Att - ap.Def + hp.HomeAdv*advFactor)
	la := math.Exp(hp.Mu + ap.Att - hp.Def)
	return lh, la
}

// sampleScore draws Poisson(lh) and Poisson(la) goal counts.
func sampleScore(lh, la float64, rng *rand.Rand) (int, int) {
	return samplePoisson(lh, rng), samplePoisson(la, rng)
}

// samplePoisson draws one sample from Poisson(lambda) using the Knuth method.
// For small lambda this is exact; fast enough for ~1 M calls per second.
func samplePoisson(lambda float64, rng *rand.Rand) int {
	if lambda <= 0 {
		return 0
	}
	L := math.Exp(-lambda)
	k := 0
	p := 1.0
	for p > L {
		p *= rng.Float64()
		k++
	}
	return k - 1
}

// SimulateGroupStage simulates all unplayed group matches, resolves standings
// and tiebreakers, and returns the two qualifiers from each group plus the
// third-place standings for best-thirds selection.
func SimulateGroupStage(state TournamentState, rng *rand.Rand) (
	qualifiers [][2]string, // [groupIdx][0=winner, 1=runnerup]
	groupResults []GroupResult,
) {
	qualifiers = make([][2]string, len(state.Groups))
	groupResults = make([]GroupResult, len(state.Groups))

	for gi, g := range state.Groups {
		// Copy existing scores and fill in unplayed matches.
		scores := make(map[string][2]int)
		for k, v := range state.GroupMatchScores {
			scores[k] = v
		}

		// Initialise standings for all 4 teams.
		standingMap := make(map[string]*Standing, 4)
		for _, tid := range g.Teams {
			s := &Standing{TeamID: tid}
			standingMap[tid] = s
		}

		// Apply already-played results.
		for k, v := range scores {
			// key is "HOME:AWAY" — find the teams involved in this group.
			home, away := splitKey(k)
			hs, hsOK := standingMap[home]
			as_, asOK := standingMap[away]
			if hsOK && asOK {
				ApplyResult(hs, as_, v[0], v[1])
			}
		}

		// Simulate unplayed matches.
		for _, m := range g.Matches {
			key := m.HomeID + ":" + m.AwayID
			if _, played := scores[key]; played {
				continue
			}
			if _, played := scores[m.AwayID+":"+m.HomeID]; played {
				continue
			}

			lh, la := m.HomeXG, m.AwayXG
			// If xg is not pre-computed, derive from model params.
			if lh == 0 && la == 0 {
				lh, la = lambdas(m.HomeID, m.AwayID, state.TeamParams)
			}
			hg, ag := sampleScore(lh, la, rng)
			scores[key] = [2]int{hg, ag}
			ApplyResult(standingMap[m.HomeID], standingMap[m.AwayID], hg, ag)
		}

		// Build slice from map.
		var slist []Standing
		for _, s := range standingMap {
			slist = append(slist, *s)
		}

		ranked := RankGroup(slist, scores, rng)
		qualifiers[gi] = [2]string{ranked[0].TeamID, ranked[1].TeamID}
		groupResults[gi] = GroupResult{
			Letter:    g.Letter,
			Standings: ranked,
			MatchScores: scores,
		}
	}
	return qualifiers, groupResults
}

// SimulateKnockout simulates from Round of 32 onward.
// advancers is the slice of 32 team IDs in bracket order (R32 slot 0..31).
// Returns a map from teamID to the furthest stage reached.
func SimulateKnockout(advancers []string, params map[string]TeamParams, rng *rand.Rand) map[string]string {
	reached := make(map[string]string, len(advancers))
	for _, tid := range advancers {
		reached[tid] = StageR32
	}

	stages := []string{StageR16, StageQF, StageSF, StageFinal, StageChampion}
	current := advancers

	for si, stage := range stages {
		var next []string
		for i := 0; i+1 < len(current); i += 2 {
			home, away := current[i], current[i+1]
			lh, la := lambdas(home, away, params)
			winner := knockoutWinner(lh, la, home, away, rng)
			next = append(next, winner)
			reached[winner] = stage
			// The loser stays at whatever stage they already have.
			_ = si
		}
		current = next
	}
	return reached
}

// knockoutWinner samples a match result. If level after 90 min, resolves extra
// time and penalties using relative Poisson rates: P(home) = lh / (lh + la).
// This preserves the model's strength signal rather than discarding it with a
// coin flip, which would bias champion probabilities toward weaker teams.
func knockoutWinner(lh, la float64, home, away string, rng *rand.Rand) string {
	hg, ag := sampleScore(lh, la, rng)
	if hg > ag {
		return home
	}
	if ag > hg {
		return away
	}
	// Level after 90 min: use relative strength for ET/penalties.
	total := lh + la
	if total <= 0 {
		// Degenerate: both teams have zero xG — fall back to coin flip.
		if rng.Intn(2) == 0 {
			return home
		}
		return away
	}
	if rng.Float64() < lh/total {
		return home
	}
	return away
}

// SimulateFromQF simulates from Quarter-Finals onward using actual confirmed QF fixtures.
// qfPairs is [QF0home, QF0away, QF1home, QF1away, QF2home, QF2away, QF3home, QF3away].
// SF1 = winner(QF0) vs winner(QF1); SF2 = winner(QF2) vs winner(QF3).
// Returns each team's deepest stage reached (QF, SF, FINAL, CHAMPION).
func SimulateFromQF(qfPairs [8]string, params map[string]TeamParams, rng *rand.Rand) map[string]string {
	reached := make(map[string]string, 8)
	for _, tid := range qfPairs {
		reached[tid] = StageQF
	}

	// QF round: 4 matches → 4 SF qualifiers
	sfTeams := make([]string, 0, 4)
	for i := 0; i < 4; i++ {
		home, away := qfPairs[i*2], qfPairs[i*2+1]
		lh, la := lambdas(home, away, params)
		winner := knockoutWinner(lh, la, home, away, rng)
		sfTeams = append(sfTeams, winner)
		reached[winner] = StageSF
	}

	// SF round: SF1 = sfTeams[0] vs sfTeams[1]; SF2 = sfTeams[2] vs sfTeams[3]
	finTeams := make([]string, 0, 2)
	for i := 0; i < 2; i++ {
		home, away := sfTeams[i*2], sfTeams[i*2+1]
		lh, la := lambdas(home, away, params)
		winner := knockoutWinner(lh, la, home, away, rng)
		finTeams = append(finTeams, winner)
		reached[winner] = StageFinal
	}

	// Final
	lh, la := lambdas(finTeams[0], finTeams[1], params)
	champion := knockoutWinner(lh, la, finTeams[0], finTeams[1], rng)
	reached[champion] = StageChampion

	return reached
}

// splitKey splits "HOME:AWAY" into ("HOME", "AWAY").
func splitKey(key string) (string, string) {
	for i, c := range key {
		if c == ':' {
			return key[:i], key[i+1:]
		}
	}
	return key, ""
}
