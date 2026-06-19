"use client";

import type { MatchGrading, OutcomeProbabilities, Team } from "@/lib/types";

const MONO = "'JetBrains Mono',monospace";

interface Props {
  grading: MatchGrading;
  modelProbs: OutcomeProbabilities;
  homeTeam: Team;
  awayTeam: Team;
  tournamentMeanLogLoss?: number;
}

function outcomeLabel(outcome: string, homeTeam: Team, awayTeam: Team): string {
  if (outcome === "home_win") return `${homeTeam.name} win`;
  if (outcome === "away_win") return `${awayTeam.name} win`;
  return "Draw";
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function PostMatchScorecard({
  grading,
  modelProbs,
  homeTeam,
  awayTeam,
  tournamentMeanLogLoss,
}: Props) {
  const outcome = grading.actual_outcome;
  const modelProb =
    outcome === "home_win"
      ? modelProbs.home_win
      : outcome === "away_win"
      ? modelProbs.away_win
      : modelProbs.draw;

  const correct = modelProb >= 0.5;
  const outcomeText = outcomeLabel(outcome, homeTeam, awayTeam);

  const relativeSurprise =
    tournamentMeanLogLoss != null
      ? grading.model_log_loss - tournamentMeanLogLoss
      : null;

  return (
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 18,
    }}>
      {/* Outcome verdict */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <span style={{ fontSize: 24, color: correct ? "#2BE38A" : "#FF5D6A", fontWeight: 800, lineHeight: 1 }}>
          {correct ? "✓" : "✗"}
        </span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#F2F1F7" }}>
            {outcomeText} ({pct(modelProb)} pre-match)
          </div>
          <div style={{ fontSize: 13.5, color: "#9E99B0", marginTop: 4 }}>
            {correct
              ? "The model's most likely outcome was correct."
              : `The model's favoured outcome was wrong. Actual: ${outcomeText}.`}
          </div>
        </div>
      </div>

      {/* Scoring metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ background: "#1D1A2A", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#645F77", marginBottom: 6 }}>Log Loss</div>
          <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: "#F2F1F7" }}>
            {grading.model_log_loss.toFixed(3)}
          </div>
          {relativeSurprise != null && (
            <div style={{ fontFamily: MONO, fontSize: 12, marginTop: 5, color: relativeSurprise > 0 ? "#FF5D6A" : "#2BE38A" }}>
              {relativeSurprise > 0 ? "+" : ""}{relativeSurprise.toFixed(3)} vs avg
            </div>
          )}
        </div>
        <div style={{ background: "#1D1A2A", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#645F77", marginBottom: 6 }}>Brier Score</div>
          <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: "#F2F1F7" }}>
            {grading.model_brier_score.toFixed(3)}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#4A4560", marginTop: 5 }}>lower = better</div>
        </div>
      </div>

      {/* Market comparison */}
      {grading.market_log_loss && Object.keys(grading.market_log_loss).length > 0 && (
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: "#645F77", marginBottom: 10, letterSpacing: "0.06em" }}>VS MARKETS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(grading.market_log_loss).map(([src, ll]) => {
              const modelBetter = grading.model_log_loss < ll;
              return (
                <div key={src} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13.5 }}>
                  <span style={{ color: "#9E99B0", textTransform: "capitalize" as const }}>{src}</span>
                  <span style={{ fontFamily: MONO, color: modelBetter ? "#2BE38A" : "#FF5D6A", fontWeight: 600 }}>
                    {modelBetter ? "Model better" : "Market better"} ({ll.toFixed(3)})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
