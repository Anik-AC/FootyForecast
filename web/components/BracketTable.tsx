"use client";

import { useState } from "react";
import Link from "next/link";
import type { StageProbabilities, TeamSimulationResult, TeamRating } from "@/lib/types";

const MONO = "'JetBrains Mono',monospace";

const STAGE_COLS: Array<{ key: keyof StageProbabilities; label: string }> = [
  { key: "round_of_32", label: "R32" },
  { key: "round_of_16", label: "R16" },
  { key: "quarter_final", label: "QF" },
  { key: "semi_final", label: "SF" },
  { key: "final", label: "FINAL" },
  { key: "champion", label: "CHAMP" },
];

function pct(n: number): string {
  if (n === 0) return "–";
  if (n >= 0.995) return "99%";
  return `${(n * 100).toFixed(0)}%`;
}

function delta(n: number): string {
  if (Math.abs(n) < 0.001) return "";
  return `${n > 0 ? "+" : ""}${(n * 100).toFixed(0)}`;
}

function probColor(n: number): string {
  if (n === 0) return "#3F3A52";
  if (n >= 0.5) return "#2BE38A";
  if (n >= 0.2) return "#1FD0C0";
  if (n >= 0.05) return "#C8C3D6";
  return "#7E7892";
}

function deltaColor(n: number): string {
  if (n > 0.005) return "#2BE38A";
  if (n < -0.005) return "#FF5D6A";
  return "#4A4560";
}

function eloColor(rating: number): string {
  if (rating >= 1900) return "#2BE38A";
  if (rating >= 1700) return "#F2F1F7";
  if (rating >= 1500) return "#9E99B0";
  return "#645F77";
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
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(43,227,138,0.2)",
      borderRadius: 16,
      padding: "20px 24px",
      marginTop: 12,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#F2F1F7" }}>
            <Link href={`/teams/${team.team_id}`} style={{ textDecoration: "none", color: "#F2F1F7" }}>
              {team.team_name}
            </Link>
          </div>
          {team.group && (
            <div style={{ fontFamily: MONO, fontSize: 12, color: "#645F77", marginTop: 4 }}>Group {team.group}</div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: "#2BE38A" }}>
            {pct(team.stage_probabilities.champion)}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: "#645F77", marginTop: 2 }}>to win</div>
          {elo != null && (
            <div style={{ fontFamily: MONO, fontSize: 13, color: eloColor(elo), marginTop: 4 }}>
              Elo {Math.round(elo)}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {stages.map(({ key, label }) => {
          const prob = team.stage_probabilities[key];
          const d = team.delta?.[key] ?? 0;
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 120, fontSize: 13, color: "#9E99B0", flexShrink: 0 }}>{label}</div>
              <div style={{ flex: 1, height: 6, background: "#1D1A2A", borderRadius: 99, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    borderRadius: 99,
                    width: `${Math.min(prob * 100, 100)}%`,
                    background: "linear-gradient(90deg,#2BE38A,#1FD0C0)",
                  }}
                />
              </div>
              <div style={{ width: 42, textAlign: "right", fontFamily: MONO, fontSize: 13, color: "#C8C3D6", flexShrink: 0 }}>
                {pct(prob)}
              </div>
              {Math.abs(d) >= 0.001 && (
                <div style={{ width: 36, textAlign: "right", fontFamily: MONO, fontSize: 11, color: deltaColor(d), flexShrink: 0 }}>
                  {delta(d)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {team.delta && (
        <p style={{ fontFamily: MONO, fontSize: 11.5, color: "#4A4560", marginTop: 14 }}>
          Numbers in green/red show change since previous simulation run.
        </p>
      )}
    </div>
  );
}

const TH: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.08em",
  color: "#645F77",
  paddingTop: 10,
  paddingBottom: 10,
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  background: "#15131F",
};

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
      <div style={{
        background: "#120F1E",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16,
        overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: "left", paddingLeft: 18, width: 46 }}>GRP</th>
              <th style={{ ...TH, textAlign: "left" }}>TEAM</th>
              <th style={{ ...TH, textAlign: "right", paddingRight: 16 }}>ELO</th>
              {STAGE_COLS.map(({ key, label }) => (
                <th key={key} style={{ ...TH, textAlign: "right", paddingRight: 14 }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => {
              const isSelected = team.team_id === selected;
              const elo = ratingMap.get(team.team_id) ?? null;
              return (
                <tr
                  key={team.team_id}
                  className={`ff-bracket-row${isSelected ? " ff-selected" : ""}`}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    cursor: "pointer",
                    background: isSelected ? "rgba(43,227,138,0.06)" : "transparent",
                  }}
                  onClick={() => setSelected(isSelected ? null : team.team_id)}
                >
                  <td style={{ paddingLeft: 18, paddingTop: 10, paddingBottom: 10, fontFamily: MONO, fontSize: 12, color: "#645F77" }}>
                    {team.group ?? "–"}
                  </td>
                  <td style={{ paddingTop: 10, paddingBottom: 10, fontWeight: 600, fontSize: 14, color: "#F2F1F7" }}>
                    {team.team_name}
                    {team.eliminated && (
                      <span style={{ fontFamily: MONO, fontSize: 10, color: "#4A4560", marginLeft: 8 }}>eliminated</span>
                    )}
                  </td>
                  <td style={{
                    paddingRight: 16,
                    textAlign: "right",
                    fontFamily: MONO,
                    fontSize: 13,
                    color: elo != null ? eloColor(elo) : "#3F3A52",
                  }}>
                    {elo != null ? Math.round(elo) : "–"}
                  </td>
                  {STAGE_COLS.map(({ key }) => {
                    const p = team.stage_probabilities[key];
                    const d = team.delta?.[key] ?? 0;
                    return (
                      <td
                        key={key}
                        style={{
                          textAlign: "right",
                          paddingRight: 14,
                          paddingTop: 10,
                          paddingBottom: 10,
                          fontFamily: MONO,
                          fontSize: 13,
                          fontWeight: p >= 0.5 ? 700 : 400,
                          color: probColor(p),
                        }}
                      >
                        {pct(p)}
                        {hasDelta && Math.abs(d) >= 0.005 && (
                          <span style={{ marginLeft: 4, fontSize: 11, color: deltaColor(d) }}>
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

      <p style={{ fontFamily: MONO, fontSize: 12, color: "#4A4560", marginTop: 12 }}>
        Click a team to see their full path probabilities.
        {hasDelta && " Green/red numbers show change from last simulation."}
      </p>
    </div>
  );
}
