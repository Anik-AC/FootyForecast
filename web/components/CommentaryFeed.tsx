"use client";

import { useState } from "react";
import type { CommentaryEntry } from "@/lib/types";

interface Props {
  entries: CommentaryEntry[];
  hydrationBreakMinute?: number;
}

const HYDRATION_RE = /(hydration|cooling|water|drinks?)\s+(break|interval|pause|stop)/i;

export default function CommentaryFeed({ entries, hydrationBreakMinute }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (!entries.length) return null;

  const importantOnly = entries.filter((e) => e.is_important || HYDRATION_RE.test(e.text));
  const displayed = showAll ? entries : importantOnly;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          Commentary
        </h2>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          {showAll ? "Key moments only" : `Show all (${entries.length})`}
        </button>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {displayed.map((entry, i) => {
          const isHydration = HYDRATION_RE.test(entry.text);
          const isBreakMinute = hydrationBreakMinute != null && entry.minute === hydrationBreakMinute;

          return (
            <div
              key={i}
              className={`flex gap-3 text-sm rounded-lg px-3 py-2 ${
                isHydration || isBreakMinute
                  ? "bg-amber-950/30 border border-amber-800/40"
                  : entry.is_important
                  ? "bg-slate-800"
                  : "bg-transparent"
              }`}
            >
              <span className="text-slate-600 font-mono text-xs w-8 shrink-0 pt-0.5">
                {entry.minute != null ? `${entry.minute}'` : "--"}
              </span>
              <span
                className={
                  isHydration
                    ? "text-amber-300"
                    : entry.is_important
                    ? "text-slate-200"
                    : "text-slate-400"
                }
              >
                {entry.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
