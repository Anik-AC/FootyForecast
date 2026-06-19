import { getMatches } from "@/lib/api";
import { MatchCard } from "@/components/MatchCard";
import UserStatsBanner from "@/components/UserStatsBanner";
import Link from "next/link";
import type { MatchSummary } from "@/lib/types";
import LocalTime from "@/components/LocalTime";

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
      link:  item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "",
      source: item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() ?? "",
      pubDate: item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "",
    })).filter(i => i.title);
  } catch { return []; }
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


export default async function HomePage() {
  const [matches, news] = await Promise.all([getMatches(), fetchHomeNews()]);

  if (matches.length === 0) {
    return (
      <div className="text-center py-24 text-slate-500">
        <p className="text-lg">No fixtures available yet.</p>
        <p className="text-sm mt-2">Make sure the Go API is running and fixtures are loaded.</p>
      </div>
    );
  }

  const now = new Date();
  const cutoffFuture = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const cutoffPast = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const upcoming = matches.filter(
    (m) => m.result === null && new Date(m.kickoff_utc) <= cutoffFuture
  );
  const recent = matches.filter(
    (m) => m.result !== null && new Date(m.kickoff_utc) >= cutoffPast
  );

  const totalPlayed = matches.filter((m) => m.result !== null).length;
  const totalUpcoming = matches.filter((m) => m.result === null).length;

  const upcomingByDate = groupByDate(upcoming);
  const recentReversed = [...recent].reverse();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">FIFA World Cup 2026</h1>
        <p className="text-slate-400 mt-1 text-sm">
          {totalPlayed} matches played · {totalUpcoming} remaining
        </p>
      </div>

      <UserStatsBanner />

      {upcoming.length === 0 && recent.length === 0 && (
        <div className="text-center py-16 text-slate-500 space-y-2">
          <p>No matches in the next 48 hours.</p>
          <p className="text-sm">
            <Link href="/matches" className="text-emerald-400 hover:underline">View all upcoming matches</Link>
            {" · "}
            <Link href="/results" className="text-emerald-400 hover:underline">View all results</Link>
          </p>
        </div>
      )}

      {upcoming.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">
              Next 48 hours
            </h2>
            <Link href="/matches" className="text-xs text-emerald-400 hover:underline">
              All upcoming &rarr;
            </Link>
          </div>
          <div className="space-y-8">
            {[...upcomingByDate.entries()].map(([date, dayMatches]) => (
              <div key={date}>
                <p className="text-xs font-medium text-slate-500 mb-3"><LocalTime iso={dayMatches[0].kickoff_utc} variant="dayheading" /></p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {dayMatches.map((m) => <MatchCard key={m.id} match={m} />)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {recentReversed.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">
              Recent results
            </h2>
            <Link href="/results" className="text-xs text-emerald-400 hover:underline">
              All results &rarr;
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {recentReversed.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {news.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">
              Latest News
            </h2>
            <Link href="/stats" className="text-xs text-emerald-400 hover:underline">
              More &rarr;
            </Link>
          </div>
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
        </section>
      )}
    </div>
  );
}
