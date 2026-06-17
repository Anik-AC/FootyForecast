import type { OutcomeProbabilities } from "@/lib/types";

interface Props {
  probs: OutcomeProbabilities;
  homeLabel: string;
  awayLabel: string;
}

export function ProbabilityBar({ probs, homeLabel, awayLabel }: Props) {
  const hw = (probs.home_win * 100).toFixed(0);
  const dw = (probs.draw * 100).toFixed(0);
  const aw = (probs.away_win * 100).toFixed(0);

  return (
    <div className="mt-3 space-y-1.5">
      {/* Stacked bar */}
      <div className="flex rounded-full overflow-hidden h-2 bg-slate-800">
        <div
          className="bg-emerald-500 transition-all"
          style={{ width: `${probs.home_win * 100}%` }}
        />
        <div
          className="bg-slate-500 transition-all"
          style={{ width: `${probs.draw * 100}%` }}
        />
        <div
          className="bg-rose-500 transition-all"
          style={{ width: `${probs.away_win * 100}%` }}
        />
      </div>
      {/* Labels */}
      <div className="flex justify-between text-xs text-slate-400">
        <span>
          <span className="text-emerald-400 font-medium">{hw}%</span>{" "}
          {homeLabel}
        </span>
        <span className="text-slate-500">{dw}% draw</span>
        <span>
          {awayLabel}{" "}
          <span className="text-rose-400 font-medium">{aw}%</span>
        </span>
      </div>
    </div>
  );
}
