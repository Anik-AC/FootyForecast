"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/",                    label: "Home",              exact: true,  dot: null },
  { href: "/matches",             label: "Upcoming",          exact: false, dot: "#2BE38A" },
  { href: "/results",             label: "Results",           exact: false, dot: "#5B8CFF" },
  { href: "/predictions",         label: "Bracket",           exact: false, dot: "#FFC23D" },
  { href: "/standings/groups",    label: "Standings · Groups",    exact: false, dot: "#2BE38A" },
  { href: "/standings/knockout",  label: "Standings · Knockout",  exact: false, dot: "#FFC23D" },
  { href: "/teams",               label: "Teams",             exact: false, dot: "#A35CFF" },
  { href: "/stats",               label: "Stats",             exact: false, dot: "#1FD0C0" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Hamburger / close button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close menu" : "Open menu"}
        style={{
          background: "none",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 9,
          padding: "8px 10px",
          cursor: "pointer",
          color: open ? "#2BE38A" : "#9E99B0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 45, top: 78, background: "rgba(0,0,0,0.5)" }}
        />
      )}

      {/* Slide-down drawer */}
      {open && (
        <div
          style={{
            position: "fixed",
            top: 78,
            left: 0,
            right: 0,
            zIndex: 50,
            background: "#15131F",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            padding: "8px 16px 16px",
            boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
          }}
        >
          {NAV_LINKS.map(({ href, label, exact, dot }) => {
            const isActive = exact
              ? pathname === href
              : pathname.startsWith(href) && href !== "/";

            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "13px 10px",
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#2BE38A" : "#C8C3D6",
                  textDecoration: "none",
                  background: isActive ? "rgba(43,227,138,0.08)" : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                {dot && (
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: dot, flexShrink: 0 }} />
                )}
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
