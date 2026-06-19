"use client";

import type { MatchPrediction, MatchScorerPredictions } from "@/lib/types";

interface Props {
  prediction: MatchPrediction;
  scorers: MatchScorerPredictions | null;
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function Row({ label, verdict, value }: { label: string; verdict: string; value: string }) {
  return (
    <div className="py-4 border-b border-slate-800 last:border-0 first:pt-0">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
        {label}
      </p>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-xl font-bold text-slate-100 leading-tight">{verdict}</span>
        <span className="text-xl font-bold text-emerald-400 tabular-nums shrink-0">{value}</span>
      </div>
    </div>
  );
}

export default function ForecastCard({ prediction, scorers }: Props) {
  const { home_team, away_team, outcome_probabilities: probs, scoreline_grid, totals } = prediction;

  // 1. Most likely outcome
  const outcomes = [
    { label: `${home_team.name} win`, prob: probs.home_win },
    { label: "Draw", prob: probs.draw },
    { label: `${away_team.name} win`, prob: probs.away_win },
  ];
  const topOutcome = outcomes.reduce((a, b) => (b.prob > a.prob ? b : a));

  // 2. Most likely scoreline
  const topLine = scoreline_grid.length
    ? [...scoreline_grid].sort((a, b) => b.probability - a.probability)[0]
    : null;
  const scorelineVerdict = topLine
    ? `${home_team.name} ${topLine.home_goals}–${topLine.away_goals} ${away_team.name}`
    : null;

  // 3. Goals call: pick the highest-confidence market across all over/under/btts options
  const goalOptions = [
    { label: "Over 1.5 goals",       prob: totals.over_1_5 },
    { label: "Under 1.5 goals",      prob: 1 - totals.over_1_5 },
    { label: "Over 2.5 goals",       prob: totals.over_2_5 },
    { label: "Under 2.5 goals",      prob: 1 - totals.over_2_5 },
    { label: "Over 3.5 goals",       prob: totals.over_3_5 },
    { label: "Under 3.5 goals",      prob: 1 - totals.over_3_5 },
    { label: "Both teams to score",  prob: totals.btts },
    { label: "Clean sheet likely",   prob: 1 - totals.btts },
  ];
  const topGoals = goalOptions.reduce((a, b) => (b.prob > a.prob ? b : a));

  // 4. Most likely scorer across both teams
  const allPlayers = [
    ...(scorers?.home_team.players ?? []),
    ...(scorers?.away_team.players ?? []),
  ].sort((a, b) => b.anytime_scorer_prob - a.anytime_scorer_prob);
  const topScorer = allPlayers[0] ?? null;

  return (
    <div className="bg-slate-950 border border-slate-700/60 rounded-xl p-6">
      {/* Header */}
      <h2 className="text-base font-extrabold uppercase tracking-widest mb-4">
        <span className="text-slate-200">The </span>
        <span className="text-emerald-400">Forecast</span>
      </h2>

      <Row
        label="Most Likely Result"
        verdict={topOutcome.label}
        value={pct(topOutcome.prob)}
      />

      {scorelineVerdict && topLine && (
        <Row
          label="Most Likely Scoreline"
          verdict={scorelineVerdict}
          value={pct(topLine.probability)}
        />
      )}

      <Row
        label="Goals Call"
        verdict={topGoals.label}
        value={pct(topGoals.prob)}
      />

      {topScorer && (
        <Row
          label="Most Likely Scorer"
          verdict={topScorer.player_name}
          value={pct(topScorer.anytime_scorer_prob)}
        />
      )}
    </div>
  );
}
