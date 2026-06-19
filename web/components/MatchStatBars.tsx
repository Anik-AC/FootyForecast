import type { MatchStats } from "@/lib/types";

interface Props {
  stats: MatchStats[];
  homeTeam: string;
  awayTeam: string;
}

interface StatRow {
  label: string;
  key: keyof MatchStats;
  format?: (v: number) => string;
}

const ROWS: StatRow[] = [
  { label: "Possession", key: "possession_pct", format: (v) => `${v.toFixed(0)}%` },
  { label: "xG", key: "expected_goals", format: (v) => v.toFixed(2) },
  { label: "Shots", key: "total_shots" },
  { label: "Shots on Target", key: "shots_on_target" },
  { label: "Big Chances", key: "big_chances" },
  { label: "GK Saves", key: "goalkeeper_saves" },
  { label: "Corners", key: "corner_kicks" },
  { label: "Passes", key: "passes_total" },
  { label: "Pass Acc.", key: "passes_accurate" },
  { label: "Tackles", key: "tackles" },
  { label: "Fouls", key: "fouls" },
  { label: "Yellow Cards", key: "yellow_cards" },
  { label: "Red Cards", key: "red_cards" },
  { label: "Offsides", key: "offsides" },
];

function StatBar({
  label,
  homeVal,
  awayVal,
  format,
}: {
  label: string;
  homeVal: number;
  awayVal: number;
  format?: (v: number) => string;
}) {
  const total = homeVal + awayVal;
  const homePct = total > 0 ? (homeVal / total) * 100 : 50;
  const fmt = format ?? ((v: number) => String(v));

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2 text-sm">
      <div className="text-right font-mono text-slate-200">{fmt(homeVal)}</div>
      <div
        className="h-2 rounded-l-full bg-emerald-600"
        style={{ width: `${homePct}px`, maxWidth: "80px", minWidth: "2px" }}
      />
      <div className="text-center text-xs text-slate-500 whitespace-nowrap px-1">{label}</div>
      <div
        className="h-2 rounded-r-full bg-blue-600"
        style={{ width: `${100 - homePct}px`, maxWidth: "80px", minWidth: "2px" }}
      />
      <div className="font-mono text-slate-200">{fmt(awayVal)}</div>
    </div>
  );
}

export default function MatchStatBars({ stats, homeTeam, awayTeam }: Props) {
  const home = stats.find((s) => s.is_home);
  const away = stats.find((s) => !s.is_home);
  if (!home && !away) return null;

  const rows = ROWS.filter((r) => {
    const hv = home?.[r.key];
    const av = away?.[r.key];
    return hv != null || av != null;
  });

  if (!rows.length) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Match Statistics
      </h2>
      <div className="flex justify-between text-xs text-slate-500 mb-3">
        <span className="text-emerald-400 font-medium">{homeTeam}</span>
        <span className="text-blue-400 font-medium">{awayTeam}</span>
      </div>
      <div className="space-y-2">
        {rows.map((row) => {
          const hv = (home?.[row.key] as number | undefined) ?? 0;
          const av = (away?.[row.key] as number | undefined) ?? 0;
          return (
            <StatBar
              key={row.key}
              label={row.label}
              homeVal={hv}
              awayVal={av}
              format={row.format}
            />
          );
        })}
      </div>
    </div>
  );
}
