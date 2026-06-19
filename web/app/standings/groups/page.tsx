import { getGroupStandings, getLatestSimulation } from "@/lib/api";
import type { GroupTable, GroupStanding } from "@/lib/types";
import Link from "next/link";

function GroupCard({
  group,
  advanceProbs,
}: {
  group: GroupTable;
  advanceProbs: Record<string, number>;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-700">
        <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
          Group {group.letter}
        </h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
            <th className="text-left py-2 px-4">Team</th>
            <th className="text-center py-2 px-2">P</th>
            <th className="text-center py-2 px-2">W</th>
            <th className="text-center py-2 px-2">D</th>
            <th className="text-center py-2 px-2">L</th>
            <th className="text-center py-2 px-2">GD</th>
            <th className="text-center py-2 px-2">GF</th>
            <th className="text-right py-2 px-3 font-bold">Pts</th>
            <th className="text-right py-2 px-4 text-emerald-600">Qualify</th>
          </tr>
        </thead>
        <tbody>
          {group.standings.map((team: GroupStanding, i: number) => {
            const prob = advanceProbs[team.team_id];
            return (
              <tr
                key={team.team_id}
                className={`border-b border-slate-800 last:border-0 ${i < 2 ? "bg-emerald-950/20" : ""}`}
              >
                <td className="py-2.5 px-4 flex items-center gap-2">
                  {i < 2 ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  ) : (
                    <span className="w-1.5 shrink-0" />
                  )}
                  <Link
                    href={`/teams/${team.team_id}`}
                    className="font-medium text-slate-100 hover:text-emerald-400 transition-colors"
                  >
                    {team.team_name}
                  </Link>
                </td>
                <td className="text-center py-2.5 px-2 text-slate-400 tabular-nums">{team.played}</td>
                <td className="text-center py-2.5 px-2 text-slate-300 tabular-nums">{team.won}</td>
                <td className="text-center py-2.5 px-2 text-slate-400 tabular-nums">{team.drawn}</td>
                <td className="text-center py-2.5 px-2 text-slate-500 tabular-nums">{team.lost}</td>
                <td className={`text-center py-2.5 px-2 tabular-nums font-mono text-xs ${
                  team.gd > 0 ? "text-emerald-400" : team.gd < 0 ? "text-red-400" : "text-slate-500"
                }`}>
                  {team.gd > 0 ? `+${team.gd}` : team.gd}
                </td>
                <td className="text-center py-2.5 px-2 text-slate-400 tabular-nums">{team.gf}</td>
                <td className="text-right py-2.5 px-3 font-bold text-slate-100 tabular-nums">{team.points}</td>
                <td className="text-right py-2.5 px-4 tabular-nums text-xs">
                  {prob != null ? (
                    <span className={
                      prob >= 0.7 ? "text-emerald-400 font-semibold"
                      : prob >= 0.4 ? "text-slate-300"
                      : "text-slate-500"
                    }>
                      {(prob * 100).toFixed(0)}%
                    </span>
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

// Sort third-placed teams by the official FIFA tiebreaker order:
// points, then GD, then GF, then group letter (alphabetical) as final tiebreak.
function rankThirdPlaced(
  thirds: Array<{ group: string; team: GroupStanding }>
) {
  return [...thirds].sort((a, b) => {
    if (b.team.points !== a.team.points) return b.team.points - a.team.points;
    if (b.team.gd !== a.team.gd) return b.team.gd - a.team.gd;
    if (b.team.gf !== a.team.gf) return b.team.gf - a.team.gf;
    return a.group.localeCompare(b.group);
  });
}

function ThirdPlacedTable({
  thirds,
  advanceProbs,
}: {
  thirds: Array<{ group: string; team: GroupStanding }>;
  advanceProbs: Record<string, number>;
}) {
  const ranked = rankThirdPlaced(thirds);
  // In WC 2026, 8 best third-placed teams from 12 groups advance.
  const QUALIFY_SLOTS = 8;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-700">
        <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
          Best Third-Placed Teams
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Top 8 of 12 advance to the Round of 32
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
            <th className="text-center py-2 px-3 w-8">#</th>
            <th className="text-center py-2 px-2 w-10">Grp</th>
            <th className="text-left py-2 px-4">Team</th>
            <th className="text-center py-2 px-2">P</th>
            <th className="text-center py-2 px-2">W</th>
            <th className="text-center py-2 px-2">D</th>
            <th className="text-center py-2 px-2">L</th>
            <th className="text-center py-2 px-2">GD</th>
            <th className="text-center py-2 px-2">GF</th>
            <th className="text-right py-2 px-3 font-bold">Pts</th>
            <th className="text-right py-2 px-4 text-emerald-600">Qualify</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map(({ group, team }, i) => {
            const qualifies = i < QUALIFY_SLOTS;
            const onBubble = i === QUALIFY_SLOTS - 1; // last qualifying slot
            const prob = advanceProbs[team.team_id];

            return (
              <tr
                key={team.team_id}
                className={[
                  "border-b border-slate-800 last:border-0",
                  qualifies ? "bg-emerald-950/20" : "",
                  onBubble ? "border-b-2 border-b-emerald-900" : "",
                ].join(" ")}
              >
                <td className="text-center py-2.5 px-3 text-slate-500 tabular-nums text-xs font-mono">
                  {i + 1}
                </td>
                <td className="text-center py-2.5 px-2 text-slate-500 text-xs font-bold">
                  {group}
                </td>
                <td className="py-2.5 px-4 flex items-center gap-2">
                  {qualifies ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  ) : (
                    <span className="w-1.5 shrink-0" />
                  )}
                  <Link
                    href={`/teams/${team.team_id}`}
                    className="font-medium text-slate-100 hover:text-emerald-400 transition-colors"
                  >
                    {team.team_name}
                  </Link>
                </td>
                <td className="text-center py-2.5 px-2 text-slate-400 tabular-nums">{team.played}</td>
                <td className="text-center py-2.5 px-2 text-slate-300 tabular-nums">{team.won}</td>
                <td className="text-center py-2.5 px-2 text-slate-400 tabular-nums">{team.drawn}</td>
                <td className="text-center py-2.5 px-2 text-slate-500 tabular-nums">{team.lost}</td>
                <td className={`text-center py-2.5 px-2 tabular-nums font-mono text-xs ${
                  team.gd > 0 ? "text-emerald-400" : team.gd < 0 ? "text-red-400" : "text-slate-500"
                }`}>
                  {team.gd > 0 ? `+${team.gd}` : team.gd}
                </td>
                <td className="text-center py-2.5 px-2 text-slate-400 tabular-nums">{team.gf}</td>
                <td className="text-right py-2.5 px-3 font-bold text-slate-100 tabular-nums">{team.points}</td>
                <td className="text-right py-2.5 px-4 tabular-nums text-xs">
                  {prob != null ? (
                    <span className={
                      prob >= 0.7 ? "text-emerald-400 font-semibold"
                      : prob >= 0.4 ? "text-slate-300"
                      : "text-slate-500"
                    }>
                      {(prob * 100).toFixed(0)}%
                    </span>
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

export default async function GroupsPage() {
  const [groups, sim] = await Promise.all([
    getGroupStandings(),
    getLatestSimulation(),
  ]);

  const advanceProbs: Record<string, number> = {};
  for (const t of sim?.teams ?? []) {
    advanceProbs[t.team_id] = t.stage_probabilities.round_of_32;
  }

  // Collect the 3rd-placed team from each group (index 2 in ranked standings).
  const thirds = groups
    .filter((g) => g.standings.length >= 3)
    .map((g) => ({ group: g.letter, team: g.standings[2] }));

  return (
    <div className="space-y-6">
      <p className="text-slate-400 text-sm">
        Top 2 from each group advance · 8 best third-placed teams also advance
      </p>

      {groups.length === 0 ? (
        <p className="text-slate-500 text-center py-16">Group data not available yet.</p>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            {groups.map((g) => (
              <GroupCard key={g.letter} group={g} advanceProbs={advanceProbs} />
            ))}
          </div>

          {thirds.length > 0 && (
            <ThirdPlacedTable thirds={thirds} advanceProbs={advanceProbs} />
          )}
        </>
      )}

      <div className="flex items-center gap-4 text-xs text-slate-600">
        <span><span className="text-emerald-500">●</span> On course to advance</span>
        <span>Qualify % = simulated P(advance to Round of 32)</span>
      </div>
    </div>
  );
}
