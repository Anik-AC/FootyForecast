"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/standings/groups", label: "Group Stage" },
  { href: "/standings/knockout", label: "Knockout" },
];

export function StandingsNav() {
  const pathname = usePathname();

  return (
    <nav style={{ display: "flex", gap: 6, marginTop: 18, marginBottom: 32 }}>
      {TABS.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              textDecoration: "none",
              padding: "7px 18px",
              borderRadius: 99,
              fontSize: 14,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? "#2BE38A" : "#9E99B0",
              background: isActive ? "rgba(43,227,138,0.12)" : "transparent",
              border: `1px solid ${isActive ? "rgba(43,227,138,0.25)" : "transparent"}`,
              transition: "all .15s",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
