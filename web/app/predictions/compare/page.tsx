import { getPredictionComparison } from "@/lib/api";
import type { FixtureComparison, ModelPick, ChampionTeamProb } from "@/lib/types";
import Link from "next/link";

const MONO = "'JetBrains Mono',monospace";

const MODEL_META: Record<string, { label: string; color: string; short: string }> = {
  bayesian_goals_v3: {
    label: "Recency",
    short: "v3",
    color: "#2BE38A",
  },
  bayesian_goals_historical: {
    label: "Historical",
    short: "hist",
    color: "#60A5FA",
  },
  elo_v1: {
    label: "Elo",
    short: "elo",
    color: "#FFC23D",
  },
};

const SIM_META: Record<string, { label: string; color: string }> = {
  bayesian_goals_v3_qf: { label: "Recency", color: "#2BE38A" },
  bayesian_goals_historical_qf: { label: "Historical", color: "#60A5FA" },
};

const STAGE_LABELS: Record<string, string> = {
  quarter_final: "Quarter-Final",
  semi_final: "Semi-Final",
  final: "Final",
  round_of_16: "Round of 16",
  round_of_32: "Round of 32",
};

function pct(v: number, decimals = 0): string {
  return (v * 100).toFixed(decimals) + "%";
}

function stageLabel(s: string): string {
  return STAGE_LABELS[s] ?? s.replace(/_/g, " ");
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }) + " UTC";
}

function PickBadge({ pick, teamName }: { pick: string; teamName: string }) {
  const label = pick === "draw" ? "Draw" : teamName;
  const color = "#2BE38A";
  return (
    <span style={{
      fontSize: 10,
      fontFamily: MONO,
      fontWeight: 700,
      color,
      background: "rgba(43,227,138,0.1)",
      border: "1px solid rgba(43,227,138,0.25)",
      borderRadius: 5,
      padding: "1px 6px",
      whiteSpace: "nowrap",
      display: "block",
      marginTop: 4,
    }}>
      PICK: {label.toUpperCase()}
    </span>
  );
}

function ProbBar({ prob, color }: { prob: number; color: string }) {
  return (
    <div style={{
      height: 3,
      borderRadius: 2,
      background: "rgba(255,255,255,0.08)",
      marginTop: 2,
      overflow: "hidden",
    }}>
      <div style={{
        width: `${(prob * 100).toFixed(1)}%`,
        height: "100%",
        background: color,
        borderRadius: 2,
      }} />
    </div>
  );
}

function ModelColumn({ pick, homeTeamName, awayTeamName }: {
  pick: ModelPick;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const meta = MODEL_META[pick.model_version] ?? { label: pick.model_version, color: "#9E99B0", short: "?" };
  const outcomes = [
    { label: homeTeamName, prob: pick.home_win_prob, key: "home" },
    { label: "Draw", prob: pick.draw_prob, key: "draw" },
    { label: awayTeamName, prob: pick.away_win_prob, key: "away" },
  ];

  return (
    <div style={{
      flex: 1,
      minWidth: 120,
      padding: "12px 14px",
      background: "rgba(255,255,255,0.03)",
      borderRadius: 10,
      border: `1px solid rgba(255,255,255,0.07)`,
    }}>
      <div style={{
        fontSize: 11,
        fontFamily: MONO,
        fontWeight: 700,
        color: meta.color,
        marginBottom: 10,
        display: "flex",
        alignItems: "center",
        gap: 5,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: 2, background: meta.color, display: "inline-block", flexShrink: 0 }} />
        {meta.label}
      </div>

      {outcomes.map(o => (
        <div key={o.key} style={{ marginBottom: 7 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{
              fontSize: 11,
              color: "#9E99B0",
              maxWidth: 80,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {o.label}
            </span>
            <span style={{
              fontSize: 13,
              fontFamily: MONO,
              fontWeight: 700,
              color: o.key === pick.pick ? "#F5F3FF" : "#9E99B0",
            }}>
              {pct(o.prob, 1)}
            </span>
          </div>
          <ProbBar prob={o.prob} color={o.key === pick.pick ? meta.color : "rgba(255,255,255,0.15)"} />
        </div>
      ))}

      <PickBadge
        pick={pick.pick}
        teamName={pick.pick === "home" ? homeTeamName : awayTeamName}
      />

      {(pick.home_xg != null && pick.away_xg != null) && (
        <div style={{
          marginTop: 8,
          fontSize: 10,
          fontFamily: MONO,
          color: "#9E99B0",
          display: "flex",
          justifyContent: "space-between",
        }}>
          <span>xG {pick.home_xg.toFixed(2)}</span>
          <span>{pick.away_xg.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

function MatchComparisonCard({ fixture }: { fixture: FixtureComparison }) {
  const hasResult = fixture.result != null;
  const r = fixture.result;

  // Sort models in consistent display order
  const MODEL_ORDER = ["bayesian_goals_v3", "bayesian_goals_historical", "elo_v1"];
  const sortedModels = [...fixture.models].sort(
    (a, b) => MODEL_ORDER.indexOf(a.model_version) - MODEL_ORDER.indexOf(b.model_version)
  );

  // Check if all models agree on the same pick
  const picks = sortedModels.map(m => m.pick);
  const allAgree = picks.length > 0 && picks.every(p => p === picks[0]);

  return (
    <div style={{
      background: "#15131F",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 18,
    }}>
      {/* Match header */}
      <div style={{
        padding: "14px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            fontSize: 11,
            fontFamily: MONO,
            color: "#9E99B0",
            background: "rgba(255,255,255,0.06)",
            borderRadius: 5,
            padding: "2px 8px",
          }}>
            {stageLabel(fixture.stage)}
          </span>
          <span style={{ fontSize: 11, color: "#9E99B0", fontFamily: MONO }}>
            {fmtDate(fixture.kickoff_utc)}
          </span>
        </div>
        {allAgree && sortedModels.length > 1 && (
          <span style={{
            fontSize: 10,
            fontFamily: MONO,
            color: "#2BE38A",
            background: "rgba(43,227,138,0.08)",
            border: "1px solid rgba(43,227,138,0.2)",
            borderRadius: 5,
            padding: "2px 8px",
          }}>
            ALL MODELS AGREE
          </span>
        )}
      </div>

      {/* Teams + result */}
      <div style={{
        padding: "14px 20px 10px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#F5F3FF", flex: 1, textAlign: "right" }}>
          {fixture.home_team.name}
        </span>
        <div style={{ textAlign: "center", minWidth: 60 }}>
          {hasResult ? (
            <span style={{
              fontSize: 20,
              fontWeight: 800,
              fontFamily: MONO,
              color: "#F5F3FF",
            }}>
              {r!.home_goals} – {r!.away_goals}
            </span>
          ) : (
            <span style={{ fontSize: 14, color: "#9E99B0", fontFamily: MONO }}>vs</span>
          )}
          {hasResult && r!.went_to_pens && (
            <div style={{ fontSize: 10, color: "#9E99B0", fontFamily: MONO, marginTop: 2 }}>
              (pens)
            </div>
          )}
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#F5F3FF", flex: 1 }}>
          {fixture.away_team.name}
        </span>
      </div>

      {/* Model columns */}
      <div style={{ padding: "10px 20px 18px", display: "flex", gap: 10, flexWrap: "wrap" }}>
        {sortedModels.map(model => (
          <ModelColumn
            key={model.model_version}
            pick={model}
            homeTeamName={fixture.home_team.name}
            awayTeamName={fixture.away_team.name}
          />
        ))}
        {sortedModels.length === 0 && (
          <span style={{ color: "#9E99B0", fontSize: 13 }}>No model predictions available.</span>
        )}
      </div>
    </div>
  );
}

function ChampionProbsSection({ champProbs }: {
  champProbs: Record<string, ChampionTeamProb[]>
}) {
  const versions = Object.keys(champProbs);
  if (versions.length === 0) return null;

  // Get union of all teams, sorted by average probability across models
  const teamMap: Record<string, Record<string, number>> = {};
  for (const version of versions) {
    for (const t of champProbs[version]) {
      if (!teamMap[t.team_id]) teamMap[t.team_id] = { __name: t.team_name as unknown as number };
      teamMap[t.team_id][version] = t.probability;
    }
  }

  // Sort by first model's probability
  const firstVersion = versions[0];
  const teams = Object.entries(teamMap)
    .sort((a, b) => (b[1][firstVersion] ?? 0) - (a[1][firstVersion] ?? 0));

  const maxProb = Math.max(...teams.flatMap(([, probs]) =>
    versions.map(v => probs[v] ?? 0)
  ));

  return (
    <div style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: "#F5F3FF", marginBottom: 6 }}>
        Champion Probability
      </h2>
      <p style={{ color: "#9E99B0", fontSize: 13, lineHeight: 1.6, marginBottom: 20, maxWidth: 600 }}>
        Monte Carlo simulation from the quarter-final bracket forward, comparing
        how each model forecasts the champion.
      </p>

      {/* Model legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        {versions.map(v => {
          const meta = SIM_META[v] ?? { label: v, color: "#9E99B0" };
          return (
            <div key={v} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: meta.color, display: "inline-block" }} />
              <span style={{ fontSize: 13, color: "#C8C3D6" }}>{meta.label}</span>
              <span style={{ fontSize: 11, fontFamily: MONO, color: "#9E99B0" }}>({v})</span>
            </div>
          );
        })}
      </div>

      <div style={{
        background: "#15131F",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        overflow: "hidden",
      }}>
        {teams.map(([teamId, probs], i) => {
          const teamName = probs.__name as unknown as string;
          return (
            <div
              key={teamId}
              style={{
                padding: "12px 20px",
                borderBottom: i < teams.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span style={{
                fontFamily: MONO,
                fontSize: 12,
                color: "#645F77",
                width: 24,
                textAlign: "right",
                flexShrink: 0,
              }}>
                {i + 1}
              </span>
              <span style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#F5F3FF",
                minWidth: 130,
                flexShrink: 0,
              }}>
                {teamName}
              </span>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 200 }}>
                {versions.map(v => {
                  const prob = probs[v] ?? 0;
                  const meta = SIM_META[v] ?? { label: v, color: "#9E99B0" };
                  const widthPct = maxProb > 0 ? (prob / maxProb) * 100 : 0;
                  return (
                    <div key={v} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                        <div style={{
                          width: `${widthPct.toFixed(1)}%`,
                          height: "100%",
                          background: meta.color,
                          borderRadius: 4,
                          opacity: 0.85,
                        }} />
                      </div>
                      <span style={{
                        fontSize: 12,
                        fontFamily: MONO,
                        fontWeight: 700,
                        color: meta.color,
                        minWidth: 40,
                        textAlign: "right",
                      }}>
                        {pct(prob, 1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function PredictionComparePage() {
  const data = await getPredictionComparison();

  if (!data) {
    return (
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 16px 64px" }}>
        <div style={{ marginBottom: 8 }}>
          <Link href="/" style={{ color: "#9E99B0", fontSize: 13, textDecoration: "none", fontFamily: MONO }}>
            ← Home
          </Link>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#F5F3FF" }}>Model Predictions</h1>
        <div style={{
          marginTop: 32,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: "40px 24px",
          textAlign: "center",
          color: "#9E99B0",
          fontSize: 15,
        }}>
          No prediction data available. Check back once the API is running.
        </div>
      </main>
    );
  }

  const knockoutMatches = data.matches.filter(m =>
    ["quarter_final", "semi_final", "final"].includes(m.stage)
  );

  const groupedByStage: Record<string, FixtureComparison[]> = {};
  for (const m of knockoutMatches) {
    if (!groupedByStage[m.stage]) groupedByStage[m.stage] = [];
    groupedByStage[m.stage].push(m);
  }
  const stageOrder = ["quarter_final", "semi_final", "final"];

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 16px 80px" }}>
      {/* Back link */}
      <div style={{ marginBottom: 8 }}>
        <Link href="/stats/models" style={{ color: "#9E99B0", fontSize: 13, textDecoration: "none", fontFamily: MONO }}>
          ← Model Comparison
        </Link>
      </div>

      {/* Header */}
      <h1 style={{ fontSize: 28, fontWeight: 800, color: "#F5F3FF", marginBottom: 6 }}>
        Model Predictions
      </h1>
      <p style={{ color: "#9E99B0", fontSize: 14, lineHeight: 1.6, marginBottom: 12, maxWidth: 620 }}>
        Three models predict every knockout match from the quarter-finals onwards.
        See how they agree and where they diverge.
      </p>

      {/* Model legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
        {Object.entries(MODEL_META).map(([version, meta]) => (
          <div key={version} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: meta.color, display: "inline-block" }} />
            <span style={{ fontSize: 13, color: "#C8C3D6" }}>{meta.label}</span>
          </div>
        ))}
      </div>

      {/* Matches by stage */}
      {stageOrder.map(stage => {
        const fixtures = groupedByStage[stage];
        if (!fixtures || fixtures.length === 0) return null;
        return (
          <div key={stage} style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#9E99B0",
              fontFamily: MONO,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}>
              {stageLabel(stage)}
            </h2>
            {fixtures.map(fixture => (
              <MatchComparisonCard key={fixture.match_id} fixture={fixture} />
            ))}
          </div>
        );
      })}

      {/* Champion probabilities */}
      <ChampionProbsSection champProbs={data.champion_probs} />

      {/* Footnote */}
      <div style={{
        marginTop: 40,
        padding: "16px 20px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        fontSize: 12,
        color: "#645F77",
        fontFamily: MONO,
        lineHeight: 1.6,
      }}>
        Recency: Bayesian Poisson goals model, 1-year half-life, 3x WC boost.
        Historical: same model with 2-year half-life, no WC boost.
        Elo: Elo ratings converted to 3-way probabilities, no goals model.
        Champion probabilities come from 10,000-iteration Monte Carlo simulations
        started from the confirmed quarter-final bracket.
      </div>
    </main>
  );
}
