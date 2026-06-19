import type { MatchStats } from "@/lib/types";

const MONO = "'JetBrains Mono',monospace";

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
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 80px auto 80px 1fr",
      alignItems: "center",
      gap: 8,
    }}>
      <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 13, color: "#C8C3D6", fontWeight: 600 }}>
        {fmt(homeVal)}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{
          height: 6,
          borderRadius: "4px 0 0 4px",
          background: "#2BE38A",
          width: `${homePct}%`,
          minWidth: 2,
          maxWidth: 80,
        }} />
      </div>
      <div style={{ textAlign: "center", fontFamily: MONO, fontSize: 11, color: "#645F77", whiteSpace: "nowrap" as const, letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <div style={{
          height: 6,
          borderRadius: "0 4px 4px 0",
          background: "#5B8CFF",
          width: `${100 - homePct}%`,
          minWidth: 2,
          maxWidth: 80,
        }} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: "#C8C3D6", fontWeight: 600 }}>
        {fmt(awayVal)}
      </div>
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
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      padding: "20px 24px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18, fontSize: 13, fontWeight: 700 }}>
        <span style={{ color: "#2BE38A" }}>{homeTeam}</span>
        <span style={{ color: "#5B8CFF" }}>{awayTeam}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
