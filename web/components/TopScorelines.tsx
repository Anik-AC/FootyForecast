import type { ScorelineProbability } from "@/lib/types";

interface Props {
  grid: ScorelineProbability[];
  homeTeam: string;
  awayTeam: string;
  topN?: number;
}

function outcome(home: number, away: number): "home" | "draw" | "away" {
  if (home > away) return "home";
  if (home === away) return "draw";
  return "away";
}

function barColor(o: "home" | "draw" | "away"): string {
  if (o === "home") return "bg-emerald-500";
  if (o === "draw") return "bg-amber-500";
  return "bg-rose-500";
}

export default function TopScorelines({ grid, homeTeam, awayTeam, topN = 5 }: Props) {
  const top = [...grid]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, topN);

  if (top.length === 0) return null;

  const maxProb = top[0].probability;

  return (
    <div className="space-y-3">
      {top.map((cell, i) => {
        const o = outcome(cell.home_goals, cell.away_goals);
        const pct = (cell.probability * 100).toFixed(1);
        const barW = maxProb > 0 ? (cell.probability / maxProb) * 100 : 0;

        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-slate-100">
                {homeTeam} {cell.home_goals} &ndash; {cell.away_goals} {awayTeam}
              </span>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">{pct}%</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor(o)}`}
                style={{ width: `${barW}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
