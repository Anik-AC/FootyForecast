"use client";

import { useEffect, useState } from "react";
import { getUserStats } from "@/lib/api";
import type { UserStats } from "@/lib/types";

export default function UserStatsBanner() {
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    const userID = localStorage.getItem("footy_user_id");
    if (!userID) return;

    getUserStats(userID).then((s) => {
      if (s && s.total_picks > 0) setStats(s);
    });
  }, []);

  if (!stats) return null;

  const correctPct =
    stats.graded > 0 ? Math.round((stats.correct / stats.graded) * 100) : null;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-3 text-sm">
      <span className="text-slate-400 font-medium">Your picks</span>
      <span className="text-slate-300">
        <span className="font-bold text-slate-100">{stats.total_picks}</span> submitted
      </span>
      {stats.graded > 0 && (
        <>
          <span className="text-slate-700">·</span>
          <span className="text-slate-300">
            <span className="font-bold text-emerald-400">{stats.correct}</span>
            <span className="text-slate-500">/{stats.graded}</span> correct
            {correctPct != null && (
              <span className="ml-1 text-slate-500">({correctPct}%)</span>
            )}
          </span>
        </>
      )}
      {stats.avg_log_loss != null && (
        <>
          <span className="text-slate-700">·</span>
          <span className="text-slate-500 text-xs">
            avg log loss {stats.avg_log_loss.toFixed(3)}
          </span>
        </>
      )}
    </div>
  );
}
