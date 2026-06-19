import { getMatches, getLatestSimulation } from "@/lib/api";
import LocalTime from "@/components/LocalTime";
import Link from "next/link";
import type { MatchSummary, TeamSimulationResult } from "@/lib/types";

const STAGE_ORDER: Record<string, number> = {
  round_of_32: 1,
  round_of_16: 2,
  quarter_final: 3,
  semi_final: 4,
  final: 5,
};

const STAGE_LABELS: Record<string, string> = {
  round_of_32: "R32",
  round_of_16: "R16",
  quarter_final: "QF",
  semi_final: "SF",
  final: "Final",
};

// Fixed card height + gap for bracket geometry
const CARD_H = 72; // px — matches the rendered card
const GAP = 8;     // px — gap between cards within a round

function BracketCard({ match }: { match: MatchSummary }) {
  const played = match.result !== null;
  const homeWon = played && match.result!.home_goals > match.result!.away_goals;
  const awayWon = played && match.result!.away_goals > match.result!.home_goals;

  return (
    <Link
      href={`/matches/${match.id}`}
      className="block bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs hover:border-emerald-600 transition-colors"
      style={{ width: 168, height: CARD_H }}
    >
      <div className="flex flex-col justify-between h-full">
        <div className={`flex items-center justify-between gap-1 ${homeWon ? "font-bold text-slate-100" : "text-slate-400"}`}>
          <span className="truncate">{match.home_team.name}</span>
          {played && <span className="tabular-nums shrink-0">{match.result!.home_goals}</span>}
        </div>
        <div className="border-t border-slate-800 my-1" />
        <div className={`flex items-center justify-between gap-1 ${awayWon ? "font-bold text-slate-100" : "text-slate-400"}`}>
          <span className="truncate">{match.away_team.name}</span>
          {played && <span className="tabular-nums shrink-0">{match.result!.away_goals}</span>}
        </div>
        {!played && (
          <div className="text-slate-600 text-[10px] mt-1"><LocalTime iso={match.kickoff_utc} variant="dateonly" /></div>
        )}
      </div>
    </Link>
  );
}

function BracketColumn({
  label,
  matches,
  totalRows,
  isLast,
}: {
  label: string;
  matches: MatchSummary[];
  totalRows: number;   // total row-slots in this bracket (= R32 match count)
  isLast: boolean;
}) {
  const matchCount = matches.length;
  // Each match occupies (totalRows / matchCount) slots.
  const slotsPerMatch = totalRows / matchCount;
  // Height of one slot = card height + gap between cards.
  const slotPx = CARD_H + GAP;
  // Total column height: all slots minus the final gap.
  const colHeight = totalRows * slotPx - GAP;

  return (
    <div className="flex-shrink-0" style={{ width: 196 }}>
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3 text-center">
        {label}
      </div>
      <div className="relative" style={{ height: colHeight }}>
        {matches.map((m, i) => {
          // Center the card within its slot range.
          const slotStart = i * slotsPerMatch;
          const slotCenterPx = (slotStart + slotsPerMatch / 2) * slotPx - CARD_H / 2 - GAP / 2;

          return (
            <div key={m.id} className="absolute" style={{ top: slotCenterPx, left: 0 }}>
              {/* Left connector line (for rounds after R32) */}
              <div
                className="absolute bg-slate-700"
                style={{ right: "100%", top: CARD_H / 2 - 1, width: 14, height: 1 }}
              />
              <BracketCard match={m} />
              {/* Right connector line (for rounds before Final) */}
              {!isLast && (
                <div
                  className="absolute bg-slate-700"
                  style={{ left: "100%", top: CARD_H / 2 - 1, width: 14, height: 1 }}
                />
              )}
            </div>
          );
        })}

        {/* Vertical bracket lines on the right side connecting pairs */}
        {!isLast &&
          Array.from({ length: matchCount / 2 }).map((_, pairIdx) => {
            const topMatchIdx = pairIdx * 2;
            const botMatchIdx = pairIdx * 2 + 1;
            if (botMatchIdx >= matchCount) return null;

            const topCenter =
              (topMatchIdx * slotsPerMatch + slotsPerMatch / 2) * slotPx - GAP / 2;
            const botCenter =
              (botMatchIdx * slotsPerMatch + slotsPerMatch / 2) * slotPx - GAP / 2;

            return (
              <div
                key={pairIdx}
                className="absolute bg-slate-700"
                style={{
                  left: 168 + 14, // card width + right-connector width
                  top: topCenter,
                  width: 1,
                  height: botCenter - topCenter,
                }}
              />
            );
          })}
      </div>
    </div>
  );
}

function SimProjection({ teams }: { teams: TeamSimulationResult[] }) {
  // Show top-16 most likely R32 qualifiers as a projected field
  const sorted = [...teams]
    .filter((t) => t.stage_probabilities.round_of_32 > 0)
    .sort((a, b) => b.stage_probabilities.round_of_32 - a.stage_probabilities.round_of_32)
    .slice(0, 16);

  if (sorted.length === 0) return null;

  return (
    <div className="space-y-4">
      <p className="text-slate-400 text-sm">
        Knockout bracket will populate once the group stage concludes (from 27 Jun).
        Below are the 16 teams most likely to advance furthest, based on{" "}
        <Link href="/bracket" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
          Monte Carlo simulations
        </Link>.
      </p>
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
              <th className="text-left py-2.5 px-4">Team</th>
              <th className="text-right py-2.5 px-4">P(Advance)</th>
              <th className="text-right py-2.5 px-4">P(QF)</th>
              <th className="text-right py-2.5 px-4">P(Win)</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => (
              <tr key={t.team_id} className="border-b border-slate-800 last:border-0">
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 tabular-nums text-xs w-4">{i + 1}</span>
                    <Link
                      href={`/teams/${t.team_id}`}
                      className="font-medium text-slate-100 hover:text-emerald-400 transition-colors"
                    >
                      {t.team_name}
                    </Link>
                    {t.group && (
                      <span className="text-xs text-slate-600">Grp {t.group}</span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 px-4 text-right tabular-nums text-emerald-400 font-semibold">
                  {(t.stage_probabilities.round_of_32 * 100).toFixed(0)}%
                </td>
                <td className="py-2.5 px-4 text-right tabular-nums text-slate-400">
                  {(t.stage_probabilities.quarter_final * 100).toFixed(0)}%
                </td>
                <td className="py-2.5 px-4 text-right tabular-nums text-slate-300 font-medium">
                  {(t.stage_probabilities.champion * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-700">
        Advance = P(reach Round of 32). Probabilities update after each match.
      </p>
    </div>
  );
}

export default async function KnockoutPage() {
  const [matchList, sim] = await Promise.all([
    getMatches(),
    getLatestSimulation(),
  ]);
  const knockout = matchList.filter((m) => m.stage !== "group");

  const byStage = new Map<string, MatchSummary[]>();
  for (const m of knockout) {
    if (!byStage.has(m.stage)) byStage.set(m.stage, []);
    byStage.get(m.stage)!.push(m);
  }
  // Sort within each round by kickoff.
  for (const list of byStage.values()) {
    list.sort((a, b) => a.kickoff_utc.localeCompare(b.kickoff_utc));
  }

  const stages = [...byStage.entries()].sort(
    ([a], [b]) => (STAGE_ORDER[a] ?? 99) - (STAGE_ORDER[b] ?? 99)
  );

  if (stages.length === 0) {
    return <SimProjection teams={sim?.teams ?? []} />;
  }

  // totalRows = number of matches in the first (largest) round.
  const totalRows = stages[0][1].length;

  return (
    <div className="space-y-4">
      <p className="text-slate-400 text-sm">Round of 32 through to the Final</p>
      <div className="overflow-x-auto pb-4">
        <div
          className="flex gap-7 items-start"
          style={{ minWidth: stages.length * 210 + "px", paddingLeft: 14 }}
        >
          {stages.map(([stage, stageMatches], idx) => (
            <BracketColumn
              key={stage}
              label={STAGE_LABELS[stage] ?? stage}
              matches={stageMatches}
              totalRows={totalRows}
              isLast={idx === stages.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
