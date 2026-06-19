import type { H2HRecord, H2HMatch } from "@/lib/types";

interface Props {
  data: H2HRecord;
  homeTeamName: string;
  awayTeamName: string;
}

function HistoricalRow({ m }: { m: H2HMatch }) {
  return (
    <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800 last:border-0">
      <span className="text-slate-500 w-24 shrink-0">
        {m.date.slice(0, 4)}
      </span>
      <div className="flex-1 flex items-center justify-center gap-3 font-medium">
        <span className={`text-right flex-1 truncate ${m.home_goals > m.away_goals ? "text-slate-100" : "text-slate-500"}`}>
          {m.home_team}
        </span>
        <span className="font-mono tabular-nums text-slate-100 shrink-0">
          {m.home_goals}–{m.away_goals}
        </span>
        <span className={`text-left flex-1 truncate ${m.away_goals > m.home_goals ? "text-slate-100" : "text-slate-500"}`}>
          {m.away_team}
        </span>
      </div>
      <span className="text-slate-600 w-28 text-right shrink-0 truncate">{m.tournament}</span>
    </div>
  );
}

export default function HeadToHead({ data, homeTeamName, awayTeamName }: Props) {
  const hasHistory = data.all_time_played > 0;
  const hasRecent = data.recent.length > 0;

  if (!hasHistory && data.wc_2026.length === 0 && !hasRecent) return null;

  const homeWinPct =
    hasHistory ? Math.round((data.home_team_wins / data.all_time_played) * 100) : 0;
  const drawPct =
    hasHistory ? Math.round((data.all_time_draws / data.all_time_played) * 100) : 0;
  const awayWinPct =
    hasHistory ? Math.round((data.away_team_wins / data.all_time_played) * 100) : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-extrabold text-slate-100 uppercase tracking-widest">
        Head to Head
      </h2>

      {hasHistory && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-medium text-slate-200">{homeTeamName}</span>
            <span className="text-slate-600">{data.all_time_played} played</span>
            <span className="font-medium text-slate-200">{awayTeamName}</span>
          </div>

          {/* Bar showing wins / draws / losses */}
          <div className="flex h-2 rounded-full overflow-hidden gap-px">
            <div
              className="bg-emerald-500"
              style={{ width: `${homeWinPct}%` }}
              title={`${homeTeamName} wins: ${data.home_team_wins}`}
            />
            <div
              className="bg-slate-600"
              style={{ width: `${drawPct}%` }}
              title={`Draws: ${data.all_time_draws}`}
            />
            <div
              className="bg-blue-500"
              style={{ width: `${awayWinPct}%` }}
              title={`${awayTeamName} wins: ${data.away_team_wins}`}
            />
          </div>

          <div className="flex justify-between text-xs tabular-nums">
            <span className="text-emerald-400 font-bold">{data.home_team_wins}W</span>
            <span className="text-slate-500">{data.all_time_draws}D</span>
            <span className="text-blue-400 font-bold">{data.away_team_wins}W</span>
          </div>
        </div>
      )}

      {hasRecent && (
        <div className="space-y-0">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Recent meetings</p>
          {data.recent.map((m, i) => (
            <HistoricalRow key={i} m={m} />
          ))}
        </div>
      )}

      {!hasHistory && !hasRecent && (
        <p className="text-xs text-slate-600 italic">No historical matches on record.</p>
      )}
    </div>
  );
}
