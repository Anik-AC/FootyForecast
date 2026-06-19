import { StandingsNav } from "@/components/StandingsNav";

export default function StandingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ animation: "ff-up 0.4s ease both", paddingTop: 46 }}>
      <h1 style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.03em", margin: 0 }}>Standings</h1>
      <StandingsNav />
      {children}
    </div>
  );
}
