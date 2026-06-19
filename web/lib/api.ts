import type {
  MatchSummary,
  MatchPrediction,
  TournamentSimulation,
  MarketComparison,
  CalibrationSummary,
  MatchTrivia,
  MatchPreview,
  MatchScorerPredictions,
  DisagreementEntry,
  TeamRating,
  UserPredictionRequest,
  UserPredictionResponse,
  UserStats,
  GroupTable,
  TopScorer,
  TeamListItem,
  TeamDetail,
  MatchEvent,
  MatchStats,
  MomentumPoint,
  CommentaryEntry,
  MatchPlayerStat,
  MatchAnalysis,
  HydrationAnalysis,
  H2HRecord,
  TournamentTrivia,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

async function apiFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      next: { revalidate: 60 }, // ISR: revalidate every 60 seconds
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function getMatches(): Promise<MatchSummary[]> {
  return (await apiFetch<MatchSummary[]>("/v1/matches")) ?? [];
}

export async function getMatchPrediction(id: string): Promise<MatchPrediction | null> {
  return apiFetch<MatchPrediction>(`/v1/matches/${encodeURIComponent(id)}/prediction`);
}

export async function getLatestSimulation(): Promise<TournamentSimulation | null> {
  return apiFetch<TournamentSimulation>("/v1/simulation/latest");
}

export async function getMarketComparison(id: string): Promise<MarketComparison | null> {
  return apiFetch<MarketComparison>(`/v1/matches/${encodeURIComponent(id)}/market-comparison`);
}

export async function getCalibration(): Promise<CalibrationSummary | null> {
  return apiFetch<CalibrationSummary>("/v1/calibration");
}

export async function getMatchTrivia(id: string): Promise<MatchTrivia | null> {
  return apiFetch<MatchTrivia>(`/v1/matches/${encodeURIComponent(id)}/trivia`);
}

export async function getMatchPreview(id: string): Promise<MatchPreview | null> {
  return apiFetch<MatchPreview>(`/v1/matches/${encodeURIComponent(id)}/preview`);
}

export async function getMatchScorerPredictions(id: string): Promise<MatchScorerPredictions | null> {
  return apiFetch<MatchScorerPredictions>(`/v1/matches/${encodeURIComponent(id)}/scorers`);
}

export async function getDisagreements(): Promise<DisagreementEntry[]> {
  return (await apiFetch<DisagreementEntry[]>("/v1/matches/disagreements")) ?? [];
}

export async function getTeamRatings(): Promise<TeamRating[]> {
  return (await apiFetch<TeamRating[]>("/v1/teams/ratings")) ?? [];
}

export async function getTeams(): Promise<TeamListItem[]> {
  return (await apiFetch<TeamListItem[]>("/v1/teams")) ?? [];
}

export async function getTeamDetail(id: string): Promise<TeamDetail | null> {
  return apiFetch<TeamDetail>(`/v1/teams/${encodeURIComponent(id)}`);
}

export async function getGroupStandings(): Promise<GroupTable[]> {
  return (await apiFetch<GroupTable[]>("/v1/groups")) ?? [];
}

export async function getTopScorers(limit = 20): Promise<TopScorer[]> {
  return (await apiFetch<TopScorer[]>(`/v1/stats/scorers?limit=${limit}`)) ?? [];
}

export async function getUserStats(userID: string): Promise<UserStats | null> {
  return apiFetch<UserStats>(`/v1/users/${encodeURIComponent(userID)}/stats`);
}

export async function getMatchEvents(id: string): Promise<MatchEvent[]> {
  return (await apiFetch<MatchEvent[]>(`/v1/matches/${encodeURIComponent(id)}/events`)) ?? [];
}

export async function getMatchStats(id: string): Promise<MatchStats[]> {
  return (await apiFetch<MatchStats[]>(`/v1/matches/${encodeURIComponent(id)}/match-stats`)) ?? [];
}

export async function getMatchMomentum(id: string): Promise<MomentumPoint[]> {
  return (await apiFetch<MomentumPoint[]>(`/v1/matches/${encodeURIComponent(id)}/momentum`)) ?? [];
}

export async function getMatchCommentary(id: string): Promise<CommentaryEntry[]> {
  return (await apiFetch<CommentaryEntry[]>(`/v1/matches/${encodeURIComponent(id)}/commentary`)) ?? [];
}

export async function getMatchPlayerStats(id: string): Promise<MatchPlayerStat[]> {
  return (await apiFetch<MatchPlayerStat[]>(`/v1/matches/${encodeURIComponent(id)}/player-stats`)) ?? [];
}

export async function getMatchAnalysis(id: string): Promise<MatchAnalysis | null> {
  return apiFetch<MatchAnalysis>(`/v1/matches/${encodeURIComponent(id)}/analysis`);
}

export async function getHydrationAnalysis(): Promise<HydrationAnalysis | null> {
  return apiFetch<HydrationAnalysis>("/v1/stats/hydration-breaks");
}

export async function getTeamForm(teamID: string): Promise<MatchSummary[]> {
  return (await apiFetch<MatchSummary[]>(`/v1/teams/${encodeURIComponent(teamID)}/form`)) ?? [];
}

export async function getMatchH2H(id: string): Promise<H2HRecord | null> {
  return apiFetch<H2HRecord>(`/v1/matches/${encodeURIComponent(id)}/h2h`);
}

export async function getTopAssists(limit = 10): Promise<TopScorer[]> {
  return (await apiFetch<TopScorer[]>(`/v1/stats/assists?limit=${limit}`)) ?? [];
}

export async function getTournamentTrivia(): Promise<TournamentTrivia | null> {
  return apiFetch<TournamentTrivia>("/v1/stats/trivia");
}

export async function createUserPrediction(
  matchId: string,
  body: UserPredictionRequest
): Promise<UserPredictionResponse | null> {
  try {
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
    const res = await fetch(`${API_URL}/v1/matches/${encodeURIComponent(matchId)}/predictions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return res.json() as Promise<UserPredictionResponse>;
  } catch {
    return null;
  }
}
