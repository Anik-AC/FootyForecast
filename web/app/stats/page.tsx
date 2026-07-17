import { getCalibration, getTopScorers, getTopAssists, getHydrationAnalysis, getTournamentTrivia } from "@/lib/api";
import type { GradedMatch, TopScorer, TournamentTriviaFact, CalibrationSummary } from "@/lib/types";
import Link from "next/link";

const MONO = "'JetBrains Mono',monospace";

// Parse stage from match ID (e.g. WC2026-GRP-A-01 → group, WC2026-R32-537418 → round_of_32)
function stageFromId(id: string): string {
  if (id.includes("-GRP-")) return "group";
  if (id.includes("-R32-")) return "round_of_32";
  if (id.includes("-R16-")) return "round_of_16";
  if (id.includes("-QF-"))  return "quarter_final";
  if (id.includes("-SF-"))  return "semi_final";
  if (id.includes("-3RD-")) return "third_place";
  if (id.includes("-FIN-")) return "final";
  return "unknown";
}

const STAGE_LABEL: Record<string, string> = {
  group:        "Group Stage",
  round_of_32:  "Round of 32",
  round_of_16:  "Round of 16",
  quarter_final:"Quarter-Final",
  semi_final:   "Semi-Final",
  third_place:  "3rd Place",
  final:        "Final",
};

const STAGE_ORDER: Record<string, number> = {
  group: 1, round_of_32: 2, round_of_16: 3,
  quarter_final: 4, semi_final: 5, third_place: 6, final: 7,
};

function isCorrect(m: GradedMatch): boolean {
  const p = m.model_probabilities;
  const top =
    p.home_win >= p.draw && p.home_win >= p.away_win ? "home_win" :
    p.away_win > p.home_win && p.away_win > p.draw   ? "away_win" : "draw";
  return top === m.actual_outcome;
}

function isUpset(m: GradedMatch): boolean {
  const prob =
    m.actual_outcome === "home_win" ? m.model_probabilities.home_win :
    m.actual_outcome === "away_win" ? m.model_probabilities.away_win :
    m.model_probabilities.draw;
  return prob < 0.3;
}

function actualOutcomeProb(m: GradedMatch): number {
  return m.actual_outcome === "home_win" ? m.model_probabilities.home_win :
         m.actual_outcome === "away_win" ? m.model_probabilities.away_win :
         m.model_probabilities.draw;
}

function outcomeLabel(outcome: string, m: GradedMatch): string {
  if (outcome === "home_win") return `${m.home_team.name} won`;
  if (outcome === "away_win") return `${m.away_team.name} won`;
  return "Draw";
}

function predictedLabel(m: GradedMatch): { label: string; color: string } {
  const p = m.model_probabilities;
  if (p.home_win >= p.draw && p.home_win >= p.away_win)
    return { label: `${m.home_team.id} (${(p.home_win * 100).toFixed(0)}%)`, color: "#2BE38A" };
  if (p.away_win > p.home_win && p.away_win > p.draw)
    return { label: `${m.away_team.id} (${(p.away_win * 100).toFixed(0)}%)`, color: "#5B8CFF" };
  return { label: `Draw (${(p.draw * 100).toFixed(0)}%)`, color: "#FFC23D" };
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

function StatCard({ label, value, sub, highlight = false, color }: {
  label: string; value: string; sub?: string; highlight?: boolean; color?: string;
}) {
  return (
    <div style={{
      background: "#15131F",
      border: `1px solid ${highlight ? "rgba(43,227,138,0.25)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 14,
      padding: "18px 16px",
      textAlign: "center",
    }}>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: color ?? (highlight ? "#2BE38A" : "#F2F1F7") }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#645F77", marginTop: 5 }}>{label}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 11, color: "#4A4560", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function AccuracyHero({ graded, correct, calibration }: {
  graded: GradedMatch[];
  correct: GradedMatch[];
  calibration: CalibrationSummary;
}) {
  const accuracy = graded.length > 0 ? (correct.length / graded.length) * 100 : 0;
  const oosGraded = graded.filter((m) => !m.is_retroactive);
  const oosCorrect = oosGraded.filter(isCorrect);
  const oosAcc = oosGraded.length > 0 ? (oosCorrect.length / oosGraded.length) * 100 : 0;

  // Pull first market source for comparison if available
  const mktSrc = calibration.market_mean_log_loss
    ? Object.keys(calibration.market_mean_log_loss)[0]
    : null;
  const mktLL  = mktSrc ? calibration.market_mean_log_loss![mktSrc] : null;
  const mktBS  = mktSrc ? calibration.market_mean_brier![mktSrc]    : null;

  const cols = mktSrc ? 5 : 4;

  return (
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(43,227,138,0.15)",
      borderRadius: 20,
      overflow: "hidden",
    }}>
      {/* Hero banner */}
      <div style={{
        background: "linear-gradient(105deg,rgba(43,227,138,0.12) 0%,rgba(91,140,255,0.08) 100%)",
        padding: "28px 32px 24px",
        display: "flex",
        alignItems: "center",
        gap: 32,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 60, fontWeight: 900, color: "#2BE38A", lineHeight: 1, letterSpacing: "-0.04em" }}>
            {Math.round(accuracy)}%
          </div>
          <div style={{ fontSize: 13, color: "#9E99B0", marginTop: 6 }}>
            correct predictions · {correct.length} of {graded.length} matches
          </div>
        </div>
        <div style={{ width: 1, height: 64, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: MONO, fontSize: 13, color: "#F2F1F7" }}>
            <span style={{ color: "#645F77", marginRight: 8 }}>OOS accuracy</span>
            <span style={{ color: oosGraded.length > 0 ? "#2BE38A" : "#4A4560", fontWeight: 700 }}>
              {oosGraded.length > 0 ? `${Math.round(oosAcc)}%` : "—"}
            </span>
            {oosGraded.length > 0 && (
              <span style={{ color: "#4A4560", marginLeft: 6, fontSize: 11 }}>
                ({oosCorrect.length}/{oosGraded.length})
              </span>
            )}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: "#F2F1F7" }}>
            <span style={{ color: "#645F77", marginRight: 8 }}>Log loss (OOS)</span>
            <span style={{ color: "#F2F1F7", fontWeight: 700 }}>
              {oosGraded.length > 0 ? calibration.oos_mean_log_loss.toFixed(3) : "—"}
            </span>
            {mktLL != null && (
              <span style={{ color: calibration.oos_mean_log_loss < mktLL ? "#2BE38A" : "#FF5D6A", marginLeft: 8, fontSize: 11 }}>
                vs mkt {mktLL.toFixed(3)}
              </span>
            )}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: "#F2F1F7" }}>
            <span style={{ color: "#645F77", marginRight: 8 }}>Brier score (OOS)</span>
            <span style={{ color: "#F2F1F7", fontWeight: 700 }}>
              {oosGraded.length > 0 ? calibration.oos_mean_brier.toFixed(3) : "—"}
            </span>
            {mktBS != null && (
              <span style={{ color: calibration.oos_mean_brier < mktBS ? "#2BE38A" : "#FF5D6A", marginLeft: 8, fontSize: 11 }}>
                vs mkt {mktBS.toFixed(3)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 0 }}>
        {[
          { label: "Total graded", value: graded.length.toString(), sub: "all matches" },
          { label: "OOS graded",   value: oosGraded.length.toString(), sub: "genuine pre-match" },
          { label: "Mean log loss", value: calibration.model_mean_log_loss.toFixed(3), sub: "all incl. retro" },
          { label: "Mean Brier",    value: calibration.model_mean_brier.toFixed(3),    sub: "lower = better" },
          ...(mktSrc ? [{
            label: `Market LL (${mktSrc})`,
            value: mktLL!.toFixed(3),
            sub: calibration.oos_mean_log_loss < mktLL! ? "model beats market" : "market beats model",
          }] : []),
        ].map((item, i) => (
          <div key={i} style={{
            padding: "16px 20px",
            borderRight: i < cols - 1 ? "1px solid rgba(255,255,255,0.05)" : undefined,
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}>
            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: "#F2F1F7" }}>{item.value}</div>
            <div style={{ fontSize: 11, color: "#645F77", marginTop: 4 }}>{item.label}</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#4A4560", marginTop: 2 }}>{item.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageBreakdown({ graded }: { graded: GradedMatch[] }) {
  const byStage = new Map<string, GradedMatch[]>();
  for (const m of graded) {
    const s = stageFromId(m.match_id);
    if (!byStage.has(s)) byStage.set(s, []);
    byStage.get(s)!.push(m);
  }

  const stages = [...byStage.entries()].sort(([a], [b]) => (STAGE_ORDER[a] ?? 9) - (STAGE_ORDER[b] ?? 9));
  if (stages.length === 0) return null;

  return (
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      overflow: "hidden",
      marginTop: 14,
    }}>
      <div style={{ background: "#15131F", padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#9E99B0" }}>
          BREAKDOWN BY STAGE
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {["STAGE", "PLAYED", "CORRECT", "ACCURACY", "AVG LL", "AVG BRIER"].map((h, i) => (
              <th key={h} style={{
                fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                color: "#645F77", padding: "8px 16px",
                textAlign: i === 0 ? "left" : "center",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stages.map(([stage, matches]) => {
            const correct = matches.filter(isCorrect).length;
            const acc = (correct / matches.length) * 100;
            const avgLL = matches.reduce((s, m) => s + m.model_log_loss, 0) / matches.length;
            const avgBS = matches.reduce((s, m) => s + m.model_brier_score, 0) / matches.length;
            return (
              <tr key={stage} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td style={{ padding: "10px 16px", fontSize: 13, color: "#C8C3D6", fontWeight: 600 }}>
                  {STAGE_LABEL[stage] ?? stage}
                </td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#9E99B0", padding: "10px 0" }}>
                  {matches.length}
                </td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#9E99B0", padding: "10px 0" }}>
                  {correct}
                </td>
                <td style={{ textAlign: "center", padding: "10px 0" }}>
                  <span style={{
                    fontFamily: MONO, fontSize: 13, fontWeight: 700,
                    color: acc >= 60 ? "#2BE38A" : acc >= 40 ? "#FFC23D" : "#FF5D6A",
                  }}>
                    {Math.round(acc)}%
                  </span>
                </td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#9E99B0", padding: "10px 0" }}>
                  {avgLL.toFixed(3)}
                </td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#9E99B0", padding: "10px 16px" }}>
                  {avgBS.toFixed(3)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PredictionRecord({ graded }: { graded: GradedMatch[] }) {
  const sorted = [...graded].sort(
    (a, b) => new Date(b.kickoff_utc).getTime() - new Date(a.kickoff_utc).getTime()
  );

  return (
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      overflow: "hidden",
    }}>
      <div style={{ background: "#15131F", padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#9E99B0" }}>
          FULL PREDICTION RECORD · {sorted.length} matches
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["DATE", "STAGE", "MATCH", "PREDICTED", "ACTUAL", "PROB", ""].map((h, i) => (
                <th key={i} style={{
                  fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                  color: "#645F77", padding: "8px 14px",
                  textAlign: i >= 5 ? "center" : "left",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => {
              const ok = isCorrect(m);
              const pred = predictedLabel(m);
              const actualProb = actualOutcomeProb(m);
              const stage = stageFromId(m.match_id);
              const dateStr = new Date(m.kickoff_utc).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
              return (
                <tr
                  key={`${m.match_id}-${i}`}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", transition: "background .1s" }}
                  className="ff-table-row"
                >
                  <td style={{ padding: "9px 14px", fontFamily: MONO, fontSize: 11, color: "#4A4560", whiteSpace: "nowrap" }}>
                    {dateStr}
                  </td>
                  <td style={{ padding: "9px 0", fontFamily: MONO, fontSize: 10, color: "#645F77", whiteSpace: "nowrap" }}>
                    {STAGE_LABEL[stage] ?? stage}
                  </td>
                  <td style={{ padding: "9px 14px", minWidth: 180 }}>
                    <Link href={`/matches/${m.match_id}`} style={{ textDecoration: "none" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#F2F1F7" }}>{m.home_team.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: "#3F3A52", margin: "0 6px" }}>vs</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#F2F1F7" }}>{m.away_team.name}</span>
                    </Link>
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: pred.color }}>{pred.label}</span>
                  </td>
                  <td style={{ padding: "9px 14px", fontSize: 12, color: "#9E99B0" }}>
                    {outcomeLabel(m.actual_outcome, m)}
                  </td>
                  <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 12, color: "#645F77", padding: "9px 0" }}>
                    {(actualProb * 100).toFixed(0)}%
                  </td>
                  <td style={{ textAlign: "center", padding: "9px 14px" }}>
                    <span style={{
                      fontFamily: MONO, fontSize: 12, fontWeight: 700,
                      color: ok ? "#2BE38A" : isUpset(m) ? "#FF5D6A" : "#FFC23D",
                    }}>
                      {ok ? "✓" : isUpset(m) ? "UPSET" : "✗"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TRIVIA_ICON_MAP: Record<string, { bg: string; color: string; path: string }> = {
  "🥇": { bg: "#2A200A", color: "#D4A017", path: "M12 2l1.8 3.6L18 6.5l-3 2.9.7 4.1L12 11.4l-3.7 2 .7-4.1L6 6.5l4.2-.9L12 2zM8 18h8v1.5a2.5 2.5 0 01-5 0H8V18z" },
  "🎯": { bg: "#0A2220", color: "#1FD0C0", path: "M12 22a10 10 0 110-20 10 10 0 010 20zm0-4a6 6 0 100-12 6 6 0 000 12zm0-4a2 2 0 110-4 2 2 0 010 4zm0-2h.01" },
  "⚽": { bg: "#0D1828", color: "#5B8CFF", path: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" },
  "🔥": { bg: "#2D1005", color: "#FF6B35", path: "M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5 0.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" },
  "📊": { bg: "#0A1020", color: "#5B8CFF", path: "M9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4zm2.5 2.1h-15V5h15v14.1zm0-16.1h-15C3.67 3 3 3.67 3 4.5v15C3 20.33 3.67 21 4.5 21h15c.83 0 1.5-.67 1.5-1.5v-15C21 3.67 20.33 3 19.5 3z" },
  "🏆": { bg: "#2A200A", color: "#D4A017", path: "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V18H9v2h6v-2h-2v-2.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.86 10.4 5 9.3 5 8zm14 0c0 1.3-.86 2.4-2 2.82V7h2v1z" },
  "🎇": { bg: "#1A0D28", color: "#A35CFF", path: "M12 3L14.09 8.26L20 9.27L16 13.14L16.99 19.05L12 16.5L7.01 19.05L8 13.14L4 9.27L9.91 8.26L12 3Z" },
  "🧤": { bg: "#0A2018", color: "#2BE38A", path: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" },
  "🎩": { bg: "#1A0D28", color: "#A35CFF", path: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4z" },
  "⚡": { bg: "#2A2005", color: "#FFC23D", path: "M7 2v11h3v9l7-12h-4l4-8z" },
  "🟥": { bg: "#2D0808", color: "#FF4040", path: "M6 3h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" },
};

function TriviaIcon({ icon }: { icon: string }) {
  const cfg = TRIVIA_ICON_MAP[icon];
  if (!cfg) return <div style={{ width: 46, height: 46, borderRadius: 12, background: "#15131F", marginBottom: 14 }} />;
  return (
    <div style={{ width: 46, height: 46, borderRadius: 12, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, flexShrink: 0 }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill={cfg.color}><path d={cfg.path} /></svg>
    </div>
  );
}

function TriviaCard({ fact }: { fact: TournamentTriviaFact }) {
  const inner = (
    <div style={{ background: "#120F1E", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "18px" }}>
      <TriviaIcon icon={fact.icon} />
      <div style={{ fontSize: 14.5, fontWeight: 700, color: "#EDEBF3", lineHeight: 1.35 }}>{fact.headline}</div>
      {fact.detail && <div style={{ fontSize: 12.5, color: "#7E7892", marginTop: 6 }}>{fact.detail}</div>}
      {fact.match_id && fact.home_team && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: "#4A4560", marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fact.home_team} vs {fact.away_team}
        </div>
      )}
    </div>
  );
  if (fact.match_id) return <Link href={`/matches/${fact.match_id}`} style={{ textDecoration: "none" }}>{inner}</Link>;
  return inner;
}

const TH: React.CSSProperties = {
  fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#645F77",
  paddingTop: 10, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.06)",
};

function PlayerLeaderboard({ title, color, players, statKey, statLabel }: {
  title: string; color: string; players: TopScorer[]; statKey: "goals" | "assists"; statLabel: string;
}) {
  return (
    <div>
      {players.length === 0 ? (
        <p style={{ color: "#645F77", fontSize: 14 }}>No data yet.</p>
      ) : (
        <div style={{ background: "#120F1E", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ background: "#15131F", padding: "11px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "#C8C3D6" }}>
              {title.toUpperCase()}
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...TH, textAlign: "left", paddingLeft: 18, width: 36 }}>#</th>
                <th style={{ ...TH, textAlign: "left" }}>PLAYER</th>
                <th style={{ ...TH, textAlign: "left", color: "#9E99B0" }}>TEAM</th>
                <th style={{ ...TH, textAlign: "center", paddingRight: 18, width: 40, color }}>{statLabel}</th>
              </tr>
            </thead>
            <tbody>
              {players.map((s, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ paddingLeft: 18, paddingTop: 11, paddingBottom: 11, fontFamily: MONO, fontSize: 12, color: "#4A4560" }}>{i + 1}</td>
                  <td style={{ paddingTop: 11, paddingBottom: 11, fontWeight: 600, fontSize: 14, color: "#F2F1F7" }}>{s.player_name}</td>
                  <td style={{ paddingTop: 11, paddingBottom: 11, fontSize: 13, color: "#7E7892" }}>
                    <Link href={`/teams/${s.team_id}`} style={{ color: "#9E99B0", textDecoration: "none" }}>{s.team_name}</Link>
                  </td>
                  <td style={{ textAlign: "center", paddingRight: 18, fontFamily: MONO, fontSize: 15, fontWeight: 800, color }}>{s[statKey]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard2({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "#15131F", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "18px 16px", textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: "#F2F1F7" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#645F77", marginTop: 5 }}>{label}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 11, color: "#4A4560", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default async function StatsPage() {
  const [calibration, scorers, assists, hydration, trivia] = await Promise.all([
    getCalibration(),
    getTopScorers(10),
    getTopAssists(10),
    getHydrationAnalysis(),
    getTournamentTrivia(),
  ]);

  const graded = calibration?.matches ?? [];
  const correct = graded.filter(isCorrect);
  const upsets = graded.filter(isUpset).sort((a, b) => actualOutcomeProb(a) - actualOutcomeProb(b));

  return (
    <div style={{ animation: "ff-up 0.4s ease both", paddingTop: 46 }}>
      <h1 style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.03em", margin: 0 }}>
        Tournament{" "}
        <span style={{ background: "linear-gradient(90deg,#2BE38A,#1FD0C0,#5B8CFF)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>Stats</span>
      </h1>
      <div style={{ color: "#9E99B0", fontSize: 15, marginTop: 10 }}>
        Model performance, prediction record, top performers, and tournament facts.
      </div>

      {/* MODEL PERFORMANCE */}
      <SectionHeader
        color="#A35CFF"
        label="MODEL PERFORMANCE"
        right={
          <Link href="/stats/models" style={{ fontSize: 13.5, fontWeight: 600, color: "#A35CFF", textDecoration: "none" }}>
            Compare all models →
          </Link>
        }
      />
      {!calibration || graded.length === 0 ? (
        <p style={{ color: "#645F77", fontSize: 14 }}>No graded matches yet. Run predictions to populate this section.</p>
      ) : (
        <>
          <AccuracyHero graded={graded} correct={correct} calibration={calibration} />
          <StageBreakdown graded={graded} />
        </>
      )}

      {/* PREDICTION RECORD */}
      {graded.length > 0 && (
        <>
          <SectionHeader color="#5B8CFF" label="PREDICTION RECORD" />
          <PredictionRecord graded={graded} />
        </>
      )}

      {/* UPSETS */}
      {upsets.length > 0 && (
        <>
          <SectionHeader color="#FFC23D" label="UPSETS AND SURPRISES" />
          <p style={{ fontSize: 12.5, color: "#645F77", marginBottom: 14 }}>
            Matches where the model gave less than 30% probability to the actual outcome.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upsets.map((m) => (
              <Link key={m.match_id} href={`/matches/${m.match_id}`} style={{ textDecoration: "none" }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "#120F1E", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 14, padding: "14px 18px",
                  transition: "border-color .15s",
                }} className="ff-result-card">
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#F2F1F7" }}>
                      {m.home_team.name} vs {m.away_team.name}
                    </span>
                    <span style={{ marginLeft: 10, fontSize: 13, color: "#7E7892" }}>
                      {outcomeLabel(m.actual_outcome, m)}
                    </span>
                    <span style={{ marginLeft: 8, fontFamily: MONO, fontSize: 10, color: "#645F77" }}>
                      {STAGE_LABEL[stageFromId(m.match_id)] ?? ""}
                    </span>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "#FF5D6A" }}>
                    {(actualOutcomeProb(m) * 100).toFixed(0)}% model
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* TOURNAMENT RECORDS */}
      {(trivia?.facts ?? []).length > 0 && (
        <>
          <SectionHeader color="#1FD0C0" label="TOURNAMENT RECORDS AND TRIVIA" />
          <p style={{ fontSize: 12.5, color: "#645F77", marginBottom: 14 }}>
            Records and milestones set at FIFA World Cup 2026.
          </p>
          <div className="ff-grid-4col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            {(trivia?.facts ?? []).map((f: TournamentTriviaFact, i: number) => (
              <TriviaCard key={`${f.category}-${i}`} fact={f} />
            ))}
          </div>
        </>
      )}

      {/* TOP PERFORMERS */}
      <SectionHeader color="#2BE38A" label="TOP PERFORMERS" />
      <div className="ff-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <PlayerLeaderboard title="Top Scorers" color="#2BE38A" players={scorers} statKey="goals" statLabel="G" />
        <PlayerLeaderboard title="Top Assists" color="#5B8CFF" players={assists} statKey="assists" statLabel="A" />
      </div>

      {/* HYDRATION BREAKS */}
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
          <div className="ff-grid-5col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 10 }}>
            <StatCard2 label="Total breaks" value={hydration.total_breaks.toString()} sub={`${hydration.matches_with_breaks} matches`} />
            <StatCard2 label="Momentum shifts" value={hydration.shifts_count.toString()} sub={`${hydration.shifts_pct.toFixed(0)}% of breaks`} />
            <StatCard2 label="Goals within 5 min" value={hydration.goal_after_count.toString()} sub={`${hydration.goal_after_pct.toFixed(0)}% of breaks`} />
            <StatCard2 label="Home benefited" value={hydration.home_benefit_count.toString()} sub="when shift occurred" />
            <StatCard2 label="Away benefited" value={hydration.away_benefit_count.toString()} sub="when shift occurred" />
          </div>
        </>
      )}
    </div>
  );
}
