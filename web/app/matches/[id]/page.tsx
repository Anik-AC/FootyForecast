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
import type { MatchEvent } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

// ── Match events ──────────────────────────────────────────────────────────────

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
  if (type === "goal") return "text-emerald-300";
  if (type === "own_goal") return "text-red-400";
  if (type === "red_card" || type === "yellow_red_card") return "text-red-400";
  if (type === "yellow_card") return "text-yellow-300";
  if (type === "drinks_break") return "text-amber-400";
  return "text-slate-300";
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
  // Deduplicate: for repeated (minute, incident_type) pairs keep the one with more detail.
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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Match Events
      </h2>
      <div className="space-y-2.5">
        {deduped.map((ev, i) => {
          const icon = eventIcon(ev.incident_type);
          const color = eventColor(ev.incident_type);
          const team = ev.is_home ? homeTeam : awayTeam;
          const isDrinks = ev.incident_type === "drinks_break";

          return (
            <div key={i} className="flex gap-3 text-sm items-baseline">
              <span className="font-mono text-slate-500 w-10 shrink-0 text-right tabular-nums text-xs">
                {ev.minute}&apos;
                {ev.added_time != null && (
                  <span className="text-slate-700">+{ev.added_time}</span>
                )}
              </span>
              <span className="w-5 shrink-0 text-center text-base leading-none">{icon}</span>
              <span className={`flex-1 min-w-0 ${color}`}>
                {!isDrinks && (
                  <span className="text-slate-500 text-xs mr-1.5 font-normal">{team}</span>
                )}
                {ev.player_name && (
                  <span className="font-semibold">{ev.player_name}</span>
                )}
                {ev.assist_player && (
                  <span className="text-slate-500 text-xs ml-1.5">
                    (A: {ev.assist_player})
                  </span>
                )}
                {ev.incident_type === "own_goal" && (
                  <span className="text-xs ml-1 text-red-500">OG</span>
                )}
                {ev.detail && (
                  <span className="text-slate-500 text-xs ml-1.5">{ev.detail}</span>
                )}
                {isDrinks && (
                  <span className="text-amber-400 text-xs font-medium">Hydration break</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Match facts (computed from events, shown in place of LLM trivia) ──────────

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

  // Deduplicate break minutes
  const breakMinutes = Array.from(new Set(breaks.map((b) => b.minute)));

  const firstGoal = goals[0];
  const lastGoal = goals[goals.length - 1];

  const facts: { icon: string; text: string }[] = [];

  if (homeGoals === 0 && awayGoals === 0) {
    facts.push({ icon: "🤝", text: "A goalless draw — clean sheets for both keepers" });
  } else {
    if (firstGoal) {
      const scorer = firstGoal.player_name ? `${firstGoal.player_name} (${firstGoal.is_home ? homeTeam : awayTeam})` : (firstGoal.is_home ? homeTeam : awayTeam);
      facts.push({ icon: "⚽", text: `First goal: ${scorer} in the ${firstGoal.minute}&apos; minute` });
    }
    if (goals.length > 1 && lastGoal && lastGoal !== firstGoal) {
      facts.push({ icon: "🎯", text: `${goals.length} goals scored in total` });
    }
    const homeGls = goals.filter((g) => g.is_home && g.incident_type === "goal").length;
    const ownGoals = goals.filter((g) => g.incident_type === "own_goal").length;
    if (ownGoals > 0) {
      facts.push({ icon: "🙈", text: `${ownGoals} own goal${ownGoals > 1 ? "s" : ""}` });
    }
    if (homeGoals === 0) {
      facts.push({ icon: "🧤", text: `Clean sheet for ${awayTeam}` });
    } else if (awayGoals === 0) {
      facts.push({ icon: "🧤", text: `Clean sheet for ${homeTeam}` });
    }
    void homeGls;
  }

  if (yellows.length > 0) {
    facts.push({ icon: "🟨", text: `${yellows.length} yellow card${yellows.length > 1 ? "s" : ""} shown` });
  }
  if (reds.length > 0) {
    facts.push({ icon: "🟥", text: `${reds.length} red card${reds.length > 1 ? "s" : ""} — ${reds.map((r) => r.player_name ?? (r.is_home ? homeTeam : awayTeam)).join(", ")}` });
  }
  if (subs.length > 0) {
    facts.push({ icon: "↔", text: `${subs.length} substitution${subs.length > 1 ? "s" : ""}` });
  }
  if (breakMinutes.length > 0) {
    facts.push({ icon: "💧", text: `${breakMinutes.length} hydration break${breakMinutes.length > 1 ? "s" : ""} — ${breakMinutes.map((m) => `${m}'`).join(", ")}` });
  }

  if (facts.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Match Facts
      </h2>
      <div className="space-y-2.5">
        {facts.map((f, i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <span className="text-base shrink-0 leading-none mt-0.5">{f.icon}</span>
            <span
              className="text-slate-300"
              dangerouslySetInnerHTML={{ __html: f.text }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 rounded-lg p-4 text-center">
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
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

  // Only fetch form and H2H for upcoming matches (not needed post-match).
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

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Back link */}
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
        &larr; All matches
      </Link>

      {/* Match header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="text-xs text-slate-500 mb-4 text-center"><LocalTime iso={prediction.match_date} variant="datetime" /></div>

        {/* Teams and score / vs */}
        <div className="flex items-center justify-center gap-6">
          <div className="flex-1 text-right">
            <div className="text-xl font-bold text-slate-100">{home_team.name}</div>
            <div className="text-sm text-slate-500">{home_team.id}</div>
            {prediction.home_elo != null && (
              <div className="text-xs text-slate-600 mt-0.5">Elo {Math.round(prediction.home_elo)}</div>
            )}
          </div>

          {isCompleted ? (
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums text-slate-100">
                {prediction.actual_result!.home_goals}
                <span className="text-slate-500 mx-2">–</span>
                {prediction.actual_result!.away_goals}
              </div>
              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mt-1">
                Full Time
              </div>
              {eloDelta !== null && Math.abs(eloDelta) > 5 && (
                <div className="mt-2 text-[10px] text-slate-500">
                  <span className={eloDelta > 0 ? "text-emerald-400 font-semibold" : "text-blue-400 font-semibold"}>
                    {eloDelta > 0
                      ? `${home_team.id} +${eloDelta}`
                      : `${away_team.id} +${Math.abs(eloDelta)}`}
                  </span>
                  {" "}Elo advantage
                </div>
              )}
            </div>
          ) : (
            <div className="text-center">
              <div className="text-slate-600 font-semibold text-lg">vs</div>
              {eloDelta !== null && Math.abs(eloDelta) > 5 && (
                <div className="mt-2 text-[10px] text-slate-500">
                  <span className={eloDelta > 0 ? "text-emerald-400 font-semibold" : "text-blue-400 font-semibold"}>
                    {eloDelta > 0
                      ? `${home_team.id} +${eloDelta}`
                      : `${away_team.id} +${Math.abs(eloDelta)}`}
                  </span>
                  {" "}Elo advantage
                </div>
              )}
            </div>
          )}

          <div className="flex-1 text-left">
            <div className="text-xl font-bold text-slate-100">{away_team.name}</div>
            <div className="text-sm text-slate-500">{away_team.id}</div>
            {prediction.away_elo != null && (
              <div className="text-xs text-slate-600 mt-0.5">Elo {Math.round(prediction.away_elo)}</div>
            )}
          </div>
        </div>

        {/* Outcome probability bar */}
        <div className="mt-6">
          <div className="text-xs text-slate-600 text-center mb-2 uppercase tracking-wider">
            {isCompleted ? "Pre-match model probabilities" : "Model probabilities"}
          </div>
          <ProbabilityBar
            probs={probs}
            homeLabel={home_team.id}
            awayLabel={away_team.id}
          />
        </div>

        {/* Win / Draw / Away % */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <StatBox label={`${home_team.id} win`} value={`${(probs.home_win * 100).toFixed(1)}%`} />
          <StatBox label="Draw" value={`${(probs.draw * 100).toFixed(1)}%`} />
          <StatBox label={`${away_team.id} win`} value={`${(probs.away_win * 100).toFixed(1)}%`} />
        </div>
      </div>

      {/* ── COMPLETED MATCH SECTIONS ────────────────────────────────────── */}
      {isCompleted && (
        <>
          {/* Post-match verdict: how did the model do? Was this an upset? */}
          {prediction.grading && (
            <PostMatchScorecard
              grading={prediction.grading}
              modelProbs={prediction.outcome_probabilities}
              homeTeam={home_team}
              awayTeam={away_team}
              tournamentMeanLogLoss={calibration?.model_mean_log_loss}
            />
          )}

          {/* LLM post-match analysis with hydration break detection */}
          {analysis && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                  Match Analysis
                </h2>
                {analysis.has_hydration_break && (
                  <span className="text-xs bg-amber-900/40 text-amber-300 border border-amber-700/50 rounded px-2 py-0.5">
                    Hydration break detected
                    {analysis.hydration_break_minute != null && ` (${analysis.hydration_break_minute}')`}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {analysis.analysis_text}
              </p>
              <div className="text-xs text-slate-600 mt-3">
                Generated {new Date(analysis.generated_at).toLocaleDateString()}
              </div>
            </div>
          )}

          {/* Momentum chart */}
          {momentum.length > 0 && (
            <MomentumChart
              data={momentum}
              homeTeam={home_team.name}
              awayTeam={away_team.name}
              breakMinutes={events
                .filter((e) => e.incident_type === "drinks_break")
                .map((e) => e.minute)}
              goalEvents={events
                .filter((e) => e.incident_type === "goal" || e.incident_type === "own_goal")
                .map((e) => ({ minute: e.minute, isHome: e.is_home }))}
            />
          )}

          {/* Bi-directional team stat bars */}
          {matchStats.length > 0 && (
            <MatchStatBars
              stats={matchStats}
              homeTeam={home_team.name}
              awayTeam={away_team.name}
            />
          )}

          {/* Key match events (goals, cards, subs, hydration breaks) */}
          {events.length > 0 && (
            <MatchEventsCard events={events} homeTeam={home_team.name} awayTeam={away_team.name} />
          )}

          {/* Computed match facts derived from event data */}
          <MatchFacts
            events={events}
            homeTeam={home_team.name}
            awayTeam={away_team.name}
            homeGoals={prediction.actual_result!.home_goals}
            awayGoals={prediction.actual_result!.away_goals}
          />

          {/* Market comparison — only when market data exists */}
          {hasMarketData && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Model vs Market
              </h2>
              <MarketPanel data={market!} />
            </div>
          )}

          {/* Pre-match scorer predictions for context */}
          {scorers && (
            <div>
              <p className="text-xs text-slate-600 uppercase tracking-wider mb-2 pl-1">
                Pre-match scorer predictions
              </p>
              <PlayerScorers data={scorers} />
            </div>
          )}

          {/* Historical context: trivia and pre-match preview */}
          {(trivia && trivia.facts.length > 0) && (
            <TriviaFacts facts={trivia.facts} />
          )}
          {preview && <MatchPreviewCard preview={preview} />}
        </>
      )}

      {/* ── UPCOMING MATCH SECTIONS ─────────────────────────────────────── */}
      {!isCompleted && (
        <>
          {/* Recent form */}
          {(homeForm.length > 0 || awayForm.length > 0) && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-extrabold text-slate-100 uppercase tracking-widest mb-4">
                Recent Form
              </h2>
              <div className="flex gap-8">
                {homeForm.length > 0 && (
                  <TeamForm
                    teamID={home_team.id}
                    teamName={home_team.name}
                    matches={homeForm}
                  />
                )}
                {awayForm.length > 0 && (
                  <TeamForm
                    teamID={away_team.id}
                    teamName={away_team.name}
                    matches={awayForm}
                  />
                )}
              </div>
            </div>
          )}

          {/* Head to head */}
          {h2h && (
            <HeadToHead
              data={h2h}
              homeTeamName={home_team.name}
              awayTeamName={away_team.name}
            />
          )}

          {/* The Forecast: headline calls derived from model output */}
          <ForecastCard prediction={prediction} scorers={scorers} />

          {/* Expected goals */}
          {expected_goals && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Expected Goals</h2>
              <div className="grid grid-cols-2 gap-4">
                <StatBox label={`${home_team.name} xG`} value={expected_goals.home_xg.toFixed(2)} />
                <StatBox label={`${away_team.name} xG`} value={expected_goals.away_xg.toFixed(2)} />
              </div>
            </div>
          )}

          {/* Over / Under */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">Over / Under</h2>
            <OverUnderBars totals={totals} showBTTS />
          </div>

          {/* Top scorelines */}
          {scoreline_grid && scoreline_grid.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">Top Scorelines</h2>
              <TopScorelines
                grid={scoreline_grid}
                homeTeam={home_team.name}
                awayTeam={away_team.name}
              />
            </div>
          )}

          {/* Market comparison — only when data exists */}
          {hasMarketData && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Model vs Market
              </h2>
              <MarketPanel data={market!} />
            </div>
          )}

          {/* Scorer predictions */}
          {scorers && <PlayerScorers data={scorers} />}

          {/* Pick card — before kick-off */}
          <PredictionCard
            matchId={id}
            homeTeam={home_team}
            awayTeam={away_team}
            modelProbs={probs}
          />

          {/* Preview and trivia */}
          {preview && <MatchPreviewCard preview={preview} />}
          {trivia && trivia.facts.length > 0 && <TriviaFacts facts={trivia.facts} />}
        </>
      )}

      {/* Model metadata */}
      <div className="text-xs text-slate-600 text-center space-y-1">
        <div>Model version: {prediction.model_version}</div>
        <div>Data as of: <LocalTime iso={prediction.model_as_of} variant="kickoff" /></div>
      </div>
    </main>
  );
}
