import { getModelComparison } from "@/lib/api";
import type { ModelComparisonRow } from "@/lib/types";
import Link from "next/link";

const MONO = "'JetBrains Mono',monospace";

const MODEL_DESCRIPTIONS: Record<string, { label: string; description: string; color: string }> = {
  bayesian_goals_v3: {
    label: "Recency (v3)",
    description: "Bayesian Poisson goals model. 1-year half-life decay, 3x boost for WC 2026 matches. Emphasises current tournament form.",
    color: "#2BE38A",
  },
  bayesian_goals_historical: {
    label: "Historical",
    description: "Same Bayesian architecture but 2-year half-life with no WC 2026 boost. Weights long-run pedigree over recent form.",
    color: "#60A5FA",
  },
  elo_v1: {
    label: "Elo",
    description: "Simple Elo ratings converted to 3-way probabilities. No goals model, no training — runs in seconds. Baseline for comparison.",
    color: "#FFC23D",
  },
  bayesian_goals_v2: {
    label: "Recency (v2)",
    description: "Earlier version of the recency model. 1-year half-life with a 2x WC 2026 boost. Superseded by v3 (3x boost).",
    color: "#9E99B0",
  },
  bayesian_goals_v1: {
    label: "Bayesian v1",
    description: "First Bayesian model version. 2-year half-life, no WC 2026 boost. Baseline from early development.",
    color: "#645F77",
  },
};

function modelLabel(version: string): string {
  return MODEL_DESCRIPTIONS[version]?.label ?? version;
}

function modelColor(version: string): string {
  return MODEL_DESCRIPTIONS[version]?.color ?? "#9E99B0";
}

function pct(v: number): string {
  return (v * 100).toFixed(1) + "%";
}

function fmt3(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(3);
}

function RankBadge({ rank }: { rank: number }) {
  const colors = ["#FFD700", "#C0C0C0", "#CD7F32"];
  const labels = ["1st", "2nd", "3rd"];
  const bg = rank <= 3 ? colors[rank - 1] : "rgba(255,255,255,0.08)";
  const text = rank <= 3 ? labels[rank - 1] : `${rank}th`;
  return (
    <span style={{
      background: bg,
      color: rank <= 3 ? "#0D0B18" : "#9E99B0",
      borderRadius: 7,
      padding: "2px 9px",
      fontSize: 12,
      fontFamily: MONO,
      fontWeight: 700,
    }}>
      {text}
    </span>
  );
}

export default async function ModelComparisonPage() {
  const rows: ModelComparisonRow[] = await getModelComparison();

  const marketLL = rows.find(r => r.market_mean_log_loss != null)?.market_mean_log_loss ?? null;
  const marketBS = rows.find(r => r.market_mean_brier_score != null)?.market_mean_brier_score ?? null;

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 16px 64px" }}>
      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <Link href="/stats" style={{ color: "#9E99B0", fontSize: 13, textDecoration: "none", fontFamily: MONO }}>
          ← Stats
        </Link>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 6, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#F5F3FF", margin: 0 }}>
          Model Comparison
        </h1>
        <Link href="/predictions/compare" style={{
          fontSize: 13,
          color: "#2BE38A",
          textDecoration: "none",
          fontFamily: MONO,
        }}>
          See match predictions →
        </Link>
      </div>
      <p style={{ color: "#9E99B0", fontSize: 14, lineHeight: 1.6, marginBottom: 32, maxWidth: 600 }}>
        Three models predict every WC 2026 match. This leaderboard shows which is closest
        to the truth so far, measured by log-loss (lower is better) and accuracy.
        Market odds are shown as the external benchmark.
      </p>

      {rows.length === 0 ? (
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: "40px 24px",
          textAlign: "center",
          color: "#9E99B0",
          fontSize: 15,
        }}>
          No graded predictions yet. Check back after matches are played.
        </div>
      ) : (
        <>
          {/* Leaderboard cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 40 }}>
            {rows.map((row, i) => {
              const info = MODEL_DESCRIPTIONS[row.model_version];
              return (
                <div
                  key={row.model_version}
                  style={{
                    background: "#15131F",
                    border: `1px solid ${i === 0 ? "rgba(43,227,138,0.3)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 16,
                    padding: "20px 24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                    <RankBadge rank={i + 1} />
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <span style={{
                          width: 9, height: 9, borderRadius: 3,
                          background: modelColor(row.model_version),
                          flexShrink: 0,
                        }} />
                        <span style={{ fontWeight: 700, fontSize: 16, color: "#F5F3FF" }}>
                          {modelLabel(row.model_version)}
                        </span>
                        <span style={{
                          fontSize: 11, fontFamily: MONO, color: "#9E99B0",
                          background: "rgba(255,255,255,0.06)", borderRadius: 5, padding: "1px 6px",
                        }}>
                          {row.model_version}
                        </span>
                      </div>
                      {info && (
                        <p style={{ color: "#9E99B0", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                          {info.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stat pills */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {[
                      { label: "Accuracy", value: pct(row.accuracy), highlight: true },
                      { label: "Log-Loss", value: fmt3(row.mean_log_loss), highlight: false },
                      { label: "Brier", value: fmt3(row.mean_brier_score), highlight: false },
                      { label: "Graded", value: String(row.graded_count), highlight: false },
                    ].map(stat => (
                      <div key={stat.label} style={{
                        background: stat.highlight ? "rgba(43,227,138,0.09)" : "rgba(255,255,255,0.05)",
                        border: `1px solid ${stat.highlight ? "rgba(43,227,138,0.2)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: 10,
                        padding: "8px 14px",
                        textAlign: "center",
                        minWidth: 90,
                      }}>
                        <div style={{ fontSize: 11, color: "#9E99B0", marginBottom: 3, fontFamily: MONO }}>
                          {stat.label}
                        </div>
                        <div style={{
                          fontSize: 19, fontWeight: 700, fontFamily: MONO,
                          color: stat.highlight ? "#2BE38A" : "#F5F3FF",
                        }}>
                          {stat.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Market benchmark */}
            {(marketLL != null || marketBS != null) && (
              <div style={{
                background: "#15131F",
                border: "1px solid rgba(255,194,61,0.2)",
                borderRadius: 16,
                padding: "20px 24px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{
                    width: 9, height: 9, borderRadius: 3, background: "#FFC23D", flexShrink: 0,
                  }} />
                  <span style={{ fontWeight: 700, fontSize: 16, color: "#F5F3FF" }}>Market Odds</span>
                  <span style={{
                    fontSize: 11, fontFamily: MONO, color: "#9E99B0",
                    background: "rgba(255,255,255,0.06)", borderRadius: 5, padding: "1px 6px",
                  }}>
                    benchmark
                  </span>
                </div>
                <p style={{ color: "#9E99B0", fontSize: 13, margin: "0 0 12px", lineHeight: 1.5 }}>
                  Implied probabilities from prediction markets (devigified). The external reference
                  for how well models can compete with the crowd.
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {marketLL != null && (
                    <div style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 10, padding: "8px 14px", textAlign: "center", minWidth: 90,
                    }}>
                      <div style={{ fontSize: 11, color: "#9E99B0", marginBottom: 3, fontFamily: MONO }}>Log-Loss</div>
                      <div style={{ fontSize: 19, fontWeight: 700, fontFamily: MONO, color: "#FFC23D" }}>
                        {fmt3(marketLL)}
                      </div>
                    </div>
                  )}
                  {marketBS != null && (
                    <div style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 10, padding: "8px 14px", textAlign: "center", minWidth: 90,
                    }}>
                      <div style={{ fontSize: 11, color: "#9E99B0", marginBottom: 3, fontFamily: MONO }}>Brier</div>
                      <div style={{ fontSize: 19, fontWeight: 700, fontFamily: MONO, color: "#FFC23D" }}>
                        {fmt3(marketBS)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Metrics explainer */}
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 14,
            padding: "20px 24px",
          }}>
            <h3 style={{ color: "#C8C3D6", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
              How to read these metrics
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["Accuracy", "Fraction of matches where the model's top-probability outcome matched the actual 90-minute result. Higher is better. Baseline is ~45% for always picking home win."],
                ["Log-Loss", "Multi-class log-loss: -log(p_correct). Lower is better. Perfect model = 0. A model that assigns 33% to every outcome scores ~1.1. Market odds typically score 0.9-1.0 on football."],
                ["Brier Score", "Mean squared probability error. Lower is better. Perfect = 0, random = 0.67. More sensitive to the confidence of wrong predictions than accuracy."],
              ].map(([metric, desc]) => (
                <div key={metric} style={{ display: "flex", gap: 12 }}>
                  <span style={{
                    fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#2BE38A",
                    minWidth: 90, flexShrink: 0, paddingTop: 1,
                  }}>
                    {metric}
                  </span>
                  <span style={{ color: "#9E99B0", fontSize: 13, lineHeight: 1.5 }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
