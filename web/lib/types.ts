// TypeScript types derived from docs/api/openapi.yaml and the Go models.

export interface Team {
  id: string;
  name: string;
  confederation: string;
}

export interface OutcomeProbabilities {
  home_win: number;
  draw: number;
  away_win: number;
}

export interface MatchResultSummary {
  home_goals: number;
  away_goals: number;
}

export interface MatchSummary {
  id: string;
  kickoff_utc: string; // ISO 8601
  stage: string;
  group_letter: string | null;
  home_team: Team;
  away_team: Team;
  result: MatchResultSummary | null;
  prediction: OutcomeProbabilities | null;
}

export interface StageProbabilities {
  round_of_32: number;
  round_of_16: number;
  quarter_final: number;
  semi_final: number;
  final: number;
  champion: number;
}

export interface TeamSimulationResult {
  team_id: string;
  team_name: string;
  group: string | null;
  eliminated: boolean;
  stage_probabilities: StageProbabilities;
}

export interface ScorelineProbability {
  home_goals: number;
  away_goals: number;
  probability: number;
}

export interface TotalsProbabilities {
  over_1_5: number;
  over_2_5: number;
  over_3_5: number;
  btts: number;
}

export interface ExpectedGoals {
  home_xg: number;
  away_xg: number;
}

export interface MatchPrediction {
  match_id: string;
  home_team: Team;
  away_team: Team;
  match_date: string;
  model_as_of: string;
  model_version: string;
  outcome_probabilities: OutcomeProbabilities;
  scoreline_grid: ScorelineProbability[];
  totals: TotalsProbabilities;
  expected_goals?: ExpectedGoals;
}

export interface MarketRaw {
  home_win: number;
  draw: number | null;
  away_win: number;
}

export interface MarketSource {
  source: string;
  sampled_at: string;
  raw: MarketRaw;
  devigged: OutcomeProbabilities;
}

export interface ActualScore {
  home_goals: number;
  away_goals: number;
}

export interface MatchGrading {
  actual_outcome: string;
  actual_score?: ActualScore;
  model_log_loss: number;
  model_brier_score: number;
  market_log_loss?: Record<string, number>;
  market_brier_score?: Record<string, number>;
}

export interface MarketComparison {
  match_id: string;
  model_as_of: string;
  model_probabilities: OutcomeProbabilities;
  markets: MarketSource[];
  disagreement_score?: number;
  grading: MatchGrading | null;
}

export interface GradedMatch {
  match_id: string;
  kickoff_utc: string;
  home_team: Team;
  away_team: Team;
  actual_outcome: string;
  model_probabilities: OutcomeProbabilities;
  model_log_loss: number;
  model_brier_score: number;
  market_log_loss?: Record<string, number>;
  market_brier_score?: Record<string, number>;
}

export interface CalibrationSummary {
  total_matches: number;
  model_mean_log_loss: number;
  model_mean_brier: number;
  market_mean_log_loss?: Record<string, number>;
  market_mean_brier?: Record<string, number>;
  matches: GradedMatch[];
}

export interface TournamentSimulation {
  simulation_id: string;
  run_at: string;
  n_simulations: number;
  match_results_as_of: string;
  teams: TeamSimulationResult[];
}
