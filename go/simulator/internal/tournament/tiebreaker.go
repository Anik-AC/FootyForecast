package tournament

import (
	"math/rand"
	"sort"
)

// RankGroup sorts group standings by the WC 2026 tiebreaker chain and returns
// them in descending order (best team first).
//
// Tiebreaker chain (PRD section 5):
//  1. Points
//  2. Goal difference
//  3. Goals scored
//  4. Head-to-head points (among tied teams only)
//  5. Head-to-head goal difference
//  6. Head-to-head goals scored
//  7. Drawing of lots (random — fair play omitted, data not available)
//
// matchScores must contain scores for every intra-group match, keyed as
// "HOME_ID:AWAY_ID". Only the match key as played is stored; lookup is
// attempted in both directions.
func RankGroup(standings []Standing, matchScores map[string][2]int, rng *rand.Rand) []Standing {
	sorted := make([]Standing, len(standings))
	copy(sorted, standings)

	sort.SliceStable(sorted, func(i, j int) bool {
		return beats(sorted[i], sorted[j], sorted, matchScores, rng)
	})
	return sorted
}

// beats returns true if a should rank above b in the group.
func beats(a, b Standing, all []Standing, scores map[string][2]int, rng *rand.Rand) bool {
	if a.Points != b.Points {
		return a.Points > b.Points
	}
	if a.GD() != b.GD() {
		return a.GD() > b.GD()
	}
	if a.GoalsFor != b.GoalsFor {
		return a.GoalsFor > b.GoalsFor
	}

	// Find all teams tied on pts / GD / GF with both a and b.
	tied := tiedWith(a, b, all)

	// Head-to-head only applies when exactly the tied subset played each other.
	// Extract h2h record for a and b within the tied group.
	aH2H := h2hStanding(a.TeamID, tied, scores)
	bH2H := h2hStanding(b.TeamID, tied, scores)

	if aH2H.Points != bH2H.Points {
		return aH2H.Points > bH2H.Points
	}
	if aH2H.GD() != bH2H.GD() {
		return aH2H.GD() > bH2H.GD()
	}
	if aH2H.GoalsFor != bH2H.GoalsFor {
		return aH2H.GoalsFor > bH2H.GoalsFor
	}

	// Lots.
	return rng.Intn(2) == 0
}

// tiedWith returns the set of teams (including a and b) that share the same
// points, goal difference, and goals-for as both a and b simultaneously.
func tiedWith(a, b Standing, all []Standing) []Standing {
	var out []Standing
	for _, s := range all {
		if s.Points == a.Points && s.GD() == a.GD() && s.GoalsFor == a.GoalsFor &&
			s.Points == b.Points && s.GD() == b.GD() && s.GoalsFor == b.GoalsFor {
			out = append(out, s)
		}
	}
	return out
}

// h2hStanding computes teamID's head-to-head record against every other team
// in the tied slice, using scores from matchScores.
func h2hStanding(teamID string, tied []Standing, scores map[string][2]int) Standing {
	s := Standing{TeamID: teamID}
	for _, opp := range tied {
		if opp.TeamID == teamID {
			continue
		}
		hg, ag, ok := lookupScore(teamID, opp.TeamID, scores)
		if !ok {
			continue
		}
		s.GoalsFor += hg
		s.GoalsAgst += ag
		switch {
		case hg > ag:
			s.Won++
			s.Points += 3
		case hg < ag:
			s.Lost++
		default:
			s.Drawn++
			s.Points++
		}
	}
	return s
}

// lookupScore retrieves goals scored by team1 and team2 in their group match.
// Returns (team1Goals, team2Goals, found).
func lookupScore(team1, team2 string, scores map[string][2]int) (int, int, bool) {
	key := team1 + ":" + team2
	if v, ok := scores[key]; ok {
		return v[0], v[1], true
	}
	key = team2 + ":" + team1
	if v, ok := scores[key]; ok {
		return v[1], v[0], true
	}
	return 0, 0, false
}

// SelectBestThirds picks the 8 best third-placed teams from the 12 group
// results and returns their IDs. Ranking: points, GD, GF, then lots.
func SelectBestThirds(groups []GroupResult, rng *rand.Rand) []string {
	var thirds []Standing
	for _, g := range groups {
		ranked := RankGroup(g.Standings, g.MatchScores, rng)
		if len(ranked) >= 3 {
			thirds = append(thirds, ranked[2])
		}
	}

	sort.SliceStable(thirds, func(i, j int) bool {
		a, b := thirds[i], thirds[j]
		if a.Points != b.Points {
			return a.Points > b.Points
		}
		if a.GD() != b.GD() {
			return a.GD() > b.GD()
		}
		if a.GoalsFor != b.GoalsFor {
			return a.GoalsFor > b.GoalsFor
		}
		return rng.Intn(2) == 0
	})

	out := make([]string, 0, 8)
	for i := 0; i < 8 && i < len(thirds); i++ {
		out = append(out, thirds[i].TeamID)
	}
	return out
}
