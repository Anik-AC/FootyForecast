import { getLatestSimulation, getTeamRatings } from "@/lib/api";
import LocalTime from "@/components/LocalTime";
import BracketTable from "@/components/BracketTable";

export default async function BracketPage() {
  const [sim, ratings] = await Promise.all([
    getLatestSimulation(),
    getTeamRatings(),
  ]);

  if (!sim) {
    return (
      <div className="text-center py-24 text-slate-500">
        <p className="text-lg">No simulation data available yet.</p>
        <p className="text-sm mt-2">
          Run the Go simulator first:{" "}
          <code className="text-slate-400">./simulator --n 100000</code>
        </p>
      </div>
    );
  }

  const sorted = [...sim.teams].sort(
    (a, b) =>
      b.stage_probabilities.champion - a.stage_probabilities.champion
  );


  const hasDelta = sorted.some((t) => t.delta != null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tournament bracket</h1>
        <p className="text-slate-400 mt-1 text-sm">
          {sim.n_simulations.toLocaleString()} simulations ·{" "}
          <span className="text-slate-500">as of <LocalTime iso={sim.match_results_as_of} variant="kickoff" /></span>
          {hasDelta && (
            <span className="ml-2 text-xs text-slate-600">
              · green/red = change since previous run
            </span>
          )}
        </p>
      </div>

      <BracketTable teams={sorted} hasDelta={hasDelta} ratings={ratings} />

      <p className="text-xs text-slate-600">
        Probabilities are reach-or-further: P(champion) means winning the
        final. Elo is a pre-tournament strength rating (higher = stronger).
      </p>
    </div>
  );
}
