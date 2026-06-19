import Link from "next/link";
import { getDisagreements } from "@/lib/api";
import type { DisagreementEntry } from "@/lib/types";
import LocalTime from "@/components/LocalTime";

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function pp(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(0)}pp`;
}

function stageBadge(stage: string): string {
  const map: Record<string, string> = {
    group: "Group",
    round_of_32: "R32",
    round_of_16: "R16",
    quarter_final: "QF",
    semi_final: "SF",
    final: "Final",
  };
  return map[stage] ?? stage;
}

function FavorsBadge({ entry }: { entry: DisagreementEntry }) {
  const favors = entry.model_favors;
  const team =
    favors === "home"
      ? entry.home_team.name
      : favors === "away"
      ? entry.away_team.name
      : "Draw";
  const modelProb =
    favors === "home"
      ? entry.model_probabilities.home_win
      : favors === "away"
      ? entry.model_probabilities.away_win
      : entry.model_probabilities.draw;
  const mktProb =
    favors === "home"
      ? entry.market_probabilities.home_win
      : favors === "away"
      ? entry.market_probabilities.away_win
      : entry.market_probabilities.draw;

  return (
    <div className="text-sm">
      <span className="text-emerald-400 font-medium">Model</span>
      <span className="text-slate-400"> favors </span>
      <span className="text-slate-100 font-medium">{team}</span>
      <span className="text-slate-500">
        {" "}({pct(modelProb)} vs {pct(mktProb)} mkt)
      </span>
    </div>
  );
}

function DisagreementRow({ entry }: { entry: DisagreementEntry }) {
  const score = entry.disagreement_score;
  // Colour scale: >15pp mean diff is very high
  const scoreColour =
    score >= 0.15 ? "text-red-400" : score >= 0.08 ? "text-amber-400" : "text-slate-400";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/matches/${entry.match_id}`}
            className="font-semibold text-slate-100 hover:text-emerald-400 transition-colors"
          >
            {entry.home_team.name} vs {entry.away_team.name}
          </Link>
          <div className="text-xs text-slate-500 mt-0.5">
            {stageBadge(entry.stage)} · <LocalTime iso={entry.kickoff_utc} variant="kickoff" />
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-lg font-bold tabular-nums ${scoreColour}`}>
            {pp(score)}
          </div>
          <div className="text-xs text-slate-600">avg diff</div>
        </div>
      </div>

      <FavorsBadge entry={entry} />

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {(["home_win", "draw", "away_win"] as const).map((key, i) => {
          const labels = [entry.home_team.name, "Draw", entry.away_team.name];
          const modelP = entry.model_probabilities[key];
          const mktP = entry.market_probabilities[key];
          const diff = modelP - mktP;
          const diffColour =
            Math.abs(diff) >= 0.08
              ? diff > 0
                ? "text-emerald-400"
                : "text-red-400"
              : "text-slate-500";
          return (
            <div key={key} className="bg-slate-950 rounded-lg p-2">
              <div className="text-slate-500 truncate mb-1">{labels[i]}</div>
              <div className="font-mono font-bold text-slate-100">{pct(modelP)}</div>
              <div className="text-slate-600">mkt {pct(mktP)}</div>
              <div className={`font-mono text-xs ${diffColour}`}>
                {diff >= 0 ? "+" : ""}{(diff * 100).toFixed(0)}pp
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-slate-700">
        Market: {entry.market_source}
      </div>
    </div>
  );
}

export default async function DisagreementsPage() {
  const entries = await getDisagreements();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Model vs Market: Disagreements</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Upcoming matches ranked by how much the model disagrees with prediction markets.
          High disagreement means the model sees a different probability than the market does.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-24 text-slate-500">
          <p className="text-lg">No disagreements to show yet.</p>
          <p className="text-sm mt-2 text-slate-600">
            Market data is needed to compare against model predictions.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <DisagreementRow key={entry.match_id} entry={entry} />
          ))}
        </div>
      )}

      <p className="text-xs text-slate-600">
        Disagreement score is the mean absolute difference across win/draw/loss probabilities.
        Markets are de-vigged before comparison.
      </p>
    </div>
  );
}
