import type { MatchSummary } from "@/lib/types";

const MONO = "'JetBrains Mono',monospace";

interface Props {
  teamID: string;
  teamName: string;
  matches: MatchSummary[];
}

type Result = "W" | "D" | "L";

function getResult(match: MatchSummary, teamID: string): Result | null {
  if (!match.result) return null;
  const isHome = match.home_team.id === teamID;
  const { home_goals, away_goals } = match.result;
  if (home_goals === away_goals) return "D";
  const won = isHome ? home_goals > away_goals : away_goals > home_goals;
  return won ? "W" : "L";
}

const BADGE_STYLE: Record<Result, React.CSSProperties> = {
  W: { background: "rgba(43,227,138,0.15)", color: "#2BE38A", border: "1px solid rgba(43,227,138,0.3)" },
  D: { background: "rgba(255,255,255,0.06)", color: "#9E99B0", border: "1px solid rgba(255,255,255,0.1)" },
  L: { background: "rgba(255,93,106,0.12)", color: "#FF5D6A", border: "1px solid rgba(255,93,106,0.25)" },
};

export default function TeamForm({ teamID, teamName, matches }: Props) {
  if (matches.length === 0) return null;

  const reversed = [...matches].reverse();

  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#645F77", letterSpacing: "0.1em", marginBottom: 10 }}>
        {teamName.toUpperCase()}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {reversed.map((m) => {
          const result = getResult(m, teamID);
          if (!result) return null;
          const opponent = m.home_team.id === teamID ? m.away_team.name : m.home_team.name;
          return (
            <div
              key={m.id}
              title={`vs ${opponent}: ${result}`}
              style={{
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: MONO,
                fontSize: 12,
                fontWeight: 800,
                borderRadius: 6,
                ...BADGE_STYLE[result],
              }}
            >
              {result}
            </div>
          );
        })}
      </div>
    </div>
  );
}
