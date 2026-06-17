import type { MarketComparison, MarketSource, MatchGrading } from "@/lib/types";

interface MarketPanelProps {
  data: MarketComparison;
}

function sourceName(source: string): string {
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function ColorProbability({ model, market }: { model: number; market: number }) {
  const diff = model - market;
  const absDiff = Math.abs(diff);
  // Colour if disagreement > 5pp
  const color =
    absDiff < 0.05
      ? "text-slate-300"
      : diff > 0
      ? "text-emerald-400"
      : "text-rose-400";

  return (
    <span>
      <span className={color}>{pct(market)}</span>
      {absDiff >= 0.05 && (
        <span className="text-xs text-slate-500 ml-1">
          ({diff > 0 ? "+" : ""}{(diff * 100).toFixed(1)}pp vs model)
        </span>
      )}
    </span>
  );
}

function MarketRow({ source, model }: { source: MarketSource; model: { home_win: number; draw: number; away_win: number } }) {
  return (
    <tr className="border-t border-slate-800">
      <td className="py-2 pr-4 text-slate-400 font-medium text-sm">{sourceName(source.source)}</td>
      <td className="py-2 pr-4 text-sm">
        <ColorProbability model={model.home_win} market={source.devigged.home_win} />
      </td>
      <td className="py-2 pr-4 text-sm">
        <ColorProbability model={model.draw} market={source.devigged.draw ?? 0} />
      </td>
      <td className="py-2 text-sm">
        <ColorProbability model={model.away_win} market={source.devigged.away_win} />
      </td>
    </tr>
  );
}

function GradingSection({ grading }: { grading: MatchGrading }) {
  const outcomeLabel: Record<string, string> = {
    home_win: "Home win",
    draw: "Draw",
    away_win: "Away win",
  };

  const sources = Object.keys(grading.market_log_loss ?? {});

  return (
    <div className="mt-4 pt-4 border-t border-slate-800">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Post-match grading
      </h3>
      <div className="text-sm text-slate-400 mb-3">
        Actual outcome:{" "}
        <span className="text-emerald-400 font-semibold">
          {outcomeLabel[grading.actual_outcome] ?? grading.actual_outcome}
        </span>
        {grading.actual_score && (
          <span className="ml-2 text-slate-500">
            ({grading.actual_score.home_goals}–{grading.actual_score.away_goals})
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 uppercase tracking-wider">
            <th className="text-left pb-1 pr-4">Source</th>
            <th className="text-left pb-1 pr-4">Log loss</th>
            <th className="text-left pb-1">Brier</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-slate-800">
            <td className="py-2 pr-4 text-slate-400 font-medium">Model</td>
            <td className="py-2 pr-4 text-slate-300">{grading.model_log_loss.toFixed(4)}</td>
            <td className="py-2 text-slate-300">{grading.model_brier_score.toFixed(4)}</td>
          </tr>
          {sources.map((src) => (
            <tr key={src} className="border-t border-slate-800">
              <td className="py-2 pr-4 text-slate-400">{sourceName(src)}</td>
              <td className="py-2 pr-4 text-slate-300">
                {(grading.market_log_loss?.[src] ?? 0).toFixed(4)}
              </td>
              <td className="py-2 text-slate-300">
                {(grading.market_brier_score?.[src] ?? 0).toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MarketPanel({ data }: MarketPanelProps) {
  const model = data.model_probabilities;
  const hasMarkets = data.markets && data.markets.length > 0;

  return (
    <div>
      {data.disagreement_score !== undefined && data.disagreement_score > 0.05 && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-950 border border-amber-800 text-amber-300 text-sm">
          Model disagrees with markets by{" "}
          <strong>{(data.disagreement_score * 100).toFixed(1)}pp</strong> on average.
        </div>
      )}

      {hasMarkets ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wider">
              <th className="text-left pb-2 pr-4">Source</th>
              <th className="text-left pb-2 pr-4">Home win</th>
              <th className="text-left pb-2 pr-4">Draw</th>
              <th className="text-left pb-2">Away win</th>
            </tr>
          </thead>
          <tbody>
            {/* Model row */}
            <tr className="border-t border-slate-800">
              <td className="py-2 pr-4 text-slate-400 font-medium">Model</td>
              <td className="py-2 pr-4 text-slate-300">{pct(model.home_win)}</td>
              <td className="py-2 pr-4 text-slate-300">{pct(model.draw)}</td>
              <td className="py-2 text-slate-300">{pct(model.away_win)}</td>
            </tr>
            {data.markets.map((ms) => (
              <MarketRow key={ms.source} source={ms} model={model} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-slate-600 text-sm italic">
          No market data available for this match yet.
        </p>
      )}

      {data.grading && <GradingSection grading={data.grading} />}
    </div>
  );
}
