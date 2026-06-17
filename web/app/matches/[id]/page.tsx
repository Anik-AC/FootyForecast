import { notFound } from "next/navigation";
import Link from "next/link";
import { getMatchPrediction, getMarketComparison } from "@/lib/api";
import { ProbabilityBar } from "@/components/ProbabilityBar";
import { ScorelineHeatmap } from "@/components/ScorelineHeatmap";
import { MarketPanel } from "@/components/MarketPanel";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 rounded-lg p-4 text-center">
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

export default async function MatchDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [prediction, market] = await Promise.all([
    getMatchPrediction(id),
    getMarketComparison(id),
  ]);

  if (!prediction) notFound();

  const { home_team, away_team, outcome_probabilities: probs, scoreline_grid, totals, expected_goals } = prediction;

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Back link */}
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
        &larr; All matches
      </Link>

      {/* Match header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="text-xs text-slate-500 mb-4 text-center">{formatDate(prediction.match_date)}</div>
        <div className="flex items-center justify-center gap-6">
          <div className="flex-1 text-right">
            <div className="text-xl font-bold text-slate-100">{home_team.name}</div>
            <div className="text-sm text-slate-500">{home_team.id}</div>
          </div>
          <div className="text-slate-600 font-semibold text-lg">vs</div>
          <div className="flex-1 text-left">
            <div className="text-xl font-bold text-slate-100">{away_team.name}</div>
            <div className="text-sm text-slate-500">{away_team.id}</div>
          </div>
        </div>

        {/* Outcome probability bar */}
        <div className="mt-6">
          <ProbabilityBar
            probs={probs}
            homeLabel={home_team.id}
            awayLabel={away_team.id}
          />
        </div>

        {/* Win / Draw / Away % */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <StatBox label={`${home_team.id} win`} value={`${(probs.home_win * 100).toFixed(1)}%`} />
          <StatBox label="Draw" value={`${(probs.draw * 100).toFixed(1)}%`} />
          <StatBox label={`${away_team.id} win`} value={`${(probs.away_win * 100).toFixed(1)}%`} />
        </div>
      </div>

      {/* Expected goals */}
      {expected_goals && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Expected Goals</h2>
          <div className="grid grid-cols-2 gap-4">
            <StatBox label={`${home_team.name} xG`} value={expected_goals.home_xg.toFixed(2)} />
            <StatBox label={`${away_team.name} xG`} value={expected_goals.away_xg.toFixed(2)} />
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Match Totals</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox label="Over 1.5" value={`${(totals.over_1_5 * 100).toFixed(1)}%`} />
          <StatBox label="Over 2.5" value={`${(totals.over_2_5 * 100).toFixed(1)}%`} />
          <StatBox label="Over 3.5" value={`${(totals.over_3_5 * 100).toFixed(1)}%`} />
          <StatBox label="BTTS" value={`${(totals.btts * 100).toFixed(1)}%`} />
        </div>
      </div>

      {/* Model vs market */}
      {market && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Model vs Market
          </h2>
          <MarketPanel data={market} />
        </div>
      )}

      {/* Scoreline heatmap */}
      {scoreline_grid && scoreline_grid.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Scoreline Probabilities
          </h2>
          <ScorelineHeatmap
            grid={scoreline_grid}
            homeTeam={home_team.id}
            awayTeam={away_team.id}
          />
        </div>
      )}

      {/* Model metadata */}
      <div className="text-xs text-slate-600 text-center space-y-1">
        <div>Model version: {prediction.model_version}</div>
        <div>Data as of: {formatDate(prediction.model_as_of)}</div>
      </div>
    </main>
  );
}
