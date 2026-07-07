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
  went_to_et: boolean;
  went_to_pens: boolean;
  pen_winner_id?: string;
}

export interface KnockoutProbabilities {
  home_win_full: number;
  away_win_full: number;
  goes_to_et: number;
  goes_to_pens: number;
  home_pen_win: number;
}

export interface KeyEvent {
  minute: number;
  incident_type: string; // goal, own_goal, red_card, yellow_red_card
  is_home: boolean;
  player_name: string;
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
  key_events?: KeyEvent[];
}

export interface H2HMatch {
  date: string;
  home_team: string;
  away_team: string;
  home_goals: number;
  away_goals: number;
  tournament: string;
  neutral: boolean;
}

export interface H2HRecord {
  home_team_id: string;
  away_team_id: string;
  wc_2026: MatchSummary[];
  all_time_played: number;
  home_team_wins: number;
  all_time_draws: number;
  away_team_wins: number;
  recent: H2HMatch[];
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
  delta?: StageProbabilities;
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
  home_elo?: number;
  away_elo?: number;
  actual_result?: MatchResultSummary;
  grading?: MatchGrading;
  knockout_probs?: KnockoutProbabilities;
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
  is_retroactive: boolean;
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
  out_of_sample_matches: number;
  model_mean_log_loss: number;
  model_mean_brier: number;
  oos_mean_log_loss: number;
  oos_mean_brier: number;
  market_mean_log_loss?: Record<string, number>;
  market_mean_brier?: Record<string, number>;
  matches: GradedMatch[];
}

export interface TournamentSimulation {
  simulation_id: string;
  run_at: string;
  previous_run_at?: string;
  n_simulations: number;
  match_results_as_of: string;
  teams: TeamSimulationResult[];
}

export interface DisagreementEntry {
  match_id: string;
  kickoff_utc: string;
  stage: string;
  home_team: Team;
  away_team: Team;
  model_probabilities: OutcomeProbabilities;
  market_probabilities: OutcomeProbabilities;
  market_source: string;
  disagreement_score: number;
  model_favors: "home" | "draw" | "away";
}

export interface TriviaFact {
  template: string;
  text: string;
  data?: Record<string, unknown>;
}

export interface MatchTrivia {
  match_id: string;
  generated_at: string;
  facts: TriviaFact[];
}

export interface MatchPreview {
  match_id: string;
  preview_text: string;
  model_used: string;
  generated_at: string;
}

export interface GroupStanding {
  team_id: string;
  team_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export interface GroupTable {
  letter: string;
  standings: GroupStanding[];
}

export interface TopScorer {
  player_name: string;
  team_id: string;
  team_name: string;
  goals: number;
  assists: number;
  appearances: number;
  penalties: number;
}

export interface PlayerStat {
  player_name: string;
  goals: number;
  assists: number;
  appearances: number;
  penalties: number;
  yellow_cards: number;
  red_cards: number;
}

export interface TeamRecord {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export interface TeamListItem {
  id: string;
  name: string;
  short_name: string;
  confederation: string;
  elo_rating?: number;
  group?: string;
}

export interface TeamDetail {
  id: string;
  name: string;
  short_name: string;
  confederation: string;
  elo_rating?: number;
  group?: string;
  record: TeamRecord;
  fixtures: MatchSummary[];
  players: PlayerStat[];
}

export interface MatchEvent {
  minute: number;
  added_time?: number;
  incident_type: string;
  is_home: boolean;
  player_name?: string;
  assist_player?: string;
  detail?: string;
  sofascore_player_id?: number;
}

export interface MatchStats {
  is_home: boolean;
  possession_pct?: number;
  expected_goals?: number;
  big_chances?: number;
  total_shots?: number;
  shots_on_target?: number;
  goalkeeper_saves?: number;
  corner_kicks?: number;
  fouls?: number;
  passes_total?: number;
  passes_accurate?: number;
  tackles?: number;
  free_kicks?: number;
  yellow_cards?: number;
  red_cards?: number;
  offsides?: number;
}

export interface MomentumPoint {
  minute: number;
  value: number;
}

export interface CommentaryEntry {
  minute?: number;
  text: string;
  is_important: boolean;
}

export interface MatchPlayerStat {
  sofascore_player_id: number;
  player_name: string;
  team_id?: string;
  is_home: boolean;
  position?: string;
  minutes_played?: number;
  rating?: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  shots?: number;
  shots_on_target?: number;
  big_chances_created?: number;
  big_chances_missed?: number;
  goals_inside_box?: number;
  goals_outside_box?: number;
  dribble_attempts?: number;
  dribbles_won?: number;
  tackles?: number;
  interceptions?: number;
  clearances?: number;
  blocks?: number;
  duels_total?: number;
  duels_won?: number;
  aerial_duels_won?: number;
  passes_total?: number;
  passes_accurate?: number;
  key_passes?: number;
  long_balls_total?: number;
  long_balls_accurate?: number;
  crosses_total?: number;
  crosses_accurate?: number;
  saves?: number;
  saves_inside_box?: number;
  clean_sheet?: boolean;
  penalties_saved?: number;
  runs_out?: number;
  fouls_committed?: number;
  fouls_suffered?: number;
  offsides?: number;
  dispossessed?: number;
}

export interface MatchAnalysis {
  fixture_id: string;
  analysis_text: string;
  has_hydration_break: boolean;
  hydration_break_minute?: number;
  generated_at: string;
  model_used?: string;
}

export interface UserPredictionRequest {
  user_id: string;
  home_win_prob: number;
  draw_prob: number;
  away_win_prob: number;
}

export interface UserPredictionResponse {
  id: number;
  user_id: string;
  fixture_id: string;
  home_win_prob: number;
  draw_prob: number;
  away_win_prob: number;
  submitted_at: string;
}

export interface UserStats {
  total_picks: number;
  graded: number;
  correct: number;
  avg_log_loss?: number;
}

export interface TeamRating {
  team_id: string;
  team_name: string;
  confederation: string;
  rating: number;
  as_of: string;
}

export interface PlayerScorerPrediction {
  player_name: string;
  anytime_scorer_prob: number;
  tournament_goals: number;
}

export interface TeamScorerPredictions {
  team_id: string;
  team_name: string;
  players: PlayerScorerPrediction[];
}

export interface MatchScorerPredictions {
  match_id: string;
  computed_at: string;
  home_team: TeamScorerPredictions;
  away_team: TeamScorerPredictions;
}

export interface HydrationBreak {
  fixture_id: string;
  kickoff_utc: string;
  stage: string;
  break_minute: number;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  venue: string;
  venue_climate: "enclosed" | "open" | "unknown";
  goals_home_before: number;
  goals_away_before: number;
  goals_home_after: number;
  goals_away_after: number;
  goal_within_5min: boolean;
  important_before: number;
  important_after: number;
  momentum_before: "home" | "away" | "level";
  momentum_after: "home" | "away" | "level";
  shifted: boolean;
}

export interface HydrationAnalysis {
  total_breaks: number;
  matches_with_breaks: number;
  shifts_count: number;
  shifts_pct: number;
  goal_after_count: number;
  goal_after_pct: number;
  home_benefit_count: number;
  away_benefit_count: number;
  enclosed_count: number;
  open_count: number;
  breaks: HydrationBreak[];
}

export interface TournamentTriviaFact {
  category: string;
  icon: string;
  headline: string;
  detail?: string;
  match_id?: string;
  home_team?: string;
  away_team?: string;
  home_goals?: number;
  away_goals?: number;
}

export interface TournamentTrivia {
  facts: TournamentTriviaFact[];
  computed_at: string;
}

