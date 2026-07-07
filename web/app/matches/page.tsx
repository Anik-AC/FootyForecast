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
    <div style={{ animation: "ff-up 0.4s ease both", paddingTop: 46 }}>
      <h1 className="ff-page-h1" style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.03em", margin: 0 }}>
        Upcoming{" "}
        <span style={{ background: "linear-gradient(90deg,#2BE38A,#1FD0C0,#5B8CFF)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>Matches</span>
      </h1>
      <div style={{ color: "#9E99B0", fontSize: 15, marginTop: 10 }}>
        <b style={{ color: "#F2F1F7" }}>{upcoming.length}</b> matches remaining
      </div>

      {upcoming.length === 0 ? (
        <p style={{ color: "#645F77", textAlign: "center", padding: "64px 0" }}>No upcoming matches.</p>
      ) : (
        <>
          {[...byDate.entries()].map(([date, dayMatches]) => (
            <div key={date} style={{ marginTop: 34 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16 }}>
                <span style={{ width: 4, height: 16, borderRadius: 99, background: "#2BE38A" }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: "#C8C3D6", letterSpacing: "0.04em" }}>
                  <LocalTime iso={dayMatches[0].kickoff_utc} variant="dayheading" />
                </span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
              </div>
              <div className="ff-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {dayMatches.map((m) => <MatchCard key={m.id} match={m} />)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
