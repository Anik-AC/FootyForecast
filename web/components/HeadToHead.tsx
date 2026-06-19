import type { H2HRecord, H2HMatch } from "@/lib/types";

const MONO = "'JetBrains Mono',monospace";

interface Props {
  data: H2HRecord;
  homeTeamName: string;
  awayTeamName: string;
}

function HistoricalRow({ m }: { m: H2HMatch }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontSize: 13,
      paddingTop: 10,
      paddingBottom: 10,
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <span style={{ fontFamily: MONO, fontSize: 12, color: "#4A4560", width: 40, flexShrink: 0 }}>
        {m.date.slice(0, 4)}
      </span>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <span style={{
          textAlign: "right",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
          fontWeight: m.home_goals > m.away_goals ? 700 : 400,
          color: m.home_goals > m.away_goals ? "#F2F1F7" : "#7E7892",
        }}>
          {m.home_team}
        </span>
        <span style={{ fontFamily: MONO, fontWeight: 700, color: "#F2F1F7", flexShrink: 0 }}>
          {m.home_goals}–{m.away_goals}
        </span>
        <span style={{
          textAlign: "left",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
          fontWeight: m.away_goals > m.home_goals ? 700 : 400,
          color: m.away_goals > m.home_goals ? "#F2F1F7" : "#7E7892",
        }}>
          {m.away_team}
        </span>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 11, color: "#4A4560", width: 100, textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        {m.tournament}
      </span>
    </div>
  );
}

export default function HeadToHead({ data, homeTeamName, awayTeamName }: Props) {
  const hasHistory = data.all_time_played > 0;
  const hasRecent = data.recent.length > 0;

  if (!hasHistory && data.wc_2026.length === 0 && !hasRecent) return null;

  const homeWinPct = hasHistory ? Math.round((data.home_team_wins / data.all_time_played) * 100) : 0;
  const drawPct = hasHistory ? Math.round((data.all_time_draws / data.all_time_played) * 100) : 0;
  const awayWinPct = hasHistory ? Math.round((data.away_team_wins / data.all_time_played) * 100) : 0;

  return (
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      padding: "20px 24px",
    }}>
      {hasHistory && (
        <div style={{ marginBottom: hasRecent ? 18 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#F2F1F7" }}>{homeTeamName}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#645F77" }}>{data.all_time_played} played</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#F2F1F7" }}>{awayTeamName}</span>
          </div>
          <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "#1D1A2A" }}>
            <div style={{ width: `${homeWinPct}%`, background: "#2BE38A" }} />
            <div style={{ width: `${drawPct}%`, background: "#4A4560" }} />
            <div style={{ width: `${awayWinPct}%`, background: "#5B8CFF" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 13, fontWeight: 700, marginTop: 8 }}>
            <span style={{ color: "#2BE38A" }}>{data.home_team_wins}W</span>
            <span style={{ color: "#645F77" }}>{data.all_time_draws}D</span>
            <span style={{ color: "#5B8CFF" }}>{data.away_team_wins}W</span>
          </div>
        </div>
      )}

      {hasRecent && (
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: "#645F77", letterSpacing: "0.08em", marginBottom: 6 }}>RECENT MEETINGS</div>
          {data.recent.map((m, i) => (
            <HistoricalRow key={i} m={m} />
          ))}
        </div>
      )}

      {!hasHistory && !hasRecent && (
        <p style={{ fontSize: 13, color: "#4A4560", fontStyle: "italic" }}>No historical matches on record.</p>
      )}
    </div>
  );
}
