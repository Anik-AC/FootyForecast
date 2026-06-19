import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getMatchPrediction,
  getMarketComparison,
  getMatchTrivia,
  getMatchPreview,
  getMatchScorerPredictions,
  getCalibration,
  getMatchEvents,
  getMatchStats,
  getMatchMomentum,
  getMatchAnalysis,
  getTeamForm,
  getMatchH2H,
} from "@/lib/api";
import { ProbabilityBar } from "@/components/ProbabilityBar";
import { MarketPanel } from "@/components/MarketPanel";
import TriviaFacts from "@/components/TriviaFacts";
import MatchPreviewCard from "@/components/MatchPreviewCard";
import PlayerScorers from "@/components/PlayerScorers";
import PostMatchScorecard from "@/components/PostMatchScorecard";
import TopScorelines from "@/components/TopScorelines";
import OverUnderBars from "@/components/OverUnderBars";
import PredictionCard from "@/components/PredictionCard";
import MomentumChart from "@/components/MomentumChart";
import MatchStatBars from "@/components/MatchStatBars";
import ForecastCard from "@/components/ForecastCard";
import TeamForm from "@/components/TeamForm";
import HeadToHead from "@/components/HeadToHead";
import LocalTime from "@/components/LocalTime";
import { flagUrl } from "@/lib/flags";
import type { MatchEvent } from "@/lib/types";

const MONO = "'JetBrains Mono',monospace";

interface PageProps {
  params: Promise<{ id: string }>;
}

function SectionHeader({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, margin: "36px 0 16px" }}>
      <span style={{ width: 4, height: 16, borderRadius: 99, background: color }} />
      <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: "#C8C3D6", margin: 0 }}>{label}</h2>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: "#1D1A2A",
      borderRadius: 12,
      padding: "14px 10px",
      textAlign: "center",
    }}>
      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: color ?? "#F2F1F7" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#645F77", marginTop: 5 }}>{label}</div>
    </div>
  );
}

function eventIcon(type: string): string {
  switch (type) {
    case "goal": return "⚽";
    case "own_goal": return "⚽";
    case "yellow_card": return "🟨";
    case "yellow_red_card": return "🟨🟥";
    case "red_card": return "🟥";
    case "substitution": return "↔";
    case "var": return "📺";
    case "drinks_break": return "💧";
    case "penalty_missed": return "❌";
    default: return "·";
  }
}

function eventColor(type: string): string {
  if (type === "goal") return "#2BE38A";
  if (type === "own_goal") return "#FF5D6A";
  if (type === "red_card" || type === "yellow_red_card") return "#FF5D6A";
  if (type === "yellow_card") return "#FFC23D";
  if (type === "drinks_break") return "#FFC23D";
  return "#C8C3D6";
}

function MatchEventsCard({
  events,
  homeTeam,
  awayTeam,
}: {
  events: MatchEvent[];
  homeTeam: string;
  awayTeam: string;
}) {
  const seen = new Map<string, MatchEvent>();
  for (const ev of events) {
    const key = `${ev.minute}-${ev.incident_type}`;
    const existing = seen.get(key);
    if (!existing || (ev.player_name && !existing.player_name) || (ev.detail && !existing.detail)) {
      seen.set(key, ev);
    }
  }
  const deduped = Array.from(seen.values()).sort((a, b) => a.minute - b.minute);

  return (
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      padding: "22px 24px",
    }}>
      <SectionHeader color="#5B8CFF" label="MATCH EVENTS" />
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {deduped.map((ev, i) => {
          const isDrinks = ev.incident_type === "drinks_break";
          const team = ev.is_home ? homeTeam : awayTeam;

          return (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: "#4A4560", width: 36, flexShrink: 0, textAlign: "right" }}>
                {ev.minute}{ev.added_time != null ? `+${ev.added_time}` : ""}&apos;
              </span>
              <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1, minWidth: 20, textAlign: "center" }}>
                {eventIcon(ev.incident_type)}
              </span>
              <span style={{ fontSize: 13.5, color: eventColor(ev.incident_type), flex: 1, minWidth: 0 }}>
                {!isDrinks && (
                  <span style={{ color: "#645F77", marginRight: 6, fontSize: 12 }}>{team}</span>
                )}
                {ev.player_name && (
                  <span style={{ fontWeight: 700 }}>{ev.player_name}</span>
                )}
                {ev.assist_player && (
                  <span style={{ color: "#645F77", fontSize: 12, marginLeft: 6 }}>(A: {ev.assist_player})</span>
                )}
                {ev.incident_type === "own_goal" && (
                  <span style={{ fontSize: 11, color: "#FF5D6A", marginLeft: 5 }}>OG</span>
                )}
                {ev.detail && (
                  <span style={{ color: "#645F77", fontSize: 12, marginLeft: 5 }}>{ev.detail}</span>
                )}
                {isDrinks && (
                  <span style={{ fontWeight: 600 }}>Hydration break</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchFacts({
  events,
  homeTeam,
  awayTeam,
  homeGoals,
  awayGoals,
}: {
  events: MatchEvent[];
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
}) {
  const goals = events.filter((e) => e.incident_type === "goal" || e.incident_type === "own_goal");
  const yellows = events.filter((e) => e.incident_type === "yellow_card" || e.incident_type === "yellow_red_card");
  const reds = events.filter((e) => e.incident_type === "red_card" || e.incident_type === "yellow_red_card");
  const breaks = events.filter((e) => e.incident_type === "drinks_break");
  const subs = events.filter((e) => e.incident_type === "substitution");
  const breakMinutes = Array.from(new Set(breaks.map((b) => b.minute)));
  const firstGoal = goals[0];

  const facts: { icon: string; text: string }[] = [];

  if (homeGoals === 0 && awayGoals === 0) {
    facts.push({ icon: "🤝", text: "A goalless draw — clean sheets for both keepers" });
  } else {
    if (firstGoal) {
      const scorer = firstGoal.player_name
        ? `${firstGoal.player_name} (${firstGoal.is_home ? homeTeam : awayTeam})`
        : (firstGoal.is_home ? homeTeam : awayTeam);
      facts.push({ icon: "⚽", text: `First goal: ${scorer} in the ${firstGoal.minute}&apos; minute` });
    }
    if (goals.length > 1) {
      facts.push({ icon: "🎯", text: `${goals.length} goals scored in total` });
    }
    const ownGoals = goals.filter((g) => g.incident_type === "own_goal").length;
    if (ownGoals > 0) {
      facts.push({ icon: "🙈", text: `${ownGoals} own goal${ownGoals > 1 ? "s" : ""}` });
    }
    if (homeGoals === 0) {
      facts.push({ icon: "🧤", text: `Clean sheet for ${awayTeam}` });
    } else if (awayGoals === 0) {
      facts.push({ icon: "🧤", text: `Clean sheet for ${homeTeam}` });
    }
  }

  if (yellows.length > 0) facts.push({ icon: "🟨", text: `${yellows.length} yellow card${yellows.length > 1 ? "s" : ""} shown` });
  if (reds.length > 0) facts.push({ icon: "🟥", text: `${reds.length} red card${reds.length > 1 ? "s" : ""} — ${reds.map((r) => r.player_name ?? (r.is_home ? homeTeam : awayTeam)).join(", ")}` });
  if (subs.length > 0) facts.push({ icon: "↔", text: `${subs.length} substitution${subs.length > 1 ? "s" : ""}` });
  if (breakMinutes.length > 0) facts.push({ icon: "💧", text: `${breakMinutes.length} hydration break${breakMinutes.length > 1 ? "s" : ""} — ${breakMinutes.map((m) => `${m}'`).join(", ")}` });

  if (facts.length === 0) return null;

  return (
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      padding: "22px 24px",
    }}>
      <SectionHeader color="#1FD0C0" label="MATCH FACTS" />
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {facts.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1 }}>{f.icon}</span>
            <span
              style={{ fontSize: 14, color: "#C8C3D6", lineHeight: 1.5 }}
              dangerouslySetInnerHTML={{ __html: f.text }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function MatchDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [prediction, market, trivia, preview, scorers, calibration, events, matchStats, momentum, analysis] = await Promise.all([
    getMatchPrediction(id),
    getMarketComparison(id),
    getMatchTrivia(id),
    getMatchPreview(id),
    getMatchScorerPredictions(id),
    getCalibration(),
    getMatchEvents(id),
    getMatchStats(id),
    getMatchMomentum(id),
    getMatchAnalysis(id),
  ]);

  if (!prediction) notFound();

  const isCompleted = !!prediction.actual_result;

  const [homeForm, awayForm, h2h] = isCompleted
    ? [[], [], null]
    : await Promise.all([
        getTeamForm(prediction.home_team.id),
        getTeamForm(prediction.away_team.id),
        getMatchH2H(id),
      ]);

  const { home_team, away_team, outcome_probabilities: probs, scoreline_grid, totals, expected_goals } = prediction;
  const hasMarketData = (market?.markets?.length ?? 0) > 0;

  const eloDelta =
    prediction.home_elo != null && prediction.away_elo != null
      ? Math.round(prediction.home_elo - prediction.away_elo)
      : null;

  const homeWon = isCompleted && prediction.actual_result!.home_goals > prediction.actual_result!.away_goals;
  const awayWon = isCompleted && prediction.actual_result!.away_goals > prediction.actual_result!.home_goals;

  return (
    <div style={{ animation: "ff-up 0.4s ease both", paddingTop: 32, maxWidth: 740, margin: "0 auto" }}>
      {/* Back link */}
      <Link href="/" style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: MONO,
        fontSize: 13,
        color: "#7E7892",
        textDecoration: "none",
        marginBottom: 24,
      }}>
        ← All matches
      </Link>

      {/* Match hero card */}
      <div style={{
        background: "#15131F",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 20,
        overflow: "hidden",
      }}>
        {/* Stage + time strip */}
        <div style={{
          background: "#120F1E",
          padding: "12px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: "#7E7892" }}>
            FIFA World Cup 2026
          </span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: "#645F77" }}>
            <LocalTime iso={prediction.match_date} variant="datetime" />
          </span>
        </div>

        {/* Teams + score */}
        <div style={{ padding: "32px 28px 28px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 20 }}>
            {/* Home team */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={flagUrl(home_team.id, 160)}
                alt={home_team.id}
                style={{ width: 88, height: 59, borderRadius: 10, objectFit: "cover", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 6px 20px rgba(0,0,0,0.4)" }}
              />
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", color: awayWon ? "#7E7892" : "#F2F1F7", lineHeight: 1.1 }}>
                  {home_team.name}
                </div>
                {prediction.home_elo != null && (
                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: "#645F77", marginTop: 4 }}>
                    Elo {Math.round(prediction.home_elo)}
                  </div>
                )}
              </div>
            </div>

            {/* Score or VS */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              {isCompleted ? (
                <>
                  <div style={{
                    fontFamily: MONO,
                    fontSize: 44,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    letterSpacing: "-0.03em",
                  }}>
                    <span style={{ color: homeWon ? "#2BE38A" : "#F2F1F7" }}>
                      {prediction.actual_result!.home_goals}
                    </span>
                    <span style={{ color: "#3F3A52", fontSize: 30 }}>–</span>
                    <span style={{ color: awayWon ? "#2BE38A" : "#F2F1F7" }}>
                      {prediction.actual_result!.away_goals}
                    </span>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#2BE38A", letterSpacing: "0.12em" }}>
                    FULL TIME
                  </span>
                </>
              ) : (
                <>
                  <span style={{ fontFamily: MONO, fontSize: 14, color: "#4A4560", letterSpacing: "0.1em" }}>VS</span>
                  {eloDelta !== null && Math.abs(eloDelta) > 5 && (
                    <div style={{ fontFamily: MONO, fontSize: 11, color: eloDelta > 0 ? "#2BE38A" : "#5B8CFF" }}>
                      {eloDelta > 0
                        ? `${home_team.id} +${eloDelta}`
                        : `${away_team.id} +${Math.abs(eloDelta)}`} Elo
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Away team */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={flagUrl(away_team.id, 160)}
                alt={away_team.id}
                style={{ width: 88, height: 59, borderRadius: 10, objectFit: "cover", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 6px 20px rgba(0,0,0,0.4)" }}
              />
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", color: homeWon ? "#7E7892" : "#F2F1F7", lineHeight: 1.1 }}>
                  {away_team.name}
                </div>
                {prediction.away_elo != null && (
                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: "#645F77", marginTop: 4 }}>
                    Elo {Math.round(prediction.away_elo)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Probability bar */}
          <div style={{ marginTop: 28 }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: "#4A4560", textAlign: "center", marginBottom: 10, letterSpacing: "0.08em" }}>
              {isCompleted ? "PRE-MATCH MODEL PROBABILITIES" : "MODEL PROBABILITIES"}
            </div>
            <ProbabilityBar probs={probs} homeLabel={home_team.id} awayLabel={away_team.id} />
          </div>

          {/* Stat boxes */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16 }}>
            <StatBox label={`${home_team.id} win`} value={`${(probs.home_win * 100).toFixed(1)}%`} color="#2BE38A" />
            <StatBox label="Draw" value={`${(probs.draw * 100).toFixed(1)}%`} color="#FFC23D" />
            <StatBox label={`${away_team.id} win`} value={`${(probs.away_win * 100).toFixed(1)}%`} color="#5B8CFF" />
          </div>
        </div>
      </div>

      {/* ── COMPLETED MATCH SECTIONS ── */}
      {isCompleted && (
        <>
          {prediction.grading && (
            <>
              <SectionHeader color="#A35CFF" label="MODEL VERDICT" />
              <PostMatchScorecard
                grading={prediction.grading}
                modelProbs={prediction.outcome_probabilities}
                homeTeam={home_team}
                awayTeam={away_team}
                tournamentMeanLogLoss={calibration?.model_mean_log_loss}
              />
            </>
          )}

          {analysis && (
            <>
              <SectionHeader color="#5B8CFF" label="MATCH ANALYSIS" />
              <div style={{
                background: "#120F1E",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16,
                padding: "20px 24px",
              }}>
                {analysis.has_hydration_break && (
                  <span style={{
                    display: "inline-block",
                    fontFamily: MONO,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: "#FFC23D",
                    background: "rgba(255,194,61,0.1)",
                    border: "1px solid rgba(255,194,61,0.22)",
                    padding: "3px 10px",
                    borderRadius: 7,
                    marginBottom: 14,
                  }}>
                    💧 Hydration break detected{analysis.hydration_break_minute != null && ` (${analysis.hydration_break_minute}')`}
                  </span>
                )}
                <p style={{ fontSize: 14.5, color: "#C8C3D6", lineHeight: 1.7, margin: 0, whiteSpace: "pre-line" }}>
                  {analysis.analysis_text}
                </p>
                <div style={{ fontFamily: MONO, fontSize: 11.5, color: "#4A4560", marginTop: 14 }}>
                  Generated {new Date(analysis.generated_at).toLocaleDateString()}
                </div>
              </div>
            </>
          )}

          {momentum.length > 0 && (
            <>
              <SectionHeader color="#A35CFF" label="MOMENTUM" />
              <MomentumChart
                data={momentum}
                homeTeam={home_team.name}
                awayTeam={away_team.name}
                breakMinutes={events.filter((e) => e.incident_type === "drinks_break").map((e) => e.minute)}
                goalEvents={events.filter((e) => e.incident_type === "goal" || e.incident_type === "own_goal").map((e) => ({ minute: e.minute, isHome: e.is_home }))}
              />
            </>
          )}

          {matchStats.length > 0 && (
            <>
              <SectionHeader color="#5B8CFF" label="MATCH STATISTICS" />
              <MatchStatBars stats={matchStats} homeTeam={home_team.name} awayTeam={away_team.name} />
            </>
          )}

          {events.length > 0 && (
            <MatchEventsCard events={events} homeTeam={home_team.name} awayTeam={away_team.name} />
          )}

          <MatchFacts
            events={events}
            homeTeam={home_team.name}
            awayTeam={away_team.name}
            homeGoals={prediction.actual_result!.home_goals}
            awayGoals={prediction.actual_result!.away_goals}
          />

          {hasMarketData && (
            <>
              <SectionHeader color="#FFC23D" label="MODEL VS MARKET" />
              <div style={{ background: "#120F1E", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "20px 24px" }}>
                <MarketPanel data={market!} />
              </div>
            </>
          )}

          {scorers && (
            <>
              <SectionHeader color="#2BE38A" label="PRE-MATCH SCORER PREDICTIONS" />
              <PlayerScorers data={scorers} />
            </>
          )}

          {trivia && trivia.facts.length > 0 && (
            <>
              <SectionHeader color="#1FD0C0" label="MATCH TRIVIA" />
              <TriviaFacts facts={trivia.facts} />
            </>
          )}
          {preview && (
            <>
              <SectionHeader color="#9E99B0" label="MATCH PREVIEW" />
              <MatchPreviewCard preview={preview} />
            </>
          )}
        </>
      )}

      {/* ── UPCOMING MATCH SECTIONS ── */}
      {!isCompleted && (
        <>
          {(homeForm.length > 0 || awayForm.length > 0) && (
            <>
              <SectionHeader color="#2BE38A" label="RECENT FORM" />
              <div style={{
                background: "#120F1E",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16,
                padding: "20px 24px",
              }}>
                <div style={{ display: "flex", gap: 32 }}>
                  {homeForm.length > 0 && (
                    <TeamForm teamID={home_team.id} teamName={home_team.name} matches={homeForm} />
                  )}
                  {awayForm.length > 0 && (
                    <TeamForm teamID={away_team.id} teamName={away_team.name} matches={awayForm} />
                  )}
                </div>
              </div>
            </>
          )}

          {h2h && (
            <>
              <SectionHeader color="#FFC23D" label="HEAD TO HEAD" />
              <HeadToHead data={h2h} homeTeamName={home_team.name} awayTeamName={away_team.name} />
            </>
          )}

          <SectionHeader color="#2BE38A" label="THE FORECAST" />
          <ForecastCard prediction={prediction} scorers={scorers} />

          {expected_goals && (
            <>
              <SectionHeader color="#A35CFF" label="EXPECTED GOALS" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <StatBox label={`${home_team.name} xG`} value={expected_goals.home_xg.toFixed(2)} color="#2BE38A" />
                <StatBox label={`${away_team.name} xG`} value={expected_goals.away_xg.toFixed(2)} color="#5B8CFF" />
              </div>
            </>
          )}

          <SectionHeader color="#1FD0C0" label="OVER / UNDER" />
          <div style={{ background: "#120F1E", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "20px 24px" }}>
            <OverUnderBars totals={totals} showBTTS />
          </div>

          {scoreline_grid && scoreline_grid.length > 0 && (
            <>
              <SectionHeader color="#5B8CFF" label="TOP SCORELINES" />
              <div style={{ background: "#120F1E", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "20px 24px" }}>
                <TopScorelines grid={scoreline_grid} homeTeam={home_team.name} awayTeam={away_team.name} />
              </div>
            </>
          )}

          {hasMarketData && (
            <>
              <SectionHeader color="#FFC23D" label="MODEL VS MARKET" />
              <div style={{ background: "#120F1E", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "20px 24px" }}>
                <MarketPanel data={market!} />
              </div>
            </>
          )}

          {scorers && (
            <>
              <SectionHeader color="#2BE38A" label="PROBABLE GOALSCORERS" />
              <PlayerScorers data={scorers} />
            </>
          )}

          <SectionHeader color="#645F77" label="YOUR PREDICTION" />
          <PredictionCard matchId={id} homeTeam={home_team} awayTeam={away_team} modelProbs={probs} />

          {preview && (
            <>
              <SectionHeader color="#9E99B0" label="MATCH PREVIEW" />
              <MatchPreviewCard preview={preview} />
            </>
          )}
          {trivia && trivia.facts.length > 0 && (
            <>
              <SectionHeader color="#1FD0C0" label="MATCH TRIVIA" />
              <TriviaFacts facts={trivia.facts} />
            </>
          )}
        </>
      )}

      {/* Model metadata */}
      <div style={{ fontFamily: MONO, fontSize: 12, color: "#4A4560", textAlign: "center", marginTop: 32, display: "flex", flexDirection: "column", gap: 4 }}>
        <div>Model version: {prediction.model_version}</div>
        <div>Data as of: <LocalTime iso={prediction.model_as_of} variant="kickoff" /></div>
      </div>
    </div>
  );
}
