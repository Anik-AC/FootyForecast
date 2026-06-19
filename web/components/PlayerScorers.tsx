import type { MatchScorerPredictions, PlayerScorerPrediction, TeamScorerPredictions } from "@/lib/types";

const MONO = "'JetBrains Mono',monospace";
const TOP_N = 5;

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function barWidth(prob: number): string {
  return `${Math.min(prob / 0.5, 1) * 100}%`;
}

const BAR_GRADIENT = "linear-gradient(to right, #5B8CFF, #2BE38A, #FFC23D)";

function PlayerRow({ player }: { player: PlayerScorerPrediction }) {
  const goalTag = player.tournament_goals > 0 ? `⚽ ${player.tournament_goals}` : null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#F2F1F7", lineHeight: 1.2 }}>
          {player.player_name}
          {goalTag && (
            <span style={{ marginLeft: 6, fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "#2BE38A" }}>{goalTag}</span>
          )}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: "#2BE38A", flexShrink: 0 }}>
          {pct(player.anytime_scorer_prob)}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 700,
          color: "#1FD0C0",
          background: "rgba(31,208,192,0.1)",
          border: "1px solid rgba(31,208,192,0.22)",
          padding: "1px 7px",
          borderRadius: 5,
          flexShrink: 0,
        }}>
          xG
        </span>
        <div style={{ flex: 1, height: 5, background: "#1D1A2A", borderRadius: 99, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              borderRadius: 99,
              width: barWidth(player.anytime_scorer_prob),
              background: BAR_GRADIENT,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function TeamColumn({ team, side }: { team: TeamScorerPredictions; side: "home" | "away" }) {
  const players = team.players.slice(0, TOP_N);

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      ...(side === "away"
        ? { paddingLeft: 20, borderLeft: "1px solid rgba(255,255,255,0.06)" }
        : { paddingRight: 20 }),
    }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#645F77", letterSpacing: "0.1em", marginBottom: 16 }}>
        {team.team_name.toUpperCase()}
      </div>
      {players.length === 0 ? (
        <p style={{ fontSize: 13, color: "#4A4560", fontStyle: "italic" }}>No scorer data yet.</p>
      ) : (
        players.map((p) => <PlayerRow key={p.player_name} player={p} />)
      )}
    </div>
  );
}

interface Props {
  data: MatchScorerPredictions;
}

export default function PlayerScorers({ data }: Props) {
  const hasAnyPlayers = data.home_team.players.length > 0 || data.away_team.players.length > 0;
  if (!hasAnyPlayers) return null;

  return (
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      padding: "20px 24px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#F2F1F7" }}>Probable Goalscorers</span>
        <span style={{
          fontFamily: MONO,
          fontSize: 11,
          color: "#9E99B0",
          background: "#1D1A2A",
          padding: "4px 10px",
          borderRadius: 7,
        }}>
          2025/26 club xG
        </span>
      </div>
      <div style={{ display: "flex", gap: 0 }}>
        <TeamColumn team={data.home_team} side="home" />
        <TeamColumn team={data.away_team} side="away" />
      </div>
    </div>
  );
}
