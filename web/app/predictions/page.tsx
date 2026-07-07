import { getMatches, getLatestSimulation } from "@/lib/api";
import type { MatchSummary } from "@/lib/types";
import type { CSSProperties } from "react";
import { teamColor } from "@/lib/teamColors";
import { flagUrl } from "@/lib/flags";

const MONO = "'JetBrains Mono',monospace";

// Bracket layout constants (px)
const QF_H    = 118;
const QF_GAP  = 80;
const SIDE_H  = QF_H * 2 + QF_GAP;   // 316
const CARD_W  = 180;
const CONN_W  = 30;
const FINAL_W = 196;
const CONN_TOP = QF_H / 2;            // 59
const CONN_MID = SIDE_H / 2;          // 158
const CONN_ARM = CONN_MID - CONN_TOP; // 99
const BRACKET_W = CARD_W * 4 + CONN_W * 4 + FINAL_W; // 1136

interface BTeam {
  id: string;
  name: string;
  prob: number;
  isWinner: boolean;
  score?: number;
  pens?: boolean;
}
interface BMatch {
  home: BTeam;
  away: BTeam;
  played: boolean;
  projected: boolean;
  matchId?: string;
}

function isValidTeam(t: { id: string; name: string }): boolean {
  return !!t.id && t.id !== "TBD" && t.id.length > 1 && t.name !== "TBD";
}

function playedWinnerId(m: MatchSummary): string | null {
  if (!m.result) return null;
  const { home_goals, away_goals, went_to_pens, pen_winner_id } = m.result;
  if (went_to_pens && pen_winner_id) return pen_winner_id;
  if (home_goals > away_goals) return m.home_team.id;
  if (away_goals > home_goals) return m.away_team.id;
  return null;
}

function predictedWinnerId(m: MatchSummary): string | null {
  if (!m.prediction) return null;
  return m.prediction.home_win >= m.prediction.away_win
    ? m.home_team.id
    : m.away_team.id;
}

function anyWinnerId(m: MatchSummary): string | null {
  return m.result ? playedWinnerId(m) : predictedWinnerId(m);
}

function r16Winner(m: MatchSummary | undefined): { id: string; name: string } | null {
  if (!m) return null;
  const wId = anyWinnerId(m);
  if (!wId) return null;
  return wId === m.home_team.id
    ? { id: m.home_team.id, name: m.home_team.name }
    : { id: m.away_team.id, name: m.away_team.name };
}

function toBMatch(m: MatchSummary): BMatch {
  const played = m.result != null;
  let homeW = false, awayW = false;
  let hProb = 0.5, aProb = 0.5;
  let hScore: number | undefined, aScore: number | undefined;
  let pens = false;

  if (played && m.result) {
    const { home_goals, away_goals, went_to_pens, pen_winner_id } = m.result;
    hScore = home_goals;
    aScore = away_goals;
    pens = went_to_pens;
    homeW = (went_to_pens && pen_winner_id)
      ? pen_winner_id === m.home_team.id
      : home_goals > away_goals;
    awayW = !homeW;
    hProb = homeW ? 1 : 0;
    aProb = awayW ? 1 : 0;
  } else if (m.prediction) {
    const total = (m.prediction.home_win + m.prediction.away_win) || 1;
    hProb = m.prediction.home_win / total;
    aProb = m.prediction.away_win / total;
    homeW = hProb >= aProb;
    awayW = !homeW;
  }

  return {
    home: { id: m.home_team.id, name: m.home_team.name, prob: hProb, isWinner: homeW, score: hScore, pens: pens && homeW },
    away: { id: m.away_team.id, name: m.away_team.name, prob: aProb, isWinner: awayW, score: aScore, pens: pens && awayW },
    played,
    projected: false,
    matchId: m.id,
  };
}

function toProjected(
  homeId: string | null,
  awayId: string | null,
  names: Record<string, string>,
  champ: Record<string, number>
): BMatch | null {
  if (!homeId || !awayId) return null;
  const hc = champ[homeId] ?? 0;
  const ac = champ[awayId] ?? 0;
  const total = hc + ac || 1;
  const hProb = hc / total;
  const aProb = ac / total;
  const homeW = hProb >= aProb;
  return {
    home: { id: homeId, name: names[homeId] ?? homeId, prob: hProb, isWinner: homeW },
    away: { id: awayId, name: names[awayId] ?? awayId, prob: aProb, isWinner: !homeW },
    played: false,
    projected: true,
  };
}

function projectedWinner(a: string | null, b: string | null, champ: Record<string, number>): string | null {
  if (!a || !b) return null;
  return (champ[a] ?? 0) >= (champ[b] ?? 0) ? a : b;
}

// ---- Sub-components ----

function FlagImg({ id, size = 28 }: { id: string; size?: number }) {
  return (
    <span style={{
      width: size,
      height: Math.round(size * 0.68),
      borderRadius: 4,
      overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.14)",
      display: "block",
      flexShrink: 0,
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={flagUrl(id, 40)}
        alt={id}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </span>
  );
}

function TeamRow({ t, played }: { t: BTeam; played: boolean }) {
  const pct = Math.round(t.prob * 100);
  const accent = teamColor(t.id);
  const dimmed = !t.isWinner && (played || t.prob < 0.42);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 7,
      padding: "7px 10px",
      opacity: dimmed ? 0.35 : 1,
      background: t.isWinner ? "rgba(43,227,138,0.07)" : "transparent",
    }}>
      <div style={{ width: 3, height: 22, borderRadius: 2, background: accent, flexShrink: 0 }} />
      <FlagImg id={t.id} size={26} />
      <span style={{
        fontSize: 12,
        fontWeight: 600,
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: t.isWinner ? "#F2F1F7" : "#B0AAC4",
      }}>
        {t.name || t.id}
      </span>
      {played ? (
        <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: t.isWinner ? "#2BE38A" : "#645F77", minWidth: 22, textAlign: "right" }}>
          {t.score ?? "-"}{t.pens && <span style={{ fontSize: 9, marginLeft: 2 }}>P</span>}
        </span>
      ) : (
        <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, color: t.isWinner ? "#2BE38A" : "#4A4560", minWidth: 32, textAlign: "right" }}>
          {pct}%
        </span>
      )}
    </div>
  );
}

function MatchCard({ data, w, isFinal = false }: { data: BMatch | null; w?: number; isFinal?: boolean }) {
  const cardW = w ?? CARD_W;
  const border = `1px solid ${isFinal ? "rgba(255,194,61,0.22)" : "rgba(255,255,255,0.09)"}`;

  if (!data) {
    return (
      <div style={{ width: cardW, height: QF_H, background: "#0D0B16", border, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 11, color: "#3F3A52", fontFamily: MONO }}>TBD</span>
      </div>
    );
  }

  return (
    <div style={{ width: cardW, height: QF_H, background: "#12101C", border, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {data.projected && (
        <div style={{ textAlign: "center", fontSize: 8.5, fontFamily: MONO, color: "#3F3A52", padding: "3px 0 1px", letterSpacing: "0.1em" }}>
          PROJECTED
        </div>
      )}
      <TeamRow t={data.home} played={data.played} />
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 10px" }} />
      <TeamRow t={data.away} played={data.played} />
    </div>
  );
}

function LeftConnector() {
  const B = "2px solid rgba(255,255,255,0.11)";
  const base: CSSProperties = { position: "absolute", width: "100%", borderRight: B };
  return (
    <div style={{ width: CONN_W, height: SIDE_H, flexShrink: 0, position: "relative" }}>
      <div style={{ ...base, top: CONN_TOP, height: CONN_ARM, borderBottom: B, borderRadius: "0 0 6px 0" }} />
      <div style={{ ...base, top: CONN_MID, height: CONN_ARM, borderTop: B, borderRadius: "0 6px 0 0" }} />
    </div>
  );
}

function RightConnector() {
  const B = "2px solid rgba(255,255,255,0.11)";
  const base: CSSProperties = { position: "absolute", width: "100%", borderLeft: B };
  return (
    <div style={{ width: CONN_W, height: SIDE_H, flexShrink: 0, position: "relative" }}>
      <div style={{ ...base, top: CONN_TOP, height: CONN_ARM, borderBottom: B, borderRadius: "0 0 0 6px" }} />
      <div style={{ ...base, top: CONN_MID, height: CONN_ARM, borderTop: B, borderRadius: "6px 0 0 0" }} />
    </div>
  );
}

function HConnector() {
  return (
    <div style={{ width: CONN_W, height: SIDE_H, flexShrink: 0, position: "relative" }}>
      <div style={{ position: "absolute", top: "50%", width: "100%", borderTop: "2px solid rgba(255,255,255,0.11)" }} />
    </div>
  );
}

function RoundLabel({ label, w }: { label: string; w: number }) {
  return (
    <div style={{ width: w, flexShrink: 0, textAlign: "center", fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", color: "#4A4560" }}>
      {label}
    </div>
  );
}

function Spacer({ w }: { w: number }) {
  return <div style={{ width: w, flexShrink: 0 }} />;
}

// ---- Page ----

export default async function PredictionsBracketPage() {
  const [allMatches, sim] = await Promise.all([getMatches(), getLatestSimulation()]);

  const names: Record<string, string> = {};
  const champ: Record<string, number> = {};
  if (sim) {
    for (const t of sim.teams) {
      names[t.team_id] = t.team_name;
      champ[t.team_id] = t.stage_probabilities.champion;
    }
  }
  for (const m of allMatches) {
    if (m.home_team?.id) names[m.home_team.id] ??= m.home_team.name;
    if (m.away_team?.id) names[m.away_team.id] ??= m.away_team.name;
  }

  // Sort all stage matches by kickoff
  const byDate = (a: MatchSummary, b: MatchSummary) => a.kickoff_utc.localeCompare(b.kickoff_utc);
  const qfM  = allMatches.filter(m => m.id.includes("-QF-")).sort(byDate);
  const sfM  = allMatches.filter(m => m.id.includes("-SF-")).sort(byDate);
  const finM = allMatches.filter(m => m.id.includes("-FIN-")).sort(byDate);
  // R16 sorted by date: last two (indices 6+7) feed into the 4th QF
  const r16M = allMatches.filter(m => m.id.includes("-R16-")).sort(byDate);

  // Build match data for each bracket position.
  // When a QF fixture is missing or has TBD teams, cascade from the corresponding R16 pair.
  // R16 sorted by date: pair (0,1)→QF0, (2,3)→QF1, (4,5)→QF2, (6,7)→QF3
  function buildQFCard(qfIdx: number): BMatch | null {
    const qm = qfM[qfIdx];
    if (qm && isValidTeam(qm.home_team) && isValidTeam(qm.away_team)) {
      return toBMatch(qm);
    }
    // Fall back: project from the pair of R16 matches that feed this QF slot
    const ra = r16Winner(r16M[qfIdx * 2]);
    const rb = r16Winner(r16M[qfIdx * 2 + 1]);
    return toProjected(ra?.id ?? null, rb?.id ?? null, names, champ);
  }

  const qf0 = buildQFCard(0);
  const qf1 = buildQFCard(1);
  const qf2 = buildQFCard(2);
  const qf3 = buildQFCard(3);

  // QF winners (for projecting SF)
  function cardWinner(card: BMatch | null): string | null {
    if (!card) return null;
    if (card.home.isWinner) return card.home.id;
    if (card.away.isWinner) return card.away.id;
    return null;
  }

  const qfw = [qf0, qf1, qf2, qf3].map(cardWinner);

  // SF1: QF0 winner vs QF1 winner
  // SF2: QF2 winner vs QF3 winner
  const sf1Data: BMatch | null = sfM[0] ? toBMatch(sfM[0]) : toProjected(qfw[0], qfw[1], names, champ);
  const sf2Data: BMatch | null = sfM[1] ? toBMatch(sfM[1]) : toProjected(qfw[2], qfw[3], names, champ);

  const sf1Win = sfM[0] ? anyWinnerId(sfM[0]) : projectedWinner(qfw[0], qfw[1], champ);
  const sf2Win = sfM[1] ? anyWinnerId(sfM[1]) : projectedWinner(qfw[2], qfw[3], champ);

  const finData: BMatch | null = finM[0] ? toBMatch(finM[0]) : toProjected(sf1Win, sf2Win, names, champ);

  const championId = finData
    ? (finData.home.isWinner ? finData.home.id : finData.away.id)
    : null;
  const champPct = championId ? Math.round((champ[championId] ?? 0) * 100) : null;

  return (
    <div style={{ animation: "ff-up 0.4s ease both", paddingTop: 46 }}>
      <h1 style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.03em", margin: 0 }}>
        Predictions{" "}
        <span style={{ background: "linear-gradient(90deg,#FFC23D,#FF5DA8,#A35CFF)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Bracket
        </span>
      </h1>
      <p style={{ fontSize: 14, color: "#9E99B0", marginTop: 10, marginBottom: 28 }}>
        Model-predicted path to the trophy, cascaded from Quarter-Finals through to the Final.
        Played matches show actual scores; unplayed rounds are projected using model win probabilities and simulation champion odds.
      </p>

      {championId && (
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 18px",
          background: "rgba(255,194,61,0.08)",
          border: "1px solid rgba(255,194,61,0.28)",
          borderRadius: 14,
          marginBottom: 36,
        }}>
          <FlagImg id={championId} size={36} />
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#7A7590", letterSpacing: "0.1em", marginBottom: 2 }}>PREDICTED CHAMPION</div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: "#FFC23D" }}>
              {(names[championId] ?? championId).toUpperCase()}
              {champPct != null && (
                <span style={{ fontWeight: 400, color: "#9E99B0", fontSize: 12, marginLeft: 8 }}>
                  {champPct}% to win tournament
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bracket */}
      <div style={{ overflowX: "auto", paddingBottom: 24 }}>
        {/* Round labels */}
        <div style={{ display: "flex", minWidth: BRACKET_W, marginBottom: 10 }}>
          <RoundLabel label="QUARTER-FINALS" w={CARD_W} />
          <Spacer w={CONN_W} />
          <RoundLabel label="SEMI-FINALS" w={CARD_W} />
          <Spacer w={CONN_W} />
          <RoundLabel label="FINAL" w={FINAL_W} />
          <Spacer w={CONN_W} />
          <RoundLabel label="SEMI-FINALS" w={CARD_W} />
          <Spacer w={CONN_W} />
          <RoundLabel label="QUARTER-FINALS" w={CARD_W} />
        </div>

        {/* Bracket row */}
        <div style={{ display: "flex", alignItems: "stretch", minWidth: BRACKET_W }}>

          {/* Left QF column */}
          <div style={{ width: CARD_W, height: SIDE_H, flexShrink: 0, display: "flex", flexDirection: "column", gap: QF_GAP }}>
            <MatchCard data={qf0} />
            <MatchCard data={qf1} />
          </div>

          <LeftConnector />

          {/* SF1 */}
          <div style={{ width: CARD_W, height: SIDE_H, flexShrink: 0, display: "flex", alignItems: "center" }}>
            <MatchCard data={sf1Data} />
          </div>

          <HConnector />

          {/* Final */}
          <div style={{ width: FINAL_W, height: SIDE_H, flexShrink: 0, display: "flex", alignItems: "center" }}>
            <div style={{ width: FINAL_W }}>
              <div style={{ textAlign: "center", fontFamily: MONO, fontSize: 10, color: "#FFC23D", letterSpacing: "0.12em", marginBottom: 6 }}>
                🏆 FINAL
              </div>
              <MatchCard data={finData} w={FINAL_W} isFinal />
            </div>
          </div>

          <HConnector />

          {/* SF2 */}
          <div style={{ width: CARD_W, height: SIDE_H, flexShrink: 0, display: "flex", alignItems: "center" }}>
            <MatchCard data={sf2Data} />
          </div>

          <RightConnector />

          {/* Right QF column */}
          <div style={{ width: CARD_W, height: SIDE_H, flexShrink: 0, display: "flex", flexDirection: "column", gap: QF_GAP }}>
            <MatchCard data={qf2} />
            <MatchCard data={qf3} />
          </div>

        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 20, marginTop: 20, flexWrap: "wrap" as const }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: "rgba(43,227,138,0.15)", border: "1px solid rgba(43,227,138,0.4)" }} />
            <span style={{ fontSize: 12, color: "#645F77", fontFamily: MONO }}>Predicted / actual winner</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 10, fontFamily: MONO, color: "#4A4560", border: "1px solid rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 3 }}>PROJECTED</span>
            <span style={{ fontSize: 12, color: "#645F77", fontFamily: MONO }}>Not yet scheduled — projected from simulation odds</span>
          </div>
        </div>
      </div>

      {sim && (
        <p style={{ fontFamily: MONO, fontSize: 12, color: "#3F3A52", marginTop: 8 }}>
          Simulation: {sim.n_simulations.toLocaleString()} runs · as of{" "}
          {new Date(sim.match_results_as_of).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      )}
    </div>
  );
}
