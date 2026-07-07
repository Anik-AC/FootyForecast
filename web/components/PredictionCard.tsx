"use client";

import { useEffect, useState } from "react";
import { createUserPrediction } from "@/lib/api";
import { flagUrl } from "@/lib/flags";

const MONO = "'JetBrains Mono',monospace";

type Pick = "home_win" | "draw" | "away_win";

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
  return localStorage.getItem(`pick_${matchId}`) as Pick | null;
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

  const options: { key: Pick; label: string; prob: number }[] = [
    { key: "home_win", label: homeTeam.id, prob: modelProbs.home_win },
    { key: "draw",     label: "Draw",      prob: modelProbs.draw },
    { key: "away_win", label: awayTeam.id, prob: modelProbs.away_win },
  ];

  return (
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      padding: "22px 26px",
    }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#9E99B0", marginBottom: 4 }}>
        MAKE YOUR CALL
      </div>
      <div style={{ fontSize: 13, color: "#4A4560", marginBottom: 20 }}>
        Pick an outcome before kick-off to score it on the leaderboard.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {options.map(({ key, label, prob }) => {
          const isSelected = pick === key;
          const isDraw = key === "draw";
          return (
            <button
              key={key}
              onClick={() => handlePick(key)}
              disabled={submitting}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "18px 12px",
                borderRadius: 14,
                border: isSelected ? "2px solid #2BE38A" : "2px solid rgba(255,255,255,0.08)",
                background: isSelected ? "rgba(43,227,138,0.08)" : "#1A1726",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.5 : 1,
                transition: "border-color .15s, background .15s",
              }}
            >
              {isDraw ? (
                <span style={{ fontSize: 24, color: "#FFC23D", lineHeight: 1 }}>&#9135;</span>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={flagUrl(key === "home_win" ? homeTeam.id : awayTeam.id, 80)}
                  alt={label}
                  style={{ width: 36, height: 24, borderRadius: 5, objectFit: "cover", border: "1px solid rgba(255,255,255,0.14)" }}
                />
              )}
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: isSelected ? "#2BE38A" : "#F2F1F7" }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 16, fontFamily: MONO, fontSize: 13 }}>
        {pick ? (
          <span style={{ color: "#2BE38A" }}>
            You backed <b>{pick === "home_win" ? homeTeam.name : pick === "away_win" ? awayTeam.name : "a draw"}</b>.
            {" "}Model gives them <b>{Math.round((pick === "home_win" ? modelProbs.home_win : pick === "away_win" ? modelProbs.away_win : modelProbs.draw) * 100)}%</b>.
          </span>
        ) : (
          <span style={{ color: "#4A4560" }}>No pick yet — choose an outcome above.</span>
        )}
      </div>

      {error && <div style={{ marginTop: 10, fontSize: 13, color: "#FF5D6A" }}>{error}</div>}
    </div>
  );
}
