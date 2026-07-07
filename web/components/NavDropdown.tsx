"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function NavDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const isActive = pathname.startsWith("/standings");

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close dropdown on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  const activeStyle: React.CSSProperties = {
    color: "#2BE38A",
    background: "linear-gradient(180deg, rgba(43,227,138,0.18), rgba(43,227,138,0.05))",
    border: "1px solid rgba(43,227,138,0.38)",
    boxShadow: "0 2px 16px rgba(43,227,138,0.16)",
    fontWeight: 700,
  };
  const inactiveStyle: React.CSSProperties = {
    color: "#9E99B0",
    background: "transparent",
    border: "1px solid transparent",
    fontWeight: 500,
  };

  function handleTrigger() {
    if (!open) {
      // Navigate to groups as the default standings page
      router.push("/standings/groups");
    }
    setOpen((o) => !o);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={handleTrigger}
        className="ff-nav-item"
        style={{
          cursor: "pointer",
          transition: "all .18s",
          padding: "8px 14px",
          borderRadius: 11,
          fontSize: 14.5,
          display: "flex",
          alignItems: "center",
          gap: 6,
          ...(isActive ? activeStyle : inactiveStyle),
        }}
      >
        <span>Standings</span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          style={{ transition: "transform .18s", transform: open ? "rotate(180deg)" : "none" }}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              zIndex: 60,
              minWidth: 184,
              background: "#15131F",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: 7,
              boxShadow: "0 18px 44px rgba(0,0,0,0.55)",
            }}
          >
            <Link
              href="/standings/groups"
              onClick={() => setOpen(false)}
              className="ff-nav-item"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "11px 13px",
                borderRadius: 9,
                fontSize: 14.5,
                fontWeight: 600,
                color: "#C8C3D6",
                textDecoration: "none",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 2, background: "#2BE38A", flexShrink: 0 }} />
              Groups
            </Link>
            <Link
              href="/standings/knockout"
              onClick={() => setOpen(false)}
              className="ff-nav-item"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "11px 13px",
                borderRadius: 9,
                fontSize: 14.5,
                fontWeight: 600,
                color: "#C8C3D6",
                textDecoration: "none",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 2, background: "#FFC23D", flexShrink: 0 }} />
              Knockout
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
