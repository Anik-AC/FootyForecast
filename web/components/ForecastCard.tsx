"use client";

import type { MatchPrediction, MatchScorerPredictions } from "@/lib/types";

const MONO = "'JetBrains Mono',monospace";

interface Props {
  prediction: MatchPrediction;
  scorers: MatchScorerPredictions | null;
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function Row({ label, verdict, value }: { label: string; verdict: string; value: string }) {
  return (
    <div style={{
      padding: "16px 0",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: "#645F77", letterSpacing: "0.1em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 19, fontWeight: 800, color: "#F2F1F7", lineHeight: 1.2 }}>{verdict}</span>
        <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 800, color: "#2BE38A", flexShrink: 0 }}>{value}</span>
      </div>
    </div>
  );
}

export default function ForecastCard({ prediction, scorers }: Props) {
  const { home_team, away_team, outcome_probabilities: probs, scoreline_grid, totals } = prediction;

  const outcomes = [
    { label: `${home_team.name} win`, prob: probs.home_win },
    { label: "Draw", prob: probs.draw },
    { label: `${away_team.name} win`, prob: probs.away_win },
  ];
  const topOutcome = outcomes.reduce((a, b) => (b.prob > a.prob ? b : a));

  const topLine = scoreline_grid.length
    ? [...scoreline_grid].sort((a, b) => b.probability - a.probability)[0]
    : null;
  const scorelineVerdict = topLine
    ? `${home_team.name} ${topLine.home_goals}–${topLine.away_goals} ${away_team.name}`
    : null;

  const goalOptions = [
    { label: "Over 1.5 goals",      prob: totals.over_1_5 },
    { label: "Under 1.5 goals",     prob: 1 - totals.over_1_5 },
    { label: "Over 2.5 goals",      prob: totals.over_2_5 },
    { label: "Under 2.5 goals",     prob: 1 - totals.over_2_5 },
    { label: "Over 3.5 goals",      prob: totals.over_3_5 },
    { label: "Under 3.5 goals",     prob: 1 - totals.over_3_5 },
    { label: "Both teams to score", prob: totals.btts },
    { label: "Clean sheet likely",  prob: 1 - totals.btts },
  ];
  const topGoals = goalOptions.reduce((a, b) => (b.prob > a.prob ? b : a));

  const allPlayers = [
    ...(scorers?.home_team.players ?? []),
    ...(scorers?.away_team.players ?? []),
  ].sort((a, b) => b.anytime_scorer_prob - a.anytime_scorer_prob);
  const topScorer = allPlayers[0] ?? null;

  return (
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(43,227,138,0.18)",
      borderRadius: 16,
      padding: "20px 24px",
    }}>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", marginBottom: 4 }}>
        <span style={{ color: "#9E99B0" }}>THE </span>
        <span style={{ color: "#2BE38A" }}>FORECAST</span>
      </div>

      <Row label="MOST LIKELY RESULT" verdict={topOutcome.label} value={pct(topOutcome.prob)} />
      {scorelineVerdict && topLine && (
        <Row label="MOST LIKELY SCORELINE" verdict={scorelineVerdict} value={pct(topLine.probability)} />
      )}
      <Row label="GOALS CALL" verdict={topGoals.label} value={pct(topGoals.prob)} />
      {topScorer && (
        <Row label="MOST LIKELY SCORER" verdict={topScorer.player_name} value={pct(topScorer.anytime_scorer_prob)} />
      )}
    </div>
  );
}
