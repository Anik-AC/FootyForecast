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
  const played = [...matches.filter((m) => m.result !== null)].reverse();
  const byDate = groupByDate(played);

  return (
    <div style={{ animation: "ff-up 0.4s ease both", paddingTop: 46 }}>
      <h1 style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.03em", margin: 0 }}>Results</h1>
      <div style={{ color: "#9E99B0", fontSize: 15, marginTop: 10 }}>
        <b style={{ color: "#F2F1F7" }}>{played.length}</b> matches played
      </div>

      {played.length === 0 ? (
        <p style={{ color: "#645F77", textAlign: "center", padding: "64px 0" }}>No results yet.</p>
      ) : (
        <>
          {[...byDate.entries()].map(([date, dayMatches]) => (
            <div key={date} style={{ marginTop: 34 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16 }}>
                <span style={{ width: 4, height: 16, borderRadius: 99, background: "#5B8CFF" }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: "#C8C3D6", letterSpacing: "0.04em" }}>
                  <LocalTime iso={dayMatches[0].kickoff_utc} variant="dayheading" />
                </span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
                {dayMatches.map((m) => <MatchCard key={m.id} match={m} />)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
