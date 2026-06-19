import { getTeams } from "@/lib/api";
import Link from "next/link";

const CONF_COLORS: Record<string, string> = {
  UEFA:     "bg-blue-900/40 text-blue-300",
  CONMEBOL: "bg-yellow-900/40 text-yellow-300",
  CAF:      "bg-orange-900/40 text-orange-300",
  AFC:      "bg-red-900/40 text-red-300",
  CONCACAF: "bg-green-900/40 text-green-300",
  OFC:      "bg-purple-900/40 text-purple-300",
};

function eloColor(elo: number | undefined): string {
  if (!elo) return "text-slate-600";
  if (elo >= 1900) return "text-emerald-400";
  if (elo >= 1700) return "text-slate-200";
  if (elo >= 1500) return "text-slate-400";
  return "text-slate-600";
}

export default async function TeamsPage() {
  const teams = await getTeams();

  const byConf = new Map<string, typeof teams>();
  const confOrder = ["UEFA", "CONMEBOL", "CAF", "AFC", "CONCACAF", "OFC"];
  for (const t of teams) {
    if (!byConf.has(t.confederation)) byConf.set(t.confederation, []);
    byConf.get(t.confederation)!.push(t);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Teams</h1>
        <p className="text-slate-400 mt-1 text-sm">{teams.length} qualified nations · FIFA World Cup 2026</p>
      </div>

      {teams.length === 0 ? (
        <p className="text-slate-500 text-center py-16">Teams data not available.</p>
      ) : (
        <div className="space-y-8">
          {confOrder.filter(c => byConf.has(c)).map((conf) => (
            <section key={conf}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{conf}</h2>
                <span className="text-xs text-slate-600">{byConf.get(conf)!.length} teams</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {byConf.get(conf)!.map((team) => (
                  <Link
                    key={team.id}
                    href={`/teams/${team.id}`}
                    className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-100">{team.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CONF_COLORS[team.confederation] ?? "bg-slate-700 text-slate-400"}`}>
                            {team.confederation}
                          </span>
                          {team.group && (
                            <span className="text-[10px] text-slate-500">Group {team.group}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {team.elo_rating != null && (
                      <span className={`text-sm font-bold tabular-nums ${eloColor(team.elo_rating)}`}>
                        {Math.round(team.elo_rating)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
