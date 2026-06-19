"use client";

import { useState } from "react";
import type { MatchPlayerStat } from "@/lib/types";

interface Props {
  players: MatchPlayerStat[];
  homeTeam: string;
  awayTeam: string;
}

type Tab = "general" | "attack" | "defense" | "passing" | "goalkeeping";

const TABS: { key: Tab; label: string }[] = [
  { key: "general", label: "General" },
  { key: "attack", label: "Attack" },
  { key: "defense", label: "Defense" },
  { key: "passing", label: "Passing" },
  { key: "goalkeeping", label: "GK" },
];

interface Col {
  key: keyof MatchPlayerStat;
  label: string;
  short: string;
}

const COLS: Record<Tab, Col[]> = {
  general: [
    { key: "minutes_played", label: "Minutes", short: "Mins" },
    { key: "rating", label: "Rating", short: "Rtg" },
    { key: "goals", label: "Goals", short: "G" },
    { key: "assists", label: "Assists", short: "A" },
    { key: "yellow_cards", label: "Yellow Cards", short: "Y" },
    { key: "red_cards", label: "Red Cards", short: "R" },
  ],
  attack: [
    { key: "shots", label: "Shots", short: "Sh" },
    { key: "shots_on_target", label: "On Target", short: "SoT" },
    { key: "big_chances_created", label: "Big Chances Created", short: "BCC" },
    { key: "big_chances_missed", label: "Big Chances Missed", short: "BCM" },
    { key: "goals_inside_box", label: "Inside Box", short: "IB" },
    { key: "goals_outside_box", label: "Outside Box", short: "OB" },
    { key: "dribble_attempts", label: "Dribbles Att.", short: "DA" },
    { key: "dribbles_won", label: "Dribbles Won", short: "DW" },
  ],
  defense: [
    { key: "tackles", label: "Tackles", short: "Tck" },
    { key: "interceptions", label: "Interceptions", short: "Int" },
    { key: "clearances", label: "Clearances", short: "Clr" },
    { key: "blocks", label: "Blocks", short: "Blk" },
    { key: "duels_total", label: "Duels", short: "Dls" },
    { key: "duels_won", label: "Duels Won", short: "DW" },
    { key: "aerial_duels_won", label: "Aerial Won", short: "AW" },
  ],
  passing: [
    { key: "passes_total", label: "Passes", short: "Pas" },
    { key: "passes_accurate", label: "Accurate", short: "Acc" },
    { key: "key_passes", label: "Key Passes", short: "KP" },
    { key: "long_balls_total", label: "Long Balls", short: "LB" },
    { key: "long_balls_accurate", label: "Long Acc.", short: "LA" },
    { key: "crosses_total", label: "Crosses", short: "Crs" },
    { key: "crosses_accurate", label: "Cross Acc.", short: "CA" },
  ],
  goalkeeping: [
    { key: "saves", label: "Saves", short: "Sav" },
    { key: "saves_inside_box", label: "Inside Box", short: "IB" },
    { key: "penalties_saved", label: "Pen Saved", short: "PS" },
    { key: "runs_out", label: "Runs Out", short: "RO" },
    { key: "clean_sheet", label: "Clean Sheet", short: "CS" },
  ],
};

function fmtVal(val: unknown): string {
  if (val == null) return "-";
  if (typeof val === "boolean") return val ? "Y" : "N";
  if (typeof val === "number") return val % 1 === 0 ? String(val) : val.toFixed(1);
  return String(val);
}

function TeamTable({
  players,
  cols,
  teamName,
}: {
  players: MatchPlayerStat[];
  cols: Col[];
  teamName: string;
}) {
  if (!players.length) return null;
  return (
    <div>
      <div className="text-xs text-slate-500 font-medium mb-1 px-1">{teamName}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="py-2 pr-3 text-slate-500 font-medium whitespace-nowrap">Player</th>
              <th className="py-2 pr-2 text-slate-500 font-medium text-center whitespace-nowrap">Pos</th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className="py-2 px-2 text-slate-500 font-medium text-center whitespace-nowrap"
                  title={c.label}
                >
                  {c.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.sofascore_player_id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="py-1.5 pr-3 text-slate-200 whitespace-nowrap">{p.player_name}</td>
                <td className="py-1.5 pr-2 text-slate-500 text-center">{p.position ?? "-"}</td>
                {cols.map((c) => {
                  const val = p[c.key];
                  const isHighlight =
                    c.key === "goals" && typeof val === "number" && val > 0;
                  return (
                    <td
                      key={c.key}
                      className={`py-1.5 px-2 text-center font-mono ${
                        isHighlight ? "text-emerald-400 font-bold" : "text-slate-300"
                      }`}
                    >
                      {fmtVal(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PlayerStatsTable({ players, homeTeam, awayTeam }: Props) {
  const [tab, setTab] = useState<Tab>("general");

  if (!players.length) return null;

  const home = players.filter((p) => p.is_home);
  const away = players.filter((p) => !p.is_home);
  const cols = COLS[tab];

  // Hide GK tab if no goalkeeper data exists in any player
  const hasGKData = players.some((p) => p.saves != null || p.clean_sheet != null);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Player Statistics
      </h2>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-800 pb-1 overflow-x-auto">
        {TABS.filter((t) => t.key !== "goalkeeping" || hasGKData).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors whitespace-nowrap ${
              tab === t.key
                ? "text-slate-100 border-b-2 border-emerald-500"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        <TeamTable players={home} cols={cols} teamName={homeTeam} />
        <TeamTable players={away} cols={cols} teamName={awayTeam} />
      </div>
    </div>
  );
}
