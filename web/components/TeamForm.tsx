import type { MatchSummary } from "@/lib/types";

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

function ResultBadge({ result }: { result: Result }) {
  const styles: Record<Result, string> = {
    W: "bg-emerald-500/20 text-emerald-400 border-emerald-700/50",
    D: "bg-slate-700/50 text-slate-400 border-slate-600/50",
    L: "bg-red-500/20 text-red-400 border-red-700/50",
  };
  return (
    <span
      className={`w-7 h-7 flex items-center justify-center text-xs font-bold rounded border ${styles[result]}`}
    >
      {result}
    </span>
  );
}

export default function TeamForm({ teamID, teamName, matches }: Props) {
  if (matches.length === 0) return null;

  const reversed = [...matches].reverse(); // oldest first

  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
        {teamName}
      </p>
      <div className="flex items-center gap-1.5">
        {reversed.map((m) => {
          const result = getResult(m, teamID);
          if (!result) return null;
          const opponent =
            m.home_team.id === teamID ? m.away_team.name : m.home_team.name;
          return (
            <div key={m.id} title={`vs ${opponent}: ${result}`}>
              <ResultBadge result={result} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
