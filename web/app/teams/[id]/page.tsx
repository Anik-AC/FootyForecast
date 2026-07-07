import { getTeamDetail, getCalibration } from "@/lib/api";
import { MatchCard } from "@/components/MatchCard";
import { notFound } from "next/navigation";
import type { MatchSummary, GradedMatch } from "@/lib/types";
import { flagUrl } from "@/lib/flags";

const MONO = "'JetBrains Mono',monospace";

interface NewsItem { title: string; link: string; source: string; pubDate: string }

async function fetchTeamNews(teamName: string): Promise<NewsItem[]> {
  try {
    const q = encodeURIComponent(`"${teamName}" FIFA World Cup 2026`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      next: { revalidate: 1800 },
      headers: { "User-Agent": "FootyForecast/1.0" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
    return items.slice(0, 5).map((item) => ({
      title: (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ?? item.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim() ?? "",
      link:  item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "",
      source: item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() ?? "",
      pubDate: item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "",
    })).filter((i) => i.title);
  } catch { return []; }
}

function teamAccuracy(matches: GradedMatch[], teamID: string) {
  const relevant = matches.filter(
    (m) => m.home_team.id === teamID || m.away_team.id === teamID
  );
  const correct = relevant.filter((m) => {
    const isHome = m.home_team.id === teamID;
    const probs = m.model_probabilities;
    const modelPick =
      probs.home_win >= probs.draw && probs.home_win >= probs.away_win
        ? "home_win"
        : probs.away_win > probs.draw
        ? "away_win"
        : "draw";
    if (m.actual_outcome === "home_win" && isHome && modelPick === "home_win") return true;
    if (m.actual_outcome === "away_win" && !isHome && modelPick === "away_win") return true;
    if (m.actual_outcome === "home_win" && !isHome && modelPick === "home_win") return true;
    if (m.actual_outcome === "away_win" && isHome && modelPick === "away_win") return true;
    if (m.actual_outcome === "draw" && modelPick === "draw") return true;
    return false;
  });
  return { graded: relevant.length, correct: correct.length };
}

function SectionHeader({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, margin: "40px 0 16px" }}>
      <span style={{ width: 4, height: 16, borderRadius: 99, background: color }} />
      <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: "#C8C3D6", margin: 0 }}>{label}</h2>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
    </div>
  );
}

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [team, calibration] = await Promise.all([
    getTeamDetail(id),
    getCalibration(),
  ]);

  if (!team) notFound();

  const news = await fetchTeamNews(team.name);

  const fixtures = team.fixtures ?? [];
  const players  = team.players  ?? [];

  const played   = fixtures.filter((m: MatchSummary) => m.result !== null);
  const upcoming = fixtures.filter((m: MatchSummary) => m.result === null);

  const modelStats = calibration
    ? teamAccuracy(calibration.matches, team.id)
    : null;

  const hasPlayers = players.length > 0;

  return (
    <div style={{ animation: "ff-up 0.4s ease both", paddingTop: 46 }}>
      {/* Hero header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 28, flexWrap: "wrap" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={flagUrl(team.id, 160)}
          alt={team.id}
          style={{
            width: 104,
            height: 70,
            borderRadius: 12,
            objectFit: "cover",
            border: "1px solid rgba(255,255,255,0.16)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-0.03em", margin: 0, lineHeight: 1.05 }}>
            {team.name}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <span style={{
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: 600,
              color: "#9E99B0",
              background: "#1D1A2A",
              padding: "4px 10px",
              borderRadius: 7,
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              {team.confederation}
            </span>
            {team.group && (
              <span style={{
                fontFamily: MONO,
                fontSize: 12,
                fontWeight: 600,
                color: "#2BE38A",
                background: "rgba(43,227,138,0.1)",
                padding: "4px 10px",
                borderRadius: 7,
                border: "1px solid rgba(43,227,138,0.22)",
              }}>
                Group {team.group}
              </span>
            )}
            {team.elo_rating != null && (
              <span style={{
                fontFamily: MONO,
                fontSize: 12,
                fontWeight: 600,
                color: "#9E99B0",
                background: "#1D1A2A",
                padding: "4px 10px",
                borderRadius: 7,
                border: "1px solid rgba(255,255,255,0.1)",
              }}>
                Elo <b style={{ color: "#F2F1F7" }}>{Math.round(team.elo_rating)}</b>
              </span>
            )}
          </div>
        </div>

        {/* W/D/L record */}
        {team.record.played > 0 && (
          <div style={{ display: "flex", gap: 28, flexShrink: 0, alignItems: "flex-start" }}>
            {[
              { label: "W",     value: team.record.won,  color: "#2BE38A" },
              { label: "D",     value: team.record.drawn, color: "#9E99B0" },
              { label: "L",     value: team.record.lost,  color: "#FF5D6A" },
              { label: "GF–GA", value: `${team.record.gf}–${team.record.ga}`, color: "#F2F1F7" },
            ].map((stat) => (
              <div key={stat.label} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: "#645F77", marginTop: 5, letterSpacing: "0.08em" }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Model performance */}
      {modelStats && modelStats.graded > 0 && (
        <>
          <SectionHeader color="#A35CFF" label="MODEL PERFORMANCE" />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{
              background: "#15131F",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 14,
              padding: "16px 22px",
              textAlign: "center",
            }}>
              <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: "#F2F1F7" }}>
                {modelStats.correct}/{modelStats.graded}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: "#645F77", marginTop: 4, letterSpacing: "0.06em" }}>CORRECT CALLS</div>
            </div>
            <div style={{
              background: "#15131F",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 14,
              padding: "16px 22px",
              textAlign: "center",
            }}>
              <div style={{
                fontFamily: MONO,
                fontSize: 22,
                fontWeight: 800,
                color: modelStats.graded > 0 && modelStats.correct / modelStats.graded >= 0.6
                  ? "#2BE38A"
                  : "#F2F1F7",
              }}>
                {modelStats.graded > 0 ? Math.round((modelStats.correct / modelStats.graded) * 100) : 0}%
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: "#645F77", marginTop: 4, letterSpacing: "0.06em" }}>ACCURACY</div>
            </div>
          </div>
        </>
      )}

      {/* Player stats */}
      {hasPlayers && (
        <>
          <SectionHeader color="#FFC23D" label="PLAYER STATS" />
          <div style={{
            background: "#120F1E",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16,
            overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["PLAYER", "APPS", "GOALS", "ASSISTS", "PENS"].map((col, i) => (
                    <th key={col} style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      color: "#645F77",
                      paddingTop: 10,
                      paddingBottom: 10,
                      paddingLeft: i === 0 ? 18 : 0,
                      paddingRight: i === 4 ? 18 : 0,
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      textAlign: i === 0 ? "left" : "center",
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ paddingLeft: 18, paddingTop: 11, paddingBottom: 11, fontWeight: 600, fontSize: 14, color: "#F2F1F7" }}>
                      {p.player_name}
                    </td>
                    <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#645F77" }}>
                      {p.appearances || "–"}
                    </td>
                    <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 14, fontWeight: 700, color: p.goals > 0 ? "#2BE38A" : "#645F77" }}>
                      {p.goals}
                    </td>
                    <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, color: "#9E99B0" }}>
                      {p.assists || "–"}
                    </td>
                    <td style={{ textAlign: "center", paddingRight: 18, fontFamily: MONO, fontSize: 13, color: "#645F77" }}>
                      {p.penalties || "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Upcoming fixtures */}
      {upcoming.length > 0 && (
        <>
          <SectionHeader color="#2BE38A" label="UPCOMING" />
          <div className="ff-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {upcoming.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        </>
      )}

      {/* Results */}
      {played.length > 0 && (
        <>
          <SectionHeader color="#5B8CFF" label="RESULTS" />
          <div className="ff-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
            {[...played].reverse().map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        </>
      )}

      {/* Team news */}
      <SectionHeader color="#FFC23D" label="LATEST NEWS" />
      {news.length === 0 ? (
        <p style={{ color: "#645F77", fontSize: 14 }}>No news found for {team.name}.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {news.map((item, i) => (
            <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              <div style={{
                background: "#120F1E",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: "18px 22px",
                cursor: "pointer",
              }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: "#EDEBF3", lineHeight: 1.4 }}>{item.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 8, fontSize: 13, color: "#7E7892" }}>
                  {item.source && <span style={{ color: "#9E99B0", fontWeight: 600 }}>{item.source}</span>}
                  {item.source && item.pubDate && <span style={{ color: "#3F3A52" }}>·</span>}
                  {item.pubDate && (
                    <span>{new Date(item.pubDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
