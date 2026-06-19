import type { TotalsProbabilities } from "@/lib/types";

interface Props {
  totals: TotalsProbabilities;
  showBTTS?: boolean;
}

const ITEMS = [
  { key: "over_1_5" as keyof TotalsProbabilities, label: "Over 1.5 goals" },
  { key: "over_2_5" as keyof TotalsProbabilities, label: "Over 2.5 goals" },
  { key: "over_3_5" as keyof TotalsProbabilities, label: "Over 3.5 goals" },
];

function barColor(prob: number): string {
  if (prob >= 0.65) return "bg-emerald-500";
  if (prob >= 0.40) return "bg-emerald-700";
  return "bg-slate-600";
}

export default function OverUnderBars({ totals, showBTTS = false }: Props) {
  const items = showBTTS
    ? [...ITEMS, { key: "btts" as keyof TotalsProbabilities, label: "Both teams to score" }]
    : ITEMS;

  return (
    <div className="space-y-3">
      {items.map(({ key, label }) => {
        const prob = totals[key] as number;
        const pct = (prob * 100).toFixed(1);

        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-slate-300">{label}</span>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">{pct}%</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor(prob)}`}
                style={{ width: `${Math.min(prob * 100, 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
