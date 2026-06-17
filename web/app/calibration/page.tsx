import { getCalibration } from "@/lib/api";
import type { GradedMatch } from "@/lib/types";

function outcomeLabel(outcome: string): string {
  return { home_win: "H", draw: "D", away_win: "A" }[outcome] ?? outcome;
}

function scoreClass(ll: number): string {
  if (ll < 0.5) return "text-emerald-400";
  if (ll < 1.0) return "text-amber-400";
  return "text-rose-400";
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function MatchRow({ match }: { match: GradedMatch }) {
  const mktSources = Object.keys(match.market_log_loss ?? {});

  return (
    <tr className="border-t border-slate-800 hover:bg-slate-900/50 transition-colors">
      <td className="py-3 pr-4">
        <div className="text-sm font-medium text-slate-200">
          {match.home_team.name} vs {match.away_team.name}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {new Date(match.kickoff_utc).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          })}
        </div>
      </td>
      <td className="py-3 pr-4">
        <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-800 text-slate-300">
          {outcomeLabel(match.actual_outcome)}
        </span>
      </td>
      <td className={`py-3 pr-4 text-sm font-mono ${scoreClass(match.model_log_loss)}`}>
        {match.model_log_loss.toFixed(4)}
      </td>
      <td className={`py-3 pr-4 text-sm font-mono ${scoreClass(match.model_brier_score)}`}>
        {match.model_brier_score.toFixed(4)}
      </td>
      {mktSources.map((src) => (
        <td key={src} className={`py-3 pr-4 text-sm font-mono ${scoreClass(match.market_log_loss?.[src] ?? 0)}`}>
          {(match.market_log_loss?.[src] ?? 0).toFixed(4)}
        </td>
      ))}
    </tr>
  );
}

export default async function CalibrationPage() {
  const data = await getCalibration();

  if (!data || data.total_matches === 0) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-slate-100 mb-4">Calibration</h1>
        <p className="text-slate-500">
          No completed matches have been graded yet. Grading runs after each confirmed result.
        </p>
      </main>
    );
  }

  const marketSources = Object.keys(data.market_mean_log_loss ?? {});

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-slate-100">Calibration</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Matches graded" value={String(data.total_matches)} />
        <SummaryCard
          label="Model mean log loss"
          value={data.model_mean_log_loss.toFixed(4)}
        />
        <SummaryCard
          label="Model mean Brier"
          value={data.model_mean_brier.toFixed(4)}
        />
        {marketSources.slice(0, 1).map((src) => (
          <SummaryCard
            key={src}
            label={`${src.charAt(0).toUpperCase() + src.slice(1)} log loss`}
            value={(data.market_mean_log_loss?.[src] ?? 0).toFixed(4)}
          />
        ))}
      </div>

      {/* Market benchmarks (all sources if > 1) */}
      {marketSources.length > 1 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Market benchmarks (mean over {data.total_matches} matches)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {marketSources.map((src) => (
              <div key={src}>
                <div className="text-xs text-slate-500 uppercase mb-1">{src}</div>
                <div className="text-sm text-slate-300">
                  Log loss: {(data.market_mean_log_loss?.[src] ?? 0).toFixed(4)}
                </div>
                <div className="text-sm text-slate-300">
                  Brier: {(data.market_mean_brier?.[src] ?? 0).toFixed(4)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          &lt;0.5 (good)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          0.5 – 1.0 (ok)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
          &gt;1.0 (poor)
        </span>
        <span className="ml-auto">Lower is better for both metrics</span>
      </div>

      {/* Per-match table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wider">
              <th className="text-left px-4 pt-4 pb-2 pr-4">Match</th>
              <th className="text-left px-0 pt-4 pb-2 pr-4">Result</th>
              <th className="text-left pt-4 pb-2 pr-4">Log loss</th>
              <th className="text-left pt-4 pb-2 pr-4">Brier</th>
              {marketSources.map((src) => (
                <th key={src} className="text-left pt-4 pb-2 pr-4">
                  {src.charAt(0).toUpperCase() + src.slice(1)} LL
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="px-4">
            {data.matches.map((m) => (
              <MatchRow key={m.match_id} match={m} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-600 text-center">
        Log loss and Brier score are computed on 90-minute outcomes (home win / draw / away win). Lower is better. Random three-way baseline: log loss ≈ 1.099, Brier ≈ 0.667.
      </p>
    </main>
  );
}
