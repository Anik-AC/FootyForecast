import { getHydrationAnalysis } from "@/lib/api";
import type { HydrationBreak, HydrationAnalysis } from "@/lib/types";
import Link from "next/link";
import LocalTime from "@/components/LocalTime";

const MONO = "'JetBrains Mono',monospace";

function climateBadge(climate: string) {
  if (climate === "enclosed") {
    return (
      <span style={{
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 6,
        background: "rgba(31,208,192,0.12)",
        color: "#1FD0C0",
        border: "1px solid rgba(31,208,192,0.25)",
      }}>
        AC
      </span>
    );
  }
  if (climate === "open") {
    return (
      <span style={{
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 6,
        background: "rgba(255,155,61,0.12)",
        color: "#FF9B3D",
        border: "1px solid rgba(255,155,61,0.25)",
      }}>
        Open
      </span>
    );
  }
  return <span style={{ fontFamily: MONO, fontSize: 11, color: "#4A4560" }}>?</span>;
}

type MomentumTeam = "home" | "away" | "level";

function momentumStyle(m: MomentumTeam): string {
  if (m === "home") return "#5B8CFF";
  if (m === "away") return "#FFC23D";
  return "#645F77";
}

function momentumText(m: MomentumTeam, homeTeam: string, awayTeam: string): string {
  if (m === "level") return "Level";
  return m === "home" ? homeTeam : awayTeam;
}

function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div style={{
      background: "#15131F",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14,
      padding: "16px",
      textAlign: "center",
    }}>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: accent ? "#2BE38A" : "#F2F1F7" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#645F77", marginTop: 5 }}>{label}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 11, color: "#4A4560", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function ImpactCard({ b }: { b: HydrationBreak }) {
  const shifted = b.momentum_before !== b.momentum_after;
  const beforeColor = momentumStyle(b.momentum_before as MomentumTeam);
  const afterColor = momentumStyle(b.momentum_after as MomentumTeam);
  const beforeText = momentumText(b.momentum_before as MomentumTeam, b.home_team_name, b.away_team_name);
  const afterText = momentumText(b.momentum_after as MomentumTeam, b.home_team_name, b.away_team_name);

  return (
    <Link href={`/matches/${b.fixture_id}`} style={{ textDecoration: "none" }}>
      <div style={{
        border: `1px solid ${shifted ? "rgba(255,194,61,0.22)" : "rgba(255,255,255,0.07)"}`,
        background: shifted ? "rgba(255,194,61,0.04)" : "#120F1E",
        borderRadius: 16,
        padding: "18px 22px",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#F2F1F7" }}>
              {b.home_team_name} vs {b.away_team_name}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 12.5, color: "#7E7892", flexWrap: "wrap" as const }}>
              <LocalTime iso={b.kickoff_utc} variant="dateonly" />
              <span style={{ color: "#3F3A52" }}>·</span>
              <span style={{ textTransform: "uppercase" as const }}>{b.stage.replace(/_/g, " ")}</span>
              {b.venue && (
                <>
                  <span style={{ color: "#3F3A52" }}>·</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>{b.venue}</span>
                </>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 13, color: "#9E99B0" }}>{b.break_minute}&apos;</span>
            {climateBadge(b.venue_climate)}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#645F77", letterSpacing: "0.08em", marginBottom: 6 }}>BEFORE BREAK</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: beforeColor }}>{beforeText}</div>
            <div style={{ fontSize: 11.5, color: "#4A4560", marginTop: 4 }}>
              {b.goals_home_before > 0 || b.goals_away_before > 0
                ? `${b.goals_home_before}–${b.goals_away_before} goals in window`
                : "No goals in 10-min window"}
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#645F77", letterSpacing: "0.08em", marginBottom: 6 }}>AFTER BREAK</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: afterColor }}>{afterText}</div>
            <div style={{ fontSize: 11.5, color: "#4A4560", marginTop: 4 }}>
              {b.goals_home_after > 0 || b.goals_away_after > 0
                ? `${b.goals_home_after}–${b.goals_away_after} goals in window`
                : "No goals in 10-min window"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
          {shifted ? (
            <span style={{
              fontFamily: MONO,
              fontSize: 11.5,
              fontWeight: 700,
              color: "#FFC23D",
              background: "rgba(255,194,61,0.1)",
              border: "1px solid rgba(255,194,61,0.22)",
              padding: "3px 10px",
              borderRadius: 7,
            }}>
              Momentum shifted: {beforeText} → {afterText}
            </span>
          ) : (
            <span style={{
              fontFamily: MONO,
              fontSize: 11.5,
              color: "#645F77",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              padding: "3px 10px",
              borderRadius: 7,
            }}>
              No momentum shift
            </span>
          )}
          {b.goal_within_5min && (
            <span style={{
              fontFamily: MONO,
              fontSize: 11.5,
              fontWeight: 700,
              color: "#2BE38A",
              background: "rgba(43,227,138,0.08)",
              border: "1px solid rgba(43,227,138,0.2)",
              padding: "3px 10px",
              borderRadius: 7,
            }}>
              Goal within 5 minutes
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default async function HydrationPage() {
  const data: HydrationAnalysis | null = await getHydrationAnalysis();
  const impacted = (data?.breaks ?? []).filter((b) => b.shifted || b.goal_within_5min);

  return (
    <div style={{ animation: "ff-up 0.4s ease both", paddingTop: 46 }}>
      <Link href="/stats" style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: MONO,
        fontSize: 13,
        color: "#7E7892",
        textDecoration: "none",
        marginBottom: 24,
      }}>
        ← Tournament Stats
      </Link>

      <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-0.03em", margin: 0 }}>Hydration Break Analysis</h1>
      <p style={{ color: "#9E99B0", fontSize: 14.5, marginTop: 12, maxWidth: 640, lineHeight: 1.6 }}>
        FIFA mandates cooling breaks when pitch-level temperature exceeds 32°C. We track whether
        these breaks alter match momentum or trigger scoring.
      </p>

      {!data || data.total_breaks === 0 ? (
        <p style={{ color: "#645F77", fontSize: 14, textAlign: "center", padding: "64px 0" }}>
          No hydration break data available yet.
        </p>
      ) : (
        <>
          {/* Summary */}
          <div style={{ display: "flex", alignItems: "center", gap: 13, margin: "40px 0 18px" }}>
            <span style={{ width: 4, height: 16, borderRadius: 99, background: "#1FD0C0" }} />
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: "#C8C3D6", margin: 0 }}>SUMMARY</h2>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 10 }}>
            <StatCard label="Total breaks" value={data.total_breaks.toString()} sub={`${data.matches_with_breaks} matches`} />
            <StatCard label="Momentum shifts" value={data.shifts_count.toString()} sub={`${data.shifts_pct.toFixed(0)}% of breaks`} accent={data.shifts_pct > 30} />
            <StatCard label="Goals within 5 min" value={data.goal_after_count.toString()} sub={`${data.goal_after_pct.toFixed(0)}% of breaks`} accent={data.goal_after_pct > 20} />
            <StatCard label="Home benefited" value={data.home_benefit_count.toString()} sub="when shift occurred" />
            <StatCard label="Away benefited" value={data.away_benefit_count.toString()} sub="when shift occurred" />
          </div>

          {/* Methodology */}
          <div style={{ display: "flex", alignItems: "center", gap: 13, margin: "40px 0 18px" }}>
            <span style={{ width: 4, height: 16, borderRadius: 99, background: "#5B8CFF" }} />
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: "#C8C3D6", margin: 0 }}>HOW WE MEASURE IMPACT</h2>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          </div>
          <div style={{
            background: "#120F1E",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16,
            padding: "22px 26px",
            color: "#9E99B0",
            fontSize: 14.5,
            lineHeight: 1.7,
            maxWidth: 720,
          }}>
            <p style={{ margin: "0 0 12px" }}>
              Momentum is computed per-minute from the commentary feed using a rolling sentiment
              window. Positive values indicate home-team pressure; negative values indicate away-team
              pressure. We classify each minute as "home," "away," or "level" by sign and magnitude
              threshold.
            </p>
            <p style={{ margin: "0 0 12px" }}>
              For each hydration break, we compare the dominant team in the 10-minute window before
              the break to the 10-minute window after. If the dominant team changes, we call it a{" "}
              <span style={{ color: "#FFC23D", fontWeight: 700 }}>momentum shift</span>. A{" "}
              <span style={{ color: "#2BE38A", fontWeight: 700 }}>goal within 5 minutes</span> means
              a goal was scored in the five minutes immediately following the break.
            </p>
            <p style={{ margin: 0 }}>
              Venue climate is "AC" (enclosed, air-conditioned) or "Open" based on the stadium.
              AC stadiums are cooler, making breaks less physiologically impactful.
            </p>
          </div>

          {/* Impacted breaks */}
          {impacted.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 13, margin: "40px 0 6px" }}>
                <span style={{ width: 4, height: 16, borderRadius: 99, background: "#FFC23D" }} />
                <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: "#C8C3D6", margin: 0 }}>BREAKS WITH MEASURABLE IMPACT</h2>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
              </div>
              <p style={{ fontSize: 12.5, color: "#645F77", marginBottom: 16 }}>
                {impacted.length} of {data.total_breaks} breaks showed a momentum shift or triggered a goal within 5 minutes.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {impacted.map((b, i) => (
                  <ImpactCard key={`${b.fixture_id}-${b.break_minute}-${i}`} b={b} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
