import type { MatchSummary, MatchPrediction, TournamentSimulation } from "./types";

const API_URL = process.env.API_URL ?? "http://localhost:8080";

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
