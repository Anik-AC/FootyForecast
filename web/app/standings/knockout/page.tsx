import type { CSSProperties } from "react";
import { getMatches, getLatestSimulation } from "@/lib/api";
import LocalTime from "@/components/LocalTime";
import Link from "next/link";
import type { MatchSummary, TeamSimulationResult } from "@/lib/types";

const MONO = "'JetBrains Mono',monospace";

const STAGE_ORDER: Record<string, number> = {
  round_of_32: 1,
  round_of_16: 2,
  quarter_final: 3,
  semi_final: 4,
  third_place: 5,
  final: 6,
};

const STAGE_LABELS: Record<string, string> = {
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter_final: "Quarter-final",
  semi_final: "Semi-final",
  third_place: "3rd Place",
  final: "Final",
};

const CARD_H = 72;
const GAP = 8;

function BracketCard({ match }: { match: MatchSummary }) {
  const played = match.result !== null;
  const wentToPens = played && match.result!.went_to_pens;
  const penWinnerID = played ? match.result!.pen_winner_id : undefined;

  const homeWon = played && (
    wentToPens
      ? penWinnerID === match.home_team.id
      : match.result!.home_goals > match.result!.away_goals
  );
  const awayWon = played && (
    wentToPens
      ? penWinnerID === match.away_team.id
      : match.result!.away_goals > match.result!.home_goals
  );

  const resultSuffix = wentToPens ? "PENS" : (played && match.result!.went_to_et) ? "AET" : null;

  return (
    <Link
      href={`/matches/${match.id}`}
      style={{
        display: "block",
        width: 168,
        height: CARD_H,
        background: "#120F1E",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "8px 12px",
        textDecoration: "none",
        transition: "border-color .15s",
        position: "relative",
      }}
      className="ff-result-card"
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
          fontWeight: homeWon ? 700 : 400,
          color: homeWon ? "#F2F1F7" : played ? "#7E7892" : "#C8C3D6",
          fontSize: 13,
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{match.home_team.name}</span>
          {played && (
            <span style={{
              fontFamily: MONO,
              fontSize: 14,
              flexShrink: 0,
              color: homeWon ? "#2BE38A" : "#7E7892",
            }}>{match.result!.home_goals}</span>
          )}
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", position: "relative" }}>
          {resultSuffix && (
            <span style={{
              position: "absolute",
              right: 0,
              top: -8,
              fontFamily: MONO,
              fontSize: 9,
              fontWeight: 700,
              color: wentToPens ? "#FFC23D" : "#5B8CFF",
              letterSpacing: "0.06em",
            }}>
              {resultSuffix}
            </span>
          )}
        </div>

        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
          fontWeight: awayWon ? 700 : 400,
          color: awayWon ? "#F2F1F7" : played ? "#7E7892" : "#C8C3D6",
          fontSize: 13,
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{match.away_team.name}</span>
          {played && (
            <span style={{
              fontFamily: MONO,
              fontSize: 14,
              flexShrink: 0,
              color: awayWon ? "#2BE38A" : "#7E7892",
            }}>{match.result!.away_goals}</span>
          )}
        </div>

        {!played && (
          <div style={{ fontFamily: MONO, fontSize: 10, color: "#4A4560", marginTop: 2 }}>
            <LocalTime iso={match.kickoff_utc} variant="dateonly" />
          </div>
        )}
      </div>
    </Link>
  );
}

function BracketColumn({
  label,
  matches,
  totalRows,
  isLast,
}: {
  label: string;
  matches: MatchSummary[];
  totalRows: number;
  isLast: boolean;
}) {
  const matchCount = matches.length;
  const slotsPerMatch = totalRows / matchCount;
  const slotPx = CARD_H + GAP;
  const colHeight = totalRows * slotPx - GAP;

  return (
    <div style={{ flexShrink: 0, width: 196 }}>
      <div style={{
        fontFamily: MONO,
        fontSize: 10,
        fontWeight: 700,
        color: "#5E5875",
        letterSpacing: "0.12em",
        marginBottom: 12,
        textAlign: "center",
      }}>
        {label}
      </div>
      <div style={{ position: "relative", height: colHeight }}>
        {matches.map((m, i) => {
          const slotStart = i * slotsPerMatch;
          const slotCenterPx = (slotStart + slotsPerMatch / 2) * slotPx - CARD_H / 2 - GAP / 2;

          return (
            <div key={m.id} style={{ position: "absolute", top: slotCenterPx, left: 0 }}>
              {/* Left connector */}
              <div style={{
                position: "absolute",
                right: "100%",
                top: CARD_H / 2 - 1,
                width: 14,
                height: 1,
                background: "#2A2640",
              }} />
              <BracketCard match={m} />
              {/* Right connector */}
              {!isLast && (
                <div style={{
                  position: "absolute",
                  left: "100%",
                  top: CARD_H / 2 - 1,
                  width: 14,
                  height: 1,
                  background: "#2A2640",
                }} />
              )}
            </div>
          );
        })}

        {/* Vertical bracket lines on right side */}
        {!isLast &&
          Array.from({ length: Math.floor(matchCount / 2) }).map((_, pairIdx) => {
            const topMatchIdx = pairIdx * 2;
            const botMatchIdx = pairIdx * 2 + 1;
            if (botMatchIdx >= matchCount) return null;
            const topCenter = (topMatchIdx * slotsPerMatch + slotsPerMatch / 2) * slotPx - GAP / 2;
            const botCenter = (botMatchIdx * slotsPerMatch + slotsPerMatch / 2) * slotPx - GAP / 2;

            return (
              <div
                key={pairIdx}
                style={{
                  position: "absolute",
                  left: 168 + 14,
                  top: topCenter,
                  width: 1,
                  height: botCenter - topCenter,
                  background: "#2A2640",
                }}
              />
            );
          })}
      </div>
    </div>
  );
}

function SimProjection({ teams, knockoutStarted }: { teams: TeamSimulationResult[]; knockoutStarted: boolean }) {
  const sorted = [...teams]
    .filter((t) => t.stage_probabilities.round_of_32 > 0)
    .sort((a, b) => b.stage_probabilities.champion - a.stage_probabilities.champion)
    .slice(0, 24);

  if (sorted.length === 0) return null;

  const TH: CSSProperties = {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "#645F77",
    paddingTop: 8,
    paddingBottom: 10,
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    textAlign: "right",
  };

  return (
    <div>
      {!knockoutStarted && (
        <p style={{ color: "#9E99B0", fontSize: 14, margin: "0 0 20px" }}>
          Knockout bracket will populate once the group stage concludes.
          Probabilities below are from{" "}
          <Link href="/bracket" style={{ color: "#5B8CFF", textDecoration: "underline", textUnderlineOffset: 3 }}>
            Monte Carlo simulations
          </Link>{" "}
          of the full tournament.
        </p>
      )}

      <div style={{
        background: "#120F1E",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16,
        overflow: "hidden",
      }}>
        <div style={{
          background: "#15131F",
          padding: "12px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: "#C8C3D6" }}>
            ROAD TO THE FINAL
          </span>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: "left", paddingLeft: 18, paddingRight: 8 }}>#</th>
              <th style={{ ...TH, textAlign: "left", paddingRight: 8 }}>TEAM</th>
              <th style={{ ...TH, paddingRight: 14, color: "#9E99B0" }}>R32</th>
              <th style={{ ...TH, paddingRight: 14, color: "#9E99B0" }}>R16</th>
              <th style={{ ...TH, paddingRight: 14, color: "#9E99B0" }}>QF</th>
              <th style={{ ...TH, paddingRight: 14, color: "#9E99B0" }}>SF</th>
              <th style={{ ...TH, paddingRight: 14, color: "#9E99B0" }}>FINAL</th>
              <th style={{ ...TH, paddingRight: 18, color: "#FFC23D" }}>CHAMP</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => {
              const p = t.stage_probabilities;
              const champPct = Math.round(p.champion * 100);
              return (
                <tr
                  key={t.team_id}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <td style={{ paddingLeft: 18, paddingTop: 11, paddingBottom: 11, fontFamily: MONO, fontSize: 12, color: "#4A4560" }}>
                    {i + 1}
                  </td>
                  <td style={{ paddingTop: 11, paddingBottom: 11, paddingRight: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Link
                        href={`/teams/${t.team_id}`}
                        style={{ textDecoration: "none", color: "#F2F1F7", fontWeight: 600, fontSize: 14 }}
                      >
                        {t.team_name}
                      </Link>
                      {t.group && (
                        <span style={{ fontFamily: MONO, fontSize: 11, color: "#4A4560" }}>Grp {t.group}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: "right", paddingRight: 14, fontFamily: MONO, fontSize: 13, color: "#9E99B0" }}>
                    {Math.round(p.round_of_32 * 100)}%
                  </td>
                  <td style={{ textAlign: "right", paddingRight: 14, fontFamily: MONO, fontSize: 13, color: "#9E99B0" }}>
                    {Math.round(p.round_of_16 * 100)}%
                  </td>
                  <td style={{ textAlign: "right", paddingRight: 14, fontFamily: MONO, fontSize: 13, color: "#9E99B0" }}>
                    {Math.round(p.quarter_final * 100)}%
                  </td>
                  <td style={{ textAlign: "right", paddingRight: 14, fontFamily: MONO, fontSize: 13, color: "#9E99B0" }}>
                    {Math.round(p.semi_final * 100)}%
                  </td>
                  <td style={{ textAlign: "right", paddingRight: 14, fontFamily: MONO, fontSize: 13, color: "#C8C3D6" }}>
                    {Math.round(p.final * 100)}%
                  </td>
                  <td style={{ textAlign: "right", paddingRight: 18, fontFamily: MONO, fontSize: 13, fontWeight: 700, color: champPct >= 10 ? "#FFC23D" : champPct >= 3 ? "#C8A030" : "#7E7892" }}>
                    {p.champion < 0.001 ? "<1%" : `${champPct}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12.5, color: "#4A4560", marginTop: 14 }}>
        Probabilities update after each match. CHAMP = P(win the tournament).
      </p>
    </div>
  );
}

export default async function KnockoutPage() {
  const [matchList, sim] = await Promise.all([
    getMatches(),
    getLatestSimulation(),
  ]);

  // Split third_place out — it doesn't belong in the main bracket column layout
  const knockout = matchList.filter((m) => m.stage !== "group" && m.stage !== "third_place");
  const thirdPlaceMatch = matchList.find((m) => m.stage === "third_place");

  const byStage = new Map<string, MatchSummary[]>();
  for (const m of knockout) {
    if (!byStage.has(m.stage)) byStage.set(m.stage, []);
    byStage.get(m.stage)!.push(m);
  }
  for (const list of byStage.values()) {
    list.sort((a, b) => a.kickoff_utc.localeCompare(b.kickoff_utc));
  }

  const stages = [...byStage.entries()].sort(
    ([a], [b]) => (STAGE_ORDER[a] ?? 99) - (STAGE_ORDER[b] ?? 99)
  );

  const knockoutStarted = stages.length > 0;

  if (!knockoutStarted) {
    return <SimProjection teams={sim?.teams ?? []} knockoutStarted={false} />;
  }

  const totalRows = stages[0][1].length;

  return (
    <div>
      <p style={{ color: "#9E99B0", fontSize: 14, margin: "0 0 24px" }}>
        Round of 32 through to the Final. Click any match for full details and probabilities.
      </p>

      <div style={{ overflowX: "auto", paddingBottom: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 28,
            alignItems: "flex-start",
            minWidth: stages.length * 210 + "px",
            paddingLeft: 14,
          }}
        >
          {stages.map(([stage, stageMatches], idx) => (
            <BracketColumn
              key={stage}
              label={STAGE_LABELS[stage] ?? stage}
              matches={stageMatches}
              totalRows={totalRows}
              isLast={idx === stages.length - 1}
            />
          ))}
        </div>
      </div>

      {/* Third-place match shown separately below the bracket */}
      {thirdPlaceMatch && (
        <div style={{ marginTop: 32 }}>
          <div style={{
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "#5E5875",
            marginBottom: 12,
          }}>
            3RD PLACE MATCH
          </div>
          <div style={{ display: "inline-block" }}>
            <BracketCard match={thirdPlaceMatch} />
          </div>
        </div>
      )}

      {/* Simulation projection table always shown below the bracket */}
      {(sim?.teams?.length ?? 0) > 0 && (
        <div style={{ marginTop: 40 }}>
          <SimProjection teams={sim!.teams} knockoutStarted={true} />
        </div>
      )}
    </div>
  );
}
