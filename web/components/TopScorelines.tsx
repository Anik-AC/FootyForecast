import type { ScorelineProbability } from "@/lib/types";

const MONO = "'JetBrains Mono',monospace";

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
  if (o === "home") return "#2BE38A";
  if (o === "draw") return "#FFC23D";
  return "#5B8CFF";
}

export default function TopScorelines({ grid, homeTeam, awayTeam, topN = 5 }: Props) {
  const top = [...grid]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, topN);

  if (top.length === 0) return null;

  const maxProb = top[0].probability;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {top.map((cell, i) => {
        const o = outcome(cell.home_goals, cell.away_goals);
        const pct = (cell.probability * 100).toFixed(1);
        const barW = maxProb > 0 ? (cell.probability / maxProb) * 100 : 0;

        return (
          <div key={i}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#F2F1F7" }}>
                {homeTeam} {cell.home_goals} – {cell.away_goals} {awayTeam}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: barColor(o) }}>{pct}%</span>
            </div>
            <div style={{ height: 6, background: "#1D1A2A", borderRadius: 99, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  borderRadius: 99,
                  width: `${barW}%`,
                  background: barColor(o),
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
