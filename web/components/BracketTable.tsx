"use client";

import { useState } from "react";
import type { StageProbabilities, TeamSimulationResult, TeamRating } from "@/lib/types";

const STAGE_COLS: Array<{ key: keyof StageProbabilities; label: string }> = [
  { key: "round_of_32", label: "R32" },
  { key: "round_of_16", label: "R16" },
  { key: "quarter_final", label: "QF" },
  { key: "semi_final", label: "SF" },
  { key: "final", label: "Final" },
  { key: "champion", label: "Win" },
];

function pct(n: number): string {
  if (n === 0) return "–";
  if (n >= 0.995) return "99%";
  return `${(n * 100).toFixed(0)}%`;
}

function delta(n: number): string {
  if (Math.abs(n) < 0.001) return "";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(0)}`;
}

function probColour(n: number): string {
  if (n === 0) return "text-slate-700";
  if (n >= 0.5) return "text-emerald-400";
  if (n >= 0.2) return "text-emerald-600";
  if (n >= 0.05) return "text-slate-300";
  return "text-slate-500";
}

function deltaColour(n: number): string {
  if (n > 0.005) return "text-emerald-500";
  if (n < -0.005) return "text-red-500";
  return "text-slate-600";
}

function eloColour(rating: number): string {
  if (rating >= 1900) return "text-emerald-400";
  if (rating >= 1700) return "text-slate-200";
  if (rating >= 1500) return "text-slate-400";
  return "text-slate-600";
}

function SpotlightPanel({
  team,
  elo,
}: {
  team: TeamSimulationResult;
  elo: number | null;
}) {
  const stages: Array<{ key: keyof StageProbabilities; label: string }> = [
    { key: "round_of_32", label: "Round of 32" },
    { key: "round_of_16", label: "Round of 16" },
    { key: "quarter_final", label: "Quarter-final" },
    { key: "semi_final", label: "Semi-final" },
    { key: "final", label: "Final" },
    { key: "champion", label: "Champion" },
  ];

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-bold text-slate-100 text-lg">{team.team_name}</div>
          {team.group && (
            <div className="text-xs text-slate-500">Group {team.group}</div>
          )}
        </div>
        <div className="text-right flex flex-col items-end gap-1">
          <div className="text-2xl font-bold text-emerald-400">
            {pct(team.stage_probabilities.champion)}
          </div>
          <div className="text-xs text-slate-500">to win</div>
          {elo != null && (
            <div className={`text-sm font-mono font-semibold ${eloColour(elo)}`}>
              Elo {Math.round(elo)}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {stages.map(({ key, label }) => {
          const prob = team.stage_probabilities[key];
          const d = team.delta?.[key] ?? 0;
          return (
            <div key={key} className="flex items-center gap-3">
              <div className="w-28 text-xs text-slate-400 shrink-0">{label}</div>
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full"
                  style={{ width: `${Math.min(prob * 100, 100)}%` }}
                />
              </div>
              <div className="w-10 text-right text-sm font-mono tabular-nums text-slate-200 shrink-0">
                {pct(prob)}
              </div>
              {Math.abs(d) >= 0.001 && (
                <div className={`w-10 text-right text-xs font-mono tabular-nums shrink-0 ${deltaColour(d)}`}>
                  {delta(d)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {team.delta && (
        <p className="text-xs text-slate-600 mt-3">
          Numbers in green/red show change since previous simulation run.
        </p>
      )}
    </div>
  );
}

interface Props {
  teams: TeamSimulationResult[];
  hasDelta: boolean;
  ratings: TeamRating[];
}

export default function BracketTable({ teams, hasDelta, ratings }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedTeam = teams.find((t) => t.team_id === selected) ?? null;

  const ratingMap = new Map(ratings.map((r) => [r.team_id, r.rating]));

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-slate-900 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-3 w-10">Grp</th>
              <th className="py-3 px-3">Team</th>
              <th className="py-3 px-3 text-right" title="Elo strength rating">Elo</th>
              {STAGE_COLS.map(({ key, label }) => (
                <th key={key} className="py-3 px-3 text-right">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-slate-950">
            {teams.map((team) => {
              const isSelected = team.team_id === selected;
              const elo = ratingMap.get(team.team_id) ?? null;
              return (
                <tr
                  key={team.team_id}
                  className={`border-b border-slate-800 transition-colors cursor-pointer ${
                    isSelected ? "bg-slate-800" : "hover:bg-slate-800/50"
                  }`}
                  onClick={() => setSelected(isSelected ? null : team.team_id)}
                >
                  <td className="py-2.5 px-3 text-slate-400 text-xs font-mono">
                    {team.group ?? "–"}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-100">
                    {team.team_name}
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums text-sm font-mono ${elo != null ? eloColour(elo) : "text-slate-700"}`}>
                    {elo != null ? Math.round(elo) : "–"}
                  </td>
                  {STAGE_COLS.map(({ key }) => {
                    const p = team.stage_probabilities[key];
                    const d = team.delta?.[key] ?? 0;
                    return (
                      <td
                        key={key}
                        className={`py-2.5 px-3 text-right tabular-nums text-sm font-medium ${probColour(p)}`}
                      >
                        {pct(p)}
                        {hasDelta && Math.abs(d) >= 0.005 && (
                          <span className={`ml-1 text-xs ${deltaColour(d)}`}>
                            {delta(d)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedTeam && (
        <SpotlightPanel
          team={selectedTeam}
          elo={ratingMap.get(selectedTeam.team_id) ?? null}
        />
      )}

      <p className="text-xs text-slate-600 mt-3">
        Click a team to see their path probabilities.{" "}
        {hasDelta && "Green/red numbers show change from last simulation."}
      </p>
    </div>
  );
}
