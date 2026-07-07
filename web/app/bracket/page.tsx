import { getLatestSimulation, getTeamRatings } from "@/lib/api";
import LocalTime from "@/components/LocalTime";
import BracketTable from "@/components/BracketTable";

const MONO = "'JetBrains Mono',monospace";

export default async function BracketPage() {
  const [sim, ratings] = await Promise.all([
    getLatestSimulation(),
    getTeamRatings(),
  ]);

  if (!sim) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0", animation: "ff-up 0.4s ease both" }}>
        <p style={{ fontSize: 18, color: "#7E7892" }}>No simulation data available yet.</p>
        <p style={{ fontSize: 13, color: "#4A4560", marginTop: 10 }}>
          Run the Go simulator first:{" "}
          <span style={{ fontFamily: MONO, color: "#9E99B0", background: "#15131F", padding: "2px 8px", borderRadius: 6 }}>
            ./simulator --n 100000
          </span>
        </p>
      </div>
    );
  }

  const sorted = [...sim.teams].sort(
    (a, b) => b.stage_probabilities.champion - a.stage_probabilities.champion
  );

  const hasDelta = sorted.some((t) => t.delta != null);

  return (
    <div style={{ animation: "ff-up 0.4s ease both", paddingTop: 46 }}>
      <h1 style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.03em", margin: 0 }}>
        Tournament{" "}
        <span style={{ background: "linear-gradient(90deg,#2BE38A,#1FD0C0,#5B8CFF)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>Bracket</span>
      </h1>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, marginBottom: 32, flexWrap: "wrap" as const }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: "#9E99B0" }}>
          <b style={{ color: "#F2F1F7" }}>{sim.n_simulations.toLocaleString()}</b> simulations
        </span>
        <span style={{ color: "#3F3A52" }}>·</span>
        <span style={{ fontFamily: MONO, fontSize: 13, color: "#645F77" }}>
          as of <LocalTime iso={sim.match_results_as_of} variant="kickoff" />
        </span>
        {hasDelta && (
          <>
            <span style={{ color: "#3F3A52" }}>·</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#4A4560" }}>
              green/red = change since previous run
            </span>
          </>
        )}
      </div>

      <BracketTable teams={sorted} hasDelta={hasDelta} ratings={ratings} />

      <p style={{ fontFamily: MONO, fontSize: 12.5, color: "#4A4560", marginTop: 18 }}>
        Probabilities are reach-or-further: P(champion) means winning the final.
        Elo is a pre-tournament strength rating (higher = stronger).
      </p>
    </div>
  );
}
