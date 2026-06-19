import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { NavDropdown } from "@/components/NavDropdown";
import { NavLink } from "@/components/NavLink";
import "./globals.css";

export const metadata: Metadata = {
  title: "FootyForecast",
  description: "Calibrated probabilistic predictions for every FIFA World Cup 2026 match.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ minHeight: "100vh", background: "#0B0A12", color: "#F2F1F7" }}>
        {/* Rainbow streamer */}
        <div style={{ height: 4, background: "linear-gradient(90deg,#2BE38A,#1FD0C0,#5B8CFF,#A35CFF,#FF5DA8,#FFC23D)" }} />

        {/* Sticky nav */}
        <header style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(11,10,18,0.78)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}>
          <div style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "0 28px",
            height: 74,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            {/* Logo */}
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 13, textDecoration: "none" }}>
              <Image src="/footy-logo-2.png" alt="FootyForecast" width={120} height={40} style={{ height: 40, width: "auto" }} priority />
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#2BE38A",
                background: "rgba(43,227,138,0.1)",
                border: "1px solid rgba(43,227,138,0.3)",
                padding: "4px 8px",
                borderRadius: 7,
              }}>
                WC 2026
              </span>
            </Link>

            {/* Nav items */}
            <nav style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <NavLink href="/" exact>Home</NavLink>
              <NavLink href="/matches">Upcoming</NavLink>
              <NavLink href="/results">Results</NavLink>
              <NavDropdown />
              <NavLink href="/teams">Teams</NavLink>
              <NavLink href="/stats">Stats</NavLink>
            </nav>
          </div>
        </header>

        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px" }}>
          {children}
        </div>

        {/* Footer */}
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px" }}>
          <div style={{
            borderTop: "1px solid rgba(255,255,255,0.08)",
            marginTop: 70,
            padding: "26px 0 40px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}>
            <span style={{ fontSize: 13, color: "#645F77" }}>Predictions update live after every match.</span>
            <span style={{ fontSize: 13, color: "#645F77", fontFamily: "'JetBrains Mono', monospace" }}>
              FootyForecast · Anik Chakraborti
            </span>
          </div>
        </div>
      </body>
    </html>
  );
}
