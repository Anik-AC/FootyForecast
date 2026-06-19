import { getCalibration, getTopScorers, getTopAssists, getHydrationAnalysis, getTournamentTrivia } from "@/lib/api";
import type { GradedMatch, HydrationAnalysis, TopScorer, TournamentTriviaFact } from "@/lib/types";
import Link from "next/link";

// ── Upset detection ───────────────────────────────────────────────────────────

function isUpset(match: GradedMatch): boolean {
  const prob =
    match.actual_outcome === "home_win"
      ? match.model_probabilities.home_win
      : match.actual_outcome === "away_win"
      ? match.model_probabilities.away_win
      : match.model_probabilities.draw;
  return prob < 0.3;
}

function actualOutcomeProb(match: GradedMatch): number {
  return match.actual_outcome === "home_win"
    ? match.model_probabilities.home_win
    : match.actual_outcome === "away_win"
    ? match.model_probabilities.away_win
    : match.model_probabilities.draw;
}

function outcomeLabel(outcome: string, match: GradedMatch): string {
  if (outcome === "home_win") return `${match.home_team.name} won`;
  if (outcome === "away_win") return `${match.away_team.name} won`;
  return "Draw";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default async function StatsPage() {
  const [calibration, scorers, assists, hydration, trivia] = await Promise.all([
    getCalibration(),
    getTopScorers(5),
    getTopAssists(5),
    getHydrationAnalysis(),
    getTournamentTrivia(),
  ]);

  const graded = calibration?.matches ?? [];
  const correct = graded.filter(
    (m) =>
      (m.actual_outcome === "home_win" &&
        m.model_probabilities.home_win >= m.model_probabilities.draw &&
        m.model_probabilities.home_win >= m.model_probabilities.away_win) ||
      (m.actual_outcome === "draw" &&
        m.model_probabilities.draw > m.model_probabilities.home_win &&
        m.model_probabilities.draw > m.model_probabilities.away_win) ||
      (m.actual_outcome === "away_win" &&
        m.model_probabilities.away_win > m.model_probabilities.home_win &&
        m.model_probabilities.away_win > m.model_probabilities.draw)
  );

  const upsets = graded.filter(isUpset).sort(
    (a, b) => actualOutcomeProb(a) - actualOutcomeProb(b)
  );

  const accuracy =
    graded.length > 0
      ? Math.round((correct.length / graded.length) * 100)
      : null;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Tournament Stats</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Model performance, top performers, and tournament records
        </p>
      </div>

      {/* Model performance */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">
          Model Performance
        </h2>
        {!calibration || graded.length === 0 ? (
          <p className="text-slate-500 text-sm">No graded matches yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Matches graded"
              value={graded.length.toString()}
            />
            {accuracy != null && (
              <StatCard
                label="Correct predictions"
                value={`${correct.length}/${graded.length}`}
                sub={`${accuracy}%`}
                highlight={accuracy >= 60}
              />
            )}
            <StatCard
              label="Avg log loss"
              value={calibration.model_mean_log_loss.toFixed(3)}
              sub="lower = better"
            />
            <StatCard
              label="Avg Brier score"
              value={calibration.model_mean_brier.toFixed(3)}
              sub="lower = better"
            />
          </div>
        )}
      </section>

      {/* Upsets */}
      {upsets.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">
            Upsets &amp; Surprises
          </h2>
          <p className="text-xs text-slate-600">
            Matches where the model gave less than 30% probability to the actual outcome.
          </p>
          <div className="space-y-2">
            {upsets.map((m) => (
              <div
                key={m.match_id}
                className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-4 py-3"
              >
                <div>
                  <span className="text-sm font-medium text-slate-100">
                    {m.home_team.name} vs {m.away_team.name}
                  </span>
                  <span className="ml-2 text-xs text-slate-500">
                    {outcomeLabel(m.actual_outcome, m)}
                  </span>
                </div>
                <span className="text-sm font-bold text-red-400 tabular-nums">
                  {(actualOutcomeProb(m) * 100).toFixed(0)}% model prob
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tournament records and trivia */}
      <TriviaSection facts={trivia?.facts ?? []} />

      {/* Top scorers + top assists side by side */}
      <div className="grid sm:grid-cols-2 gap-6">
        <PlayerLeaderboard
          title="Top Scorers"
          players={scorers}
          statKey="goals"
          statLabel="G"
          accentColor="text-emerald-400"
        />
        <PlayerLeaderboard
          title="Top Assists"
          players={assists}
          statKey="assists"
          statLabel="A"
          accentColor="text-sky-400"
        />
      </div>

      {/* Hydration breaks */}
      <HydrationSection data={hydration} />
    </div>
  );
}

// ── Tournament trivia ─────────────────────────────────────────────────────────

function TriviaCard({ fact }: { fact: TournamentTriviaFact }) {
  const inner = (
    <>
      <div className="text-2xl mb-2 leading-none">{fact.icon}</div>
      <div className="font-semibold text-slate-100 text-sm leading-snug">{fact.headline}</div>
      {fact.detail && (
        <div className="text-xs text-slate-500 mt-1">{fact.detail}</div>
      )}
      {fact.match_id && fact.home_team && (
        <div className="text-[10px] text-slate-600 mt-2 truncate">
          {fact.home_team} vs {fact.away_team}
        </div>
      )}
    </>
  );

  const cls =
    "bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-600 transition-colors";

  if (fact.match_id) {
    return (
      <Link href={`/matches/${fact.match_id}`} className={`block ${cls}`}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function TriviaSection({ facts }: { facts: TournamentTriviaFact[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">
          Tournament Records &amp; Trivia
        </h2>
        <p className="text-xs text-slate-600 mt-0.5">
          Records and milestones set at FIFA World Cup 2026.
        </p>
      </div>
      {facts.length === 0 ? (
        <p className="text-slate-600 text-sm">
          Records will appear here as matches are played and data is ingested.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {facts.map((f, i) => (
            <TriviaCard key={`${f.category}-${i}`} fact={f} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Player leaderboard ────────────────────────────────────────────────────────

function PlayerLeaderboard({
  title,
  players,
  statKey,
  statLabel,
  accentColor,
}: {
  title: string;
  players: TopScorer[];
  statKey: "goals" | "assists";
  statLabel: string;
  accentColor: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">{title}</h2>
      {players.length === 0 ? (
        <p className="text-slate-500 text-sm">No data yet.</p>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <th className="text-left py-2.5 px-4 w-6">#</th>
                <th className="text-left py-2.5 px-4">Player</th>
                <th className="text-left py-2.5 px-4">Team</th>
                <th className={`text-center py-2.5 px-3 ${accentColor}`}>{statLabel}</th>
              </tr>
            </thead>
            <tbody>
              {players.map((s, i) => (
                <tr key={i} className="border-b border-slate-800 last:border-0">
                  <td className="py-2.5 px-4 text-slate-600 tabular-nums text-xs">{i + 1}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-100">{s.player_name}</td>
                  <td className="py-2.5 px-4 text-slate-400 text-xs">
                    <Link href={`/teams/${s.team_id}`} className="hover:text-slate-200 transition-colors">
                      {s.team_name}
                    </Link>
                  </td>
                  <td className={`py-2.5 px-3 text-center font-bold tabular-nums ${accentColor}`}>
                    {s[statKey]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Hydration break analysis ──────────────────────────────────────────────────

function HydrationSection({ data }: { data: HydrationAnalysis | null }) {
  if (!data || data.total_breaks === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">
          Hydration Break Impact
        </h2>
        <Link
          href="/stats/hydration"
          className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Full analysis &rarr;
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Total breaks"
          value={data.total_breaks.toString()}
          sub={`${data.matches_with_breaks} matches`}
        />
        <StatCard
          label="Momentum shifts"
          value={data.shifts_count.toString()}
          sub={`${data.shifts_pct.toFixed(0)}% of breaks`}
          highlight={data.shifts_pct > 30}
        />
        <StatCard
          label="Goals within 5 min"
          value={data.goal_after_count.toString()}
          sub={`${data.goal_after_pct.toFixed(0)}% of breaks`}
        />
        <StatCard
          label="Home benefited"
          value={data.home_benefit_count.toString()}
          sub="when shift occurred"
        />
        <StatCard
          label="Away benefited"
          value={data.away_benefit_count.toString()}
          sub="when shift occurred"
        />
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
      <div className={`text-2xl font-bold ${highlight ? "text-emerald-400" : "text-slate-100"}`}>
        {value}
      </div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-600 mt-0.5">{sub}</div>}
    </div>
  );
}
