import { getMatches } from "@/lib/api";
import { MatchCard } from "@/components/MatchCard";
import type { MatchSummary } from "@/lib/types";

// Group matches by date (UTC date string "YYYY-MM-DD").
function groupByDate(matches: MatchSummary[]): Map<string, MatchSummary[]> {
  const groups = new Map<string, MatchSummary[]>();
  for (const m of matches) {
    const date = m.kickoff_utc.slice(0, 10); // "YYYY-MM-DD"
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(m);
  }
  return groups;
}

function formatDateHeading(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default async function HomePage() {
  const matches = await getMatches();

  if (matches.length === 0) {
    return (
      <div className="text-center py-24 text-slate-500">
        <p className="text-lg">No fixtures available yet.</p>
        <p className="text-sm mt-2">
          Make sure the Go API is running and fixtures are loaded.
        </p>
      </div>
    );
  }

  const played = matches.filter((m) => m.result !== null);
  const upcoming = matches.filter((m) => m.result === null);
  const byDate = groupByDate(upcoming);

  return (
    <div className="space-y-10">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold">FIFA World Cup 2026</h1>
        <p className="text-slate-400 mt-1 text-sm">
          {played.length} matches played · {upcoming.length} remaining
        </p>
      </div>

      {/* Upcoming matches grouped by date */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">
            Upcoming
          </h2>
          <div className="space-y-8">
            {[...byDate.entries()].map(([date, dayMatches]) => (
              <div key={date}>
                <p className="text-xs font-medium text-slate-500 mb-3">
                  {formatDateHeading(date)}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {dayMatches.map((m) => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recently played */}
      {played.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">
            Results
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...played].reverse().map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
