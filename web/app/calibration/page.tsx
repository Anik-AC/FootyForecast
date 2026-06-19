import { getCalibration } from "@/lib/api";
import LocalTime from "@/components/LocalTime";
import type { GradedMatch } from "@/lib/types";

const MONO = "'JetBrains Mono',monospace";

function outcomeLabel(outcome: string): string {
  return { home_win: "H", draw: "D", away_win: "A" }[outcome] ?? outcome;
}

function scoreColor(ll: number): string {
  if (ll < 0.5) return "#2BE38A";
  if (ll < 1.0) return "#FFC23D";
  return "#FF5D6A";
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "#15131F",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14,
      padding: "18px 16px",
      textAlign: "center",
    }}>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: "#F2F1F7" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#645F77", marginTop: 6 }}>{label}</div>
    </div>
  );
}

const TH: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.08em",
  color: "#645F77",
  paddingTop: 10,
  paddingBottom: 10,
  paddingLeft: 16,
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  background: "#15131F",
};

function MatchRow({ match, marketSources }: { match: GradedMatch; marketSources: string[] }) {
  return (
    <tr style={{
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      opacity: match.is_retroactive ? 0.5 : 1,
    }}>
      <td style={{ paddingLeft: 18, paddingTop: 11, paddingBottom: 11 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#F2F1F7" }}>
            {match.home_team.name} vs {match.away_team.name}
          </span>
          {match.is_retroactive && (
            <span style={{
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 700,
              color: "#FFC23D",
              background: "rgba(255,194,61,0.1)",
              border: "1px solid rgba(255,194,61,0.2)",
              padding: "2px 7px",
              borderRadius: 6,
            }}>
              in-sample
            </span>
          )}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: "#645F77", marginTop: 3 }}>
          <LocalTime iso={match.kickoff_utc} variant="dateonly" />
        </div>
      </td>
      <td style={{ paddingLeft: 16, paddingTop: 11, paddingBottom: 11 }}>
        <span style={{
          fontFamily: MONO,
          fontSize: 13,
          fontWeight: 700,
          color: "#C8C3D6",
          background: "#1D1A2A",
          padding: "3px 9px",
          borderRadius: 6,
        }}>
          {outcomeLabel(match.actual_outcome)}
        </span>
      </td>
      <td style={{ paddingLeft: 16, paddingTop: 11, paddingBottom: 11, fontFamily: MONO, fontSize: 13, color: scoreColor(match.model_log_loss) }}>
        {match.model_log_loss.toFixed(4)}
      </td>
      <td style={{ paddingLeft: 16, paddingTop: 11, paddingBottom: 11, fontFamily: MONO, fontSize: 13, color: scoreColor(match.model_brier_score) }}>
        {match.model_brier_score.toFixed(4)}
      </td>
      {marketSources.map((src) => (
        <td key={src} style={{ paddingLeft: 16, paddingTop: 11, paddingBottom: 11, paddingRight: 18, fontFamily: MONO, fontSize: 13, color: scoreColor(match.market_log_loss?.[src] ?? 0) }}>
          {(match.market_log_loss?.[src] ?? 0).toFixed(4)}
        </td>
      ))}
    </tr>
  );
}

export default async function CalibrationPage() {
  const data = await getCalibration();

  if (!data || data.total_matches === 0) {
    return (
      <div style={{ animation: "ff-up 0.4s ease both", paddingTop: 46, textAlign: "center" }}>
        <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-0.03em", margin: 0 }}>Calibration</h1>
        <p style={{ color: "#645F77", fontSize: 14, marginTop: 24 }}>
          No completed matches have been graded yet. Grading runs after each confirmed result.
        </p>
      </div>
    );
  }

  const marketSources = Object.keys(data.market_mean_log_loss ?? {});

  return (
    <div style={{ animation: "ff-up 0.4s ease both", paddingTop: 46 }}>
      <h1 style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.03em", margin: 0 }}>Calibration</h1>
      <p style={{ color: "#9E99B0", fontSize: 15, marginTop: 10, marginBottom: 32 }}>
        Model vs market accuracy — computed on 90-minute outcomes
      </p>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        <SummaryCard
          label={`Out-of-sample matches (${data.total_matches} total)`}
          value={String(data.out_of_sample_matches)}
        />
        <SummaryCard
          label="OOS mean log loss"
          value={data.out_of_sample_matches > 0 ? data.oos_mean_log_loss.toFixed(4) : "—"}
        />
        <SummaryCard
          label="OOS mean Brier"
          value={data.out_of_sample_matches > 0 ? data.oos_mean_brier.toFixed(4) : "—"}
        />
        {marketSources.slice(0, 1).map((src) => (
          <SummaryCard
            key={src}
            label={`${src.charAt(0).toUpperCase() + src.slice(1)} log loss`}
            value={(data.market_mean_log_loss?.[src] ?? 0).toFixed(4)}
          />
        ))}
      </div>

      {data.total_matches > data.out_of_sample_matches && (
        <p style={{ fontFamily: MONO, fontSize: 12.5, color: "#4A4560", marginTop: 12 }}>
          {data.total_matches - data.out_of_sample_matches} in-sample (retroactive) predictions shown in the table below but excluded from headline metrics.
        </p>
      )}

      {/* Market benchmarks (all sources if > 1) */}
      {marketSources.length > 1 && (
        <div style={{
          background: "#120F1E",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16,
          padding: "20px 24px",
          marginTop: 24,
        }}>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "#C8C3D6", marginBottom: 16 }}>
            MARKET BENCHMARKS (mean over {data.total_matches} matches)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {marketSources.map((src) => (
              <div key={src}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: "#645F77", marginBottom: 6, letterSpacing: "0.06em" }}>{src.toUpperCase()}</div>
                <div style={{ fontFamily: MONO, fontSize: 13, color: "#C8C3D6" }}>
                  LL: {(data.market_mean_log_loss?.[src] ?? 0).toFixed(4)}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 13, color: "#C8C3D6", marginTop: 2 }}>
                  Brier: {(data.market_mean_brier?.[src] ?? 0).toFixed(4)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, margin: "24px 0 16px", flexWrap: "wrap" as const }}>
        {[
          { color: "#2BE38A", label: "<0.5 (good)" },
          { color: "#FFC23D", label: "0.5 – 1.0 (ok)" },
          { color: "#FF5D6A", label: ">1.0 (poor)" },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 12, color: "#9E99B0" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
            {label}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, color: "#645F77" }}>Lower is better for both metrics</span>
      </div>

      {/* Per-match table */}
      <div style={{
        background: "#120F1E",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16,
        overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: "left" }}>MATCH</th>
              <th style={{ ...TH, textAlign: "left" }}>RESULT</th>
              <th style={{ ...TH, textAlign: "left" }}>LOG LOSS</th>
              <th style={{ ...TH, textAlign: "left" }}>BRIER</th>
              {marketSources.map((src) => (
                <th key={src} style={{ ...TH, textAlign: "left", paddingRight: 18 }}>
                  {src.toUpperCase()} LL
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matches.map((m) => (
              <MatchRow key={m.match_id} match={m} marketSources={marketSources} />
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontFamily: MONO, fontSize: 12.5, color: "#4A4560", textAlign: "center", marginTop: 16 }}>
        Log loss and Brier score on 90-minute outcomes (H/D/A). Random three-way baseline: log loss ≈ 1.099, Brier ≈ 0.667.
      </p>
    </div>
  );
}
