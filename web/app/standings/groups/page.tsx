import { getGroupStandings, getLatestSimulation } from "@/lib/api";
import type { GroupTable, GroupStanding } from "@/lib/types";
import Link from "next/link";
import { flagUrl } from "@/lib/flags";

const MONO = "'JetBrains Mono',monospace";

const TH_STYLE: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.08em",
  color: "#645F77",
  paddingTop: 8,
  paddingBottom: 10,
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  whiteSpace: "nowrap" as const,
};

function GroupCard({
  group,
  advanceProbs,
}: {
  group: GroupTable;
  advanceProbs: Record<string, number>;
}) {
  return (
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
          GROUP {group.letter}
        </span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...TH_STYLE, textAlign: "left", paddingLeft: 16, paddingRight: 6 }}>TEAM</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 28 }}>P</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 28 }}>W</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 28 }}>D</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 28 }}>L</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 38 }}>GD</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 28 }}>GF</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 34 }}>PTS</th>
            <th style={{ ...TH_STYLE, textAlign: "right", paddingRight: 16, width: 66, color: "#2BE38A" }}>QUAL%</th>
          </tr>
        </thead>
        <tbody>
          {group.standings.map((team: GroupStanding, i: number) => {
            const prob = advanceProbs[team.team_id];
            const qualifying = i < 2;
            const gdColor = team.gd > 0 ? "#2BE38A" : team.gd < 0 ? "#FF5D6A" : "#645F77";
            const qualColor = prob >= 0.7 ? "#2BE38A" : prob >= 0.4 ? "#FFC23D" : "#645F77";

            return (
              <tr
                key={team.team_id}
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: qualifying ? "rgba(43,227,138,0.04)" : "transparent",
                }}
              >
                <td style={{ padding: "10px 6px 10px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {qualifying ? (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2BE38A", flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: 6, flexShrink: 0 }} />
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={flagUrl(team.team_id, 40)}
                      alt={team.team_id}
                      style={{ width: 22, height: 15, borderRadius: 3, objectFit: "cover", border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}
                    />
                    <Link
                      href={`/teams/${team.team_id}`}
                      style={{ textDecoration: "none", color: "#F2F1F7", fontWeight: 600, fontSize: 14 }}
                    >
                      {team.team_name}
                    </Link>
                  </div>
                </td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#9E99B0" }}>{team.played}</td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#F2F1F7", fontWeight: 700 }}>{team.won}</td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#9E99B0" }}>{team.drawn}</td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#645F77" }}>{team.lost}</td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: gdColor, fontWeight: 600 }}>
                  {team.gd > 0 ? `+${team.gd}` : team.gd}
                </td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#9E99B0" }}>{team.gf}</td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 14, color: "#F2F1F7", fontWeight: 800 }}>{team.points}</td>
                <td style={{ textAlign: "right", paddingRight: 16, fontFamily: MONO, fontSize: 13, color: qualColor, fontWeight: prob >= 0.7 ? 700 : 400 }}>
                  {prob != null ? `${Math.round(prob * 100)}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function rankThirdPlaced(thirds: Array<{ group: string; team: GroupStanding }>) {
  return [...thirds].sort((a, b) => {
    if (b.team.points !== a.team.points) return b.team.points - a.team.points;
    if (b.team.gd !== a.team.gd) return b.team.gd - a.team.gd;
    if (b.team.gf !== a.team.gf) return b.team.gf - a.team.gf;
    return a.group.localeCompare(b.group);
  });
}

function ThirdPlacedTable({
  thirds,
  advanceProbs,
}: {
  thirds: Array<{ group: string; team: GroupStanding }>;
  advanceProbs: Record<string, number>;
}) {
  const ranked = rankThirdPlaced(thirds);
  const QUALIFY_SLOTS = 8;

  return (
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      overflow: "hidden",
      marginTop: 20,
    }}>
      <div style={{
        background: "#15131F",
        padding: "12px 18px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: "#C8C3D6" }}>
          BEST THIRD-PLACED TEAMS
        </span>
        <span style={{ marginLeft: 12, fontSize: 12, color: "#645F77" }}>Top 8 of 12 advance to the Round of 32</span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 36, paddingLeft: 16 }}>#</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 36 }}>GRP</th>
            <th style={{ ...TH_STYLE, textAlign: "left", paddingLeft: 8 }}>TEAM</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 28 }}>P</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 28 }}>W</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 28 }}>D</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 28 }}>L</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 38 }}>GD</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 28 }}>GF</th>
            <th style={{ ...TH_STYLE, textAlign: "center", width: 34 }}>PTS</th>
            <th style={{ ...TH_STYLE, textAlign: "right", paddingRight: 16, width: 66, color: "#2BE38A" }}>QUAL%</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map(({ group, team }, i) => {
            const qualifies = i < QUALIFY_SLOTS;
            const onBubble = i === QUALIFY_SLOTS - 1;
            const prob = advanceProbs[team.team_id];
            const gdColor = team.gd > 0 ? "#2BE38A" : team.gd < 0 ? "#FF5D6A" : "#645F77";
            const qualColor = prob >= 0.7 ? "#2BE38A" : prob >= 0.4 ? "#FFC23D" : "#645F77";

            return (
              <tr
                key={team.team_id}
                style={{
                  borderBottom: onBubble
                    ? "2px solid rgba(43,227,138,0.2)"
                    : "1px solid rgba(255,255,255,0.04)",
                  background: qualifies ? "rgba(43,227,138,0.04)" : "transparent",
                }}
              >
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 12, color: "#645F77", paddingLeft: 16 }}>
                  {i + 1}
                </td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#9E99B0" }}>
                  {group}
                </td>
                <td style={{ padding: "10px 6px 10px 8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {qualifies ? (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2BE38A", flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: 6, flexShrink: 0 }} />
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={flagUrl(team.team_id, 40)}
                      alt={team.team_id}
                      style={{ width: 22, height: 15, borderRadius: 3, objectFit: "cover", border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}
                    />
                    <Link
                      href={`/teams/${team.team_id}`}
                      style={{ textDecoration: "none", color: "#F2F1F7", fontWeight: 600, fontSize: 14 }}
                    >
                      {team.team_name}
                    </Link>
                  </div>
                </td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#9E99B0" }}>{team.played}</td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#F2F1F7", fontWeight: 700 }}>{team.won}</td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#9E99B0" }}>{team.drawn}</td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#645F77" }}>{team.lost}</td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: gdColor, fontWeight: 600 }}>
                  {team.gd > 0 ? `+${team.gd}` : team.gd}
                </td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#9E99B0" }}>{team.gf}</td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 14, color: "#F2F1F7", fontWeight: 800 }}>{team.points}</td>
                <td style={{ textAlign: "right", paddingRight: 16, fontFamily: MONO, fontSize: 13, color: qualColor, fontWeight: prob >= 0.7 ? 700 : 400 }}>
                  {prob != null ? `${Math.round(prob * 100)}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function GroupsPage() {
  const [groups, sim] = await Promise.all([
    getGroupStandings(),
    getLatestSimulation(),
  ]);

  const advanceProbs: Record<string, number> = {};
  for (const t of sim?.teams ?? []) {
    advanceProbs[t.team_id] = t.stage_probabilities.round_of_32;
  }

  const thirds = groups
    .filter((g) => g.standings.length >= 3)
    .map((g) => ({ group: g.letter, team: g.standings[2] }));

  return (
    <div>
      <p style={{ color: "#9E99B0", fontSize: 14, margin: "0 0 24px" }}>
        Top 2 from each group advance · 8 best third-placed teams also advance
      </p>

      {groups.length === 0 ? (
        <p style={{ color: "#645F77", textAlign: "center", padding: "64px 0" }}>Group data not available yet.</p>
      ) : (
        <>
          <div className="ff-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {groups.map((g) => (
              <GroupCard key={g.letter} group={g} advanceProbs={advanceProbs} />
            ))}
          </div>

          {thirds.length > 0 && (
            <ThirdPlacedTable thirds={thirds} advanceProbs={advanceProbs} />
          )}
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 22, fontSize: 12.5, color: "#645F77" }}>
        <span>
          <span style={{ color: "#2BE38A" }}>●</span> On course to advance
        </span>
        <span>QUAL% = simulated P(reach Round of 32)</span>
      </div>
    </div>
  );
}
