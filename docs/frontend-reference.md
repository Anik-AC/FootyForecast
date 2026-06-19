# Frontend Reference

Complete reference for the FootyForecast Next.js frontend. Covers every page, component, data flow, and design decision made during development. Intended as a living document: append entries when new frontend work lands.

---

## Stack

- **Framework:** Next.js 15 (App Router, server components by default)
- **Styling:** Tailwind CSS v4 (dark theme, slate palette, emerald accents)
- **Charts:** Recharts (MomentumChart, OverUnderBars)
- **Language:** TypeScript, strict mode
- **API:** Go REST API at `http://localhost:8080/v1` (local dev) / deployed URL (prod)
- **Data fetching:** Server components fetch directly from the Go API at render time. No SWR or React Query. Most pages use `next: { revalidate: 60 }` (1-minute ISR).

---

## Route map

| Route | File | Description |
| --- | --- | --- |
| `/` | `app/page.tsx` | Home: next 48h matches + recent results + news feed |
| `/matches` | `app/matches/page.tsx` | All upcoming matches, grouped by UTC date |
| `/matches/[id]` | `app/matches/[id]/page.tsx` | Match detail: prediction, scorers, momentum, stats, commentary |
| `/results` | `app/results/page.tsx` | All completed matches, grouped by date, newest first |
| `/standings` | `app/standings/layout.tsx` | Layout with Groups / Knockout tab switcher |
| `/standings/groups` | `app/standings/groups/page.tsx` | Group tables (points, GD, form) |
| `/standings/knockout` | `app/standings/knockout/page.tsx` | Knockout bracket or Monte Carlo projection |
| `/bracket` | `app/bracket/page.tsx` | Full Monte Carlo simulation results |
| `/teams` | `app/teams/page.tsx` | All 48 WC 2026 teams, sortable by Elo |
| `/teams/[id]` | `app/teams/[id]/page.tsx` | Team detail: Elo history, fixtures, group standing |
| `/groups` | `app/groups/page.tsx` | Group-stage fixture overview |
| `/knockout` | `app/knockout/page.tsx` | Knockout bracket (alternate path) |
| `/disagreements` | `app/disagreements/page.tsx` | Matches where model vs market diverges most |
| `/calibration` | `app/calibration/page.tsx` | Calibration chart: predicted vs actual win rates |
| `/stats` | `app/stats/page.tsx` | Model stats, hydration break analysis |

---

## Components

### `LocalTime`

**File:** `web/components/LocalTime.tsx`  
**Type:** Client component (`"use client"`)

Renders a timestamp in the user's local timezone without hydration mismatches. The `useState` initialiser outputs UTC (matching server render), then `useEffect` swaps to the browser locale after mount.

```tsx
<LocalTime iso={match.kickoff_utc} variant="kickoff" />
```

**Variants:**

| Variant | Example output | Used in |
| --- | --- | --- |
| `kickoff` | "16 Jun, 10:00 PM BST" | MatchCard, Disagreements |
| `datetime` | "16 June 2026, 10:00 PM BST" | Match detail page |
| `dayheading` | "Tuesday, 16 June" | Home, Matches, Results date headings |
| `dateonly` | "16 Jun" | Bracket, Calibration, Stats |

All variants are defined in the module-level `FORMATS` constant. Do not pass raw `Intl.DateTimeFormatOptions` inline; add a new named variant instead to keep hooks deps stable.

---

### `MatchCard`

**File:** `web/components/MatchCard.tsx`

Compact match tile used on home, matches, and results lists. Shows team names, kickoff time (via `LocalTime`), predicted probabilities as small percentage text, and the result score for completed matches. Links to the match detail page.

---

### `ForecastCard`

**File:** `web/components/ForecastCard.tsx`  
**Type:** Client component (`"use client"`)

"The Forecast" summary card shown at the top of upcoming match detail pages. Computes four verdicts purely from props (no additional API calls):

1. **Most Likely Result** - highest of home win / draw / away win probabilities
2. **Most Likely Scoreline** - top entry from `scoreline_grid` sorted by probability
3. **Goals Call** - highest confidence across 8 market options (over/under 1.5, 2.5, 3.5, btts, clean sheet)
4. **Most Likely Scorer** - top player across both teams by `anytime_scorer_prob`

Receives `prediction: MatchPrediction` and `scorers: MatchScorerPredictions | null`. Renders nothing for the scorer row if scorer data is absent. Only shown on upcoming (not completed) matches.

---

### `PlayerScorers`

**File:** `web/components/PlayerScorers.tsx`

Two-column scorer probability display. Shows the top 5 players per team. Each player renders in two visual rows: name + probability on row 1, source badge + gradient bar on row 2.

**Source badge:** "form" (emerald) when `tournament_goals > 0`, "xG" (teal) otherwise. Signals whether the probability derives from real tournament goals or purely from the 2025/26 club xG prior.

**Bar cap:** `Math.min(prob / 0.5, 1) * 100` — bar fills at 50% probability, giving visual spread for realistic WC scorer ranges (most players are 20-40%).

Returns `null` when no player data is available (avoids empty card).

---

### `ProbabilityBar`

**File:** `web/components/ProbabilityBar.tsx`

Three-segment bar showing home win / draw / away win probabilities with percentage labels. Used on match detail pages.

---

### `MomentumChart`

**File:** `web/components/MomentumChart.tsx`

Recharts `AreaChart` of per-minute match momentum. Positive values favour the home team, negative values favour the away team.

Props:

- `data: Array<{ minute: number; value: number }>` — from `match_momentum` table
- `homeTeam: string`, `awayTeam: string` — for axis labels
- `breakMinutes?: number[]` — renders amber dashed `ReferenceLine` for each hydration break
- `goalEvents?: Array<{ minute: number; isHome: boolean }>` — renders emerald (home) or blue (away) `ReferenceLine` with a soccer ball label

Subtitle states "Derived from commentary feed." (not Stats Perform data). Returns `null` when `data` is empty.

---

### `MarketPanel`

**File:** `web/components/MarketPanel.tsx`

Compares model probabilities against prediction market odds (Kalshi, Polymarket). Shows implied market probability vs model probability for home/draw/away outcomes. Highlights divergences.

---

### `PostMatchScorecard`

**File:** `web/components/PostMatchScorecard.tsx`

Shown on completed match pages. Displays the actual result, model's pre-match probability for the outcome that occurred, and accuracy context.

---

### `ScorelineHeatmap`

**File:** `web/components/ScorelineHeatmap.tsx`

Grid of scoreline probabilities from `scoreline_grid`, rendered as a colour-coded table (darker = higher probability).

---

### `TopScorelines`

**File:** `web/components/TopScorelines.tsx`

Ranked list of the most probable scorelines with percentage labels.

---

### `OverUnderBars`

**File:** `web/components/OverUnderBars.tsx`

Horizontal bars for over/under and BTTS market probabilities using Recharts.

---

### `PredictionCard`

**File:** `web/components/PredictionCard.tsx`

Compact card summarising model prediction inputs: Elo ratings (with delta), rest days, model version, and `model_as_of` timestamp.

---

### `MatchPreviewCard`

**File:** `web/components/MatchPreviewCard.tsx`

Narrative match preview text from the Go API (AI-generated or template-based), shown above the prediction section on upcoming match pages.

---

### `TriviaFacts`

**File:** `web/components/TriviaFacts.tsx`

Fun head-to-head and tournament statistics from the `match_trivia` API endpoint.

---

### `MatchStatBars`

**File:** `web/components/MatchStatBars.tsx`

Horizontal comparison bars for post-match team statistics (possession, shots, saves, corners, fouls, passes, tackles, cards, offsides). Only shown for completed matches with ESPN stats ingested.

---

### `PlayerStatsTable`

**File:** `web/components/PlayerStatsTable.tsx`

Tabular display of individual player statistics from `player_match_stats` (goals, assists, shots, saves, cards, fouls, offsides). Populated from ESPN post-match ingestion.

---

### `CommentaryFeed`

**File:** `web/components/CommentaryFeed.tsx`

Chronological list of match commentary entries from `match_commentary`. Important entries are visually distinguished. Shown on completed match pages.

---

### `UserStatsBanner`

**File:** `web/components/UserStatsBanner.tsx`

Home page banner. Shows aggregate prediction accuracy stats.

---

### `BracketTable`

**File:** `web/components/BracketTable.tsx`

Table variant of the simulation results (used as a fallback when the full bracket layout is not appropriate).

---

## Match detail page (`/matches/[id]`)

This is the most complex page in the app. All data is fetched in parallel via `Promise.all` at the top:

```
getMatchPrediction, getMarketComparison, getMatchTrivia, getMatchPreview,
getMatchScorerPredictions, getCalibration, getMatchEvents, getMatchStats,
getMatchMomentum, getMatchCommentary, getMatchPlayerStats, getMatchAnalysis
```

**Upcoming match layout (in order):**

1. Match header: team names, Elo ratings, kickoff time (`LocalTime variant="datetime"`)
2. `ForecastCard` — "The Forecast" summary
3. `ProbabilityBar` — home/draw/away bar
4. `MatchPreviewCard` — narrative preview
5. `PlayerScorers` — top 5 scorers per team
6. `TopScorelines` / `OverUnderBars` — scoreline and totals markets
7. `MarketPanel` — model vs market comparison
8. `PredictionCard` — model metadata (Elo, rest days, model version)
9. `TriviaFacts` — head-to-head trivia

**Completed match layout (in order):**

1. Match header with result score
2. `PostMatchScorecard`
3. `MomentumChart` — with hydration break and goal markers
4. `MatchStatBars` — team stats comparison
5. `PlayerStatsTable` — player stats
6. `CommentaryFeed` — full commentary

**Elo display:** Elo ratings are shown below each team's FIFA code in the match header (e.g., "1923"). The Elo gap between teams is the single most predictive feature in the model, but the raw delta is not currently shown as a highlighted figure. This is a noted frontend improvement: surface the gap (e.g., "+87 Elo" in emerald/red) alongside or instead of just the raw ratings.

---

## Data types (TypeScript)

**File:** `web/lib/types.ts`

Key types consumed by frontend components:

- `MatchSummary` — list-level match data (id, teams, kickoff, result, stage)
- `MatchPrediction` — full prediction including `outcome_probabilities`, `scoreline_grid`, `totals`, `HomeElo`, `AwayElo`, `feature_snapshot`
- `MatchScorerPredictions` — `{ home_team, away_team }` each with `players: PlayerScorerPrediction[]`
- `PlayerScorerPrediction` — `player_name`, `anytime_scorer_prob`, `tournament_goals`, `xg_per90`, `travel_km`
- `TeamSimulationResult` — `team_id`, `team_name`, `stage_probabilities` (round_of_32 through champion)
- `MomentumPoint` — `{ minute, value }`
- `MatchEvent` — `{ minute, incident_type, is_home, description }`

---

## API client (`web/lib/api.ts`)

All Go API calls are centralised here. Each function uses `fetch` with `cache: "no-store"` or `next: { revalidate: N }`. Returns typed data or throws on 404/error (404 propagates to Next.js `notFound()`).

Key functions:

- `getMatches()` — all 104 fixtures with results where available
- `getMatchPrediction(id)` — prediction + Elo for one fixture (404 if no prediction row)
- `getMatchScorerPredictions(id)` — player scorer probabilities for both teams
- `getMatchMomentum(id)` — per-minute momentum array
- `getMatchEvents(id)` — goals, cards, subs, hydration breaks
- `getMatchStats(id)` — team-level stats from ESPN
- `getMatchCommentary(id)` — full commentary feed
- `getMatchPlayerStats(id)` — individual player stats
- `getLatestSimulation()` — Monte Carlo tournament simulation results
- `getCalibration()` — historical calibration data

---

## Design system

**Colour conventions:**

- Background: `slate-950` (cards) / `slate-900` (inner sections) / `slate-800` (borders, bars)
- Primary text: `slate-100` (headings, values)
- Secondary text: `slate-400` / `slate-500` (labels, metadata)
- Accent / positive: `emerald-400`
- Away / negative: `blue-400` or `blue-500`
- Warning / shift: `amber-400`
- Danger / loss: `red-400`

**Typography conventions:**

- Section labels: `text-[10px] font-semibold uppercase tracking-widest text-slate-500`
- Card headings: `text-sm font-extrabold uppercase tracking-widest`
- Big numbers / verdicts: `text-xl font-bold`
- Body text: `text-sm` or `text-xs`

**Card wrapper pattern:** `bg-slate-900 border border-slate-800 rounded-xl p-6` (standard) or `bg-slate-950 border border-slate-700/60 rounded-xl p-6` (emphasis, used on ForecastCard).

---

## Known issues and pending improvements

**Elo gap not surfaced on match pages.** The Elo rating for each team is shown in small text below the team name in the match header, but the gap (delta) between the two teams is not highlighted. The Elo gap is the model's strongest predictor, so displaying it prominently (e.g., "+87" in emerald next to the stronger team, with a brief tooltip explaining what it means) would make the predictions more transparent. This is the next frontend fix needed.

**Date heading timezone mismatch.** Date grouping uses `kickoff_utc.slice(0, 10)` (UTC date), but `LocalTime variant="dayheading"` shows the local date of the first match in that group. For users in UTC+11 or later, a late evening UTC match (23:00 UTC = next local day) will show a local date one day later than the group key. A minor cosmetic issue for most users; fixing it requires computing the group key client-side, which requires converting to a client component.

**Commentary-derived momentum.** The `MomentumChart` data comes from text analysis of commentary, not from Stats Perform's proprietary metric. Matches with sparse or team-name-ambiguous commentary will show flat or zero momentum for many minutes. The disclaimer "Derived from commentary feed" is shown as a subtitle on the chart.

**No lineup data.** Pre-match lineups and formation display are not implemented. The `fixtures` table has no lineup columns, and ESPN's API does not return lineup data in the same endpoint. This would require a separate lineup source.
