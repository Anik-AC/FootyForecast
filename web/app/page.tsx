import { getMatches } from "@/lib/api";
import { MatchCard } from "@/components/MatchCard";
import Link from "next/link";
import type { MatchSummary } from "@/lib/types";
import LocalTime from "@/components/LocalTime";
import { flagUrl } from "@/lib/flags";
import { teamColor, hexToRgba } from "@/lib/teamColors";

interface NewsItem { title: string; link: string; source: string; pubDate: string }

async function fetchHomeNews(): Promise<NewsItem[]> {
  try {
    const url = "https://news.google.com/rss/search?q=FIFA+World+Cup+2026&hl=en-US&gl=US&ceid=US:en";
    const res = await fetch(url, { next: { revalidate: 1800 }, headers: { "User-Agent": "FootyForecast/1.0" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
    return items.slice(0, 5).map((item) => ({
      title: (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ?? item.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim() ?? "",
      link: item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "",
      source: item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() ?? "",
      pubDate: item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "",
    })).filter((i) => i.title);
  } catch { return []; }
}

function stageLabel(id: string): string {
  if (id.includes("-GRP-")) return "";
  if (id.includes("-R32-")) return " · ROUND OF 32";
  if (id.includes("-R16-")) return " · ROUND OF 16";
  if (id.includes("-QF-"))  return " · QUARTER-FINAL";
  if (id.includes("-SF-"))  return " · SEMI-FINAL";
  if (id.includes("-3P-"))  return " · 3RD PLACE";
  if (id.includes("-FIN-")) return " · FINAL";
  return "";
}

function groupByDate(matches: MatchSummary[]): Map<string, MatchSummary[]> {
  const groups = new Map<string, MatchSummary[]>();
  for (const m of matches) {
    const date = m.kickoff_utc.slice(0, 10);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(m);
  }
  return groups;
}

function SectionHeader({ color, label, right }: { color: string; label: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, margin: "52px 0 4px" }}>
      <span style={{ width: 4, height: 18, borderRadius: 99, background: color }} />
      <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.16em", color: "#C8C3D6", margin: 0 }}>{label}</h2>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
      {right}
    </div>
  );
}

export default async function HomePage() {
  const [matches, news] = await Promise.all([getMatches(), fetchHomeNews()]);

  const now = new Date();
  const cutoffFuture = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const cutoffPast = new Date(now.getTime() - 72 * 60 * 60 * 1000);

  const upcoming = matches.filter((m) => m.result === null && new Date(m.kickoff_utc) <= cutoffFuture);
  const recent = matches.filter((m) => m.result !== null && new Date(m.kickoff_utc) >= cutoffPast);

  const totalPlayed = matches.filter((m) => m.result !== null).length;
  const totalUpcoming = matches.filter((m) => m.result === null).length;

  const upcomingByDate = groupByDate(upcoming);
  const recentReversed = [...recent].reverse();

  // Featured match: prefer the Final, then first upcoming with a prediction
  const featured =
    upcoming.find((m) => m.stage === "final") ??
    upcoming.find((m) => m.prediction != null) ??
    upcoming[0] ??
    null;
  const isFinal = featured?.stage === "final";

  return (
    <div style={{ animation: "ff-up 0.4s ease both" }}>
      {/* Hero header */}
      <div style={{ padding: "48px 0 8px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, letterSpacing: "0.14em", color: "#FFC23D", fontWeight: 600 }}>
              FIFA WORLD CUP 2026 · A FESTIVAL OF FOOTBALL
            </span>
            <span style={{ display: "flex", gap: 4 }}>
              {["ca", "mx", "us"].map((iso) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={iso} src={`https://flagcdn.com/w40/${iso}.png`} style={{ width: 21, height: 14, borderRadius: 3, objectFit: "cover", display: "block" }} alt={iso} />
              ))}
            </span>
          </div>
          <h1 style={{ fontSize: 48, fontWeight: 900, letterSpacing: "-0.03em", margin: 0, lineHeight: 0.98 }}>
            Match{" "}
            <span style={{ background: "linear-gradient(90deg,#2BE38A,#1FD0C0,#5B8CFF)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Predictions
            </span>
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14, color: "#9E99B0", fontSize: 14.5 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2BE38A", display: "inline-block", animation: "ff-pulse 2s infinite" }} />
              Live model · times in your local zone
            </span>
            <span style={{ color: "#3F3A52" }}>·</span>
            <span><b style={{ color: "#F2F1F7" }}>{totalPlayed}</b> played</span>
            <span style={{ color: "#3F3A52" }}>·</span>
            <span><b style={{ color: "#F2F1F7" }}>{totalUpcoming}</b> remaining</span>
          </div>
        </div>
      </div>

      {/* Featured spotlight */}
      {featured && (() => {
        const homeHex = teamColor(featured.home_team.id);
        const awayHex = teamColor(featured.away_team.id);
        const homeClr = hexToRgba(homeHex, isFinal ? 0.6 : 0.5);
        const awayClr = hexToRgba(awayHex, isFinal ? 0.6 : 0.5);
        const heroGradient = isFinal
          ? `linear-gradient(105deg, ${homeClr} 0%, rgba(22,17,33,0.92) 30%, rgba(16,12,26,0.96) 60%, ${awayClr} 100%), #0B0A12`
          : `linear-gradient(105deg, ${homeClr} 0%, rgba(22,17,33,0.88) 35%, rgba(16,12,26,0.94) 62%, ${awayClr} 100%), #0B0A12`;
        const borderStyle = isFinal
          ? "1px solid rgba(255,194,61,0.45)"
          : "1px solid rgba(255,255,255,0.1)";
        return (
        <div style={{ marginTop: 30, position: "relative" }}>
          <Link href={`/matches/${featured.id}`} style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            borderRadius: 24,
          }} aria-label={`${featured.home_team.name} vs ${featured.away_team.name}`} />
          <div style={{
            borderRadius: 24,
            overflow: "hidden",
            border: borderStyle,
            background: heroGradient,
            cursor: "pointer",
            boxShadow: isFinal ? "0 0 60px rgba(255,194,61,0.12)" : undefined,
            position: "relative",
          }}>
            <div style={{ padding: isFinal ? "32px 36px 34px" : "26px 32px 30px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                {isFinal ? (
                  <span style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    color: "#FFC23D",
                    fontWeight: 700,
                    background: "rgba(255,194,61,0.15)",
                    border: "1px solid rgba(255,194,61,0.45)",
                    padding: "6px 14px",
                    borderRadius: 8,
                  }}>
                    🏆 WORLD CUP FINAL · MetLife Stadium, New Jersey
                  </span>
                ) : (
                  <span style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 11,
                    letterSpacing: "0.12em",
                    color: "#FFC23D",
                    fontWeight: 700,
                    background: "rgba(255,194,61,0.12)",
                    border: "1px solid rgba(255,194,61,0.3)",
                    padding: "5px 11px",
                    borderRadius: 8,
                  }}>
                    ⭐ SPOTLIGHT{featured.group_letter ? ` · Group ${featured.group_letter}` : stageLabel(featured.id)}
                  </span>
                )}
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: "#9E99B0" }}>
                  <LocalTime iso={featured.kickoff_utc} variant="kickoff" />
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 22 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={flagUrl(featured.home_team.id)} alt={featured.home_team.id} style={{ width: isFinal ? 112 : 96, height: isFinal ? 75 : 64, borderRadius: 11, objectFit: "cover", border: "1px solid rgba(255,255,255,0.16)", boxShadow: "0 6px 22px rgba(0,0,0,0.4)", display: "block" }} />
                  <div style={{ fontSize: isFinal ? 34 : 30, fontWeight: 800, letterSpacing: "-0.02em" }}>{featured.home_team.name}</div>
                  {featured.prediction != null && (
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: isFinal ? 36 : 30, fontWeight: 700, color: homeHex }}>
                      {Math.round(featured.prediction.home_win * 100)}%
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: "#645F77", letterSpacing: "0.1em" }}>VS</span>
                  {featured.prediction != null && (
                    <div style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: 18,
                      fontWeight: 700,
                      color: "#FFC23D",
                      background: "#0B0A12",
                      border: "1px solid rgba(255,194,61,0.3)",
                      padding: "9px 16px",
                      borderRadius: 10,
                    }}>
                      DRAW {Math.round(featured.prediction.draw * 100)}%
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={flagUrl(featured.away_team.id)} alt={featured.away_team.id} style={{ width: isFinal ? 112 : 96, height: isFinal ? 75 : 64, borderRadius: 11, objectFit: "cover", border: "1px solid rgba(255,255,255,0.16)", boxShadow: "0 6px 22px rgba(0,0,0,0.4)", display: "block" }} />
                  <div style={{ fontSize: isFinal ? 34 : 30, fontWeight: 800, letterSpacing: "-0.02em", textAlign: "right" }}>{featured.away_team.name}</div>
                  {featured.prediction != null && (
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: isFinal ? 36 : 30, fontWeight: 700, color: awayHex }}>
                      {Math.round(featured.prediction.away_win * 100)}%
                    </div>
                  )}
                </div>
              </div>
              {featured.prediction != null && (
                <>
                  <div style={{ display: "flex", height: isFinal ? 12 : 10, borderRadius: 99, overflow: "hidden", background: "#1D1A2A", marginTop: 26 }}>
                    <div style={{ width: `${Math.round(featured.prediction.home_win * 100)}%`, background: homeHex }} />
                    <div style={{ width: `${Math.round(featured.prediction.draw * 100)}%`, background: "#FFC23D" }} />
                    <div style={{ width: `${Math.round(featured.prediction.away_win * 100)}%`, background: awayHex }} />
                  </div>
                  {isFinal && (
                    <div style={{
                      display: "flex",
                      gap: 10,
                      marginTop: 18,
                      flexWrap: "wrap",
                    }}>
                      <span style={{
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 11,
                        color: "#7E7892",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.09)",
                        padding: "5px 12px",
                        borderRadius: 7,
                      }}>
                        Recency model favours {featured.prediction.home_win > featured.prediction.away_win ? featured.home_team.name : featured.away_team.name}
                      </span>
                      <span style={{
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 11,
                        color: "#7E7892",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.09)",
                        padding: "5px 12px",
                        borderRadius: 7,
                      }}>
                        ~28% chance of extra time / penalties
                      </span>
                      <Link href="/predictions/compare" style={{
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 11,
                        color: "#2BE38A",
                        background: "rgba(43,227,138,0.08)",
                        border: "1px solid rgba(43,227,138,0.2)",
                        padding: "5px 12px",
                        borderRadius: 7,
                        textDecoration: "none",
                        position: "relative",
                        zIndex: 1,
                      }}>
                        Compare all models →
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <>
          <SectionHeader color="#2BE38A" label="UPCOMING" right={
            <Link href="/matches" style={{ fontSize: 13.5, fontWeight: 600, color: "#2BE38A", textDecoration: "none" }}>All upcoming →</Link>
          } />
          <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 28 }}>
            {[...upcomingByDate.entries()].map(([date, dayMatches]) => (
              <div key={date}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: "#7E7892", letterSpacing: "0.04em", marginBottom: 14 }}>
                  <LocalTime iso={dayMatches[0].kickoff_utc} variant="dayheading" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {dayMatches.map((m) => <MatchCard key={m.id} match={m} />)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Results */}
      {recentReversed.length > 0 && (
        <>
          <SectionHeader color="#5B8CFF" label="RESULTS" right={
            <Link href="/results" style={{ fontSize: 13.5, fontWeight: 600, color: "#2BE38A", textDecoration: "none" }}>All results →</Link>
          } />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 22 }}>
            {recentReversed.map((m) => <MatchCard key={m.id} match={m} compact />)}
          </div>
        </>
      )}

      {/* Latest News */}
      {news.length > 0 && (
        <>
          <SectionHeader color="#FFC23D" label="LATEST NEWS" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
            {news.map((item, i) => (
              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                <div style={{
                  background: "#120F1E",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 14,
                  padding: "18px 22px",
                  cursor: "pointer",
                  transition: "border-color .15s, background .15s",
                }}>
                  <div style={{ fontSize: 16.5, fontWeight: 700, color: "#EDEBF3", lineHeight: 1.4 }}>{item.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 9, fontSize: 13, color: "#7E7892" }}>
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
        </>
      )}
    </div>
  );
}
