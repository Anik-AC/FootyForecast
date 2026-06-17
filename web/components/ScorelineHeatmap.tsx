"use client";

import type { ScorelineProbability } from "@/lib/types";

interface ScorelineHeatmapProps {
  grid: ScorelineProbability[];
  homeTeam: string;
  awayTeam: string;
}

// Determine whether a scoreline is a home win, draw, or away win.
function outcome(home: number, away: number): "home" | "draw" | "away" {
  if (home > away) return "home";
  if (home === away) return "draw";
  return "away";
}

// Produce a Tailwind bg class based on outcome and intensity (0-1).
// We map intensity into 5 discrete steps for Tailwind's static class system.
function cellColor(o: "home" | "draw" | "away", intensity: number): string {
  const step = intensity < 0.2 ? 0 : intensity < 0.4 ? 1 : intensity < 0.6 ? 2 : intensity < 0.8 ? 3 : 4;
  const home = ["bg-emerald-950", "bg-emerald-900", "bg-emerald-700", "bg-emerald-600", "bg-emerald-500"];
  const draw = ["bg-amber-950", "bg-amber-900", "bg-amber-700", "bg-amber-600", "bg-amber-500"];
  const away = ["bg-rose-950", "bg-rose-900", "bg-rose-700", "bg-rose-600", "bg-rose-500"];
  return o === "home" ? home[step] : o === "draw" ? draw[step] : away[step];
}

export function ScorelineHeatmap({ grid, homeTeam, awayTeam }: ScorelineHeatmapProps) {
  const MAX_GOALS = 5;
  const goals = Array.from({ length: MAX_GOALS + 1 }, (_, i) => i); // 0..5

  // Build a lookup map: "[home]-[away]" -> probability
  const lookup = new Map<string, number>();
  let maxProb = 0;
  for (const cell of grid) {
    if (cell.home_goals <= MAX_GOALS && cell.away_goals <= MAX_GOALS) {
      lookup.set(`${cell.home_goals}-${cell.away_goals}`, cell.probability);
      if (cell.probability > maxProb) maxProb = cell.probability;
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-300">{homeTeam} goals (rows)</span>
        <span className="text-sm font-semibold text-slate-300">{awayTeam} goals (cols)</span>
      </div>

      {/* Column headers: away goals */}
      <div className="flex gap-1 mb-1 pl-8">
        {goals.map((g) => (
          <div key={g} className="w-10 text-center text-xs text-slate-500">{g}</div>
        ))}
      </div>

      {/* Rows: home goals (descending so 0 is at the bottom) */}
      {[...goals].reverse().map((homeG) => (
        <div key={homeG} className="flex items-center gap-1 mb-1">
          {/* Row header: home goals */}
          <div className="w-7 text-right text-xs text-slate-500 pr-1">{homeG}</div>
          {goals.map((awayG) => {
            const prob = lookup.get(`${homeG}-${awayG}`) ?? 0;
            const intensity = maxProb > 0 ? prob / maxProb : 0;
            const o = outcome(homeG, awayG);
            const bg = prob > 0 ? cellColor(o, intensity) : "bg-slate-800";
            const pct = (prob * 100).toFixed(1);
            return (
              <div
                key={awayG}
                title={`${homeG}-${awayG}: ${pct}%`}
                className={`w-10 h-10 rounded flex items-center justify-center text-xs font-mono ${bg} transition-colors`}
              >
                {prob > 0.005 ? `${pct}` : ""}
              </div>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="flex gap-4 mt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-emerald-600" />
          {homeTeam} win
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-amber-600" />
          Draw
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-rose-600" />
          {awayTeam} win
        </span>
      </div>
    </div>
  );
}
