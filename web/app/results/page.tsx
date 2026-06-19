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

export default async function ResultsPage() {
  const matches = await getMatches();
  const played = matches.filter((m) => m.result !== null).reverse();
  const byDate = groupByDate(played);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Results</h1>
        <p className="text-slate-400 mt-1 text-sm">{played.length} matches played</p>
      </div>

      {played.length === 0 ? (
        <p className="text-slate-500 text-center py-16">No results yet.</p>
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
