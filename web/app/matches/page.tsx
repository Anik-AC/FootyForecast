import { getMatches } from "@/lib/api";
import { MatchCard } from "@/components/MatchCard";
import type { MatchSummary } from "@/lib/types";
import LocalTime from "@/components/LocalTime";

function groupByDate(matches: MatchSummary[]): Map<string, MatchSummary[]> {
  const groups = new Map<string, MatchSummary[]>();
  for (const m of matches) {
    const date = m.kickoff_utc.slice(0, 10);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(m);
  }
  return groups;
}

export default async function MatchesPage() {
  const matches = await getMatches();
  const upcoming = matches.filter((m) => m.result === null);
  const byDate = groupByDate(upcoming);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Upcoming Matches</h1>
        <p className="text-slate-400 mt-1 text-sm">{upcoming.length} matches remaining</p>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-slate-500 text-center py-16">No upcoming matches.</p>
      ) : (
        <div className="space-y-8">
          {[...byDate.entries()].map(([date, dayMatches]) => (
            <div key={date}>
              <p className="text-xs font-medium text-slate-500 mb-3">
                <LocalTime iso={dayMatches[0].kickoff_utc} variant="dayheading" />
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {dayMatches.map((m) => <MatchCard key={m.id} match={m} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
