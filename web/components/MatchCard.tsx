import Link from "next/link";
import type { MatchSummary, OutcomeProbabilities, MatchResultSummary, KeyEvent } from "@/lib/types";
import { ProbabilityBar } from "./ProbabilityBar";
import LocalTime from "./LocalTime";

function stageLabel(stage: string, group: string | null): string {
  if (stage === "group" && group) return `Group ${group}`;
  return stage
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function topPick(pred: OutcomeProbabilities): "home_win" | "draw" | "away_win" {
  if (pred.home_win >= pred.draw && pred.home_win >= pred.away_win) return "home_win";
  if (pred.draw >= pred.home_win && pred.draw >= pred.away_win) return "draw";
  return "away_win";
}

function actualOutcome(result: MatchResultSummary): "home_win" | "draw" | "away_win" {
  if (result.home_goals > result.away_goals) return "home_win";
  if (result.away_goals > result.home_goals) return "away_win";
  return "draw";
}

function ScorerLine({ events }: { events: KeyEvent[] }) {
  if (events.length === 0) return null;
  const parts = events.map((e) => {
    const isOG = e.incident_type === "own_goal";
    const name = e.player_name || "Unknown";
    return `${name}${isOG ? " (OG)" : ""} ${e.minute}'`;
  });
  return (
    <span className="text-[11px] text-slate-400 leading-tight">
      {parts.join(", ")}
    </span>
  );
}

export function MatchCard({ match }: { match: MatchSummary }) {
  const isPlayed = match.result !== null;

  const modelCorrect =
    isPlayed && match.prediction != null
      ? topPick(match.prediction) === actualOutcome(match.result!)
      : null;

  const homeGoals = (match.key_events ?? []).filter(
    (e) => (e.incident_type === "goal" || e.incident_type === "own_goal") && e.is_home
  );
  const awayGoals = (match.key_events ?? []).filter(
    (e) => (e.incident_type === "goal" || e.incident_type === "own_goal") && !e.is_home
  );
  const homeRed = (match.key_events ?? []).some(
    (e) => (e.incident_type === "red_card" || e.incident_type === "yellow_red_card") && e.is_home
  );
  const awayRed = (match.key_events ?? []).some(
    (e) => (e.incident_type === "red_card" || e.incident_type === "yellow_red_card") && !e.is_home
  );

  return (
    <Link href={`/matches/${match.id}`} className="block">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-600 transition-colors cursor-pointer">
        {/* Meta row */}
        <div className="flex items-center justify-between mb-3 text-xs text-slate-500">
          <span>{stageLabel(match.stage, match.group_letter)}</span>
          <LocalTime iso={match.kickoff_utc} variant="kickoff" />
        </div>

        {/* Teams + score */}
        <div className="flex items-center gap-3">
          {/* Home team */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-100 text-sm sm:text-base truncate">
                {match.home_team.name}
              </span>
              {homeRed && <span className="text-xs shrink-0">🟥</span>}
            </div>
            {isPlayed && homeGoals.length > 0 && (
              <div className="mt-0.5">
                <ScorerLine events={homeGoals} />
              </div>
            )}
          </div>

          {isPlayed ? (
            <div className="flex-shrink-0 flex items-center gap-1.5 font-mono text-lg font-bold">
              <span className={match.result!.home_goals > match.result!.away_goals ? "text-emerald-400" : "text-slate-300"}>
                {match.result!.home_goals}
              </span>
              <span className="text-slate-600">:</span>
              <span className={match.result!.away_goals > match.result!.home_goals ? "text-emerald-400" : "text-slate-300"}>
                {match.result!.away_goals}
              </span>
            </div>
          ) : (
            <div className="flex-shrink-0 text-slate-600 text-sm font-medium">vs</div>
          )}

          {/* Away team */}
          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center justify-end gap-1.5">
              {awayRed && <span className="text-xs shrink-0">🟥</span>}
              <span className="font-semibold text-slate-100 text-sm sm:text-base truncate">
                {match.away_team.name}
              </span>
            </div>
            {isPlayed && awayGoals.length > 0 && (
              <div className="mt-0.5">
                <ScorerLine events={awayGoals} />
              </div>
            )}
          </div>
        </div>

        {/* For played matches: pre-match model probs + accuracy */}
        {isPlayed && match.prediction && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-600">
                {(match.prediction.home_win * 100).toFixed(0)}% / {(match.prediction.draw * 100).toFixed(0)}% / {(match.prediction.away_win * 100).toFixed(0)}%
              </span>
              {modelCorrect === true && (
                <span className="text-emerald-500 font-medium">Predicted</span>
              )}
              {modelCorrect === false && (
                <span className="text-amber-400 font-medium">Upset</span>
              )}
            </div>
            <ProbabilityBar
              probs={match.prediction}
              homeLabel=""
              awayLabel=""
            />
          </div>
        )}

        {/* Probability bar for upcoming matches */}
        {!isPlayed && match.prediction && (
          <ProbabilityBar
            probs={match.prediction}
            homeLabel={match.home_team.id}
            awayLabel={match.away_team.id}
          />
        )}

        {!isPlayed && !match.prediction && (
          <div className="mt-3 text-xs text-slate-600 italic">
            Prediction not yet available
          </div>
        )}
      </div>
    </Link>
  );
}
