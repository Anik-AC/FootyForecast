import Link from "next/link";
import type { MatchSummary, OutcomeProbabilities, MatchResultSummary, KeyEvent } from "@/lib/types";
import LocalTime from "./LocalTime";
import { flagUrl } from "@/lib/flags";
import { teamColor } from "@/lib/teamColors";

function hexToRgb(h: string): string {
  const x = h.replace("#", "");
  return `${parseInt(x.slice(0, 2), 16)},${parseInt(x.slice(2, 4), 16)},${parseInt(x.slice(4, 6), 16)}`;
}

function heroGrad(homeId: string, awayId: string): string {
  const hc = teamColor(homeId);
  const ac = teamColor(awayId);
  return `linear-gradient(105deg, rgba(${hexToRgb(hc)},0.45) 0%, rgba(22,17,33,0.88) 35%, rgba(16,12,26,0.94) 62%, rgba(${hexToRgb(ac)},0.42) 100%), #0B0A12`;
}

function stageLabel(stage: string, group: string | null): string {
  if (stage === "group" && group) return `Group Stage · Group ${group}`;
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function topPick(p: OutcomeProbabilities): "home_win" | "draw" | "away_win" {
  if (p.home_win >= p.draw && p.home_win >= p.away_win) return "home_win";
  if (p.draw >= p.home_win && p.draw >= p.away_win) return "draw";
  return "away_win";
}

function actualOutcome(r: MatchResultSummary): "home_win" | "draw" | "away_win" {
  if (r.home_goals > r.away_goals) return "home_win";
  if (r.away_goals > r.home_goals) return "away_win";
  return "draw";
}


const Flag = ({ teamId, size = 54 }: { teamId: string; size?: number }) => (
  <span style={{
    width: size,
    height: Math.round(size * 0.68),
    borderRadius: 7,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.16)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
    display: "block",
    flexShrink: 0,
  }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src={flagUrl(teamId)}
      alt={teamId}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  </span>
);

// Upcoming match card
function UpcomingCard({ match }: { match: MatchSummary }) {
  const p = match.prediction;
  const h = p ? Math.round(p.home_win * 100) : null;
  const d = p ? Math.round(p.draw * 100) : null;
  const a = p ? Math.round(p.away_win * 100) : null;
  return (
    <Link href={`/matches/${match.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div style={{
        background: heroGrad(match.home_team.id, match.away_team.id),
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 16,
        padding: "18px 22px",
        cursor: "pointer",
        transition: "border-color .15s",
      }}
        className="ff-match-card"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: "#7E7892", background: "#1D1A2A", padding: "3px 9px", borderRadius: 6 }}>
            {stageLabel(match.stage, match.group_letter)}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: "#7E7892" }}>
            <LocalTime iso={match.kickoff_utc} variant="kickoff" />
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10, marginBottom: 15 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
            <Flag teamId={match.home_team.id} size={34} />
            <span style={{ fontSize: 18, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {match.home_team.name}
            </span>
          </div>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#4A4560" }}>vs</span>
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0, justifyContent: "flex-end" }}>
            <span style={{ fontSize: 18, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" }}>
              {match.away_team.name}
            </span>
            <Flag teamId={match.away_team.id} size={34} />
          </div>
        </div>

        {p && h !== null && d !== null && a !== null ? (
          <>
            <div style={{ display: "flex", height: 7, borderRadius: 99, overflow: "hidden", background: "#1D1A2A" }}>
              <div style={{ width: `${h}%`, background: "#2BE38A" }} />
              <div style={{ width: `${d}%`, background: "#FFC23D" }} />
              <div style={{ width: `${a}%`, background: "#5B8CFF" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 11, color: "#9E99B0" }}>
              <span><b style={{ color: "#2BE38A" }}>{h}%</b> {match.home_team.id}</span>
              <span style={{ color: "#FFC23D" }}>{d}% draw</span>
              <span>{match.away_team.id} <b style={{ color: "#5B8CFF" }}>{a}%</b></span>
            </div>
          </>
        ) : (
          <p style={{ fontSize: 12, color: "#645F77", marginTop: 8 }}>Prediction not yet available</p>
        )}
      </div>
    </Link>
  );
}

// Result card
function ResultCard({ match, compact = false }: { match: MatchSummary; compact?: boolean }) {
  const result = match.result!;
  const p = match.prediction;
  const h = p ? Math.round(p.home_win * 100) : null;
  const d = p ? Math.round(p.draw * 100) : null;
  const a = p ? Math.round(p.away_win * 100) : null;

  const wentToPens = result.went_to_pens;
  const penWinnerID = result.pen_winner_id;
  // In penalties, score is level — winner is the pen winner
  const homeWon = wentToPens
    ? penWinnerID === match.home_team.id
    : result.home_goals > result.away_goals;
  const awayWon = wentToPens
    ? penWinnerID === match.away_team.id
    : result.away_goals > result.home_goals;

  const modelCorrect = p ? topPick(p) === actualOutcome(result) : null;

  // All goals + cards sorted chronologically
  const allEvents = (match.key_events ?? [])
    .filter((e) =>
      e.incident_type === "goal" ||
      e.incident_type === "own_goal" ||
      e.incident_type === "red_card" ||
      e.incident_type === "yellow_red_card"
    )
    .sort((a, b) => a.minute - b.minute);

  return (
    <Link href={`/results/${match.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div style={{
        background: heroGrad(match.home_team.id, match.away_team.id),
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 16,
        padding: "18px 22px",
        cursor: "pointer",
        transition: "border-color .15s",
      }}
        className="ff-result-card"
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: "#7E7892" }}>
            {stageLabel(match.stage, match.group_letter)}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: "#645F77" }}>
            <LocalTime iso={match.kickoff_utc} variant="kickoff" />
          </span>
        </div>

        {/* Flags + score */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
            <Flag teamId={match.home_team.id} size={54} />
            <span style={{ fontSize: 16, fontWeight: 800, color: awayWon ? "#7E7892" : "#F2F1F7" }}>
              {match.home_team.name}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <div style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 34,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}>
              <span style={{ color: homeWon ? "#2BE38A" : "#F2F1F7" }}>{result.home_goals}</span>
              <span style={{ color: "#4A4560", fontSize: 24 }}>–</span>
              <span style={{ color: awayWon ? "#2BE38A" : "#F2F1F7" }}>{result.away_goals}</span>
            </div>
            {result.went_to_pens && (
              <span style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700,
                color: "#FFC23D", letterSpacing: "0.08em",
              }}>PENS</span>
            )}
            {result.went_to_et && !result.went_to_pens && (
              <span style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700,
                color: "#5B8CFF", letterSpacing: "0.08em",
              }}>AET</span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
            <Flag teamId={match.away_team.id} size={54} />
            <span style={{ fontSize: 16, fontWeight: 800, color: homeWon ? "#7E7892" : "#F2F1F7" }}>
              {match.away_team.name}
            </span>
          </div>
        </div>

        {/* Events: goals + red cards, one row each, sorted by minute */}
        {!compact && allEvents.length > 0 && (
          <>
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "18px 0 14px" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {allEvents.map((e, i) => {
                const minuteStr = `${e.minute}'`;
                const name = !compact && e.player_name
                  ? `${e.player_name}${e.incident_type === "own_goal" ? " (OG)" : ""}`
                  : "";
                const isGoal = e.incident_type === "goal" || e.incident_type === "own_goal";

                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 22px 1fr", alignItems: "center", gap: 8 }}>
                    {/* Home side — right-aligned */}
                    <div style={{ textAlign: "right" }}>
                      {e.is_home && (
                        <span style={{ fontSize: 12.5, color: "#9E99B0" }}>
                          {name}{name ? " " : ""}
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#5E6B7A" }}>{minuteStr}</span>
                        </span>
                      )}
                    </div>

                    {/* Center icon */}
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      {isGoal ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="9.5" stroke="#7E7892" strokeWidth="1.6"/>
                          <path d="M12 5.5v13M5.5 12h13M8 8l8 8M16 8l-8 8" stroke="#7E7892" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                      ) : (
                        <span style={{
                          width: 9, height: 13, borderRadius: 2,
                          background: "#FF4040",
                          transform: "rotate(-8deg)",
                          display: "block",
                          flexShrink: 0,
                          boxShadow: "0 2px 5px rgba(255,64,64,0.4)",
                        }} />
                      )}
                    </div>

                    {/* Away side — left-aligned */}
                    <div style={{ textAlign: "left" }}>
                      {!e.is_home && (
                        <span style={{ fontSize: 12.5, color: "#9E99B0" }}>
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#5E6B7A" }}>{minuteStr}</span>
                          {name ? " " : ""}{name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Model probs */}
        {p && h !== null && d !== null && a !== null && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "18px 0 9px" }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#5E6B7A" }}>
                {h}% / {d}% / {a}%
              </span>
              {modelCorrect === true && (
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: "#2BE38A" }}>
                  Predicted
                </span>
              )}
              {modelCorrect === false && (
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: "#FFC23D" }}>
                  Upset
                </span>
              )}
            </div>
            <div style={{ display: "flex", height: 7, borderRadius: 99, overflow: "hidden", background: "#1D1A2A" }}>
              <div style={{ width: `${h}%`, background: "#2BE38A" }} />
              <div style={{ width: `${d}%`, background: "#FFC23D" }} />
              <div style={{ width: `${a}%`, background: "#5B8CFF" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 10, color: "#9E99B0" }}>
              <span style={{ color: "#2BE38A", fontWeight: 700 }}>{h}%</span>
              <span>{d}% draw</span>
              <span style={{ color: "#5B8CFF", fontWeight: 700 }}>{a}%</span>
            </div>
          </>
        )}
      </div>
    </Link>
  );
}

export function MatchCard({ match, compact = false }: { match: MatchSummary; compact?: boolean }) {
  return match.result !== null ? <ResultCard match={match} compact={compact} /> : <UpcomingCard match={match} />;
}
