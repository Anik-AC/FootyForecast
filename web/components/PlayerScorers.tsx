import type { MatchScorerPredictions, PlayerScorerPrediction, TeamScorerPredictions } from "@/lib/types";

interface Props {
  data: MatchScorerPredictions;
}

const TOP_N = 5;

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// Bar fills proportionally, capped so a 45% prob player doesn't fill the whole bar.
function barWidth(prob: number): string {
  return `${Math.min(prob / 0.5, 1) * 100}%`;
}

// Blue → green → amber → red gradient, always rendered at full width and clipped.
const BAR_GRADIENT = "linear-gradient(to right, #3b82f6, #22c55e, #f59e0b, #ef4444)";

function PlayerRow({ player }: { player: PlayerScorerPrediction }) {
  // Probability is always derived from club xG. Tournament goals are shown as
  // an annotation only — they do not feed into anytime_scorer_prob.
  const goalTag = player.tournament_goals > 0
    ? `⚽ ${player.tournament_goals}`
    : null;

  return (
    <div className="mb-4 last:mb-0">
      {/* Row 1: player name (+ goal count if scored) + probability */}
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-slate-100 leading-snug">
          {player.player_name}
          {goalTag && (
            <span className="ml-1.5 text-[10px] font-bold text-emerald-400">{goalTag}</span>
          )}
        </span>
        <span className="text-sm font-bold text-emerald-400 tabular-nums shrink-0">
          {pct(player.anytime_scorer_prob)}
        </span>
      </div>
      {/* Row 2: source badge (always xG) + gradient bar */}
      <div className="flex items-center gap-2">
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 bg-teal-900/50 text-teal-400 border border-teal-700/50"
        >
          xG
        </span>
        <div className="flex-1 relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{ width: barWidth(player.anytime_scorer_prob), background: BAR_GRADIENT }}
          />
        </div>
      </div>
    </div>
  );
}

function TeamColumn({ team, side }: { team: TeamScorerPredictions; side: "home" | "away" }) {
  const players = team.players.slice(0, TOP_N);

  return (
    <div className={`flex-1 min-w-0 ${side === "away" ? "pl-5 border-l border-slate-800" : "pr-5"}`}>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
        {team.team_name}
      </p>
      {players.length === 0 ? (
        <p className="text-xs text-slate-600 italic">No scorer data yet.</p>
      ) : (
        players.map((p) => <PlayerRow key={p.player_name} player={p} />)
      )}
    </div>
  );
}

export default function PlayerScorers({ data }: Props) {
  const hasAnyPlayers =
    data.home_team.players.length > 0 || data.away_team.players.length > 0;

  if (!hasAnyPlayers) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <h2 className="text-sm font-extrabold text-slate-100 uppercase tracking-widest leading-tight">
          Probable Goalscorers
        </h2>
        <span className="text-[10px] text-slate-400 bg-slate-800 rounded-full px-3 py-1 whitespace-nowrap shrink-0 mt-0.5">
          2025/26 club xG
        </span>
      </div>

      {/* Two-column player grid */}
      <div className="flex gap-0">
        <TeamColumn team={data.home_team} side="home" />
        <TeamColumn team={data.away_team} side="away" />
      </div>
    </div>
  );
}
