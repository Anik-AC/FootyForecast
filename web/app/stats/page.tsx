import { getCalibration, getTopScorers, getTopAssists, getHydrationAnalysis, getTournamentTrivia } from "@/lib/api";
import type { GradedMatch, TopScorer, TournamentTriviaFact } from "@/lib/types";
import Link from "next/link";

const MONO = "'JetBrains Mono',monospace";

function isUpset(match: GradedMatch): boolean {
  const prob =
    match.actual_outcome === "home_win"
      ? match.model_probabilities.home_win
      : match.actual_outcome === "away_win"
      ? match.model_probabilities.away_win
      : match.model_probabilities.draw;
  return prob < 0.3;
}

function actualOutcomeProb(match: GradedMatch): number {
  return match.actual_outcome === "home_win"
    ? match.model_probabilities.home_win
    : match.actual_outcome === "away_win"
    ? match.model_probabilities.away_win
    : match.model_probabilities.draw;
}

function outcomeLabel(outcome: string, match: GradedMatch): string {
  if (outcome === "home_win") return `${match.home_team.name} won`;
  if (outcome === "away_win") return `${match.away_team.name} won`;
  return "Draw";
}

function SectionHeader({ color, label, right }: { color: string; label: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, margin: "48px 0 18px" }}>
      <span style={{ width: 4, height: 16, borderRadius: 99, background: color }} />
      <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: "#C8C3D6", margin: 0 }}>{label}</h2>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
      {right}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div style={{
      background: "#15131F",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14,
      padding: "18px 16px",
      textAlign: "center",
    }}>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: highlight ? "#2BE38A" : "#F2F1F7" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#645F77", marginTop: 5 }}>{label}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 11, color: "#4A4560", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function TriviaCard({ fact }: { fact: TournamentTriviaFact }) {
  const inner = (
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14,
      padding: "18px",
    }}>
      <div style={{ fontSize: 22, marginBottom: 8, lineHeight: 1 }}>{fact.icon}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: "#EDEBF3", lineHeight: 1.35 }}>{fact.headline}</div>
      {fact.detail && (
        <div style={{ fontSize: 12.5, color: "#7E7892", marginTop: 6 }}>{fact.detail}</div>
      )}
      {fact.match_id && fact.home_team && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: "#4A4560", marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fact.home_team} vs {fact.away_team}
        </div>
      )}
    </div>
  );

  if (fact.match_id) {
    return <Link href={`/matches/${fact.match_id}`} style={{ textDecoration: "none" }}>{inner}</Link>;
  }
  return inner;
}

const TH_STYLE: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.08em",
  color: "#645F77",
  paddingTop: 10,
  paddingBottom: 10,
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

function PlayerLeaderboard({
  title,
  color,
  players,
  statKey,
  statLabel,
}: {
  title: string;
  color: string;
  players: TopScorer[];
  statKey: "goals" | "assists";
  statLabel: string;
}) {
  return (
    <div>
      {players.length === 0 ? (
        <p style={{ color: "#645F77", fontSize: 14 }}>No data yet.</p>
      ) : (
        <div style={{
          background: "#120F1E",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16,
          overflow: "hidden",
        }}>
          <div style={{
            background: "#15131F",
            padding: "11px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "#C8C3D6" }}>
              {title.toUpperCase()}
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...TH_STYLE, textAlign: "left", paddingLeft: 18, width: 36 }}>#</th>
                <th style={{ ...TH_STYLE, textAlign: "left" }}>PLAYER</th>
                <th style={{ ...TH_STYLE, textAlign: "left", color: "#9E99B0" }}>TEAM</th>
                <th style={{ ...TH_STYLE, textAlign: "center", paddingRight: 18, width: 40, color }}>
                  {statLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((s, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ paddingLeft: 18, paddingTop: 11, paddingBottom: 11, fontFamily: MONO, fontSize: 12, color: "#4A4560" }}>
                    {i + 1}
                  </td>
                  <td style={{ paddingTop: 11, paddingBottom: 11, fontWeight: 600, fontSize: 14, color: "#F2F1F7" }}>
                    {s.player_name}
                  </td>
                  <td style={{ paddingTop: 11, paddingBottom: 11, fontSize: 13, color: "#7E7892" }}>
                    <Link href={`/teams/${s.team_id}`} style={{ color: "#9E99B0", textDecoration: "none" }}>
                      {s.team_name}
                    </Link>
                  </td>
                  <td style={{ textAlign: "center", paddingRight: 18, fontFamily: MONO, fontSize: 15, fontWeight: 800, color }}>
                    {s[statKey]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function StatsPage() {
  const [calibration, scorers, assists, hydration, trivia] = await Promise.all([
    getCalibration(),
    getTopScorers(5),
    getTopAssists(5),
    getHydrationAnalysis(),
    getTournamentTrivia(),
  ]);

  const graded = calibration?.matches ?? [];
  const correct = graded.filter(
    (m) =>
      (m.actual_outcome === "home_win" &&
        m.model_probabilities.home_win >= m.model_probabilities.draw &&
        m.model_probabilities.home_win >= m.model_probabilities.away_win) ||
      (m.actual_outcome === "draw" &&
        m.model_probabilities.draw > m.model_probabilities.home_win &&
        m.model_probabilities.draw > m.model_probabilities.away_win) ||
      (m.actual_outcome === "away_win" &&
        m.model_probabilities.away_win > m.model_probabilities.home_win &&
        m.model_probabilities.away_win > m.model_probabilities.draw)
  );

  const upsets = graded.filter(isUpset).sort(
    (a, b) => actualOutcomeProb(a) - actualOutcomeProb(b)
  );

  const accuracy = graded.length > 0 ? Math.round((correct.length / graded.length) * 100) : null;

  return (
    <div style={{ animation: "ff-up 0.4s ease both", paddingTop: 46 }}>
      <h1 style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.03em", margin: 0 }}>Tournament Stats</h1>
      <div style={{ color: "#9E99B0", fontSize: 15, marginTop: 10 }}>
        Model performance, top performers, and tournament records
      </div>

      {/* Model performance */}
      <SectionHeader color="#A35CFF" label="MODEL PERFORMANCE" />
      {!calibration || graded.length === 0 ? (
        <p style={{ color: "#645F77", fontSize: 14 }}>No graded matches yet.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <StatCard label="Matches graded" value={graded.length.toString()} />
          {accuracy != null && (
            <StatCard
              label="Correct predictions"
              value={`${correct.length}/${graded.length}`}
              sub={`${accuracy}%`}
              highlight={accuracy >= 60}
            />
          )}
          <StatCard
            label="Avg log loss"
            value={calibration.model_mean_log_loss.toFixed(3)}
            sub="lower = better"
          />
          <StatCard
            label="Avg Brier score"
            value={calibration.model_mean_brier.toFixed(3)}
            sub="lower = better"
          />
        </div>
      )}

      {/* Upsets */}
      {upsets.length > 0 && (
        <>
          <SectionHeader color="#FFC23D" label="UPSETS AND SURPRISES" />
          <p style={{ fontSize: 12.5, color: "#645F77", marginBottom: 14 }}>
            Matches where the model gave less than 30% probability to the actual outcome.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upsets.map((m) => (
              <div
                key={m.match_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#120F1E",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 14,
                  padding: "14px 18px",
                }}
              >
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#F2F1F7" }}>
                    {m.home_team.name} vs {m.away_team.name}
                  </span>
                  <span style={{ marginLeft: 10, fontSize: 13, color: "#7E7892" }}>
                    {outcomeLabel(m.actual_outcome, m)}
                  </span>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "#FF5D6A" }}>
                  {(actualOutcomeProb(m) * 100).toFixed(0)}% model
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Tournament records and trivia */}
      {(trivia?.facts ?? []).length > 0 && (
        <>
          <SectionHeader color="#1FD0C0" label="TOURNAMENT RECORDS AND TRIVIA" />
          <p style={{ fontSize: 12.5, color: "#645F77", marginBottom: 14 }}>
            Records and milestones set at FIFA World Cup 2026.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            {(trivia?.facts ?? []).map((f: TournamentTriviaFact, i: number) => (
              <TriviaCard key={`${f.category}-${i}`} fact={f} />
            ))}
          </div>
        </>
      )}

      {/* Top scorers + assists */}
      <SectionHeader color="#2BE38A" label="TOP PERFORMERS" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <PlayerLeaderboard
          title="Top Scorers"
          color="#2BE38A"
          players={scorers}
          statKey="goals"
          statLabel="G"
        />
        <PlayerLeaderboard
          title="Top Assists"
          color="#5B8CFF"
          players={assists}
          statKey="assists"
          statLabel="A"
        />
      </div>

      {/* Hydration breaks */}
      {hydration && hydration.total_breaks > 0 && (
        <>
          <SectionHeader
            color="#1FD0C0"
            label="HYDRATION BREAK IMPACT"
            right={
              <Link href="/stats/hydration" style={{ fontSize: 13.5, fontWeight: 600, color: "#2BE38A", textDecoration: "none" }}>
                Full analysis →
              </Link>
            }
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 10 }}>
            <StatCard label="Total breaks" value={hydration.total_breaks.toString()} sub={`${hydration.matches_with_breaks} matches`} />
            <StatCard label="Momentum shifts" value={hydration.shifts_count.toString()} sub={`${hydration.shifts_pct.toFixed(0)}% of breaks`} highlight={hydration.shifts_pct > 30} />
            <StatCard label="Goals within 5 min" value={hydration.goal_after_count.toString()} sub={`${hydration.goal_after_pct.toFixed(0)}% of breaks`} />
            <StatCard label="Home benefited" value={hydration.home_benefit_count.toString()} sub="when shift occurred" />
            <StatCard label="Away benefited" value={hydration.away_benefit_count.toString()} sub="when shift occurred" />
          </div>
        </>
      )}
    </div>
  );
}
