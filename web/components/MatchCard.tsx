import Link from "next/link";
import type { MatchSummary } from "@/lib/types";
import { ProbabilityBar } from "./ProbabilityBar";

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function stageLabel(stage: string, group: string | null): string {
  if (stage === "group" && group) return `Group ${group}`;
  return stage
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface TeamNameProps {
  name: string;
  align: "left" | "right";
}

function TeamName({ name, align }: TeamNameProps) {
  return (
    <div
      className={`flex-1 font-semibold text-slate-100 text-sm sm:text-base truncate ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {name}
    </div>
  );
}

export function MatchCard({ match }: { match: MatchSummary }) {
  const isPlayed = match.result !== null;

  return (
    <Link href={`/matches/${match.id}`} className="block">
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-600 transition-colors cursor-pointer">
      {/* Meta row */}
      <div className="flex items-center justify-between mb-3 text-xs text-slate-500">
        <span>{stageLabel(match.stage, match.group_letter)}</span>
        <span>{formatKickoff(match.kickoff_utc)}</span>
      </div>

      {/* Teams + score/probability row */}
      <div className="flex items-center gap-3">
        <TeamName name={match.home_team.name} align="left" />

        {isPlayed ? (
          /* Confirmed result */
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
          /* VS separator for upcoming */
          <div className="flex-shrink-0 text-slate-600 text-sm font-medium">
            vs
          </div>
        )}

        <TeamName name={match.away_team.name} align="right" />
      </div>

      {/* Probability bar for upcoming matches */}
      {!isPlayed && match.prediction && (
        <ProbabilityBar
          probs={match.prediction}
          homeLabel={match.home_team.id}
          awayLabel={match.away_team.id}
        />
      )}

      {/* No prediction available yet */}
      {!isPlayed && !match.prediction && (
        <div className="mt-3 text-xs text-slate-600 italic">
          Prediction not yet available
        </div>
      )}
    </div>
    </Link>
  );
}
