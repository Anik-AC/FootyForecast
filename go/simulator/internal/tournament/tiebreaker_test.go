package tournament_test

import (
	"math/rand"
	"testing"

	"github.com/footyforecast/simulator/internal/tournament"
)

func rng() *rand.Rand { return rand.New(rand.NewSource(42)) }

// ---- helpers ----------------------------------------------------------------

func makeStanding(id string, w, d, l, gf, ga int) tournament.Standing {
	pts := w*3 + d
	return tournament.Standing{
		TeamID:    id,
		Played:    w + d + l,
		Won:       w,
		Drawn:     d,
		Lost:      l,
		GoalsFor:  gf,
		GoalsAgst: ga,
		Points:    pts,
	}
}

func first(ranked []tournament.Standing) string { return ranked[0].TeamID }
func second(ranked []tournament.Standing) string { return ranked[1].TeamID }
func third(ranked []tournament.Standing) string  { return ranked[2].TeamID }

// ---- RankGroup tests --------------------------------------------------------

func TestRankGroup_ClearPointsOrder(t *testing.T) {
	standings := []tournament.Standing{
		makeStanding("C", 0, 0, 3, 1, 6), // 0 pts
		makeStanding("A", 3, 0, 0, 7, 2), // 9 pts
		makeStanding("B", 1, 1, 1, 3, 3), // 4 pts
		makeStanding("D", 0, 2, 1, 2, 4), // 2 pts
	}
	ranked := tournament.RankGroup(standings, map[string][2]int{}, rng())
	if first(ranked) != "A" || second(ranked) != "B" {
		t.Errorf("expected A, B at top; got %s, %s", first(ranked), second(ranked))
	}
}

func TestRankGroup_TiebreakByGD(t *testing.T) {
	// A and B same points, A has better GD.
	standings := []tournament.Standing{
		makeStanding("A", 2, 0, 1, 6, 2), // 6 pts, GD+4
		makeStanding("B", 2, 0, 1, 4, 4), // 6 pts, GD 0
		makeStanding("C", 0, 1, 2, 2, 5), // 1 pt
		makeStanding("D", 0, 1, 2, 1, 2), // 1 pt
	}
	scores := map[string][2]int{
		"A:B": {2, 1},
		"A:C": {3, 0},
		"A:D": {1, 1},
		"B:C": {2, 0},
		"B:D": {1, 2},
		"C:D": {2, 0},
	}
	ranked := tournament.RankGroup(standings, scores, rng())
	if first(ranked) != "A" {
		t.Errorf("expected A first (better GD); got %s", first(ranked))
	}
}

func TestRankGroup_TiebreakByGoalsScored(t *testing.T) {
	// A and B same points and GD, A has more goals scored.
	standings := []tournament.Standing{
		makeStanding("A", 2, 0, 1, 5, 2), // 6 pts, GD+3, GF=5
		makeStanding("B", 2, 0, 1, 4, 1), // 6 pts, GD+3, GF=4
		makeStanding("C", 0, 0, 3, 0, 6),
		makeStanding("D", 0, 0, 3, 0, 0),
	}
	scores := map[string][2]int{
		"A:B": {2, 0},
		"A:C": {2, 0},
		"A:D": {1, 2},
		"B:C": {3, 0},
		"B:D": {1, 1},
		"C:D": {0, 0},
	}
	ranked := tournament.RankGroup(standings, scores, rng())
	if first(ranked) != "A" {
		t.Errorf("expected A first (more GF); got %s", first(ranked))
	}
}

func TestRankGroup_H2HTiebreakerPoints(t *testing.T) {
	// A and B both 6 pts, same GD=0, same GF=3.
	// A beat B directly, so A wins the H2H.
	standings := []tournament.Standing{
		makeStanding("A", 2, 0, 1, 3, 3),
		makeStanding("B", 2, 0, 1, 3, 3),
		makeStanding("C", 1, 0, 2, 2, 4),
		makeStanding("D", 1, 0, 2, 2, 0),
	}
	scores := map[string][2]int{
		"A:B": {1, 0}, // A beat B
		"A:C": {1, 2},
		"A:D": {1, 1},
		"B:C": {2, 0},
		"B:D": {1, 3},
		"C:D": {0, 0},
	}
	ranked := tournament.RankGroup(standings, scores, rng())
	if first(ranked) != "A" {
		t.Errorf("expected A first (H2H win over B); got %s", first(ranked))
	}
	if second(ranked) != "B" {
		t.Errorf("expected B second; got %s", second(ranked))
	}
}

func TestRankGroup_ThreeWayH2HTie(t *testing.T) {
	// A beat B, B beat C, C beat A (rock-paper-scissors in H2H).
	// H2H points are equal (3 each). Move to H2H GD.
	// Each team scored 1 and conceded 1 in H2H, so H2H GD=0.
	// Then H2H GF=1 each. Finally, lots — just verify no panic.
	standings := []tournament.Standing{
		makeStanding("A", 1, 1, 1, 3, 2),
		makeStanding("B", 1, 1, 1, 3, 2),
		makeStanding("C", 1, 1, 1, 3, 2),
		makeStanding("D", 0, 0, 3, 0, 7),
	}
	scores := map[string][2]int{
		"A:B": {1, 0},
		"B:C": {1, 0},
		"C:A": {1, 0},
		"A:D": {2, 0},
		"B:D": {2, 0},
		"C:D": {2, 0},
	}
	// Should not panic; result for top 2 is arbitrary (lots), D is last.
	ranked := tournament.RankGroup(standings, scores, rng())
	if len(ranked) != 4 {
		t.Fatalf("expected 4 standings, got %d", len(ranked))
	}
	if ranked[3].TeamID != "D" {
		t.Errorf("D should finish last; got %s", ranked[3].TeamID)
	}
}

func TestRankGroup_SymmetricScoreLookup(t *testing.T) {
	// Score is stored as "B:A" but we need to look it up from A's perspective.
	standings := []tournament.Standing{
		makeStanding("A", 2, 0, 1, 4, 2),
		makeStanding("B", 2, 0, 1, 4, 2),
		makeStanding("C", 0, 0, 3, 0, 4),
		makeStanding("D", 2, 0, 1, 4, 4),
	}
	// Store the B:A match under "B:A" (away side happened to be recorded first).
	scores := map[string][2]int{
		"B:A": {0, 2}, // A wins 2-0 (stored as B home, A away: B=0, A=2)
		"A:C": {2, 0},
		"A:D": {0, 1},
		"B:C": {3, 0},
		"B:D": {1, 3},
		"C:D": {0, 0},
	}
	// Should not panic on the reverse-key lookup.
	ranked := tournament.RankGroup(standings, scores, rng())
	if len(ranked) != 4 {
		t.Fatalf("expected 4; got %d", len(ranked))
	}
}

// ---- SelectBestThirds -------------------------------------------------------

func TestSelectBestThirds_Returns8(t *testing.T) {
	groups := makeTestGroups(12)
	thirds := tournament.SelectBestThirds(groups, rng())
	if len(thirds) != 8 {
		t.Errorf("expected 8 best thirds; got %d", len(thirds))
	}
}

func TestSelectBestThirds_BestPointsFirst(t *testing.T) {
	// All groups' thirds have 1pt by default. Override group A's third to have
	// 4pts — below the runner-up (6pts) so it still ranks 3rd in its group,
	// but ahead of every other group's third (1pt). Verify it ranks first overall.
	groups := makeTestGroups(12)
	// Group A: winner=9pts(A1), runner=6pts(A2), third=1pt(A3), fourth=1pt(A4).
	// Replace third with X_BEST at 4pts; it stays below A2(6) so remains 3rd.
	groups[0].Standings[2] = makeStanding("X_BEST", 1, 1, 1, 4, 3) // 4 pts
	thirds := tournament.SelectBestThirds(groups, rng())
	if thirds[0] != "X_BEST" {
		t.Errorf("expected X_BEST as best third; got %s", thirds[0])
	}
}

func TestSelectBestThirds_FewerThan12Groups(t *testing.T) {
	// With fewer than 12 groups we still get min(8, n) thirds.
	groups := makeTestGroups(4)
	thirds := tournament.SelectBestThirds(groups, rng())
	if len(thirds) != 4 {
		t.Errorf("expected 4; got %d", len(thirds))
	}
}

// ---- ApplyResult ------------------------------------------------------------

func TestApplyResult_HomeWin(t *testing.T) {
	home := &tournament.Standing{TeamID: "H"}
	away := &tournament.Standing{TeamID: "A"}
	tournament.ApplyResult(home, away, 2, 1)

	if home.Points != 3 || home.Won != 1 || home.Lost != 0 {
		t.Errorf("home win: pts=%d won=%d", home.Points, home.Won)
	}
	if away.Points != 0 || away.Lost != 1 {
		t.Errorf("away loss: pts=%d lost=%d", away.Points, away.Lost)
	}
}

func TestApplyResult_Draw(t *testing.T) {
	home := &tournament.Standing{TeamID: "H"}
	away := &tournament.Standing{TeamID: "A"}
	tournament.ApplyResult(home, away, 1, 1)

	if home.Points != 1 || home.Drawn != 1 {
		t.Errorf("draw: home pts=%d drawn=%d", home.Points, home.Drawn)
	}
	if away.Points != 1 || away.Drawn != 1 {
		t.Errorf("draw: away pts=%d drawn=%d", away.Points, away.Drawn)
	}
}

func TestApplyResult_AwayWin(t *testing.T) {
	home := &tournament.Standing{TeamID: "H"}
	away := &tournament.Standing{TeamID: "A"}
	tournament.ApplyResult(home, away, 0, 3)

	if home.Lost != 1 || home.Points != 0 {
		t.Errorf("home loss: lost=%d pts=%d", home.Lost, home.Points)
	}
	if away.Won != 1 || away.Points != 3 {
		t.Errorf("away win: won=%d pts=%d", away.Won, away.Points)
	}
}

func TestApplyResult_GoalTotals(t *testing.T) {
	home := &tournament.Standing{TeamID: "H"}
	away := &tournament.Standing{TeamID: "A"}
	tournament.ApplyResult(home, away, 3, 1)

	if home.GoalsFor != 3 || home.GoalsAgst != 1 {
		t.Errorf("home goals: for=%d agst=%d", home.GoalsFor, home.GoalsAgst)
	}
	if away.GoalsFor != 1 || away.GoalsAgst != 3 {
		t.Errorf("away goals: for=%d agst=%d", away.GoalsFor, away.GoalsAgst)
	}
	if home.GD() != 2 || away.GD() != -2 {
		t.Errorf("GD: home=%d away=%d", home.GD(), away.GD())
	}
}

// ---- makeTestGroups helpers -------------------------------------------------

// makeTestGroups creates n synthetic GroupResult values where each group has
// 4 teams with plausible standings and scores already filled in.
func makeTestGroups(n int) []tournament.GroupResult {
	groups := make([]tournament.GroupResult, n)
	for i := range groups {
		letter := string(rune('A' + i))
		teams := []string{
			letter + "1", letter + "2", letter + "3", letter + "4",
		}
		standings := []tournament.Standing{
			makeStanding(teams[0], 3, 0, 0, 7, 1), // winner: 9pts
			makeStanding(teams[1], 2, 0, 1, 4, 3), // runner: 6pts
			makeStanding(teams[2], 0, 1, 2, 2, 5), // third:  1pt
			makeStanding(teams[3], 0, 1, 2, 1, 5), // fourth: 1pt
		}
		scores := map[string][2]int{
			teams[0] + ":" + teams[1]: {2, 1},
			teams[0] + ":" + teams[2]: {3, 0},
			teams[0] + ":" + teams[3]: {2, 0},
			teams[1] + ":" + teams[2]: {2, 1},
			teams[1] + ":" + teams[3]: {1, 0},
			teams[2] + ":" + teams[3]: {1, 1},
		}
		groups[i] = tournament.GroupResult{
			Letter:      letter,
			Standings:   standings,
			MatchScores: scores,
		}
	}
	return groups
}
