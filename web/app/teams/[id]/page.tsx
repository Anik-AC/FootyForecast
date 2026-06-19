import { getTeamDetail, getCalibration } from "@/lib/api";
import { MatchCard } from "@/components/MatchCard";
import { notFound } from "next/navigation";
import type { MatchSummary, GradedMatch } from "@/lib/types";

// ── Team news via Google News RSS ─────────────────────────────────────────────

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
    })).filter(i => i.title);
  } catch { return []; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [team, calibration] = await Promise.all([
    getTeamDetail(id),
    getCalibration(),
  ]);

  if (!team) notFound();

  const news = await fetchTeamNews(team.name);

  const played = team.fixtures.filter((m: MatchSummary) => m.result !== null);
  const upcoming = team.fixtures.filter((m: MatchSummary) => m.result === null);

  const modelStats = calibration
    ? teamAccuracy(calibration.matches, team.id)
    : null;

  const hasPlayers = team.players.length > 0;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{team.name}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
            <span>{team.confederation}</span>
            {team.group && <span>· Group {team.group}</span>}
            {team.elo_rating != null && (
              <span>· Elo <span className="font-bold text-slate-200">{Math.round(team.elo_rating)}</span></span>
            )}
          </div>
        </div>
        {/* W/D/L record */}
        {team.record.played > 0 && (
          <div className="flex gap-4 text-center shrink-0">
            <div>
              <div className="text-xl font-bold text-emerald-400">{team.record.won}</div>
              <div className="text-[10px] text-slate-500 uppercase">W</div>
            </div>
            <div>
              <div className="text-xl font-bold text-slate-300">{team.record.drawn}</div>
              <div className="text-[10px] text-slate-500 uppercase">D</div>
            </div>
            <div>
              <div className="text-xl font-bold text-red-400">{team.record.lost}</div>
              <div className="text-[10px] text-slate-500 uppercase">L</div>
            </div>
            <div>
              <div className="text-xl font-bold text-slate-100">{team.record.gf}–{team.record.ga}</div>
              <div className="text-[10px] text-slate-500 uppercase">GF–GA</div>
            </div>
          </div>
        )}
      </div>

      {/* Model stats for this team */}
      {modelStats && modelStats.graded > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Model Performance</h2>
          <div className="flex gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-3 text-center">
              <div className="text-lg font-bold text-slate-100">{modelStats.correct}/{modelStats.graded}</div>
              <div className="text-[10px] text-slate-500 uppercase mt-0.5">Correct calls</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-3 text-center">
              <div className={`text-lg font-bold ${modelStats.graded > 0 && modelStats.correct / modelStats.graded >= 0.6 ? "text-emerald-400" : "text-slate-100"}`}>
                {modelStats.graded > 0 ? Math.round((modelStats.correct / modelStats.graded) * 100) : 0}%
              </div>
              <div className="text-[10px] text-slate-500 uppercase mt-0.5">Accuracy</div>
            </div>
          </div>
        </section>
      )}

      {/* Player stats */}
      {hasPlayers && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Player Stats</h2>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="text-left py-2.5 px-4">Player</th>
                  <th className="text-center py-2.5 px-3">Apps</th>
                  <th className="text-center py-2.5 px-3">Goals</th>
                  <th className="text-center py-2.5 px-3">Assists</th>
                  <th className="text-center py-2.5 px-3">Pens</th>
                </tr>
              </thead>
              <tbody>
                {team.players.map((p, i) => (
                  <tr key={i} className="border-b border-slate-800 last:border-0">
                    <td className="py-2.5 px-4 font-medium text-slate-100">{p.player_name}</td>
                    <td className="py-2.5 px-3 text-center text-slate-500 tabular-nums">{p.appearances || "–"}</td>
                    <td className="py-2.5 px-3 text-center font-bold tabular-nums text-emerald-400">{p.goals}</td>
                    <td className="py-2.5 px-3 text-center tabular-nums text-slate-300">{p.assists || "–"}</td>
                    <td className="py-2.5 px-3 text-center tabular-nums text-slate-500">{p.penalties || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-700">Cards data not yet available on current data plan.</p>
        </section>
      )}

      {/* Upcoming fixtures */}
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Upcoming</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {/* Results */}
      {played.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Results</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...played].reverse().map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {/* Team news */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Latest News</h2>
        {news.length === 0 ? (
          <p className="text-slate-500 text-sm">No news found for {team.name}.</p>
        ) : (
          <div className="space-y-2">
            {news.map((item, i) => (
              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer"
                className="block bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 hover:border-slate-600 transition-colors">
                <p className="text-sm font-medium text-slate-100 leading-snug">{item.title}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  {item.source && <span>{item.source}</span>}
                  {item.source && item.pubDate && <span>·</span>}
                  {item.pubDate && (
                    <span>{new Date(item.pubDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
