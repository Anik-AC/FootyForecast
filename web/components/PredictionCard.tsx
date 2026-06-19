"use client";

import { useEffect, useState } from "react";
import { createUserPrediction } from "@/lib/api";

type Pick = "home_win" | "draw" | "away_win";

// Probability encoding for each pick: must sum to 1.0 for the API validator.
const PICK_PROBS: Record<Pick, { home: number; draw: number; away: number }> = {
  home_win: { home: 0.8, draw: 0.1, away: 0.1 },
  draw:     { home: 0.1, draw: 0.8, away: 0.1 },
  away_win: { home: 0.1, draw: 0.1, away: 0.8 },
};

function getUserID(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("footy_user_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("footy_user_id", id);
  }
  return id;
}

function getStoredPick(matchId: string): Pick | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(`pick_${matchId}`);
  return (raw as Pick | null);
}

function storePick(matchId: string, pick: Pick) {
  localStorage.setItem(`pick_${matchId}`, pick);
}

interface Props {
  matchId: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  modelProbs: { home_win: number; draw: number; away_win: number };
}

export default function PredictionCard({ matchId, homeTeam, awayTeam, modelProbs }: Props) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore pick from localStorage on mount.
  useEffect(() => {
    setPick(getStoredPick(matchId));
  }, [matchId]);

  async function handlePick(outcome: Pick) {
    if (submitting) return;
    const userID = getUserID();
    if (!userID) return;

    setSubmitting(true);
    setError(null);

    const probs = PICK_PROBS[outcome];
    const result = await createUserPrediction(matchId, {
      user_id: userID,
      home_win_prob: probs.home,
      draw_prob: probs.draw,
      away_win_prob: probs.away,
    });

    if (result) {
      setPick(outcome);
      storePick(matchId, outcome);
    } else {
      setError("Could not save your pick. The match may have already kicked off.");
    }
    setSubmitting(false);
  }

  const pickLabel: Record<Pick, string> = {
    home_win: homeTeam.name,
    draw: "Draw",
    away_win: awayTeam.name,
  };

  const modelPct = (n: number) => `${(n * 100).toFixed(0)}%`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider">
          Make your call
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Pick an outcome before kick-off.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(["home_win", "draw", "away_win"] as Pick[]).map((outcome) => {
          const isSelected = pick === outcome;
          const label = outcome === "home_win" ? homeTeam.id : outcome === "away_win" ? awayTeam.id : "Draw";
          const prob =
            outcome === "home_win"
              ? modelProbs.home_win
              : outcome === "away_win"
              ? modelProbs.away_win
              : modelProbs.draw;

          return (
            <button
              key={outcome}
              onClick={() => handlePick(outcome)}
              disabled={submitting}
              className={`relative flex flex-col items-center justify-center gap-2 rounded-xl py-5 px-3 border-2 transition-all
                ${isSelected
                  ? "border-emerald-500 bg-emerald-950/50 text-emerald-400"
                  : "border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500 hover:bg-slate-800"
                }
                ${submitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              {outcome === "draw" ? (
                <span className="text-2xl text-amber-400">&#9135;</span>
              ) : (
                <span className="text-2xl">{outcome === "home_win" ? "🏠" : "✈️"}</span>
              )}
              <span className="font-bold text-sm">{label}</span>
              <span className="text-xs text-slate-500">{modelPct(prob)} model</span>
            </button>
          );
        })}
      </div>

      {pick && (
        <p className="text-sm text-emerald-400">
          ✓ You backed <strong>{pickLabel[pick]}</strong> to win.
          Model gives them{" "}
          <strong>
            {modelPct(
              pick === "home_win"
                ? modelProbs.home_win
                : pick === "away_win"
                ? modelProbs.away_win
                : modelProbs.draw
            )}
          </strong>.
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
