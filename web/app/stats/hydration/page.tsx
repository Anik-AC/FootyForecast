import { getHydrationAnalysis } from "@/lib/api";
import type { HydrationBreak, HydrationAnalysis } from "@/lib/types";
import Link from "next/link";
import LocalTime from "@/components/LocalTime";

// ── Helpers ───────────────────────────────────────────────────────────────────

function climateBadge(climate: string) {
  if (climate === "enclosed") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/40 text-cyan-400 border border-cyan-800">
        AC
      </span>
    );
  }
  if (climate === "open") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900/40 text-orange-400 border border-orange-800">
        Open
      </span>
    );
  }
  return <span className="text-[10px] text-slate-600">?</span>;
}

function momentumLabel(m: "home" | "away" | "level", homeTeam: string, awayTeam: string) {
  if (m === "level") return { text: "Level", color: "text-slate-500" };
  return m === "home"
    ? { text: homeTeam, color: "text-sky-400" }
    : { text: awayTeam, color: "text-amber-400" };
}

// ── Summary stat card ─────────────────────────────────────────────────────────

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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
      <div className={`text-2xl font-bold tabular-nums ${accent ? "text-emerald-400" : "text-slate-100"}`}>
        {value}
      </div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-600 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Impact card for one break ─────────────────────────────────────────────────

function ImpactCard({ b }: { b: HydrationBreak }) {
  const before = momentumLabel(b.momentum_before, b.home_team_name, b.away_team_name);
  const after = momentumLabel(b.momentum_after, b.home_team_name, b.away_team_name);
  const shifted = b.momentum_before !== b.momentum_after;

  return (
    <Link
      href={`/matches/${b.fixture_id}`}
      className={`block border rounded-xl p-5 hover:border-slate-600 transition-colors ${
        shifted ? "bg-amber-950/10 border-amber-900/40" : "bg-slate-900 border-slate-800"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="font-semibold text-slate-100 text-sm">
            {b.home_team_name} vs {b.away_team_name}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
            <LocalTime iso={b.kickoff_utc} variant="dateonly" />
            <span className="text-slate-700">·</span>
            <span className="uppercase tracking-wide">{b.stage.replace(/_/g, " ")}</span>
            {b.venue && (
              <>
                <span className="text-slate-700">·</span>
                <span className="truncate max-w-[160px]">{b.venue}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-slate-400 text-xs">{b.break_minute}&apos;</span>
          {climateBadge(b.venue_climate)}
        </div>
      </div>

      {/* Momentum before / after */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Before break</div>
          <div className={`font-semibold text-sm ${before.color}`}>{before.text}</div>
          <div className="text-[10px] text-slate-600 mt-0.5">
            {b.goals_home_before > 0 || b.goals_away_before > 0
              ? `${b.goals_home_before}–${b.goals_away_before} goals in window`
              : "No goals in 10-min window"}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">After break</div>
          <div className={`font-semibold text-sm ${after.color}`}>{after.text}</div>
          <div className="text-[10px] text-slate-600 mt-0.5">
            {b.goals_home_after > 0 || b.goals_away_after > 0
              ? `${b.goals_home_after}–${b.goals_away_after} goals in window`
              : "No goals in 10-min window"}
          </div>
        </div>
      </div>

      {/* Evidence badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {shifted ? (
          <span className="text-xs font-bold text-amber-400 bg-amber-900/20 border border-amber-800/40 px-2 py-0.5 rounded">
            Momentum shifted: {before.text} → {after.text}
          </span>
        ) : (
          <span className="text-xs text-slate-600 bg-slate-800/40 border border-slate-700/40 px-2 py-0.5 rounded">
            No momentum shift
          </span>
        )}
        {b.goal_within_5min && (
          <span className="text-xs font-bold text-emerald-400 bg-emerald-900/20 border border-emerald-800/40 px-2 py-0.5 rounded">
            Goal scored within 5 minutes
          </span>
        )}
        <span className="text-xs text-slate-600 bg-slate-800/40 border border-slate-700/40 px-2 py-0.5 rounded">
          {b.important_before} → {b.important_after} key commentary moments
        </span>
      </div>
    </Link>
  );
}

// ── Full break table ──────────────────────────────────────────────────────────

function BreakTable({ breaks }: { breaks: HydrationBreak[] }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
      <table className="w-full text-xs min-w-[700px]">
        <thead>
          <tr className="text-slate-500 uppercase tracking-wider border-b border-slate-800">
            <th className="text-left py-2.5 px-3">Match</th>
            <th className="text-center py-2.5 px-2">Min</th>
            <th className="text-center py-2.5 px-2">Climate</th>
            <th className="text-center py-2.5 px-3">Momentum before</th>
            <th className="text-center py-2.5 px-2">Goals before</th>
            <th className="text-center py-2.5 px-3">Momentum after</th>
            <th className="text-center py-2.5 px-2">Goals after</th>
            <th className="text-center py-2.5 px-2">Shifted</th>
            <th className="text-center py-2.5 px-2">Goal +5</th>
          </tr>
        </thead>
        <tbody>
          {breaks.map((b, i) => {
            const bLabel = momentumLabel(b.momentum_before, b.home_team_name, b.away_team_name);
            const aLabel = momentumLabel(b.momentum_after, b.home_team_name, b.away_team_name);
            return (
              <tr
                key={`${b.fixture_id}-${b.break_minute}-${i}`}
                className={`border-b border-slate-800 last:border-0 ${b.shifted ? "bg-amber-950/10" : ""}`}
              >
                <td className="py-2 px-3 whitespace-nowrap">
                  <Link
                    href={`/matches/${b.fixture_id}`}
                    className="text-slate-200 hover:text-emerald-400 transition-colors font-medium"
                  >
                    {b.home_team_name} <span className="text-slate-600">vs</span> {b.away_team_name}
                  </Link>
                  <div className="text-slate-600 text-[10px] mt-0.5 truncate max-w-[180px]">
                    {b.venue || "Unknown venue"}
                  </div>
                </td>
                <td className="py-2 px-2 text-center font-mono text-slate-300">{b.break_minute}&apos;</td>
                <td className="py-2 px-2 text-center">{climateBadge(b.venue_climate)}</td>
                <td className={`py-2 px-3 text-center font-medium ${bLabel.color}`}>{bLabel.text}</td>
                <td className="py-2 px-2 text-center text-slate-400 tabular-nums">
                  {b.goals_home_before}–{b.goals_away_before}
                </td>
                <td className={`py-2 px-3 text-center font-medium ${aLabel.color}`}>{aLabel.text}</td>
                <td className="py-2 px-2 text-center text-slate-400 tabular-nums">
                  {b.goals_home_after}–{b.goals_away_after}
                </td>
                <td className="py-2 px-2 text-center">
                  {b.shifted ? (
                    <span className="font-bold text-amber-400">Yes</span>
                  ) : (
                    <span className="text-slate-700">—</span>
                  )}
                </td>
                <td className="py-2 px-2 text-center">
                  {b.goal_within_5min ? (
                    <span className="font-bold text-emerald-400">Yes</span>
                  ) : (
                    <span className="text-slate-700">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HydrationPage() {
  const data: HydrationAnalysis | null = await getHydrationAnalysis();

  const impacted = (data?.breaks ?? []).filter((b) => b.shifted || b.goal_within_5min);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <Link
          href="/stats"
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors mb-3 inline-block"
        >
          &larr; Tournament Stats
        </Link>
        <h1 className="text-2xl font-bold text-slate-100">Hydration Break Analysis</h1>
        <p className="text-slate-400 mt-1 text-sm max-w-2xl">
          FIFA mandates mandatory cooling breaks when pitch-level temperature exceeds 32°C and
          humidity is high. We track whether these breaks alter match momentum or trigger scoring.
        </p>
      </div>

      {!data || data.total_breaks === 0 ? (
        <p className="text-slate-500 text-sm py-16 text-center">
          No hydration break data available yet.
        </p>
      ) : (
        <>
          {/* Summary stats */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">
              Summary
            </h2>
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
                accent={data.shifts_pct > 30}
              />
              <StatCard
                label="Goals within 5 min"
                value={data.goal_after_count.toString()}
                sub={`${data.goal_after_pct.toFixed(0)}% of breaks`}
                accent={data.goal_after_pct > 20}
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

          {/* Methodology */}
          <section>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-widest">
                How we measure impact
              </h2>
              <div className="text-sm text-slate-400 space-y-2 max-w-2xl">
                <p>
                  Momentum is computed per-minute from the commentary feed using a rolling
                  sentiment window. Positive values indicate home-team pressure; negative values
                  indicate away-team pressure. We classify each minute as "home," "away," or "level"
                  by sign and magnitude threshold.
                </p>
                <p>
                  For each hydration break, we compare the dominant team in the 10-minute window
                  before the break to the 10-minute window after. If the dominant team changes,
                  we call it a <strong className="text-amber-400">momentum shift</strong>. A
                  <strong className="text-emerald-400"> goal within 5 minutes</strong> means a goal
                  was scored in the five minutes immediately following the break.
                </p>
                <p>
                  Venue climate is classified as "AC" (enclosed, air-conditioned stadium) or "open"
                  based on the stadium at the fixture. Climate is relevant because AC stadiums are
                  cooler, making breaks less physiologically impactful.
                </p>
              </div>
            </div>
          </section>

          {/* Impacted breaks */}
          {impacted.length > 0 && (
            <section className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">
                  Breaks with Measurable Impact
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  {impacted.length} of {data.total_breaks} breaks showed a momentum shift or
                  triggered a goal within 5 minutes.
                </p>
              </div>
              <div className="space-y-3">
                {impacted.map((b, i) => (
                  <ImpactCard key={`${b.fixture_id}-${b.break_minute}-${i}`} b={b} />
                ))}
              </div>
            </section>
          )}

        </>
      )}
    </div>
  );
}
