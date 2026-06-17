import { getLatestSimulation } from "@/lib/api";
import type { StageProbabilities, TeamSimulationResult } from "@/lib/types";

function pct(n: number): string {
  if (n === 0) return "–";
  if (n >= 0.995) return "99%";
  return `${(n * 100).toFixed(0)}%`;
}

// Map probability to a Tailwind text colour for at-a-glance scanning.
function probColour(n: number): string {
  if (n === 0) return "text-slate-700";
  if (n >= 0.5) return "text-emerald-400";
  if (n >= 0.2) return "text-emerald-600";
  if (n >= 0.05) return "text-slate-300";
  return "text-slate-500";
}

const STAGE_COLS: Array<{ key: keyof StageProbabilities; label: string }> = [
  { key: "round_of_32", label: "R32" },
  { key: "round_of_16", label: "R16" },
  { key: "quarter_final", label: "QF" },
  { key: "semi_final", label: "SF" },
  { key: "final", label: "Final" },
  { key: "champion", label: "Win" },
];

function Row({ team }: { team: TeamSimulationResult }) {
  return (
    <tr className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
      <td className="py-2.5 px-3 text-slate-400 text-xs font-mono">
        {team.group ?? "–"}
      </td>
      <td className="py-2.5 px-3 font-medium text-slate-100">
        {team.team_name}
      </td>
      {STAGE_COLS.map(({ key, label: _label }) => {
        const p = team.stage_probabilities[key];
        return (
          <td
            key={key}
            className={`py-2.5 px-3 text-right tabular-nums text-sm font-medium ${probColour(p)}`}
          >
            {pct(p)}
          </td>
        );
      })}
    </tr>
  );
}

export default async function BracketPage() {
  const sim = await getLatestSimulation();

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

  const asOf = new Date(sim.match_results_as_of).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tournament bracket</h1>
        <p className="text-slate-400 mt-1 text-sm">
          {sim.n_simulations.toLocaleString()} simulations ·{" "}
          <span className="text-slate-500">as of {asOf}</span>
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="bg-slate-900 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-3 w-10">Grp</th>
              <th className="py-3 px-3">Team</th>
              {STAGE_COLS.map(({ key, label }) => (
                <th key={key} className="py-3 px-3 text-right">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-slate-950">
            {sorted.map((team) => (
              <Row key={team.team_id} team={team} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-600">
        Probabilities are reach-or-further: P(champion) means winning the
        final. Columns sum to the number of teams that can reach each stage.
      </p>
    </div>
  );
}
