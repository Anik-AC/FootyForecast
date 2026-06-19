"use client";

import { useState, useRef } from "react";
import Link from "next/link";

export function NavDropdown() {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  }

  function handleMouseLeave() {
    timeoutRef.current = setTimeout(() => setOpen(false), 120);
  }

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-100 transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
      >
        Standings
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 bg-slate-900 border border-slate-700 rounded-lg py-1 min-w-[130px] shadow-xl z-20">
          <Link
            href="/standings/groups"
            className="block px-4 py-2 text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            onClick={() => setOpen(false)}
          >
            Groups
          </Link>
          <Link
            href="/standings/knockout"
            className="block px-4 py-2 text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            onClick={() => setOpen(false)}
          >
            Knockout
          </Link>
        </div>
      )}
    </div>
  );
}
