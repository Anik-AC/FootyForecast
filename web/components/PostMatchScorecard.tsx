"use client";

import type { MatchGrading, OutcomeProbabilities, Team } from "@/lib/types";

interface Props {
  grading: MatchGrading;
  modelProbs: OutcomeProbabilities;
  homeTeam: Team;
  awayTeam: Team;
  tournamentMeanLogLoss?: number;
}

function outcomeLabel(
  outcome: string,
  homeTeam: Team,
  awayTeam: Team
): string {
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

  // How surprising was this result? Compare this match's log loss to the
  // tournament average. Higher log loss = more surprised the model was.
  const relativeSurprise =
    tournamentMeanLogLoss != null
      ? grading.model_log_loss - tournamentMeanLogLoss
      : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
        Model Verdict
      </h2>

      {/* Outcome verdict */}
      <div className="flex items-center gap-3">
        <span
          className={`text-2xl ${correct ? "text-emerald-400" : "text-red-400"}`}
        >
          {correct ? "✓" : "✗"}
        </span>
        <div>
          <div className="text-slate-100 font-medium">
            {outcomeText} ({pct(modelProb)} pre-match)
          </div>
          <div className="text-sm text-slate-500">
            {correct
              ? "The model's most likely outcome was correct."
              : `The model's favoured outcome was wrong. Actual: ${outcomeText}.`}
          </div>
        </div>
      </div>

      {/* Scoring metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-950 rounded-lg p-3 text-center">
          <div className="text-xs text-slate-500 mb-1">Log Loss</div>
          <div className="text-xl font-bold tabular-nums text-slate-100">
            {grading.model_log_loss.toFixed(3)}
          </div>
          {relativeSurprise != null && (
            <div
              className={`text-xs mt-1 ${
                relativeSurprise > 0 ? "text-red-400" : "text-emerald-400"
              }`}
            >
              {relativeSurprise > 0 ? "+" : ""}
              {relativeSurprise.toFixed(3)} vs avg
            </div>
          )}
        </div>
        <div className="bg-slate-950 rounded-lg p-3 text-center">
          <div className="text-xs text-slate-500 mb-1">Brier Score</div>
          <div className="text-xl font-bold tabular-nums text-slate-100">
            {grading.model_brier_score.toFixed(3)}
          </div>
          <div className="text-xs text-slate-600 mt-1">lower = better</div>
        </div>
      </div>

      {/* Market comparison if available */}
      {grading.market_log_loss && Object.keys(grading.market_log_loss).length > 0 && (
        <div>
          <div className="text-xs text-slate-500 mb-2">vs markets</div>
          <div className="space-y-1">
            {Object.entries(grading.market_log_loss).map(([src, ll]) => {
              const modelBetter = grading.model_log_loss < ll;
              return (
                <div key={src} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 capitalize">{src}</span>
                  <span
                    className={`font-mono ${
                      modelBetter ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
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
