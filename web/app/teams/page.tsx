import { getTeams } from "@/lib/api";
import Link from "next/link";
import { flagUrl } from "@/lib/flags";

const MONO = "'JetBrains Mono',monospace";

const CONF_COLOR: Record<string, string> = {
  UEFA:     "#5B8CFF",
  CONMEBOL: "#FFC23D",
  CAF:      "#FF9B3D",
  AFC:      "#A35CFF",
  CONCACAF: "#2BE38A",
  OFC:      "#1FD0C0",
};

const CONF_ORDER = ["UEFA", "CONMEBOL", "CAF", "AFC", "CONCACAF", "OFC"];

function eloColor(elo: number | undefined): string {
  if (!elo) return "#645F77";
  if (elo >= 1900) return "#2BE38A";
  if (elo >= 1700) return "#F2F1F7";
  if (elo >= 1500) return "#9E99B0";
  return "#645F77";
}

export default async function TeamsPage() {
  const teams = await getTeams();

  const byConf = new Map<string, typeof teams>();
  for (const t of teams) {
    if (!byConf.has(t.confederation)) byConf.set(t.confederation, []);
    byConf.get(t.confederation)!.push(t);
  }

  return (
    <div style={{ animation: "ff-up 0.4s ease both", paddingTop: 46 }}>
      <h1 style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.03em", margin: 0 }}>Teams</h1>
      <div style={{ color: "#9E99B0", fontSize: 15, marginTop: 10, marginBottom: 36 }}>
        <b style={{ color: "#F2F1F7" }}>{teams.length}</b> qualified nations · FIFA World Cup 2026
      </div>

      {teams.length === 0 ? (
        <p style={{ color: "#645F77", textAlign: "center", padding: "64px 0" }}>Teams data not available.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          {CONF_ORDER.filter((c) => byConf.has(c)).map((conf) => {
            const color = CONF_COLOR[conf] ?? "#9E99B0";
            const confTeams = byConf.get(conf)!;

            return (
              <section key={conf}>
                <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16 }}>
                  <span style={{ width: 4, height: 16, borderRadius: 99, background: color }} />
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: "#C8C3D6" }}>
                    {conf}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: "#4A4560" }}>{confTeams.length} teams</span>
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {confTeams.map((team) => (
                    <Link
                      key={team.id}
                      href={`/teams/${team.id}`}
                      style={{ textDecoration: "none" }}
                    >
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "#15131F",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 14,
                        padding: "13px 16px",
                        cursor: "pointer",
                        transition: "border-color .15s, background .15s",
                      }}
                        className="ff-team-card"
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={flagUrl(team.id, 40)}
                            alt={team.id}
                            style={{ width: 28, height: 19, borderRadius: 4, objectFit: "cover", border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0 }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#F2F1F7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {team.name}
                            </div>
                            {team.group && (
                              <div style={{ fontFamily: MONO, fontSize: 11, color: "#645F77", marginTop: 2 }}>
                                Group {team.group}
                              </div>
                            )}
                          </div>
                        </div>
                        {team.elo_rating != null && (
                          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: eloColor(team.elo_rating), flexShrink: 0, marginLeft: 8 }}>
                            {Math.round(team.elo_rating)}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 12.5, color: "#4A4560", marginTop: 28 }}>
        Elo rating shown on the right. Higher = stronger historical record.
      </p>
    </div>
  );
}
